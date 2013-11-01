var ty = require('../lib/types');
var asmAssert = require('./asmAssert');

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
    function() {
        "use asm";
        __PURE__
        function eval() { }
        return eval;
    }, { pass: false });

exports.testEval3 = asmAssert(
    "local named eval",
    function() {
        "use asm";
        __PURE__
        function f() {
            var eval = 0;
        }
        return f;
    }, { pass: false });