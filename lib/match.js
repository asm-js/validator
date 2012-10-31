function literal(node, expected, context) {
    if (node.type !== 'Literal')
        fail(context + " expects literal " + JSON.stringify(expected) + ", got " + node.type + " node");
    if (node.value !== expected)
        fail(context + " expects literal " + JSON.stringify(expected) + ", got " + JSON.stringify(node.value));
}

function identifier(node, name, message) {
    if (node.type !== 'Identifier')
        fail("expected identifier, got " + node.type + " node");
    if (node.name !== name)
        fail("expected identifier " + name + ", got " + node.name);
}

function nodeType(node, expected, message) {
    if (node.type !== expected)
        fail("expected " + message + ", got " + node.type + " node");
}

function nodeOp(node, expected, message) {
    if (node.operator !== expected)
        fail("expected " + message + ", got " + node.operator + " operator");
}

exports.literal = literal;
exports.identifier = identifier;
exports.nodeType = nodeType;
exports.nodeOp = nodeOp;
