var validate = require('./lib/validate');
var types = require('./lib/types');
var dict = require('dict');

function explode(test) {
    var __ALL__ = ["var imul = env.imul, sin = env.sin;",
                   "var H32 = new env.Int32Array(buffer), HU32 = new env.Uint32Array(buffer);"];

    return String(test).replace("__ALL__", __ALL__.join("\n    "));
}

function makeTest(f, msg, expect) {
    f = explode(f);
    var hasOwn = {}.hasOwnProperty;

    if (expect.pass) {
        return function(test) {
            try {
                var report = validate(f);
                var types = expect.types, exports = expect.exports;
                if (types) {
                    for (var key in types) {
                        if (!hasOwn.call(types, key))
                            continue;
                        test.ok(report.has(key), msg + ": found function " + key);
                        test.ok(report.get(key).type.equals(types[key]), msg + ": function " + key + " has type " + types[key]);
                    }
                }
                if (exports) {
                    for (var key in exports) {
                        if (!hasOwn.call(exports, key))
                            continue;
                        test.ok(report.has(key), msg + ": found function " + key);
                        var fn = report.get(key);
                        test.deepEqual(fn && fn.exportedAs,
                                       exports[key],
                                       msg + ": function " + key + " exported as " + exports[key].join(", "));
                    }
                }
            } catch (e) {
                test.ok(false, msg + ": validation failed: " + e);
            } finally {
                test.done();
            }
        }
    } else {
        return function(test) {
            test.throws(function() { validate(f); },
                        function(e) {
                            return e instanceof fail.ValidationError;
                        },
                        msg + ": should fail to validate");
            test.done();
        }
    }
}

function test1(env, buffer) {
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

exports.test1 = makeTest(test1, "different parameter types", {
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
