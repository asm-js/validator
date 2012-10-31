var validate = require('./lib/validate');
var types = require('./lib/types');

var header = [
    "var floor = env.floor, sin = env.sin;",
    "var H32 = env.Int32Array(buffer), HU32 = env.Uint32Array(buffer);"
].join("\n");

var f = function f(x, y, z, i, u) {
    x = x|0;
    y = y>>>0;
    z = +z;
    i = [i[0]>>>0, i[1]|0];
    u = [u[0]>>>0, u[1]>>>0];
}.toString();

var empty = function empty() { }.toString();

var test1 = [header, f, empty, "return empty;"].join("\n");

function paramTypes(test, actual, expected, message) {
    for (var i = 0, n = expected.length; i < n; i++) {
        test.ok(actual instanceof types.arrow &&
                actual.params.length === n &&
                actual.params[i].equals(expected[i]),
                message);
    }
}

exports.test1 = function(test) {
    var report = validate(["buffer", "env"], test1);

    test.ok(report.has("f"));
    test.ok(report.get("f").type.equals(types.arrow([types.int32, types.uint32, types.float64, types.int64, types.uint64], types.void)));
    test.deepEqual(report.get("f").exportedAs, []);
    test.ok(report.has("empty"));
    test.ok(report.get("empty").type.equals(types.arrow([], types.void)));
    test.deepEqual(report.get("empty").exportedAs, [null]);

    test.done();
};
