var ty = require('./types');

function Report(globals, exports) {
    this._globals = globals;
    this._exports = exports;
}

Report.prototype.getFunction = function(f) {
    var global = this._globals.lookup(f);
    if (!global || !(global.type instanceof ty.Arrow))
        return null;
    return global.type;
};

Report.prototype.isSingleExport = function() {
    return this._exports.type === 'single';
};

// ( this.isSingleExport => () -> string)
// (!this.isSingleExport => (string) -> string)
Report.prototype.getExport = function(f) {
    return this._exports.type === 'single'
         ? this._exports.export.name
         : this._exports.exports.lookup(f).name;
};

module.exports = Report;
