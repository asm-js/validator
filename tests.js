var types = require('./lib/types');
var test = require('./test');

function paramTypes(env, buffer) {
    "use asm";
    __ALL__
    function f(w, x, y, z) {
        w = ~~w;
        x = x|0;
        y = y>>>0;
        z = +z;
    }
    function empty() { }
    return empty;
}

exports.testParamTypes = test(paramTypes, "different parameter types", {
    pass: true,
    types: {
        f: types.arrow([types.int, types.signed, types.unsigned, types.double], types.void),
        empty: types.arrow([], types.void)
    },
    exports: {
        f: [],
        empty: [null]
    }
});

function add(env) {
    "use asm";
    __PURE__
    function add1(x) {
        x = ~~x;
        return ((x|0)+1)|0;
    }
    return add1;
}

exports.testAdd = test(add, "addition", {
    pass: true,
    types: {
        add1: types.arrow([types.int], types.signed)
    }
});

function imul(env) {
    "use asm";
    __PURE__
    function double(x) {
        x = ~~x;
        return imul(x, 2)|0;
    }
    return double;
}

exports.testImul = test(imul, "multiplication", {
    pass: true,
    types: {
        double: types.arrow([types.int], types.signed)
    }
});

function load(env, buffer) {
    "use asm";
    __ALL__
    function get(i) {
        i = ~~i;
        return H32[(i&0xffff)>>4]|0;
    }
    return get;
}

exports.testLoad = test(load, "heap load", {
    pass: true,
    types: {
        get: types.arrow([types.int], types.signed)
    }
});

function store(env, buffer) {
    "use asm";
    __ALL__
    function set(i, x) {
        i = ~~i;
        x = ~~x;
        H32[(i&0xffff)>>4] = x|0;
    }
    return set;
}

exports.testStore = test(store, "heap store", {
    pass: true,
    types: {
        set: types.arrow([types.int, types.int], types.void)
    }
});
