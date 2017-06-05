var ty = require('../lib/types');
var asmAssert = require('../lib/asmAssert');

exports.testModuloIntish1 = asmAssert.one(
    "% doesn't return int",
    function f() {
        var x = 0, y = 0;
        x = (x|0)%(y|0);
    },
    { pass: false });

exports.testModuleIntish2 = asmAssert.one(
    "% returns intish",
    function f() {
        var x = 0, y = 0;
        x = ((x|0)%(y|0))|0;
    },
    { pass: true });

exports.testIntCoercionRequiresDouble1 = asmAssert.one(
    "~~ requires double",
    function f() {
        var x = 0.0, y = 0;
        y = ~~HF64[0];
    },
    { pass: false });

exports.testIntCoercionRequiresDouble2 = asmAssert.one(
    "~~ requires double",
    function f() {
        var x = 0.0, y = 0;
        y = ~~+HF64[0];
    },
    { pass: true });

exports.testNot = asmAssert.one(
    "! operator",
    function f() {
        var x = 0;
        x = !((x|0) > 0);
    },
    { pass: true });

exports.testParamTypes = asmAssert.one(
    "different parameter types",
    function f(x, y) {
        x = x|0;
        y = +y;
    }, {
        pass: true,
        types: {
            f: ty.Arrow([ty.Int, ty.Double], ty.Void)
        }
    });

exports.testAdd = asmAssert.one(
    "addition",
    function add1(x) {
        x = x|0;
        return ((x|0)+1)|0;
    }, {
        pass: true,
        types: {
            add1: ty.Arrow([ty.Int], ty.Signed)
        }
    });

exports.testImul = asmAssert.one(
    "Math.imul",
    function double(x) {
        x = x|0;
        return imul(x, 2)|0;
    }, {
        pass: true,
        double: ty.Arrow([ty.Int], ty.Signed)
    });

exports.testLoad = asmAssert.one(
    "heap load",
    function get(i) {
        i = i|0;
        return H32[i>>2]|0;
    }, {
        pass: true,
        types: {
            get: ty.Arrow([ty.Int], ty.Signed)
        }
    });

exports.testStore = asmAssert.one(
    "heap store",
    function set(i, x) {
        i = i|0;
        x = x|0;
        H32[i>>2] = x|0;
    }, {
        pass: true,
        types: {
            set: ty.Arrow([ty.Int, ty.Int], ty.Void)
        }
    });

exports.testCall1 = asmAssert(
    "function call",
    function call(stdlib, foreign, heap) {
        "use asm";
        __ALL__
        function f(x) {
            x = +x;
            return +(x + 1.0);
        }
        function g() {
            var x = 0.0;
            x = +f(x);
            return +x;
        }
        return {};
    }, { pass: true });

exports.testCall2 = asmAssert(
    "function call",
    function call(stdlib, foreign, heap) {
        "use asm";
        __ALL__
        function f(x) {
            x = x|0;
            return (x + 1)|0;
        }
        function g() {
            var x = 0.0;
            x = +f(x);
            return +x;
        }
        return {};
    }, { pass: false });

exports.testVoid1 = asmAssert(
    "void function call in expression statement",
    function void_(stdlib) {
        "use asm";
        __PURE__
        function f() { }
        function g() {
            f();
        }
        return {}
    }, { pass: true });

exports.testVoid2 = asmAssert(
    "void function call in comma expression",
    function void_(stdlib) {
        "use asm";
        __PURE__
        function f() { }
        function g() {
            var x = 0.0;
            x = (f(), f(), 1.0);
        }
        return {};
    }, { pass: true });

exports.testEval1 = asmAssert(
    "module named eval",
    function eval() {
        "use asm";
        __PURE__
        function empty () { }
        return empty;
    }, { pass: false });

exports.testEval2 = asmAssert(
    "function named eval",
    function m() {
        "use asm";
        __PURE__
        function eval() { }
        return eval;
    }, { pass: false });

exports.testEval3 = asmAssert(
    "local named eval",
    function m() {
        "use asm";
        __PURE__
        function f() {
            var eval = 0;
        }
        return f;
    }, { pass: false });

exports.testAbs = asmAssert(
    "abs returns signed",
    function call(stdlib, foreign, heap) {
        "use asm";
        __PURE__
        var abs = stdlib.Math.abs;
        function f() {
            return abs(1)|0;
        }
        return f;
    }, { pass: true });

exports.testIf = asmAssert(
    "if condition is Int",
    function m(){
        "use asm";
        function f(x,y) {
            x = x|0;
            y = y|0;
            if (x) {
                y = 3;
            }
        }
        return f;
    }, { pass: true });

exports.testEmpty = asmAssert(
    "empty statements",
    function m(){
        "use asm";
        function f() {
            ;
            ;
            ;
            {};
            if (0);
            if (0) {};
        }
        return f;
    }, { pass: true });

exports.testMinMax = asmAssert(
    "min and max validate",
    function m(stdlib, foreign, heap) {
        "use asm";
        var max = stdlib.Math.max;
        var min = stdlib.Math.min;
        function f(i0, i1, d0, d1) {
            i0 = i0|0;
            i1 = i1|0;
            d0 = +d0;
            d1 = +d1;
            var ia = 0;
            var ib = 0;
            var da = 0.0;
            var db = 0.0;
            ia = max(i0, i1)|0;
            ib = min(i0, i1)|0;
            da = +max(d0, d1);
            db = +min(d0, d1);
            return +(+(+(ia + ib|0) + d0) + d1);
        }
        return f;
    }, { pass: true });

exports.testMinWrongArgumentType = asmAssert(
    "min argument types don't match",
    function m(stdlib, foreign, heap) {
        "use asm";
        var min = stdlib.Math.min;
        function f(i0, d1) {
            i0 = i0|0;
            d1 = +d1;
            min(i0, d1)|0;
        }
        return f;
    }, { pass: false });

exports.testMaxWrongArgumentType = asmAssert(
    "min argument types don't match",
    function m(stdlib, foreign, heap) {
        "use asm";
        var max = stdlib.Math.max;
        function f(d0, i1) {
            d0 = +d0;
            i1 = i1|0;
            +max(d0, i1);
        }
        return f;
    }, { pass: false });

exports.testMaxWrongReturnType = asmAssert(
    "min argument types don't match",
    function m(stdlib, foreign, heap) {
        "use asm";
        var max = stdlib.Math.max;
        function f(i0, i1) {
            i0 = i0|0;
            i1 = i1|0;
            +max(i0, i1);
        }
        return f;
    }, { pass: false });

exports.testFunctionTables = asmAssert(
    "function tables",
    function m(stdlib, foreign, heap) {
        "use asm"
        function f() {}
        function g() {}
        var x = [f], y = [g], z = [f, g]
        return f;
    }, { pass: true });

exports.testConditionalExpression = asmAssert.one(
    "conditional expression",
    function f() {
        return (1 ? 2 : 3)|0;
    },
    { pass: true });

exports.testConditionalExpressionMismatchedTypes = asmAssert.one(
    "conditional with consequent and alternate of differing types",
    function f() {
        return (1 ? 0.5 : 3)|0;
    },
    { pass: false });

exports.testConditionalExpressionDifferentSubtypes = asmAssert.one(
    "conditional with different subtypes of int",
    function f() {
        return (1 ? (2 < 3) : 4)|0;
    },
    { pass: true });

exports.testForWithoutInit = asmAssert.one(
    "for statement without an init clause",
    function f() {
        var i = 0, j = 0;
        for (; i|0 < 10; i = i|0 + 1) {
            j = j|0 + i;
        }
    },
    { pass: true });

exports.testForWithoutTest = asmAssert.one(
    "for statement without a test clause",
    function f() {
        var i = 0, j = 0;
        for (i = 0; ; i = i|0 + 1) {
            if (i|0 >= 10) break;
            j = j|0 + i;
        }
    },
    { pass: true });

exports.testForWithoutUpdate = asmAssert.one(
    "for statement without an update clause",
    function f() {
        var i = 0, j = 0;
        for (i = 0; i|0 < 10;) {
            j = j|0 + i;
            i = i|0 + 1;
        }
    },
    { pass: true });

exports.testNegativeIntReturn = asmAssert.one(
    "negative integer literal as return value",
    function f() {
        return -42;
    },
    { pass: true });

exports.testNegativeDoubleReturn = asmAssert.one(
    "negative double literal as return value",
    function f() {
        return -42.1;
    },
    { pass: true });
