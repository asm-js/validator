function literal(node, expected, context, v) {
    if (node.type !== 'Literal')
        v.fail(context + " expects literal " + JSON.stringify(expected) + ", got " + node.type + " node", node.loc);
    if (node.value !== expected)
        v.fail(context + " expects literal " + JSON.stringify(expected) + ", got " + JSON.stringify(node.value), node.loc);
}

function identifier(node, name, message, v) {
    if (node.type !== 'Identifier')
        v.fail("expected identifier, got " + node.type + " node", node.loc);
    if (node.name !== name)
        v.fail("expected identifier " + name + ", got " + node.name, node.loc);
}

function nodeType(node, expected, message, v) {
    if (node.type !== expected)
        v.fail("expected " + message + ", got " + node.type + " node", node.loc);
}

function nodeOp(node, expected, message, v) {
    if (node.operator !== expected)
        v.fail("expected " + message + ", got " + node.operator + " operator", node.loc);
}

function heapIndex(node, message, v) {
    nodeType(node, 'MemberExpression', "heap store");
    if (!node.computed)
        v.fail("expected heap index expression, got property dot-expression", node.loc);
    nodeType(node.object, 'Identifier', "heap store", v);
    var x = node.object.name;
    nodeType(node.property, 'BinaryExpression', "heap store", v);
    if (node.property.operator !== '>>')
        v.fail("expected heap index shift, got " + node.property.operator + " operator", node.property.loc);
    nodeType(node.property.left, 'BinaryExpression', "heap store", v);
    if (node.property.left.operator !== '&')
        v.fail("expected heap index bound mask, got " + node.property.left.operator + " operator", node.property.left.loc);
    nodeType(node.property.left.right, 'Literal', "heap store", v);
    var e = node.property.left.left, m = node.property.left.right.value;
    if (typeof m !== 'number')
        v.fail("expected heap index bound mask, got " + JSON.stringify(m), node.property.left.right.loc);
    nodeType(node.property.right, 'Literal', "heap store", v);
    var b = node.property.right.value;
    if (typeof b !== 'number')
        v.fail("expected heap index shift literal, got " + JSON.stringify(b), node.property.right.loc);
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
