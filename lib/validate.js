var esprima = require('esprima');
var env = require('./env');
var dict = require('dict');
var types = require('./types');
var fail = require('./fail');
var match = require('./match');

function Validator() {
    this._env = env();
    this._result = null;
    this._controls = dict();
}

var A = dict({
    Uint8Array: types.uint32,
    Uint16Array: types.uint32,
    Uint32Array: types.uint32,
    Int8Array: types.int32,
    Int16Array: types.int32,
    Int32Array: types.int32,
    Float32Array: types.float64,
    Float64Array: types.float64
});

var M = dict({
    floor: types.floor,
    ceil: types.float2float,
    round: types.float2float,
    sin: types.float2float,
    cos: types.float2float
});

// type label = string | null
// type control = RETURN | labels
// type labels = [label]

var RETURN = null;

// ([control]) -> control
function sequence(controls) {
}

// ([control]) -> control
function union(controls) {
}

// (labels) -> label -> boolean
function notIn(labels) {
    return function(l) {
        return labels.indexOf(l) === -1;
    };
}

var p = Validator.prototype;

var IDENTIFIER = /^[a-zA-Z_$][a-zA-Z_$0-9]*$/;

// ([string], string) -> dict<{ type: Type, exportedAs: [string] }>
p.validate = function validate(args, body) {
    if (args.length !== 2 || !IDENTIFIER.test(args[0]) || !IDENTIFIER.test(args[1]))
        fail("expected exactly two valid identifiers, got [" + args.map(JSON.stringify).join(", ") + "]");
    var program = esprima.parse("(function(" + args.join(",") +"){" + body + "\n})").body[0].expression;
    if (program.params.length !== 2)
        throw new Error("unexpected parser problem (somehow found " + program.params.length + " parameter(s))");
    return this.program(program.params[0].name, program.params[1].name, program.body.body);
};

// ([Statement]) -> { imports: [VariableDeclaration], functions: [FunctionDeclaration], exports: [Statement] }
function split(body) {
    var i = 0, n = body.length;
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
function extractType(coerced) {
    switch (coerced.type) {
      case 'BinaryExpression':
        switch (coerced.operator) {
          case '|':
            match.literal(coerced.right, 0, "int32 coercion");
            return types.int32;

          case '>>>':
            match.literal(coerced.right, 0, "uint32 coercion");
            return types.uint32;

          default:
            fail("expected int or uint coercion operator, got " + coerced.operator);
        }

      case 'UnaryExpression':
        match.nodeOp(coerced, '+', "float64 coercion");
        return types.float64;

      case 'ArrayExpression':
        var elements = coerced.elements;
        if (elements.length !== 2)
            fail("expected 64-bit integer literal, got array of length " + elements.length);

        var low = elements[0], high = elements[1];

        match.nodeType(low, 'BinaryExpression', "low uint32 word");
        match.nodeOp(low, '>>>', "low uint32 word");
        match.literal(low.right, 0, "low uint32 word");
        match.nodeType(low.left, 'MemberExpression', "low uint32 word");
        match.literal(low.left.property, 0, "low uint32 word");

        match.nodeType(high, 'BinaryExpression', "high 32-bit word");
        switch (high.operator) {
          case '|':
            match.literal(high.right, 0, "high int32 word");
            match.nodeType(high.left, 'MemberExpression', "high int32 word");
            match.literal(high.left.property, 1, "high int32 word");
            return types.int64;

          case '>>>':
            match.literal(high.right, 0, "high uint32 word");
            match.nodeType(high.left, 'MemberExpression', "high uint32 word");
            match.literal(high.left.property, 1, "high uint32 word");
            return types.uint64;

          default:
            fail("expected 32-bit high word, got " + high.operator + " operator");
        }

      default:
        fail("expected type coercion, got " + coerced.type + " node");
    }
}

// (FunctionDeclaration) -> Type
function functionType(funDecl) {
    var params = funDecl.params;
    var n = params.length;
    var body = funDecl.body.body;
    if (body.length < n)
        fail("not enough annotations for parameters to " + funDecl.id.name);
    var paramTypes = [];
    for (var i = 0; i < n; i++) {
        var stmt = body[i];
        if (stmt.type !== 'ExpressionStatement' || stmt.expression.type !== 'AssignmentExpression')
            fail("expected annotation for parameter " + params[i].name + ", got " + stmt.type + " node");
        paramTypes[i] = extractType(stmt.expression.right);
    }
    return types.arrow(paramTypes, types.tvar());
}

// (string, string, [Statement]) -> dict<{ type: Type, exportedAs: [string|null] }>
p.program = function program(b, e, body) {
    // Ensure that b and e can't be rebound in this function.
    this._env.bind(b, types.unused);
    this._env.bind(e, types.unused);

    var sections = split(body);

    // Bind and check imports.
    sections.imports.forEach(function(varDecl) {
        varDecl.declarations.forEach(function(decl) {
            this._env.bind(decl.id.name, this.import(b, e, decl.id.name, decl.init));
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

    // Check function results.
    sections.functions.forEach(function(funDecl) {
        var f = funDecl.id.name;
        var ft = this._env.lookup(f);
        var resultType = ft.result;
        if (!resultType.isBound())
            resultType.unify(types.void);
        if (!resultType.equals(types.void) && this._controls.get(f) !== RETURN)
            fail("function " + f + " may return void");
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

// (string, string, string, Expression | null) -> Type
p.import = function import_(b, e, x, init) {
    if (!init)
        fail("import binding missing initializer expression");

    switch (init.type) {
      case 'MemberExpression':
        match.identifier(init.object, e, "import environment");
        match.nodeType(init.property, 'Identifier', "import binding");
        var y = init.property.name;
        return M.get(y) || types.function;

      case 'CallExpression':
      case 'NewExpression':
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
        return types.array(A.get(y));

      default:
        fail("expected import binding or heap view declaration, got " + init.type + " node");
    }
};

// (FunctionDeclaration) -> void
p.function = function function_(funDecl) {
    var f = funDecl.id.name;
    var ft = this._env.lookup(f);
    var params = funDecl.params.map(function(id) { return id.name });
    var paramTypes = ft.params;
    var resultType = ft.result;
    var body = funDecl.body.body;

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
        this._controls.set(f, this.statements(body.slice(i), []));
    } finally {
        this._env.pop();
        this._result = null;
    }
};

// (VariableDeclarator) -> void
p.local = function local(dtor) {
    var y = dtor.id.name;
    if (!dtor.init)
        fail("expected initializer for local variable " + y);
    this._env.bind(y, extractType(dtor.init));
};

// ([Statement], labels) -> control
p.statements = function statements(ss, labels) {
    return sequence(labels.map(function(s) {
        return this.statement(s, labels);
    }, this));
};

// (Statement, labels) -> control
p.statement = function statement(s, labels) {
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

// (Expression, Statement, Statement | null) -> control
p.ifStatement = function ifStatement(test, cons, alt) {
    this.expression(test).checkSubtype(types.boolish);
    return union([this.statement(cons, []),
                  alt ? this.statement(alt, []) : []]);
};

// (Expression | null) -> control
p.returnStatement = function returnStatement(arg) {
    this._result.unify(arg ? this.expression(arg) : types.void);
    return RETURN;
};

// (Expression, Statement, labels) -> control
p.whileStatement = function whileStatement(test, body, labels) {
    this.expression(test).checkSubtype(types.boolish);
    labels.push(null);
    var control = this.statement(body, labels);
    return union([[], control]).filter(notIn(labels));
};

// (Statement, Expression, labels) -> control
p.doWhileStatement = function doWhileStatement(body, test, labels) {
    labels.push(null);
    var control = this.statement(body, labels);
    this.expression(test).checkSubtype(types.boolish);
    return control === RETURN ? RETURN : control.filter(notIn(labels));
};

// (VariableDeclaration | Expression | null, Expression | null, Expression | null, Statement, labels) -> control
p.forStatement = function forStatement(init, test, update, body, labels) {
    if (init.type === 'VariableDeclaration')
        fail("illegal variable declaration in for-head");
    if (!init)
        fail("illegal empty initialization clause in for-head");
    if (!test)
        fail("illegal empty test clause in for-head");
    if (!update)
        fail("illegal empty update clause in for-head");
    this.expression(init);
    this.expression(test).checkSubtype(types.boolish);
    this.expression(update);
    labels.push(null);
    return this.statement(body, labels).filter(notIn(labels));
};

// (Expression, [SwitchCase], labels) -> control
p.switchStatement = function switchStatement(disc, cases, labels) {
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

p.case = function case_(c, s) {
    if (c.test) {
        var t = this.expression(c.test);
        if (!t.equals(s))
            fail("type mismatch between switch discriminant (" + s + ") and case clause (" + t + ")");
    }
    return this.statements(c.consequent);
};

// (Expression) -> Type
p.expression = function expression(e) {
    switch (e.type) {
      case 'BinaryExpression':
        
      case 'ArrayExpression':
      case 'Identifier':
      case 'AssignmentExpression':
      case 'MemberExpression':
      case 'CallExpression':
      case 'ConditionalExpression':
      case 'SequenceExpression':
      case 'UnaryExpression':
      default:
        fail("illegal " + e.type + " node");
    }
};

// (Statement) -> (dict<[string]> | string)
p.export = function export_(stmt) {
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
p.exportSet = function exportSet(names) {
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

// ([string], string) -> dict<{ type: Type, exportedAs: [string] }>
function validate(args, body) {
    return (new Validator).validate(args, body);
}

module.exports = validate;

validate.A = A;
validate.M = M;
