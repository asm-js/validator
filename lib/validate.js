var esprima = require('esprima');
var dict = require('dict');
var match = require('pattern-match');
var array = require('array-extended');
var env = require('./env');
var ty = require('./types');
var fail = require('./fail');
var tables = require('./tables');
var Report = require('./report');

// -----------------------------------------------------------------------------
// utilities
// -----------------------------------------------------------------------------

var log = Math.log;

var LOG2 = log(2);

// (number) -> number
function log2(x) {
    return log(x) / LOG2;
}

// (number) -> boolean
function powerOf2(x) {
    return (x & (x - 1)) === 0;
}

// (Statement) -> boolean
function nonEmpty(s) {
    return s.type !== 'EmptyStatement';
}

// ([AST], [{ name: string, type: string }]) -> { string: AST, ... }
function split(nodes, filters) {
    var result = {};
    var nNodes = nodes.length, nFilters = filters.length;
    var iNode = 0;
    for (var iFilter = 0; iFilter < nFilters; iFilter++) {
        var filter = filters[iFilter];
        var next = [];
        while (iNode < nNodes && nodes[iNode].type === filter.type) {
            next.push(nodes[iNode]);
            iNode++;
        }
        result[filter.name] = next;
    }
    return result;
}

// (string) -> boolean
function hasDot(s) {
    return s.indexOf(".") !== -1;
}

// (string) -> boolean
function dotless(s) {
    return !hasDot(s);
}

// (Expression, Expression) -> [Expression]
function flattenAdditive(left, right) {
    var result = [];

    // Since .pop is faster than .shift we'll pop tasks from the end.
    var todo = [right, left];
    while (todo.length > 0) {
        match(todo.pop(), function(when) {
            when({
                type: 'BinaryExpression',
                operator: match.some('+', '-'),
                left: match.var('left'),
                right: match.var('right')
            }, function(vars) {
                todo.push(vars.right, vars.left);
            });

            when(match.var('operand'), function(vars) {
                result.push(vars.operand);
            });
        });
    }

    return result;
}

// -----------------------------------------------------------------------------
// main methods
// -----------------------------------------------------------------------------

function Validator() {
    this._roots = {
        stdlib: null,
        foreign: null,
        heap: null
    };
    this._globals = env(this);
    this._locals = null;
    this._src = null;
    this._result = null;
}

var Vp = Validator.prototype;

// (AST, string[, Function]) -> any
// Delegates to pattern-match library, converting MatchErrors to validation errors.
Vp.match = function(node, desc, body) {
    if (body) {
        try {
            return match(node, body, this);
        } catch (e) {
            if (e instanceof match.MatchError)
                this.fail("invalid " + desc);
            else
                throw e;
        }
    }

    var delayed = match(node);
    var self = this;

    return {
        when: function(pattern, template) {
            try {
                return delayed.when(pattern, template, self);
            } catch (e) {
                if (e instanceof match.MatchError) {
                    var loc = e && e.actual ? e.actual.loc : null;
                    self.fail("invalid " + desc + fail.locToString(loc), loc);
                } else {
                    throw e;
                }
            }
        }
    };
};

// (string) -> Report
Vp.validate = function validate(src) {
    this._src = src;
    var module = esprima.parse("(" + src + ")", { raw: true, loc: true }).body[0].expression;
    var vars = this.match(module, "asm.js module declaration").when({
        type: 'FunctionExpression',
        id: match.var('id', { type: 'Identifier' }),
        params: match.var('params', { length: match.range(0, 4) }),
        body: { loc: match.var('loc'), body: match.var('body') }
    });
    return this.module(vars.params, vars.body.filter(nonEmpty), vars.loc);
};

// (string, Loc) -/->
Vp.fail = function fail_(msg, loc) {
    fail(msg, this._src, loc);
};

// ([Statement], Loc) -> {
//     imports: [VariableDeclaration],
//     functions: [FunctionDeclaration],
//     tables: [VariableDeclaration],
//     exports: Expression
// }
Vp.splitModule = function splitModule(body, loc) {
    var sections = split(body, [
        { name: 'directive', type: 'ExpressionStatement' },
        { name: 'globals', type: 'VariableDeclaration' },
        { name: 'functions', type: 'FunctionDeclaration' },
        { name: 'tables', type: 'VariableDeclaration' },
        { name: 'exports', type: 'ReturnStatement' }
    ]);
    if (sections.directive.length !== 1)
        this.fail("expected single \"use asm\" directive, got " + sections.directive.length + " ExpressionStatement nodes", loc);
    this.match(sections.directive, "\"use asm\" directive").when([{
        type: 'ExpressionStatement',
        expression: { type: 'Literal', value: "use asm" }
    }]);
    if (sections.exports.length !== 1)
        this.fail("expected single exports declaration, got " + sections.exports.length + " ReturnStatement nodes", loc);
    return {
        globals: sections.globals,
        functions: sections.functions,
        tables: sections.tables,
        exports: sections.exports[0].argument
    };
};

// (Identifier, Statement) -> Type
Vp.paramType = function paramType(id, stmt) {
    return this.match(stmt, "parameter annotation").when({
        type: 'ExpressionStatement',
        expression: {
            type: 'AssignmentExpression',
            left: { type: 'Identifier', name: id.name },
            right: match.var('right')
        }
    }, function(vars) {
        return this.match(vars.right, "parameter annotation type", function(when) {
            when({
                type: 'UnaryExpression',
                operator: '+',
                argument: { type: 'Identifier', name: id.name }
            }, function() {
                return ty.Double;
            });

            when({
                type: 'BinaryExpression',
                operator: '|',
                left: { type: 'Identifier', name: id.name },
                right: { type: 'Literal', value: 0 }
            }, function() {
                return ty.Int;
            });
        });
    });
};

// (Statement) -> Type
Vp.returnType = function returnType(stmt) {
    if (stmt.type !== 'ReturnStatement')
        return ty.Void;

    return this.match(stmt.argument, "return type annotation", function(when) {
        when(null, function() {
            return ty.Void;
        });

        when({
            type: 'UnaryExpression',
            operator: '+'
        }, function() {
            return ty.Double;
        });

        when({
            type: 'BinaryExpression',
            operator: '|',
            right: { type: 'Literal', value: 0 }
        }, function() {
            return ty.Signed;
        });

        when({
            type: 'Literal',
            value: match.number,
            raw: hasDot
        }, function() {
            return ty.Double;
        });

        when({
            type: 'Literal',
            value: match.all(match.number,
                             match.range(-0x80000000, 0x100000000)),
            raw: dotless
        }, function() {
            return ty.Signed;
        });
    });
};

// (FunctionDeclaration) -> Type
Vp.functionType = function functionType(funDecl) {
    var params = funDecl.params;
    var n = params.length;
    var body = funDecl.body.body.filter(nonEmpty);
    if (body.length < n)
        this.fail("not enough annotations for parameters to " + funDecl.id.name, funDecl.body.loc);
    var paramTypes = array.zip(params, body.slice(0, n)).map(function(pair) {
        return this.paramType(pair[0], pair[1]);
    }, this);
    var returnType = body.length > 0 ? this.returnType(body[body.length - 1]) : ty.Void;
    return ty.Arrow(paramTypes, returnType);
};

// (string, Loc) -> Type
Vp.lookup = function lookup(x, loc) {
    if (this._locals) {
        var t = this._locals.lookup(x);
        if (t)
            return t;
    }

    var mt = this._globals.lookup(x);
    if (!mt)
        this.fail("unbound variable " + x, loc);

    return mt.type;
};

// (string, Loc) -> ValueType
Vp.lookupValueType = function lookupValueType(x, loc) {
    var t = this.lookup(x, loc);
    if (!(t instanceof ty.ValueType))
        this.fail("expected value type, got " + t, loc);
    return t;
};

// (string, Expression, Loc) -> { mutable: boolean, type: Type }
Vp.global = function global(x, rhs, loc) {
    if (!rhs)
        this.fail("global variable missing initializer expression", loc);

    return this.match(rhs, "global declaration", function(when) {
        when({
            type: 'Literal',
            value: match.var('f', match.number),
            raw: match.var('src', hasDot)
        }, function(vars) {
            return { mutable: true, type: ty.Double };
        }, this);

        when({
            type: 'Literal',
            value: match.var('n', match.all(match.integer,
                                            match.range(-0x80000000, 0x100000000))),
            raw: match.var('src')
        }, function(vars) {
            return { mutable: true, type: ty.Int };
        }, this);

        when({
            type: 'MemberExpression',
            object: {
                type: 'MemberExpression',
                object: {
                    type: 'Identifier',
                    name: this._roots.stdlib
                },
                property: {
                    type: 'Identifier',
                    name: 'Math'
                }
            },
            property: {
                type: 'Identifier',
                name: match.var('x')
            }
        }, function(vars) {
            if (!tables.STDLIB_MATH_TYPES.has(vars.x))
                this.fail("unknown library: Math." + vars.x, init.loc);
            return { mutable: false, type: tables.STDLIB_MATH_TYPES.get(vars.x) };
        }, this);

        when({
            type: 'MemberExpression',
            object: {
                type: 'Identifier',
                name: this._roots.stdlib
            },
            property: match.var('x')
        }, function(vars) {
            if (!tables.STDLIB_TYPES.has(vars.x))
                this.fail("unknown library: " + vars.x, init.loc);
            return { mutable: false, type: tables.STDLIB_TYPES.get(vars.x) };
        }, this);

        when({
            type: 'MemberExpression',
            object: {
                type: 'Identifier',
                name: this._roots.foreign
            },
            property: match.var('x')
        }, function(vars) {
            return { mutable: false, type: ty.Function };
        }, this);

        when({
            type: 'BinaryExpression',
            operator: '|',
            left: {
                type: 'MemberExpression',
                object: {
                    type: 'Identifier',
                    name: this._roots.foreign
                },
                property: match.var('x')
            },
            right: {
                type: 'Literal',
                value: 0
            }
        }, function(vars) {
            return { mutable: false, type: ty.Int };
        }, this);

        when({
            type: 'UnaryExpression',
            operator: '+',
            argument: {
                type: 'MemberExpression',
                object: {
                    type: 'Identifier',
                    name: this._roots.foreign
                },
                property: match.var('x')
            }
        }, function(vars) {
            return { mutable: false, type: ty.Double };
        }, this);

        when({
            type: 'NewExpression',
            callee: {
                type: 'MemberExpression',
                object: {
                    type: 'Identifier',
                    name: this._roots.stdlib
                },
                property: {
                    type: 'Identifier',
                    name: match.var('view'),
                    loc: match.var('loc')
                }
            },
            arguments: match.var('args', [{ type: 'Identifier', name: this._roots.heap }])
        }, function(vars) {
            if (vars.args.length !== 1)
                this.fail("heap view constructor expects 1 argument, got " + vars.args.length, vars.args[1].loc);
            if (!tables.HEAP_VIEW_TYPES.has(vars.view))
                this.fail("unknown typed array type: " + vars.view, vars.loc);
            return { mutable: false, type: tables.HEAP_VIEW_TYPES.get(vars.view) };
        }, this);
    }, this);
};

// (string, Expression, Loc) -> Table
Vp.table = function table(x, rhs, loc) {
    this.match(rhs, "function table").when({
        type: 'ArrayExpression',
        elements: match.var('elements')
    }, function(vars) {
        var fs = elements.map(function(element) {
            return this.match(element, "function table entry").when(match.var('f', { type: 'Identifier' }),
                                                                    function(vars) { return vars.f; },
                                                                    this);
        }, this);

        if (fs.length === 0)
            this.fail("empty function table", loc);
        if (!powerOf2(fs.length))
            this.fail("function table length must be a power of 2, got " + fs.length, loc);

        var fts = fs.map(function(f) {
            var ft = this.lookup(f.name, f.loc);
            if (!(ft instanceof ty.Arrow))
                this.fail("non-function " + f.name + " in function table", f.loc);
            return ft;
        }, this);

        var ft = fts[0];

        for (var i = 1, n = fts.length; i < n; i++) {
            if (!ft.equals(fts[i]))
                this.fail("unexpected function type " + fs[i].name + " : " + fts[i] + " in function table", fs[i].loc);
        }

        return new ty.Table(ft, fs.length);
    });
};

// (string, Expression) -> Type
Vp.local = function local(x, rhs) {
    return this.match(rhs, "declaration of local " + x, function(when) {
        when({
            type: 'Literal',
            value: match.number,
            raw: hasDot
        }, function(vars) {
            return ty.Double;
        }, this);

        when({
            type: 'Literal',
            value: match.all(match.integer, match.range(-0x80000000, 0x100000000))
        }, function(vars) {
            return ty.Int;
        }, this);
    });
};

// (FunctionDeclaration) -> void
Vp.function = function function_(decl) {
    var f = decl.id.name;
    var ft = this._globals.lookup(f).type;
    var params = decl.params.map(function(id) { return id.name; });
    var paramTypes = ft.params;
    var resultType = ft.result;
    var body = decl.body.body.filter(nonEmpty);

    try {
        this._locals = env(this);
        this._result = resultType;

        // Bind the parameters.
        params.forEach(function(x, i) {
            this._locals.bind(x, paramTypes[i]);
        }, this);

        // Bind the locals.
        var i = params.length, n = body.length;
        while (i < n && body[i].type === 'VariableDeclaration') {
            body[i].declarations.forEach(function(dtor) {
                var x = dtor.id.name;
                this._locals.bind(x, this.local(x, dtor.init));
            }, this);
            i++;
        }

        // Check the body.
        this.statements(body.slice(i));
    } finally {
        this._locals = null;
        this._result = null;
    }
};

// (Expression) -> { type: 'single', export: { name: string, type: Arrow } }
//               | { type: 'multiple', exports: dict<{ name: string, type: Arrow }> }
Vp.exports = function exports(expr) {
    return this.match(expr, "exports declaration", function(when) {
        when({
            type: 'Identifier',
            name: match.var('f'),
            loc: match.var('loc')
        }, function(vars) {
            var t = this.lookup(vars.f, vars.loc);
            if (!(t instanceof ty.Arrow))
                this.fail("expected exported function, got definition of type " + t, vars.loc);
            return { type: 'single', export: { name: vars.f, type: t } };
        }, this);

        when({
            type: 'ObjectExpression',
            properties: match.var('props')
        }, function(vars) {
            var table = dict();

            var self = this;

            function add(internal, external, loc) {
                var t = self.lookup(internal, loc);
                if (!(t instanceof ty.Arrow))
                    self.fail("expected exported function, got definition of type " + t, loc);
                table.set(external, {
                    name: internal,
                    type: t
                });
            }

            vars.props.forEach(function(prop) {
                return this.match(prop, "export declaration", function(when) {
                    when({
                        key: {
                            type: 'Literal',
                            value: match.var('external', match.string)
                        },
                        value: {
                            type: 'Identifier',
                            name: match.var('internal'),
                            loc: match.var('loc')
                        },
                        kind: 'init'
                    }, function(vars) {
                        add(vars.internal, vars.external, vars.loc);
                    }, this);

                    when({
                        key: {
                            type: 'Identifier',
                            name: match.var('external')
                        },
                        value: {
                            type: 'Identifier',
                            name: match.var('internal'),
                            loc: match.var('loc')
                        },
                        kind: 'init'
                    }, function(vars) {
                        add(vars.internal, vars.external, vars.loc);
                    }, this);
                });
            }, this);

            return { type: 'multiple', exports: table };
        }, this);
    });
};

// ([Identifier], [Statement], Loc) -> Report
Vp.module = function module(params, body, loc) {
    var sections = this.splitModule(body, loc);

    // Bind module parameters.
    params.forEach(function(id, i) {
        this._roots[tables.ROOT_NAMES[i]] = id.name;
        this._globals.bind(id.name, { mutable: false, type: ty.ModuleParameter }, id.loc);
    }, this);

    // Bind and check globals.
    sections.globals.forEach(function(varDecl) {
        varDecl.declarations.forEach(function(decl) {
            var x = decl.id.name;
            var mt = this.global(x, decl.init, decl.loc);
            this._globals.bind(x, mt, decl.id.loc);
        }, this);
    }, this);

    // Bind function types.
    sections.functions.forEach(function(funDecl) {
        var id = funDecl.id, f = id.name;
        var t = this.functionType(funDecl);
        this._globals.bind(f, { mutable: false, type: t }, id.loc);
    }, this);

    // Bind and check function tables.
    sections.tables.forEach(function(varDecl) {
        varDecl.declarations.forEach(function(decl) {
            var x = decl.id.name;
            var t = this.table(x, decl.init, decl.loc);
            this._globals.bind(x, { mutable: false, type: t }, decl.id.loc);
        }, this);
    }, this);

    // Check functions.
    sections.functions.forEach(this.function, this);

    // Check exports.
    var exports = this.exports(sections.exports);

    return new Report(this._globals, exports);
};

// -----------------------------------------------------------------------------
// statements
// -----------------------------------------------------------------------------

// ([Statement]) -> void
Vp.statements = function statements(ss) {
    ss.forEach(this.statement, this);
};

// (Statement) -> void
Vp.statement = function statement(s) {
    switch (s.type) {
      case 'BlockStatement':
        return this.statements(s.body);

      case 'ExpressionStatement':
        return (s.expression.type === 'CallExpression')
             ? this.call(s.expression, ty.Void)
             : this.expression(s.expression);

      case 'IfStatement':
        return this.ifStatement(s.test, s.consequent, s.alternate);

      case 'ReturnStatement':
        return this.returnStatement(s.argument, s.loc);

      case 'WhileStatement':
        return this.whileStatement(s.test, s.body);

      case 'DoWhileStatement':
        return this.doWhileStatement(s.body, s.test);

      case 'ForStatement':
        return this.forStatement(s.init, s.test, s.update, s.body, s.loc);

      case 'BreakStatement':
      case 'ContinueStatement':
        return;

      case 'LabeledStatement':
        return this.statement(s.body);

      case 'SwitchStatement':
        return this.switchStatement(s.discriminant, s.cases);

      default:
        this.fail("illegal " + s.type + " node", s.loc);
    }
};

// (Type, Type, string, Loc) -> void
Vp.checkSubtype = function checkSubtype(actual, expected, msg, loc) {
    if (!(actual instanceof ty.ValueType) || !actual.subtype(expected))
        this.fail("expected " + expected + " in " + msg + ", got " + actual, loc);
};

Vp.checkSameType = function checkSameType(actual, expected, msg, loc) {
    if (!(actual instanceof ty.ValueType) || !actual.equals(expected))
        this.fail("expected " + expected + " in " + msg + ", got " + actual, loc);
};

// ([Type], Type, string, [Loc], Loc) -> Type
Vp.checkArguments = function checkArguments(ts, expected, msg, locs, loc) {
    if (expected instanceof ty.Arrow) {
        ts.forEach(function(t, i) {
            this.checkSubtype(t, expected.params[i], "argument", locs[i]);
        }, this);
        return expected.result;
    } else if (expected instanceof ty.Overloaded) {
        var t;
        expected.alts.some(function(alt) {
            var ss = alt.params;
            if (ss.length === ts.length && ss.every(function(s, i) { return ts[i].subtype(s) })) {
                t = alt.result;
                return true;
            }
        }, this);
        if (!t)
            this.fail(msg + ": argument types do not match any overloading", loc);
        return t;
    } else {
        this.fail("expected function type, got " + expected, loc);
    }
};

// (Expression, Statement, Statement | null) -> void
Vp.ifStatement = function ifStatement(test, cons, alt) {
    this.checkSubtype(this.expression(test), types.boolish, "if test", test.loc);
    this.statement(cons);
    if (alt)
        this.statement(alt);
};

// (Expression | null, Loc) -> void
Vp.returnStatement = function returnStatement(arg, loc) {
    this.checkSubtype(this.optExpression(arg) || ty.Void, this._result, "return argument", loc);
};

// (Expression, Statement) -> void
Vp.whileStatement = function whileStatement(test, body, labels) {
    this.checkSubtype(this.expression(test), ty.Int, "while loop condition", test.loc);
    this.statement(body);
};

// (Statement, Expression) -> void
Vp.doWhileStatement = function doWhileStatement(body, test) {
    this.statement(body);
    this.checkSubtype(this.expression(test), ty.Int, "do-while loop condition", test.loc);
};

// (VariableDeclaration | Expression | null, Expression | null, Expression | null, Statement, Loc) -> void
Vp.forStatement = function forStatement(init, test, update, body, loc) {
    if (init.type === 'VariableDeclaration')
        this.fail("illegal variable declaration in for-head", init.loc);
    this.optExpression(init);
    this.checkSubtype(this.optExpression(test) || ty.Int, ty.Int, "for loop condition", loc);
    this.optExpression(update);
    this.statement(body);
};

// (Expression, [SwitchCase], labels) -> void
Vp.switchStatement = function switchStatement(disc, cases) {
    var s = this.expression(disc);
    cases.forEach(function(c) {
        this.case(c, s);
    }, this);
};

// (SwitchCase, Type) -> void
Vp.case = function case_(c, s) {
    if (c.test)
        this.checkSubtype(this.literal(c.test), s, "case clause expression", c.test.loc);
    this.statements(c.consequent);
};

// -----------------------------------------------------------------------------
// expressions
// -----------------------------------------------------------------------------

// (Expression | null) -> ValueType | null
Vp.optExpression = function optExpression(expr) {
    return expr ? this.expression(expr) : null;
};

// (Expression) -> ValueType
Vp.expression = function expression(e) {
    return this.match(e, "expression", function(when) {
        when({ type: 'Literal', raw: hasDot }, function() {
            return ty.Double;
        });

        when({ type: 'Literal', value: match.range(-0x80000000, 0xffffffff) }, function() {
            return ty.Fixnum;
        });

        when({ type: 'Identifier' }, function() {
            return this.lookupValueType(e.name, e.loc);
        }, this);

        when({
            type: 'AssignmentExpression',
            left: match.var('left', { type: match.some('Identifier', 'MemberExpression') }),
            right: match.var('right')
        }, function(vars) {
            var s = this.expression(vars.left);
            var t = this.expression(vars.right);
            this.checkSubtype(t, s, "assignment", e.loc);
            return t;
        }, this);

        when({
            type: 'MemberExpression',
            object: { type: 'Identifier', name: match.var('x'), loc: match.var('loc') },
            property: { type: 'Literal', value: match.range(0, 0x100000000), raw: dotless }
        }, function(vars) {
            var t = this.lookup(vars.x, vars.loc);
            if (!(t instanceof ty.View))
                this.fail("expected view type, got " + t);
            return t.elementType;
        }, this);

        when({
            type: 'MemberExpression',
            object: { type: 'Identifier', name: match.var('x'), loc: match.var('loc') },
            property: {
                type: 'BinaryExpression',
                operator: '>>',
                left: match.var('e'),
                right: match.var('n', {
                    type: 'Literal',
                    value: match.var('shift', match.number),
                    raw: dotless
                })
            },
            computed: true
        }, function(vars) {
            var t = this.lookup(vars.x, vars.loc);
            if (!(t instanceof ty.View))
                this.fail("expected view type, got " + t, vars.loc);
            this.checkSubtype(this.expression(vars.e), ty.Intish, "heap address" , vars.e.loc);
            var expectedShift = log2(t.bytes);
            if (vars.shift !== expectedShift)
                this.fail("expected shift of " + expectedShift + " bits for view type " + t + ", got " + vars.shift, vars.n.loc);
            return t.elementType;
        }, this);

        when({
            type: 'MemberExpression',
            object: { type: 'Identifier', name: match.var('x'), loc: match.var('loc') },
            property: match.var('e'),
            computed: true
        }, function(vars) {
            var t = this.lookup(vars.x, vars.loc);
            if (!(t instanceof ty.View))
                this.fail("expected view type, got " + t, vars.loc);
            if (t.bytes !== 1)
                this.fail("expected view type with element size 1, got " + t, vars.loc);
            if (t.elementType !== ty.Intish)
                this.fail("expected view type with intish elements, got " + t, vars.loc);
            this.checkSubtype(this.expression(vars.e), ty.Int, "heap address", vars.e.loc);
            return t.Intish;
        }, this);

        when({
            type: 'ConditionalExpression',
            test: match.var('test'),
            consequent: match.var('cons'),
            alternate: match.var('alt')
        }, function(vars) {
            this.checkSubtype(this.expression(vars.test), ty.Int, "conditional test", vars.test.loc);
            var t1 = this.expression(vars.cons);
            var t2 = this.expression(vars.alt);
            if (t1 !== t2)
                this.fail("type mismatch between conditional branches", e.loc);
            if (t1 !== ty.Int && t1 !== ty.Double)
                this.fail("expected int or double in conditional branch, got " + t1, vars.cons.loc);
            return t1;
        }, this);

        when({
            type: 'SequenceExpression',
            expressions: match.var('es')
        }, function(vars) {
            var last = vars.es.pop();
            vars.es.forEach(function(e) {
                if (e.type === 'CallExpression')
                    this.call(e, ty.Void);
                else
                    this.expression(e);
            }, this);
            return this.expression(last);
        }, this);

        when({
            type: 'UnaryExpression',
            operator: '~',
            argument: {
                type: 'UnaryExpression',
                operator: '~',
                argument: match.var('e')
            }
        }, function(vars) {
            this.checkSubtype(this.expression(vars.e), ty.Double, "double->signed coercion", e.loc);
            return ty.Signed;
        }, this);

        when({
            type: 'UnaryExpression',
            operator: '+',
            argument: match.var('e', { type: 'CallExpression' })
        }, function(vars) {
            this.call(vars.e, ty.Double);
            return ty.Double;
        }, this);

        when({
            type: 'UnaryExpression',
            operator: match.var('op'),
            argument: match.var('arg')
        }, function(vars) {
            var t = tables.UNOPS.get(vars.op);
            if (!t)
                this.fail("unknown unary operator " + vars.op, e.loc);
            return this.checkArguments([this.expression(vars.arg)], t, "unary expression", [vars.op.loc], e.loc);
        }, this);

        when({
            type: 'BinaryExpression',
            operator: '|',
            left: match.var('e', { type: 'CallExpression' }),
            right: { type: 'Literal', value: 0, raw: dotless }
        }, function(vars) {
            this.call(vars.e, ty.Signed);
            return ty.Signed;
        }, this);

        when({
            type: 'BinaryExpression',
            operator: match.some('+', '-'),
            left: match.var('left'),
            right: match.var('right')
        }, function(vars) {
            var operands = flattenAdditive(vars.left, vars.right);
            var n = operands.length;
            var t = this.expression(operands[0]);
            if (t.subtype(ty.Double)) {
                for (var i = 1; i < n; i++) {
                    var operand = operands[i];
                    this.checkSubtype(this.expression(operand), ty.Double, "additive operand", operand.loc);
                }
                return ty.Double;
            } else if (t.subtype(ty.Int)) {
                if (n > 0x100000)
                    this.fail("too many additive operations without coercion: " + n + " > maximum 2^20", e.loc);
                for (var i = 1; i < n; i++) {
                    var operand = operands[i];
                    this.checkSubtype(this.expression(operand), ty.Int, "additive operand", operand.loc);
                }
                return ty.Intish;
            }
            this.fail("expected type int or double, got " + t, operands[0].loc);
        }, this);

        when({
            type: 'BinaryExpression',
            operator: match.var('op'),
            left: match.var('left'),
            right: match.var('right')
        }, function(vars) {
            var t = tables.BINOPS.get(vars.op);
            if (!t)
                this.fail("unknown binary operator " + vars.op, e.loc);
            return this.checkArguments([this.expression(vars.left), this.expression(vars.right)],
                                       t, "operator " + vars.op,
                                       [vars.left.loc, vars.right.loc],
                                       e.loc);
        }, this);
    });
};

// -----------------------------------------------------------------------------
// call expressions
// -----------------------------------------------------------------------------

// (CallExpression, ValueType) -> void
Vp.call = function call(e, t) {
    return this.match(e, "function call", function(when) {
        when({
            type: 'CallExpression',
            callee: { type: 'Identifier', name: match.var('f'), loc: match.var('loc') },
            arguments: match.var('args')
        }, function(vars) {
            var formalReturnType = this.checkArguments(vars.args.map(this.expression, this),
                                                       this.lookup(vars.f, vars.loc),
                                                       "function call",
                                                       vars.args.map(function(arg) { return arg.loc; }),
                                                       e.loc);
            this.checkSameType(formalReturnType, t, "function call", e.loc);
        }, this);

        when({
            type: 'CallExpression',
            callee: {
                type: 'MemberExpression',
                object: { type: 'Identifier', name: match.var('f'), loc: match.var('loc') },
                property: {
                    type: 'BinaryExpression',
                    operator: '&',
                    left: match.var('index'),
                    right: {
                        type: 'Literal',
                        value: match.var('n', match.number),
                        raw: dotless,
                        loc: match.var('nloc')
                    }
                },
                computed: true
            },
            arguments: match.var('args')
        }, function(vars) {
            var t = this.lookup(vars.f, vars.loc);
            if (!(t instanceof ty.Table))
                this.fail("expected function table, got " + vars.f, vars.loc);
            this.checkSubtype(this.expression(vars.index), ty.Intish, "function pointer", vars.index.loc);
            if (t.length !== vars.n + 1)
                this.fail("function table mask should be " + (t.length - 1) + ", got " + vars.n, vars.nloc);
            var formalReturnType = this.checkArguments(vars.args.map(this.expression, this),
                                                       t.type, "function pointer call",
                                                       vars.args.map(function(arg) { return arg.loc; }),
                                                       e.loc);
            this.checkSameType(formalReturnType, t, "function call", e.loc);
        }, this);
    });
};

// -----------------------------------------------------------------------------
// front end
// -----------------------------------------------------------------------------

// (string) -> Report
module.exports = function validate(src) {
    return (new Validator).validate(src);
};
