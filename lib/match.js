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

function heapIndex(node, message) {
    match.nodeType(node, 'MemberExpression', "heap store");
    if (!node.computed)
        fail("expected heap index expression, got property dot-expression");
    match.nodeType(node.object, 'Identifier', "heap store");
    var x = node.object.name;
    match.nodeType(node.property, 'BinaryExpression', "heap store");
    if (node.property.operator !== '>>')
        fail("expected heap index shift, got " + node.property.operator + " operator");
    match.nodeType(node.property.left, 'BinaryExpression', "heap store");
    if (node.property.left.operator !== '&')
        fail("expected heap index bound mask, got " + node.property.left.operator + " operator");
    match.nodeType(node.property.left.right, 'Literal', "heap store");
    var e = node.property.left.left, m = node.property.left.right.value;
    if (typeof m !== 'number')
        fail("expected heap index bound mask, got " + JSON.stringify(m));
    match.nodeType(node.property.right, 'Literal', "heap store");
    var b = node.property.right.value;
    if (typeof b !== 'number')
        fail("expected heap index shift literal, got " + JSON.stringify(b));
    return {
        heap: x,
        address: e,
        bound: m,
        shift: b
    };
}

exports.literal = literal;
exports.identifier = identifier;
exports.nodeType = nodeType;
exports.nodeOp = nodeOp;
exports.heapIndex = heapIndex;
