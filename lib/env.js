var dict = require('dict');
var fail = require('./fail');

function Env() {
    if (!(this instanceof Env))
        return new Env();
    this._frames = [dict()];
}

Env.prototype.lookup = function lookup(x) {
    var a = this._frames, n = a.length, i = n - 1;
    while (i >= 0) {
        var frame = a[i];
        if (frame.has(x))
            return frame.get(x);
    }
    return null;
};

Env.prototype.push = function push() {
    this._frames.push(dict());
};

Env.prototype.pop = function pop() {
    this._frames.pop();
};

Env.prototype.bind = function bind(x, t) {
    if (x === 'arguments' || x === 'eval')
        fail("illegal binding: '" + x + "'");
    var frame = this._frames[this._frames.length - 1];
    if (frame.has(x))
        fail("duplicate binding: '" + x + "'");
    frame.set(x, t);
};

module.exports = Env;
