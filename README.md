# asm.js

![faux logo](https://raw.github.com/dherman/asm.js/master/fauxgo.png)

A Mozilla Research project to specify and develop the extremely optimizable subset of JS targeted by compilers like Emscripten, Mandreel, and LLJS.

## Example

```javascript
function mymodule(global, foreign, buffer) {
    "use asm";

    // -------------------------------------------------------------------------
    // SECTION 1: imports

    var H32 = new global.Int32Array(buffer);
    var HU32 = new global.Uint32Array(buffer);
    var log = foreign.consoleDotLog;

    // -------------------------------------------------------------------------
    // SECTION 2: functions

    function f(x, y, z, w) {
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
        H32[(i&0xffffffff)>>4] = x; // masked by 2^k-1, shifted by byte count
        ftable_2[(x-2)&2]();        // dynamic call of functions in table 2
    }
    
    // -------------------------------------------------------------------------
    // SECTION 3: function tables

    var ftable_1 = [f];
    var ftable_2 = [g, g2]; // all of the same type
    
    // -------------------------------------------------------------------------
    // SECTION 4: globals

    var g_i = 0;   // int global
    var g_f = 0.0; // double global

    // -------------------------------------------------------------------------
    // SECTION 5: exports

    return { f_export: f, goop: g };
}
```
