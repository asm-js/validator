var validate = require('../lib/validate');

function explode(test) {
    var __EMPTY__ = [];
    var __PURE__ = ["var imul = env.imul, sin = env.sin;"];
    var __ALL__ = __PURE__.concat(["var H32 = new env.Int32Array(buffer), HU32 = new env.Uint32Array(buffer);"]);

    var SEP = "\n    ";

    return String(test).replace("__EMPTY__", __EMPTY__.join(SEP))
                       .replace("__PURE__", __PURE__.join(SEP))
                       .replace("__ALL__", __ALL__.join(SEP));
}

function test(f, msg, expect) {
    f = explode(f);
    var hasOwn = {}.hasOwnProperty;

    if (expect.pass) {
        return function(test) {
            var report;
            test.doesNotThrow(function() { report = validate(f); }, "validation threw");
            try {
                if (!report)
                    return;
                var types = expect.types, exports = expect.exports;
                if (types) {
                    for (var key in types) {
                        if (!hasOwn.call(types, key))
                            continue;
                        test.ok(report.has(key), msg + ": function " + key + " not found");
                        var actualType = report.get(key).type, expectedType = types[key];
                        test.ok(actualType.equals(expectedType), msg + ": " + key + " : " + actualType + ", expected " + expectedType);
                    }
                }
                if (exports) {
                    for (var key in exports) {
                        if (!hasOwn.call(exports, key))
                            continue;
                        test.ok(report.has(key), msg + ": function " + key + " not found");
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

module.exports = test;
