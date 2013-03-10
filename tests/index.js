var ty = require('../lib/types');
var asm = require('./asm');

exports.testParamTypes = asm(
    "different parameter types",
    function paramTypes(stdlib, foreign, heap) {
        "use asm";
        __ALL__
        function f(x, y) {
            x = x|0;
            y = +y;
        }
        function empty() { }
        return empty;
    }, {
        pass: true,
        types: {
            f: ty.Arrow([ty.Int, ty.Double], ty.Void),
            empty: ty.Arrow([], ty.Void)
        },
        export: "empty"
    });

exports.testAdd = asm(
    "addition",
    function add(stdlib) {
        "use asm";
        __PURE__
        function add1(x) {
            x = x|0;
            return ((x|0)+1)|0;
        }
        return add1;
    }, {
        pass: true,
        types: {
            add1: ty.Arrow([ty.Int], ty.Signed)
        }
    });

exports.testImul = asm(
    "multiplication",
    function imul(stdlib) {
        "use asm";
        __PURE__
        function double(x) {
            x = x|0;
            return imul(x, 2)|0;
        }
        return double;
    }, {
        pass: true,
        double: ty.Arrow([ty.Int], ty.Signed)
    });

exports.testLoad = asm(
    "heap load",
    function load(stdlib, foreign, heap) {
        "use asm";
        __ALL__
        function get(i) {
            i = i|0;
            return H32[i>>2]|0;
        }
        return get;
    }, {
        pass: true,
        types: {
            get: ty.Arrow([ty.Int], ty.Signed)
        }
    });

exports.testStore = asm(
    "heap store",
    function store(stdlib, foreign, heap) {
        "use asm";
        __ALL__
        function set(i, x) {
            i = i|0;
            x = x|0;
        H32[i>>2] = x|0;
        }
        return set;
    }, {
        pass: true,
        types: {
            set: ty.Arrow([ty.Int, ty.Int], ty.Void)
        }
    });

exports.testEval1 = asm(
    "module named eval",
    function eval() {
        "use asm";
        __PURE__
        function empty () { }
        return empty;
    }, { pass: false });

exports.testEval2 = asm(
    "function named eval",
    function() {
        "use asm";
        __PURE__
        function eval() { }
        return eval;
    }, { pass: false });

exports.testEval3 = asm(
    "local named eval",
    function() {
        "use asm";
        __PURE__
        function f() {
            var eval = 0;
        }
        return f;
    }, { pass: false });
