function Type() {}

// =============================================================================
// Value Types
// =============================================================================

function ValueType(name, supertypes) {
    this._name = name;
    this._supertypes = supertypes;
};

ValueType.prototype = Object.create(Type.prototype);

ValueType.prototype.equals = function equals(other) {
    return this === other;
};

ValueType.prototype.subtype = function subtype(other) {
    return this.equals(other) ||
           (this._supertypes && this._supertypes.some(function(sup) {
               return sup.subtype(other);
           }));
};

ValueType.prototype.toString = function toString() {
    return this._name;
}

var Extern = new ValueType("extern", null);

var Intish = new ValueType("intish", null);

var Doublish = new ValueType("doublish", null);

var Unknown = new ValueType("unknown", [Intish, Doublish]);

var Int = new ValueType("int", [Intish]);

var Double = new ValueType("double", [Extern, Doublish]);

var Signed = new ValueType("signed", [Extern, Int]);

var Unsigned = new ValueType("unsigned", [Extern, Int]);

var Fixnum = new ValueType("fixnum", [Signed, Unsigned]);

var Void = new ValueType("void", null);

// =============================================================================
// Global Types
// =============================================================================

// ([ValueType], ValueType) -> Arrow
function Arrow(params, result) {
    if (!(this instanceof Arrow))
        return new Arrow(params, result);
    this.params = params;
    this.result = result;
}

Arrow.prototype = Object.create(Type.prototype);

Arrow.prototype.equals = function equals(other) {
    return other instanceof Arrow &&
           this.params.length === other.params.length &&
           this.params.every(function(p, i) { return p.equals(other.params[i]) }) &&
           this.result.equals(other.result);
};

Arrow.prototype.toString = function toString() {
    return "(" + this.params.join(", ") + ") -> " + this.result;
};

// ([Arrow]) -> Overloaded
function Overloaded(alts) {
    if (!(this instanceof Overloaded))
        return new Overloaded(alts);
    this.alts = alts;
}

Overloaded.prototype = Object.create(Type.prototype);

Overloaded.prototype.toString = function toString() {
    return this.alts.join(" ^ ");
};

// (1|2|4|8, ValueType) -> View
function View(bytes, elementType) {
    if (!(this instanceof View))
        return new View(bytes, elementType);
    this.bytes = bytes;
    this.elementType = elementType;
}

View.prototype.toString = function toString() {
    return "View<" + this.bytes + ", " + this.elementType + ">";
};

// (Arrow, integer) -> Table
function Table(type, length) {
    if (!(this instanceof Table))
        return new Table(type, length);
    this.type = type;
    this.length = length;
}

Table.prototype = Object.create(Type.prototype);

Table.prototype.toString = function toString() {
    return "(" + this.type + ")[" + this.length + "]";
};

var Function = Object.create(Type.prototype);

var Module = Object.create(Type.prototype);

var ModuleParameter = Object.create(Type.prototype);

Function.toString = function() {
    return "Function";
};

exports.ValueType = ValueType;

exports.Extern = Extern;
exports.Intish = Intish;
exports.Doublish = Doublish;
exports.Unknown = Unknown;
exports.Int = Int;
exports.Double = Double;
exports.Signed = Signed;
exports.Unsigned = Unsigned;
exports.Fixnum = Fixnum;
exports.Void = Void;

exports.Arrow = Arrow;
exports.Overloaded = Overloaded;
exports.View = View;
exports.Table = Table;
exports.Function = Function;
exports.Module = Module;
exports.ModuleParameter = ModuleParameter;
