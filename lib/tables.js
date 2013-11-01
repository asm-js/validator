var dict = require('dict');
var ty = require('./types');

exports.ROOT_NAMES = ['stdlib', 'foreign', 'heap'];

exports.HEAP_VIEW_TYPES = dict({
    'Int8Array':    ty.View(1, ty.Intish),
    'Uint8Array':   ty.View(1, ty.Intish),
    'Int16Array':   ty.View(2, ty.Intish),
    'Uint16Array':  ty.View(2, ty.Intish),
    'Int32Array':   ty.View(4, ty.Intish),
    'Uint32Array':  ty.View(4, ty.Intish),
    'Float32Array': ty.View(4, ty.Doublish),
    'Float64Array': ty.View(8, ty.Doublish)
});

var DoublishToDouble = ty.Arrow([ty.Doublish], ty.Double);

exports.STDLIB_TYPES = dict({
    'Infinity': ty.Double,
    'NaN':      ty.Double
});

exports.STDLIB_MATH_TYPES = dict({
    'acos':    DoublishToDouble,
    'asin':    DoublishToDouble,
    'atan':    DoublishToDouble,
    'cos':     DoublishToDouble,
    'sin':     DoublishToDouble,
    'tan':     DoublishToDouble,
    'ceil':    DoublishToDouble,
    'floor':   DoublishToDouble,
    'exp':     DoublishToDouble,
    'log':     DoublishToDouble,
    'sqrt':    DoublishToDouble,
    'abs':     ty.Overloaded([
                   ty.Arrow([ty.Signed], ty.Unsigned),
                   DoublishToDouble
               ]),
    'atan2':   ty.Arrow([ty.Doublish, ty.Doublish], ty.Double),
    'pow':     ty.Arrow([ty.Doublish, ty.Doublish], ty.Double),
    'imul':    ty.Arrow([ty.Int, ty.Int], ty.Signed),
    'E':       ty.Double,
    'LN10':    ty.Double,
    'LN2':     ty.Double,
    'LOG2E':   ty.Double,
    'LOG10E':  ty.Double,
    'PI':      ty.Double,
    'SQRT1_2': ty.Double,
    'SQRT2':   ty.Double
});

var SignedBitwise = ty.Arrow([ty.Intish, ty.Intish], ty.Signed);

var RelOp = ty.Overloaded([
    ty.Arrow([ty.Signed, ty.Signed], ty.Int),
    ty.Arrow([ty.Unsigned, ty.Unsigned], ty.Int),
    ty.Arrow([ty.Double, ty.Double], ty.Int)
]);

exports.BINOPS = dict({
    '+':   ty.Arrow([ty.Double, ty.Double], ty.Double),
    '-':   ty.Arrow([ty.Doublish, ty.Doublish], ty.Double),
    '*':   ty.Arrow([ty.Doublish, ty.Doublish], ty.Double),
    '/':   ty.Overloaded([
        ty.Arrow([ty.Signed, ty.Signed], ty.Intish),
        ty.Arrow([ty.Unsigned, ty.Unsigned], ty.Intish),
        ty.Arrow([ty.Doublish, ty.Doublish], ty.Double)
    ]),
    '%':   ty.Overloaded([
        ty.Arrow([ty.Signed, ty.Signed], ty.Intish),
        ty.Arrow([ty.Unsigned, ty.Unsigned], ty.Intish),
        ty.Arrow([ty.Doublish, ty.Doublish], ty.Double)
    ]),
    '|':   SignedBitwise,
    '&':   SignedBitwise,
    '^':   SignedBitwise,
    '<<':  SignedBitwise,
    '>>':  SignedBitwise,
    '>>>': ty.Arrow([ty.Intish, ty.Intish], ty.Unsigned),
    '<':   RelOp,
    '<=':  RelOp,
    '>':   RelOp,
    '>=':  RelOp,
    '==':  RelOp,
    '!=':  RelOp
});

exports.UNOPS = dict({
    '+': ty.Overloaded([
        ty.Arrow([ty.Signed], ty.Double),
        ty.Arrow([ty.Unsigned], ty.Double),
        ty.Arrow([ty.Doublish], ty.Double)
    ]),
    '-': ty.Overloaded([
        ty.Arrow([ty.Int], ty.Intish),
        ty.Arrow([ty.Doublish], ty.Double)
    ]),
    '~': ty.Arrow([ty.Intish], ty.Signed),
    '!': ty.Arrow([ty.Int], ty.Int)
});
