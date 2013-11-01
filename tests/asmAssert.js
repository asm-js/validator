var asm = require('../lib/asm');
var validate = asm.validate;
var ValidationError = asm.ValidationError;

function explode(test) {
    var __EMPTY__ = [];
    var __PURE__ = ["var imul = stdlib.Math.imul, sin = stdlib.Math.sin;"];
    var __ALL__ = __PURE__.concat(["var H32 = new stdlib.Int32Array(heap), HU32 = new stdlib.Uint32Array(heap), HF64 = new stdlib.Float64Array(heap);"]);

    var SEP = "\n    ";

    return String(test).replace("__EMPTY__", __EMPTY__.join(SEP))
                       .replace("__PURE__", __PURE__.join(SEP))
                       .replace("__ALL__", __ALL__.join(SEP));
}

function asmAssert(msg, f, expect) {
    f = explode(f);
    var hasOwn = {}.hasOwnProperty;

    if (expect.pass) {
        return function(test) {
            var report;
            test.doesNotThrow(function() { report = validate(f); }, "validation threw");
            try {
                if (!report)
                    return;
                var types = expect.types,
                    singleExport = expect.export,
                    exports = expect.exports;
                if (types) {
                    for (var key in types) {
                        if (!hasOwn.call(types, key))
                            continue;
                        var expectedType = types[key],
                            actualType = report.getFunction(key);
                        test.ok(actualType, msg + ": function " + key + " not found");
                        test.ok(actualType.equals(expectedType), msg + ": " + key + " : " + actualType + ", expected " + expectedType);
                    }
                }
                if (singleExport) {
                    test.ok(report.isSingleExport(), msg + ": expected single export, got multiple");
                    var actualExport = report.getExport();
                    test.equal(actualExport, singleExport, msg + ": expected single export " + singleExport + ", got " + actualExport);
                }
                if (exports) {
                    for (var key in exports) {
                        if (!hasOwn.call(exports, key))
                            continue;
                        var actualExport = report.getExport(key);
                        test.ok(actualExport, msg + ": function " + key + " not found");
                        test.equal(actualExport, exports[key], msg + ": expected export " + key + " to map to " + exports[key] + ", got " + actualExport);
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
                            return e instanceof ValidationError;
                        },
                        msg + ": should fail to validate");
            test.done();
        }
    }
}

asmAssert.one = function(msg, f, expect) {
    return asmAssert(msg,
               "function one(stdlib, foreign, heap) {\n    'use asm';\n    __ALL__\n    " + f + "\n    return {};\n}",
               expect);
};

module.exports = asmAssert;
