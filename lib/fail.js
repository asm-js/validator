var match = require('pattern-match');

function ValidationError(message, stack) {
    Error.call(this, message);
    this.stack = stack;
}

ValidationError.prototype = Object.create(Error.prototype);

function spaces(n) {
    var result = "";
    for (var i = 0; i < n; i++)
        result += " ";
    return result;
}

ValidationError.prototype.context = function() {
    if (!this.src || !this.loc)
        return null;

    var lines = this.src.split(/\r|\n|\r\n/);
    var start = this.loc.start;
    var line = lines[start.line - 1];
    return line + "\n" + spaces(start.column) + "^";
};

ValidationError.prototype.toString = function() {
    return this.context() + "\n\n" + Error.prototype.toString.call(this);
};

function fail(message, src, loc) {
    message = message + locToString(loc);
    // FIXME: V8-specific; make this stack-trace logic more robust
    var stack = (new Error).stack
                           .replace(/[^n]*\n/, "ValidationError: " + message + "\n")
                           .replace(/\n[^\n]*\n/, "\n");
    var e = new ValidationError(message, stack);
    e.src = src;
    e.loc = loc;
    throw e;
}

// (Loc) -> str
function locToString(loc) {
    return match(loc, function(when) {
        when({
            start: { line: match.var('sl'), column: match.var('sc') },
            end: { line: match.var('el'), column: match.var('ec') }
        }, function(vars) {
            return " at " + vars.sl + ":" + vars.sc + "-" + vars.el + ":" + vars.ec;
        });

        when(match.any, function() {
            return "";
        });
    });
}

fail.locToString = locToString;

fail.ValidationError = ValidationError;

module.exports = fail;
