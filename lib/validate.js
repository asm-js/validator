var esprima = require('esprima');
var env = require('./env');
var dict = require('dict');
var types = require('./types');
var fail = require('./fail');
var match = require('./match');

function Validator() {
    this._env = env();
    this._src = null;
    this._result = null;
}

var A = dict({
    Uint8Array:   types.array(8,  types.unsigned),
    Uint16Array:  types.array(16, types.unsigned),
    Uint32Array:  types.array(32, types.unsigned),
    Int8Array:    types.array(8,  types.signed),
    Int16Array:   types.array(16, types.signed),
    Int32Array:   types.array(32, types.signed),
    Float32Array: types.array(32, types.double),
    Float64Array: types.array(64, types.double)
});

var double2double = types.arrow([types.double], types.double);

var M = dict({
    imul:  'imul',
    ceil:  types.double2double,
    round: types.double2double,
    sin:   types.double2double,
    cos:   types.double2double
});

var overflow = [types.arrow([types.double, types.double], types.double),
                types.arrow([types.int, types.int], types.intish)];

var div = [types.arrow([types.double, types.double], types.double),
           types.arrow([types.signed, types.signed], types.intish),
           types.arrow([types.unsigned, types.unsigned], types.intish)];

var bitwise = [types.arrow([types.intish, types.intish], types.signed)];

var cond = [types.arrow([types.signed, types.signed], types.bit),
            types.arrow([types.unsigned, types.unsigned], types.bit),
            types.arrow([types.double, types.double], types.bit)];

var binops = dict({
    "+":   overflow,
    "-":   overflow,
    "*":   [types.arrow([types.double, types.double], types.double)],
    "/":   div,
    "%":   div,
    "|":   bitwise,
    "&":   bitwise,
    "^":   bitwise,
    "<<":  bitwise,
    ">>":  bitwise,
    ">>>": [types.arrow([types.intish, types.intish], types.unsigned)],
    "<":   cond,
    "<=":  cond,
    ">":   cond,
    ">=":  cond,
    "==":  cond,
    "!=":  cond
});

var unops = dict({
    "+": types.arrow([types.intish], types.double),
    "~": types.arrow([types.intish], types.signed),
    "!": types.arrow([types.boolish], types.bit)
});

// type envtype = 'imul' | 'function' | 'module' | 'parameter' | arrow | Type

// type label = string | null
// type control = RETURN | labels
// type labels = [label]

var RETURN = null;

// ([control]) -> control
function sequence(controls) {
    var left = controls[0];
    for (var i = 1, n = controls.length; i < n; i++) {
        if (left === RETURN)
            return RETURN;
        var right = controls[i];
        if (right === RETURN) {
            if (left.length === 0)
                left = RETURN;
        } else {
            left = left.concat(right);
        }
    }
    return left;
}

// ([control]) -> control
function union(controls) {
    return left === RETURN ? right
         : right === RETURN ? left
         : left.concat(right);
}

// (labels) -> label -> boolean
function notIn(labels) {
    return function(l) {
        return labels.indexOf(l) === -1;
    };
}

var Vp = Validator.prototype;

Vp.validId = function validId(id) {
    match.nodeType(id, 'Identifier', "identifier binding", this);
    var name = id.name;
    return /^[a-zA-Z_$][a-zA-Z_$0-9]*$/.test(name) &&
           name !== "arguments" &&
           name !== "eval";
}

// (Statement) -> boolean
function nonEmpty(s) {
    return s.type !== 'EmptyStatement';
}

// (string) -> dict<{ type: Type, exportedAs: [string] }>
Vp.validate = function validate(src) {
    this._src = src;
    var module = esprima.parse("(" + src + ")", { raw: true, loc: true }).body[0].expression;
    match.nodeType(module, 'FunctionExpression', "asm.js module");
    var params = module.params;
    if (params.length > 3 || !params.every(this.validId, this)) {
        var names = params.map(function(id) { return id.name });
        this.fail("expected at most two valid identifiers, got (" + names.join(", ") + ")", params[2].loc);
    }
    if (module.id)
        this._env.bind(module.id.name, 'module');
    this._env.push();
    try {
        return this.module(module.params.map(function(id) { return id.name; }),
                           module.body.body.filter(nonEmpty),
                           module.body.loc);
    } finally {
        this._src = null;
        this._env.pop();
    }
};

Vp.fail = function fail_(msg, loc) {
    fail(msg, this._src, loc);
};

// ([Statement], Loc) -> { imports: [VariableDeclaration], functions: [FunctionDeclaration], exports: [Statement] }
Vp.splitModule = function splitModule(body, loc) {
    var n = body.length;

    if (n === 0)
        this.fail("expected \"use asm\" directive, got empty body", loc);

    match.nodeType(body[0], 'ExpressionStatement', "\"use asm\" directive", this);
    match.literal(body[0].expression, "use asm", "\"use asm\" directive", this);

    var i = 1;
    var imports = [], functions = [], exports = [];
    while (body[i].type === 'VariableDeclaration') {
        imports.push(body[i]);
        i++;
    }
    while (body[i].type === 'FunctionDeclaration') {
        functions.push(body[i]);
        i++;
    }
    while (i < n) {
        exports.push(body[i]);
        i++;
    }
    return {
        imports: imports,
        functions: functions,
        exports: exports
    };
}

// (Expression, string | null) -> Type
Vp.extractType = function extractType(node, lhs) {
    switch (node.type) {
      case 'BinaryExpression':
        switch (node.operator) {
          case '|':
            if (lhs)
                match.identifier(node.left, lhs, "parameter coercion", this);
            match.literal(node.right, 0, "signed coercion", this);
            return types.signed;

          case '>>>':
            if (lhs)
                match.identifier(node.left, lhs, "parameter coercion", this);
            match.literal(node.right, 0, "unsigned coercion", this);
            return types.unsigned;

          default:
            this.fail("expected signed or unsigned coercion operator, got " + node.operator, node.loc);
        }

      case 'UnaryExpression':
        switch (node.operator) {
          case '+':
            if (lhs)
                match.identifier(node.argument, lhs, "parameter coercion", this);
            return types.double;

          default:
            match.nodeOp(node, '~', "double coercion", this);
            match.nodeType(node.argument, 'UnaryExpression', "double coercion", this);
            match.nodeOp(node.argument, '~', "double coercion", this);
            if (lhs)
                match.identifier(node.argument.argument, lhs, "parameter coercion", this);
            return types.int;
        }

      case 'Literal':
        if (typeof node.value !== 'number')
            this.fail("expected int or double literal, got " + JSON.stringify(node.value), node.loc);
        return hasDot(node.raw) ? types.int : types.double;

      default:
        this.fail("expected explicitly typed expression, got " + node.type + " node", node.loc);
    }
}

// (string) -> boolean
function hasDot(s) {
    return s.indexOf(".") !== -1;
}

// (Expression | null) -> Type
Vp.extractReturnType = function extractReturnType(node) {
    return node ? this.extractType(node.argument) : types.void;
}

// ([Statement], (Statement) -> boolean) -> [Statement]
function find(ss, p) {
    var result = [];

    ss.forEach(function f(s) {
        if (p(s))
            result.push(s);

        switch (s.type) {
          case 'BlockStatement':
            s.body.forEach(f);
            break;

          case 'IfStatement':
            f(s.consequent);
            if (s.alternate)
                f(s.alternate);
            break;

          case 'WhileStatement':
          case 'DoWhileStatement':
          case 'ForStatement':
          case 'LabeledStatement':
            f(s.body);
            break;

          case 'SwitchStatement':
            s.cases.forEach(function(c) {
                c.consequent.forEach(f);
            });
            break;
        }
    });

    return result;
}

// (FunctionDeclaration) -> Type
Vp.functionType = function functionType(funDecl) {
    var params = funDecl.params;
    var n = params.length;
    var body = funDecl.body.body.filter(nonEmpty);
    if (body.length < n)
        this.fail("not enough annotations for parameters to " + funDecl.id.name, funDecl.body.loc);
    var paramTypes = [];
    for (var i = 0; i < n; i++) {
        var stmt = body[i];
        if (stmt.type !== 'ExpressionStatement' || stmt.expression.type !== 'AssignmentExpression')
            this.fail("expected annotation for parameter " + params[i].name + ", got " + stmt.type + " node", stmt.loc);
        paramTypes[i] = this.extractType(stmt.expression.right, params[i].name);
    }
    var returns = find(body, function(node) { return node.type === 'ReturnStatement'; });
    var returnTypes = returns.map(this.extractReturnType, this);
    var result = types.void;

    if (returns.length > 0) {
        result = returnTypes[0];
        for (var i = 1, n = result.length; i < n; i++) {
            var candidate = returnTypes[i];
            if (candidate.subtype(result))
                result = candidate;
            else if (!result.subtype(candidate))
                this.fail("return type mismatch: " + result + " and " + returnTypes[i], returns[i].loc);
        }
    }

    return types.arrow(paramTypes, returns.length === 0 ? types.void : result);
}

// ([string], [Statement], Loc) -> dict<{ type: Type, exportedAs: [string|null] }>
Vp.module = function module(params, body, loc) {
    // Ensure that the parameters can't be rebound in this function.
    params.forEach(function(param) {
        this._env.bind(param, 'parameter');
    }, this);

    var sections = this.splitModule(body, loc);

    // Bind and check imports.
    sections.imports.forEach(function(varDecl) {
        varDecl.declarations.forEach(function(decl) {
            this._env.bind(decl.id.name, this.import(params, decl.id.name, decl.init, decl.loc));
        }, this);
    }, this);

    // Bind functions.
    sections.functions.forEach(function(funDecl) {
        var id = funDecl.id;
        if (!this.validId(id))
            this.fail("expected valid function name, got " + id.name, id.loc);
        this._env.bind(id.name, this.functionType(funDecl));
    }, this);

    // Check functions.
    sections.functions.forEach(function(funDecl) {
        this.function(funDecl);
    }, this);

    // Check exports.
    if (sections.exports.length !== 1)
        this.fail("expected a single export statement, got " + sections.exports.length + " statements", loc);

    var exported = this.export(sections.exports[0]);

    var report = dict();
    sections.functions.forEach(function(funDecl) {
        var f = funDecl.id.name;
        report.set(f, {
            type: this._env.lookup(f),
            exportedAs: typeof exported === 'string'
                      ? (f === exported ? [null] : [])
                      : (exported.get(f) || [])
        });
    }, this);
    return report;
};

// ([string], string, Expression | null, Loc) -> envtype
Vp.import = function import_(params, x, init, loc) {
    if (!init)
        this.fail("import binding missing initializer expression", loc);

    if (params.length === 0)
        this.fail("cannot import because module has no imports parameter", loc);

    var g = params[0];
    var f = params[1];

    switch (init.type) {
      case 'MemberExpression':
        if (!g)
            this.fail("cannot import because module does not name imports object", loc);
        var y = init.property.name;
        if (M.has(y))
          match.identifier(init.object, g, "import global", this);
        else
          match.identifier(init.object, f, "import foreign", this);
        match.nodeType(init.property, 'Identifier', "import binding", this);
        if (M.has(y))
            return M.get(y);
        if (A.has(y))
            this.fail("cannot import heap view constructor " + y + " as a function", init.property.loc);
        return 'function';

      case 'NewExpression':
        if (params.length < 3)
            this.fail("cannot import because module has no buffer parameter", loc);
        var b = params[2];
        var callee = init.callee, args = init.arguments;
        match.nodeType(callee, 'MemberExpression', "heap declaration", this);
        match.identifier(callee.object, g, "import global", this);
        match.nodeType(callee.property, 'Identifier', "heap view type", this);
        var y = callee.property.name;
        if (!A.has(y))
            this.fail("unknown heap view type " + y, callee.property.loc);
        if (args.length !== 1)
            this.fail("expected a single argument to heap declaration, got " + args.length + " arguments", args[1].loc);
        var arg = args[0];
        match.identifier(arg, b, "heap buffer", this);
        return A.get(y);

      default:
        this.fail("expected import binding or heap view declaration, got " + init.type + " node", init.loc);
    }
};

// (FunctionDeclaration) -> void
Vp.function = function function_(funDecl) {
    var f = funDecl.id.name;
    var ft = this._env.lookup(f);
    var params = funDecl.params.map(function(id) {
        if (!this.validId(id))
            this.fail("expected valid parameter name, got " + id.name, id.loc);
        return id.name;
    }, this);
    var paramTypes = ft.params;
    var resultType = ft.result;
    var body = funDecl.body.body.filter(nonEmpty);

    try {
        this._env.push();
        this._result = resultType;

        // Bind the parameters.
        params.forEach(function(x, i) {
            this._env.bind(x, paramTypes[i]);
        }, this);

        // Bind the locals.
        var i = params.length, n = body.length;
        while (i < n && body[i].type === 'VariableDeclaration') {
            body[i].declarations.forEach(function(dtor) {
                this.local(dtor);
            }, this);
        }

        // Check the body.
        var control = this.statements(body.slice(i), []);

        // Check for fall-through.
        if (resultType !== types.void && control !== RETURN)
            this.fail("function " + f + " missing return statement", funDecl.loc);
    } finally {
        this._env.pop();
        this._result = null;
    }
};

// (VariableDeclarator) -> void
Vp.local = function local(dtor) {
    var y = dtor.id.name;
    if (!this.validId(dtor.id))
        this.fail("expected valid local identifier, got " + y, dtor.id.loc);
    if (!dtor.init)
        this.fail("expected initializer for local variable " + y, dtor.loc);
    this._env.bind(y, this.extractType(dtor.init));
};

// ([Statement], labels) -> control
Vp.statements = function statements(ss, labels) {
    return sequence(ss.map(function(s) {
        return this.statement(s, labels);
    }, this));
};

// (Statement, labels) -> control
Vp.statement = function statement(s, labels) {
    switch (s.type) {
      case 'BlockStatement':
        return this.statements(s.body, []);

      case 'ExpressionStatement':
        return this.expression(s.expression);

      case 'IfStatement':
        return this.ifStatement(s.test, s.consequent, s.alternate);

      case 'ReturnStatement':
        return this.returnStatement(s.argument, s.loc);

      case 'WhileStatement':
        return this.whileStatement(s.test, s.body, labels);

      case 'DoWhileStatement':
        return this.doWhileStatement(s.body, s.test, labels);

      case 'ForStatement':
        return this.forStatement(s.init, s.test, s.update, s.body, labels, s.loc);

      case 'BreakStatement':
        return [label ? label.name : null];

      case 'ContinueStatement':
        return [];

      case 'LabeledStatement':
        labels = labels || [];
        labels.push(s.label.name);
        return this.statement(s.body, labels);

      case 'SwitchStatement':
        return this.switchStatement(s.discriminant, s.cases, labels);

      default:
        this.fail("illegal " + s.type + " node", s.loc);
    }
};

// (Type, Type, string, Loc) -> void
Vp.checkSubtype = function checkSubtype(actual, expected, msg, loc) {
    if (!actual.isExpressionType || !actual.subtype(expected))
        this.fail("expected " + expected + " in " + msg + ", got " + actual, loc);
}

// (Expression, Statement, Statement | null) -> control
Vp.ifStatement = function ifStatement(test, cons, alt) {
    this.checkSubtype(this.expression(test), types.boolish, "if test", test.loc);
    return union([this.statement(cons, []),
                  alt ? this.statement(alt, []) : []]);
};

// (Expression | null, Loc) -> control
Vp.returnStatement = function returnStatement(arg, loc) {
    this.checkSubtype(this.optExpression(arg) || types.void, this._result, "return argument", loc);
    return RETURN;
};

// (Expression, Statement, labels) -> control
Vp.whileStatement = function whileStatement(test, body, labels) {
    this.checkSubtype(this.expression(test), types.boolish, "while loop condition", test.loc);
    labels.push(null);
    var control = this.statement(body, labels);
    return union([[], control]).filter(notIn(labels));
};

// (Statement, Expression, labels) -> control
Vp.doWhileStatement = function doWhileStatement(body, test, labels) {
    labels.push(null);
    var control = this.statement(body, labels);
    this.checkSubtype(this.expression(test), types.boolish, "do-while loop condition", test.loc);
    return control === RETURN ? RETURN : control.filter(notIn(labels));
};

// (VariableDeclaration | Expression | null, Expression | null, Expression | null, Statement, labels, Loc) -> control
Vp.forStatement = function forStatement(init, test, update, body, labels, loc) {
    if (init.type === 'VariableDeclaration')
        this.fail("illegal variable declaration in for-head", init.loc);
    this.optExpression(init);
    this.checkSubtype(this.optExpression(test) || types.bit, types.boolish, "for loop condition", loc);
    this.optExpression(update);
    labels.push(null);
    return this.statement(body, labels).filter(notIn(labels));
};

// (Expression, [SwitchCase], labels) -> control
Vp.switchStatement = function switchStatement(disc, cases, labels) {
    var s = this.expression(disc);
    if (cases.length === 0)
        return [];
    labels.push(null);
    var n = cases.length;
    var mayBreak = false;
    var controls = cases.map(function(c, i) {
        if (!c.test && i < n - 1)
            this.fail("illegal non-final default clause", c.loc);
        var control = this.case(c, s);
        mayBreak = mayBreak || (control && control.length > 0);
        return control;
    }, this);
    return (!mayBreak && controls[n - 1] === RETURN)
         ? RETURN
         : union(controls).filter(notIn(labels));
};

// (SwitchCase, Type) -> control
Vp.case = function case_(c, s) {
    // FIXME: do we need to syntactically limit case clause expressions?
    if (c.test)
        this.checkSubtype(this.expression(c.test), s, "case clause expression", c.test.loc);
    return this.statements(c.consequent);
};

// (Expression | null) -> Type | null
Vp.optExpression = function optExpression(expr) {
    return expr ? this.expression(expr) : null;
};

// (Expression) -> Type
Vp.expression = function expression(e) {
    switch (e.type) {
      case 'Literal':
        if (typeof e.value !== 'number')
            this.fail("expected number literal, got " + JSON.stringify(e.value), e.loc);
        if (hasDot(e.raw))
            return types.double;
        if (e.value < -0x80000000 || e.value > 0xffffffff)
            this.fail("int literal out of range: " + e.value + " (0x" + e.value.toString(16) + ")", e.loc);
        return types.constant;

      case 'Identifier':
        var t = this._env.lookup(e.name);
        if (!t)
            this.fail("unbound variable " + e.name, e.loc);
        if (!t.isExpressionType)
            this.fail("expected expression type, got " + t, e.loc);
        return t;

      case 'AssignmentExpression':
        return e.left.type === 'Identifier'
             ? this.assignment(e.left.name, e.right, e.loc)
             : this.store(e.left, e.right, e.loc);

      case 'MemberExpression':
        return this.load(e);

      case 'CallExpression':
        match.nodeType(e.callee, 'Identifier', "function call", this);
        var t = this._env.lookup(e.callee.name);
        if (!t)
            this.fail("unbound function " + e.callee.name, e.callee.loc);
        if (t === 'imul')
            return this.imul(e.arguments, e.loc);
        if (t === 'function')
            return this.ffi(e.arguments);
        if (t instanceof types.arrow)
            return this.call(e.arguments, t.params, t.result, e.loc);
        this.fail("illegal callee type " + t, e.callee.loc);

      case 'ConditionalExpression':
        this.checkSubtype(this.expression(e.test), types.boolish, "conditional expression", e.test.loc);
        var t1 = this.expression(e.consequent);
        var t2 = this.expression(e.alternate);
        if (t1.subtype(t2))
            return t2;
        if (t2.subtype(t1))
            return t1;
        this.fail("incompatible conditional types " + t1 + " and " + t2, e.loc);

      case 'SequenceExpression':
        var ts = e.expressions.map(function(e) {
            return this.expression(e);
        }, this);
        return ts[ts.length - 1];

      case 'UnaryExpression':
        if (e.operator === '~') {
            if (e.argument.type === 'UnaryExpression' && e.argument.operator === '~') {
                var t = this.expression(e.argument.argument);
                if (t === types.double || t.subtype(types.intish))
                    return types.signed;
                this.fail("expected double or intish, got " + t, e.argument.loc);
            }
        }
        if (!unops.has(e.operator))
            this.fail("unexpected unary operator " + e.operator, e.loc);
        var a = unops.get(e.operator);
        this.checkSubtype(this.expression(e.argument), a.params[0], "unary operator", e.argument.loc);
        return a.result;

      case 'BinaryExpression':
        if (!binops.has(e.operator))
            this.fail("unexpected binary operator " + e.operator, e.loc);
        var a = binops.get(e.operator);
        var t1 = this.expression(e.left);
        var t2 = this.expression(e.right);
        for (var i = 0, n = a.length; i < n; i++) {
            var t = a[i];
            if (t1.subtype(t.params[0]) && t2.subtype(t.params[1]))
                return t.result;
        }
        this.fail("type mismatch in binary " + e.operator + " operator: got " + t1 + " and " + t2, e.loc);

      default:
        this.fail("illegal " + e.type + " node", e.loc);
    }
};

// ([Expression], Loc) -> type
Vp.imul = function imul(args, loc) {
    if (args.length < 2)
        this.fail("imul expects 2 arguments, got " + args.length, loc);
    if (args.length > 2)
        this.fail("imul expects 2 arguments, got " + args.length, args[2].loc);
    this.checkSubtype(this.expression(args[0]), types.intish, "imul", args[0].loc);
    this.checkSubtype(this.expression(args[1]), types.intish, "imul", args[1].loc);
    return types.signed;
};

// ([Expression]) -> Type
Vp.ffi = function ffi(args) {
    for (var i = 0, n = args.length; i < n; i++) {
        this.checkSubtype(this.expression(args[i]), types.extern, "FFI call", args[i].loc);
    }
    return types.unknown;
};

// ([Expression], [Type], Type, Loc) -> Type
Vp.call = function call(args, paramTypes, resultType, loc) {
    if (args.length !== paramTypes.length)
        this.fail("expected " + paramTypes.length + " arguments, got " + args.length, loc);
    for (var i = 0, n = args.length; i < n; i++) {
        this.checkSubtype(this.expression(args[i]), paramTypes[i], "function call", args[i].loc);
    }
    return resultType;
};

// (string, Expression, Loc) -> Type
Vp.assignment = function assignment(x, e, loc) {
    var s = this._env.lookup(x);
    if (!s)
        this.fail("unbound variable " + x, loc);
    if (!s.isExpressionType)
        this.fail("invalid target of assignment: " + x, loc);
    var t = this.expression(e);
    this.checkSubtype(t, s, "assignment", loc);
    return t;
};

// (number) -> boolean
function validMask(n) {
    // quick and dirty test that n = 2^k - 1
    return !/0/.test(n.toString(2));
}

// (Expression) -> Type
Vp.load = function load(expr) {
    var idx = match.heapIndex(expr, "heap index", this);
    var x = idx.heap, e = idx.address, m = idx.bound, b = idx.shift;
    var a = this._env.lookup(x);
    if (!a)
        this.fail("unbound variable " + a, expr.loc);
    if (!(a instanceof types.array))
        this.fail("expected typed array variable, got " + x, expr.loc);
    this.checkSubtype(this.expression(e), types.intish, "heap index", e.loc);
    if (!validMask(m))
        this.fail("expected valid heap index bound mask, got " + m, expr.loc);
    if (b !== a.bits / 8)
        this.fail("expected shift of " + (a.bits / 8) + " bits, got " + b, expr.loc);
    return a.elts;
};

// (Expression, Expression, Loc) -> Type
Vp.store = function store(left, right, loc) {
    var t1 = this.load(left);
    var t2 = this.expression(right);
    this.checkSubtype(t2, t1, "heap store", loc);
    return t1;
};

// (Statement) -> (dict<[string]> | string)
Vp.export = function export_(stmt) {
    match.nodeType(stmt, 'ReturnStatement', "export clause", this);
    if (!stmt.argument)
        this.fail("empty export clause", stmt.loc);
    var arg = stmt.argument;
    switch (arg.type) {
      case 'Identifier':
        return arg.name;

      case 'ObjectExpression':
        return this.exportSet(arg.properties.map(function(prop) {
            var key = prop.key.type === 'Identifier'
                    ? prop.key.name
                    : prop.key.value;
            if (prop.kind !== 'init')
                this.fail("illegal getter or setter in export clause", prop.loc);
            match.nodeType(prop.value, 'Identifier', "export clause", this);
            return [key, prop.value.name];
        }, this));

      default:
        this.fail("expected function or set of functions in export clause, got " + arg.type + " node", arg.loc);
    }
};

// ([[string, string]]) -> dict<[string]>
Vp.exportSet = function exportSet(names) {
    var d = dict();

    names.forEach(function(pair) {
        var externalName = pair[0], internalName = pair[1];
        var externalNames;
        if (d.has(internalName)) {
            externalNames = d.get(internalName);
        } else {
            externalNames = [];
            d.set(internalName, externalNames);
        }
        externalNames.push(externalName);
    }, this);

    return d;
};

// (string) -> dict<{ type: Type, exportedAs: [string] }>
module.exports = function validate(src) {
    return (new Validator).validate(src);
};
