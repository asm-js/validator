# asm.js

A Mozilla Research project to specify and develop the extremely optimizable subset of JS targeted by compilers like Emscripten, Mandreel, and LLJS.

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
        return ((((x+1)|0)>>>0)/(x|0))>>>0; // compound expression
    }

    function g() {
        g_f = +g_i; // read/write globals
        return;
    }
    
    function g2() {
        return;
    }

    function h(i, x) {
        i = i|0;
        x = x|0;
        H32[i>>2] = x;       // shifted by log2(byte count)
        ftable_2[(x-2)&2](); // dynamic call of functions in table 2

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
