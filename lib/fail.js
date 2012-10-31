function ValidationError(message, stack) {
    Error.call(this, message);
    this.stack = stack;
}

ValidationError.prototype = Object.create(Error.prototype);

function fail(message) {
    // FIXME: V8-specific; make this stack-trace logic more robust
    var stack = (new Error).stack
                           .replace(/[^n]*\n/, "ValidationError: " + message + "\n")
                           .replace(/\n[^\n]*\n/, "\n");
    throw new ValidationError(message, stack);
}

fail.ValidationError = ValidationError;

module.exports = fail;
