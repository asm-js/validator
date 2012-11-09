// =============================================================================
// expression types
// =============================================================================

function type(name, supertypes) {
    if (!(this instanceof type))
        return new type(name, supertypes);
    this._name = name;
    this._supertypes = supertypes;
}

type.prototype.isExpressionType = true;

type.prototype.equals = function equals(other) {
    return this === other;
};

type.prototype.subtype = function subtype(other) {
    return this.equals(other) ||
           this._supertypes.some(function(sup) {
               return sup.subtype(other);
           });
};

type.prototype.toString = function toString() {
    return this._name;
};

var extern = type("extern", null);

var intish = type("intish", null);

var boolish = type("boolish", null);

var unknown = type("unknown", [intish]);

var int = type("int", [intish, boolish]);

var bit = type("bit", [boolish]);

var double = type("double", [extern]);

var signed = type("signed", [extern, int]);

var unsigned = type("unsigned", [extern, int]);

var constant = type("constant", [signed, unsigned]);

var void_ = type("void", null);

// =============================================================================
// environment types
// =============================================================================

function arrow(params, result) {
    if (!(this instanceof arrow))
        return new arrow(params, result);
    this.params = params;
    this.result = result;
}

arrow.prototype.equals = function equals(other) {
    return other instanceof arrow &&
           this.params.length === other.params.length &&
           this.params.every(function(p, i) { return p.equals(other.params[i]) }) &&
           this.result.equals(other.result);
};

arrow.prototype.toString = function toString() {
    return "(" + this.params.join(", ") + ") -> " + this.result;
};

function array(bits, elts) {
    if (!(this instanceof array))
        return new array(bits, elts);
    this.bits = bits;
    this.elts = elts;
}

array.prototype.toString = function toString() {
    return "array<" + this.bits + ", " + this.elts + ">";
};

exports.extern = extern;
exports.intish = intish;
exports.boolish = boolish;
exports.unknown = unknown;
exports.int = int;
exports.bit = bit;
exports.double = double;
exports.signed = signed;
exports.unsigned = unsigned;
exports.constant = constant;
exports.void = void_;

exports.arrow = arrow;
exports.array = array;
