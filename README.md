# asm.js

A Mozilla Research project to specify and develop the extremely optimizable subset of JS targeted by compilers like Emscripten, Mandreel, and LLJS.

Discussion of the asm.js spec now takes place on Specifiction
[here](http://discourse.specifiction.org/c/asm-js).

As of this update, this repo hosts the source for
[the current asm.js Working Draft](http://asmjs.org/spec/latest/).

This repo also hosts JS source code which performs asm.js validation, however
as of this update, this code is not up to date with the latest working draft and is
not extensively tested. Patches to update it or fix bugs are welcome though.

## Example

```javascript
function mymodule(stdlib, foreign, heap) {
    "use asm";

    // -------------------------------------------------------------------------
    // SECTION 1: globals

    var H32 = new stdlib.Int32Array(heap);
    var HU32 = new stdlib.Uint32Array(heap);
    var log = foreign.consoleDotLog;

    var g_i = 0;   // int global
    var g_f = 0.0; // double global

    // -------------------------------------------------------------------------
    // SECTION 2: functions

    function f(x, y) {
        // SECTION A: parameter type declarations
        x = x|0;      // int parameter
        y = +y;       // double parameter

        // SECTION B: function body
        log(x|0);     // call into FFI -- must force the sign
        log(y);       // call into FFI -- already know it's a double
        x = (x+3)|0;  // signed addition

        // SECTION C: unconditional return
        return ((((x+1)|0)>>>0)/(x>>>0))|0; // compound expression
    }

    function g() {
        g_f = +(g_i|0); // read/write globals
        return;
    }
    
    function g2() {
        return;
    }

    function h(i, x) {
        i = i|0;
        x = x|0;
        H32[i>>2] = x;       // shifted by log2(byte count)
        ftable_2[(x-2)&1](); // dynamic call of functions in table 2

        // no return necessary when return type is void
    }
    
    // -------------------------------------------------------------------------
    // SECTION 3: function tables

    var ftable_1 = [f];
    var ftable_2 = [g, g2]; // all of the same type

    // -------------------------------------------------------------------------
    // SECTION 4: exports

    return { f_export: f, goop: g };
}
```

## License

[Apache 2.0](http://www.apache.org/licenses/LICENSE-2.0).
