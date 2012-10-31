var fail = require('./fail');

var methods = {
    // precondition: this.isBound() && other.isBound()
    equals: function equals(other) {
        return this.resolve().equalsResolved(other.resolve());
    },
    // precondition: !(this instanceof tvar) && !(other instanceof tvar) && other.isBound()
    mustSubtype: function mustSubtype(other) {
        return this === other ||
               this._supertypes.some(function(sup) {
                   return sup.mustSubtype(other);
               });
    },
    equalsResolved: function(other) {
        return this === other;
    },
    isBound: function() {
        return true;
    },
    // precondition: this.isBound()
    resolve: function resolve() {
        return this;
    },
    unify: function unify(other) {
        if (other instanceof tvar)
            return other.unify(this);
        if (!this.equals(other))
            fail("cannot unify " + this + " with " + other);
    },
    // precondition: !(other instanceof tvar)
    checkSubtype: function checkSubtype(other) {
        if (!this.mustSubtype(other))
            fail("expected subtype of " + other + ", got " + this);
    },
    toString: function toString() {
        return this._name;
    }
};

function singleton(name, supertypes) {
    if (!(this instanceof singleton))
        return new singleton(name, supertypes);
    this._name = name;
    this._supertypes = supertypes;
}

singleton.prototype = Object.create(methods);

var jsval = singleton("jsval", null);

var voyd = singleton("void", [jsval]);

var fun = singleton("function", [jsval]);

var float64 = singleton("float64", [jsval]);

var boolish = singleton("boolish", null);

var bits32 = singleton("bits32", [float64, boolish]);

var int32 = singleton("int32", [bits32]);

var uint32 = singleton("uint32", [bits32]);

var bits1 = singleton("bits1", [boolish]);

var bits64 = singleton("bits64", null);

var int64 = singleton("int64", [bits64]);

var uint64 = singleton("uint64", [bits64]);

function arrow(params, result) {
    if (!(this instanceof arrow))
        return new arrow(params, result);
    this.params = params;
    this.result = result;
}

arrow.prototype = Object.create(methods);

arrow.prototype._supertypes = [fun];

arrow.prototype.unify = function unify(other) {
    if (other instanceof tvar)
        return other.unify(this);
    if (!(other instanceof arrow) || this.params.length !== other.params.length)
        fail("cannot unify " + this + " with " + other);
    this.params.forEach(function(param, i) {
        param.unify(other.params[i]);
    });
    this.result.unify(other.result);
};

arrow.prototype.isBound = function isBound() {
    return this.result.isBound &&
           this.params.every(function(param) { return param.isBound() });
};

arrow.prototype.equalsResolved = function equalsResolved(other) {
    if (!(other instanceof arrow))
        return false;
    if (other.params.length !== this.params.length)
        return false;
    return other.result.equals(this.result) &&
           other.params.every(function(param, i) {
               return param.equals(this.params[i]);
           }, this);
};

arrow.prototype.toString = function toString() {
    return "(" + (this.params.join(", ")) + ") -> " + this.result;
};

var floor = singleton("floor", [arrow([float64], float64)]);

function array(elts) {
    if (!(this instanceof array))
        return new array(elts);
    this._elts = elts;
}

array.prototype = Object.create(methods);

array.prototype._supertypes = [jsval];

array.prototype.isBound = function isBound() {
    return this._elts.isBound();
};

array.prototype.equalsResolved = function equalsResolved(other) {
    if (!(other instanceof array))
        return false;
    return other._elts.equals(this._elts);
};

array.prototype.unify = function unify(other) {
    if (other instanceof tvar)
        return other.unify(this);
    if (!(other instanceof array))
        fail("cannot unify " + this + " with " + other);
    this._elts.unify(other._elts);
};

array.prototype.toString = function toString() {
    return "array<" + this._elts + ">";
};

var unused = singleton("unused", null);

function tvar() {
    if (!(this instanceof tvar))
        return new tvar();
    this._value = new Constraints();
}

function Constraints() {
    this.upperBound = null;
    this.type = null;       // invariant: !(this.type instanceof tvar)
}

Constraints.prototype.toString = function toString() {
    return this.type ? this.type.toString() : "<?>";
};

Constraints.prototype.unify = function unify(other) {
    // BUG: https://github.com/dherman/asm.js/issues/27
    if (other instanceof tvar)
        throw new Error("tvar unification not yet implemented");
    if (this.type)
        return this.type.unify(other);
    if (this.upperBound)
        other.checkSubtype(this.upperBound);
    this.type = other;
};

Constraints.prototype.checkSubtype = function checkSubtype(other) {
    if (this.type && !this.type.mustSubtype(other))
        fail("expected subtype of " + other + ", got " + this.type);
    else if (this.upperBound && !other.mustSubtype(this.upperBound))
        fail("expected subtype of " + other + ", got subtype of " + this.upperBound);
    this.upperBound = other;
};

Constraints.prototype.isBound = function isBound() {
    return !!this.type;
};

Constraints.prototype.resolve = function resolve() {
    if (!this.type)
        throw new Error("attempt to resolve unbound tvar");
    return this.type;
};

function Redirect(target) {
    // path compression
    while (target instanceof tvar && target._value instanceof Redirect) {
        target = target._value.target;
    }
    this.target = target;
}

Redirect.prototype.toString = function toString() {
    return this.target.toString();
};

Redirect.prototype.unify = function unify(other) {
    return this.target.unify(other);
};

Redirect.prototype.checkSubtype = function checkSubtype(other) {
    return this.target.checkSubtype(other);
};

Redirect.prototype.isBound = function isBound() {
    return this.target.isBound();
};

Redirect.prototype.resolve = function resolve() {
    return this.target.resolve();
};

tvar.prototype = Object.create(methods);

tvar.prototype.resolve = function resolve() {
    return this._value.resolve();
};

tvar.prototype.equalsResolved = function equalsResolved() {
    throw new Error("failed to resolve tvar before testing for equality");
};

tvar.prototype.checkSubtype = function checkSubtype(other) {
    return this._value.checkSubtype(other);
};

tvar.prototype.unify = function unify(other) {
    return this._value.unify(other);
};

tvar.prototype.toString = function toString() {
    return this._value.toString();
};

tvar.prototype.isBound = function isBound() {
    return this._value.isBound();
};

var float2float = arrow([float64], float64);

exports.jsval = jsval;
exports.arrow = arrow;
exports.array = array;
exports.function = fun;
exports.void = voyd;
exports.uint32 = uint32;
exports.int32 = int32;
exports.uint64 = uint64;
exports.int64 = int64;
exports.bits1 = bits1;
exports.bits32 = bits32;
exports.bits64 = bits64;
exports.float64 = float64;
exports.boolish = boolish;
exports.floor = floor;
exports.tvar = tvar;
exports.unused = unused;
exports.float2float = float2float;
