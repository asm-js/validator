var dict = require('dict');

function Env(v) {
    if (!(this instanceof Env))
        return new Env(v);
    this._v = v;
    this._dict = dict();
}

Env.prototype.lookup = function lookup(x) {
    return this._dict.get(x) || null;
};

Env.prototype.bind = function bind(x, t, loc) {
    if (x === 'arguments' || x === 'eval')
        this._v.fail("illegal binding: '" + x + "'", loc);
    if (this._dict.has(x))
        this._v.fail("duplicate binding for " + x, loc);
    this._dict.set(x, t);
};

module.exports = Env;
