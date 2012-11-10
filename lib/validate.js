var esprima = require('esprima');
var env = require('./env');
var dict = require('dict');
var types = require('./types');
var fail = require('./fail');
var match = require('./match');

function Validator() {
    this._env = env();
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

// FIXME: use this on every identifier everywhere
function validId(id) {
    match.nodeType(id, 'Identifier', "module parameter");
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
    var module = esprima.parse("(" + src + ")", { raw: true }).body[0].expression;
    match.nodeType(module, 'FunctionExpression', "asm.js module");
    var params = module.params;
    if (params.length > 2 || !params.every(validId))
        fail("expected at most two valid identifiers, got [" + params.map(JSON.stringify).join(", ") + "]");
    if (module.id)
        this._env.bind(module.id.name, 'module');
    return this.module(module.params.map(function(id) { return id.name; }), module.body.body.filter(nonEmpty));
};

// ([Statement]) -> { imports: [VariableDeclaration], functions: [FunctionDeclaration], exports: [Statement] }
function splitModule(body) {
    var n = body.length;

    if (n === 0)
        fail("expected \"use asm\" directive, got empty body");

    match.nodeType(body[0], 'ExpressionStatement', "\"use asm\" directive");
    match.literal(body[0].expression, "use asm", "\"use asm\" directive");

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

// (Expression) -> Type
function extractType(node) {
    switch (node.type) {
      case 'BinaryExpression':
        switch (node.operator) {
          case '|':
            match.literal(node.right, 0, "signed coercion");
            return types.signed;

          case '>>>':
            match.literal(node.right, 0, "unsigned coercion");
            return types.unsigned;

          default:
            fail("expected signed or unsigned coercion operator, got " + node.operator);
        }

      case 'UnaryExpression':
        switch (node.operator) {
          case '+':
            return types.double;

          default:
            match.nodeOp(node, '~', "double coercion");
            match.nodeType(node.argument, 'UnaryExpression', "double coercion");
            match.nodeOp(node.argument, '~', "double coercion");
            return types.int;
        }

      case 'Literal':
        if (typeof node.value !== 'number')
            fail("expected int or double literal, got " + JSON.stringify(node.value));
        return hasDot(node.raw) ? types.int : types.double;

      default:
        fail("expected explicitly typed expression, got " + node.type + " node");
    }
}

// (string) -> boolean
function hasDot(s) {
    return s.indexOf(".") !== -1;
}

// (Expression | null) -> Type
function extractReturnType(node) {
    return node ? extractType(node.argument) : types.void;
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
function functionType(funDecl) {
    var params = funDecl.params;
    var n = params.length;
    var body = funDecl.body.body.filter(nonEmpty);
    if (body.length < n)
        fail("not enough annotations for parameters to " + funDecl.id.name);
    var paramTypes = [];
    for (var i = 0; i < n; i++) {
        var stmt = body[i];
        if (stmt.type !== 'ExpressionStatement' || stmt.expression.type !== 'AssignmentExpression')
            fail("expected annotation for parameter " + params[i].name + ", got " + stmt.type + " node");
        paramTypes[i] = extractType(stmt.expression.right);
    }
    var returns = find(body, function(node) { return node.type === 'ReturnStatement'; })
                  .map(extractReturnType);
    var result = types.void;

    if (returns.length > 0) {
        result = returns[0];
        for (var i = 1, n = result.length; i < n; i++) {
            var candidate = returns[i];
            if (candidate.subtype(result))
                result = candidate;
            else if (!result.subtype(candidate))
                fail("return type mismatch: " + result + " and " + returns[i]);
        }
    }

    return types.arrow(paramTypes, returns.length === 0 ? types.void : result);
}

// ([string], [Statement]) -> dict<{ type: Type, exportedAs: [string|null] }>
Vp.module = function module(params, body) {
    // Ensure that the parameters can't be rebound in this function.
    params.forEach(function(param) {
        this._env.bind(param, 'parameter');
    }, this);

    var sections = splitModule(body);

    // Bind and check imports.
    sections.imports.forEach(function(varDecl) {
        varDecl.declarations.forEach(function(decl) {
            this._env.bind(decl.id.name, this.import(params, decl.id.name, decl.init));
        }, this);
    }, this);

    // Bind functions.
    sections.functions.forEach(function(funDecl) {
        this._env.bind(funDecl.id.name, functionType(funDecl));
    }, this);

    // Check functions.
    sections.functions.forEach(function(funDecl) {
        this.function(funDecl);
    }, this);

    // Check exports.
    if (sections.exports.length !== 1)
        fail("expected a single export statement, got " + sections.exports.length + " statements");

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

// ([string], string, Expression | null) -> envtype
Vp.import = function import_(params, x, init) {
    if (!init)
        fail("import binding missing initializer expression");

    if (params.length === 0)
        fail("cannot import because module has no imports parameter");
    var e = params[0];

    switch (init.type) {
      case 'MemberExpression':
        if (!e)
            fail("cannot import because module does not name imports object");
        match.identifier(init.object, e, "import environment");
        match.nodeType(init.property, 'Identifier', "import binding");
        var y = init.property.name;
        if (M.has(y))
            return M.get(y);
        if (A.has(y))
            fail("cannot import heap view constructor " + y + " as a function");
        return 'function';

      case 'NewExpression':
        if (params.length < 2)
            fail("cannot import because module has no buffer parameter");
        var b = params[1];
        var callee = init.callee, args = init.arguments;
        match.nodeType(callee, 'MemberExpression', "heap declaration");
        match.identifier(callee.object, e, "import environment");
        match.nodeType(callee.property, 'Identifier', "heap view type");
        var y = callee.property.name;
        if (!A.has(y))
            fail("unknown heap view type " + y);
        if (args.length !== 1)
            fail("expected a single argument to heap declaration, got " + args.length + " arguments");
        var arg = args[0];
        match.identifier(arg, b, "heap buffer");
        return A.get(y);

      default:
        fail("expected import binding or heap view declaration, got " + init.type + " node");
    }
};

// (FunctionDeclaration) -> void
Vp.function = function function_(funDecl) {
    var f = funDecl.id.name;
    var ft = this._env.lookup(f);
    var params = funDecl.params.map(function(id) { return id.name });
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
            fail("function " + f + " missing return statement");
    } finally {
        this._env.pop();
        this._result = null;
    }
};

// (VariableDeclarator) -> void
Vp.local = function local(dtor) {
    var y = dtor.id.name;
    if (!dtor.init)
        fail("expected initializer for local variable " + y);
    this._env.bind(y, extractType(dtor.init));
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
        return this.returnStatement(s.argument);

      case 'WhileStatement':
        return this.whileStatement(s.test, s.body, labels);

      case 'DoWhileStatement':
        return this.doWhileStatement(s.body, s.test, labels);

      case 'ForStatement':
        return this.forStatement(s.init, s.test, s.update, s.body, labels);

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
        fail("illegal " + s.type + " node");
    }
};

function checkSubtype(actual, expected, msg) {
    if (!actual.isExpressionType || !actual.subtype(expected))
        fail("expected " + expected + " in " + msg + ", got " + actual);
}

// (Expression, Statement, Statement | null) -> control
Vp.ifStatement = function ifStatement(test, cons, alt) {
    checkSubtype(this.expression(test), types.boolish, "if test");
    return union([this.statement(cons, []),
                  alt ? this.statement(alt, []) : []]);
};

// (Expression | null) -> control
Vp.returnStatement = function returnStatement(arg) {
    checkSubtype(this.optExpression(arg) || types.void, this._result, "return argument");
    return RETURN;
};

// (Expression, Statement, labels) -> control
Vp.whileStatement = function whileStatement(test, body, labels) {
    checkSubtype(this.expression(test), types.boolish, "while loop condition");
    labels.push(null);
    var control = this.statement(body, labels);
    return union([[], control]).filter(notIn(labels));
};

// (Statement, Expression, labels) -> control
Vp.doWhileStatement = function doWhileStatement(body, test, labels) {
    labels.push(null);
    var control = this.statement(body, labels);
    checkSubtype(this.expression(test), types.boolish, "do-while loop condition");
    return control === RETURN ? RETURN : control.filter(notIn(labels));
};

// (VariableDeclaration | Expression | null, Expression | null, Expression | null, Statement, labels) -> control
Vp.forStatement = function forStatement(init, test, update, body, labels) {
    if (init.type === 'VariableDeclaration')
        fail("illegal variable declaration in for-head");
    this.optExpression(init);
    checkSubtype(this.optExpression(test) || types.bit, types.boolish, "for loop condition");
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
            fail("illegal non-final default clause");
        var control = this.case(c, s);
        mayBreak = mayBreak || (control && control.length > 0);
        return control;
    }, this);
    return (!mayBreak && controls[n - 1] === RETURN)
         ? RETURN
         : union(controls).filter(notIn(labels));
};

Vp.case = function case_(c, s) {
    // FIXME: do we need to syntactically limit case clause expressions?
    if (c.test)
        checkSubtype(this.expression(c.test), s, "case clause expression");
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
            fail("expected number literal, got " + JSON.stringify(e.value));
        if (hasDot(e.raw))
            return types.double;
        if (e.value < -0x80000000 || e.value > 0xffffffff)
            fail("int literal out of range: " + e.value + " (0x" + e.value.toString(16) + ")");
        return types.constant;

      case 'Identifier':
        var t = this._env.lookup(e.name);
        if (!t)
            fail("unbound variable " + e.name);
        if (!t.isExpressionType)
            fail("expected expression type, got " + t);
        return t;

      case 'AssignmentExpression':
        return e.left.type === 'Identifier'
             ? this.assignment(e.left.name, e.right)
             : this.store(e.left, e.right);

      case 'MemberExpression':
        return this.load(e);

      case 'CallExpression':
        match.nodeType(e.callee, 'Identifier', "function call");
        var t = this._env.lookup(e.callee.name);
        if (!t)
            fail("unbound function " + e.callee.name);
        if (t === 'imul')
            return this.imul(e.arguments);
        if (t === 'function')
            return this.ffi(e.arguments);
        if (t instanceof types.arrow)
            return this.call(e.arguments, t.params, t.result);
        fail("illegal callee type " + t);

      case 'ConditionalExpression':
        checkSubtype(this.expression(e.test), types.boolish, "conditional expression");
        var t1 = this.expression(e.consequent);
        var t2 = this.expression(e.alternate);
        if (t1.subtype(t2))
            return t2;
        if (t2.subtype(t1))
            return t1;
        fail("incompatible conditional types " + t1 + " and " + t2);

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
                fail("expected double or intish, got " + t);
            }
        }
        if (!unops.has(e.operator))
            fail("unexpected unary operator " + e.operator);
        var a = unops.get(e.operator);
        checkSubtype(this.expression(e.argument), a.params[0], "unary operator");
        return a.result;

      case 'BinaryExpression':
        if (!binops.has(e.operator))
            fail("unexpected binary operator " + e.operator);
        var a = binops.get(e.operator);
        var t1 = this.expression(e.left);
        var t2 = this.expression(e.right);
        for (var i = 0, n = a.length; i < n; i++) {
            var t = a[i];
            if (t1.subtype(t.params[0]) && t2.subtype(t.params[1]))
                return t.result;
        }
        fail("type mismatch in binary " + e.operator + " operator: got " + t1 + " and " + t2);

      default:
        fail("illegal " + e.type + " node");
    }
};

// ([Expression]) -> type
Vp.imul = function imul(args) {
    if (args.length !== 2)
        fail("imul expects 2 arguments, got " + args.length);
    checkSubtype(this.expression(args[0]), types.intish, "imul");
    checkSubtype(this.expression(args[1]), types.intish, "imul");
    return types.signed;
};

// ([Expression]) -> Type
Vp.ffi = function ffi(args) {
    for (var i = 0, n = args.length; i < n; i++) {
        checkSubtype(this.expression(args[i]), types.extern, "FFI call");
    }
    return types.unknown;
};

// ([Expression], [Type], Type) -> Type
Vp.call = function call(args, paramTypes, resultType) {
    if (args.length !== paramTypes.length)
        fail("expected " + paramTypes.length + " arguments, got " + args.length);
    for (var i = 0, n = args.length; i < n; i++) {
        checkSubtype(this.expression(args[i]), paramTypes[i], "function call");
    }
    return resultType;
};

// (string, Expression) -> Type
Vp.assignment = function assignment(x, e) {
    var s = this._env.lookup(x);
    if (!s)
        fail("unbound variable " + x);
    if (!s.isExpressionType)
        fail("invalid target of assignment: " + x);
    var t = this.expression(e);
    checkSubtype(t, s, "assignment");
    return t;
};

// (number) -> boolean
function validMask(n) {
    // quick and dirty test that n = 2^k - 1
    return !/0/.test(n.toString(2));
}

// (Expression) -> Type
Vp.load = function load(expr) {
    var idx = match.heapIndex(expr, "heap index");
    var x = idx.heap, e = idx.address, m = idx.bound, b = idx.shift;
    var a = this._env.lookup(x);
    if (!a)
        fail("unbound variable " + a);
    if (!(a instanceof types.array))
        fail("expected typed array variable, got " + x);
    checkSubtype(this.expression(e), types.intish, "heap index");
    if (!validMask(m))
        fail("expected valid heap index bound mask, got " + m);
    if (b !== a.bits / 8)
        fail("expected shift of " + (a.bits / 8) + " bits, got " + b);
    return a.elts;
};

// (Expression, Expression) -> Type
Vp.store = function store(left, right) {
    var t1 = this.load(left);
    var t2 = this.expression(right);
    checkSubtype(t2, t1, "heap store");
    return t1;
};

// (Statement) -> (dict<[string]> | string)
Vp.export = function export_(stmt) {
    match.nodeType(stmt, 'ReturnStatement', "export clause");
    if (!stmt.argument)
        fail("empty export clause");
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
                  fail("illegal getter or setter in export clause");
              match.nodeType(prop.value, 'Identifier', "export clause");
              return [key, prop.value.name];
          }, this));

        default:
          fail("expected function or set of functions in export clause, got " + arg.type + " node");
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
