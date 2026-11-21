/**
 * Deterministic elementary functions.
 *
 * ECMA-262 leaves Math.log, Math.exp, Math.pow and friends "implementation-approximated": two
 * engines (or two versions of one engine) may return different last bits. Simulation results
 * must be bit-identical everywhere (CLI, CI, browser), so the functions the kernel needs are
 * ported here from fdlibm 5.3 (Sun Microsystems, freely redistributable; see the notice below).
 * They use only IEEE 754 basic operations, which every engine evaluates identically.
 * Literal constants are written as the shortest decimal strings of the original fdlibm values
 * (the hex comments give the exact bit patterns).
 *
 * ====================================================
 * Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
 *
 * Developed at SunPro, a Sun Microsystems, Inc. business.
 * Permission to use, copy, modify, and distribute this
 * software is freely granted, provided that this notice
 * is preserved.
 * ====================================================
 */

const scratch = new DataView(new ArrayBuffer(8));

/** High 32 bits of an IEEE 754 double, as a signed 32-bit integer (fdlibm `__HI`). */
function highWord(x: number): number {
  scratch.setFloat64(0, x);
  return scratch.getInt32(0);
}

/** Low 32 bits of an IEEE 754 double, as an unsigned 32-bit integer (fdlibm `__LO`). */
function lowWord(x: number): number {
  scratch.setFloat64(0, x);
  return scratch.getUint32(4);
}

/** Returns `x` with its high 32 bits replaced by `high`. */
function withHighWord(x: number, high: number): number {
  scratch.setFloat64(0, x);
  scratch.setInt32(0, high | 0);
  return scratch.getFloat64(0);
}

const LN2_HI = 0.6931471803691238; // 0x3fe62e42 fee00000
const LN2_LO = 1.9082149292705877e-10; // 0x3dea39ef 35793c76
const TWO54 = 1.8014398509481984e16; // 2^54
const LG1 = 0.6666666666666735; // 0x3FE55555 55555593
const LG2 = 0.3999999999940942; // 0x3FD99999 9997FA04
const LG3 = 0.2857142874366239; // 0x3FD24924 94229359
const LG4 = 0.22222198432149784; // 0x3FCC71C5 1D8E78AF
const LG5 = 0.1818357216161805; // 0x3FC74664 96CB03DE
const LG6 = 0.15313837699209373; // 0x3FC39A09 D078C69F
const LG7 = 0.14798198605116586; // 0x3FC2F112 DF3E5244

/** Natural logarithm (port of fdlibm `__ieee754_log`, error < 1 ulp). */
export function ln(input: number): number {
  let x = input;
  let hx = highWord(x);
  const lx = lowWord(x);
  let k = 0;
  if (hx < 0x00100000) {
    // x < 2^-1022, including zero, subnormals and negative numbers
    if (((hx & 0x7fffffff) | lx) === 0) return -Infinity; // ln(+-0) = -inf
    if (hx < 0) return NaN; // ln(negative) = NaN
    k -= 54;
    x *= TWO54; // scale up subnormal numbers
    hx = highWord(x);
  }
  if (hx >= 0x7ff00000) return x + x; // +Infinity or NaN
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  const i = (hx + 0x95f64) & 0x100000;
  x = withHighWord(x, hx | (i ^ 0x3ff00000)); // normalise x or x/2
  k += i >> 20;
  const f = x - 1.0;
  if ((0x000fffff & (2 + hx)) < 3) {
    // |f| < 2^-20
    if (f === 0) {
      if (k === 0) return 0;
      return k * LN2_HI + k * LN2_LO;
    }
    const r = f * f * (0.5 - 0.3333333333333333 * f);
    if (k === 0) return f - r;
    return k * LN2_HI - (r - k * LN2_LO - f);
  }
  const s = f / (2.0 + f);
  const z = s * s;
  let i2 = hx - 0x6147a;
  const w = z * z;
  const j = 0x6b851 - hx;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  i2 |= j;
  const r = t2 + t1;
  if (i2 > 0) {
    const hfsq = 0.5 * f * f;
    if (k === 0) return f - (hfsq - s * (hfsq + r));
    return k * LN2_HI - (hfsq - (s * (hfsq + r) + k * LN2_LO) - f);
  }
  if (k === 0) return f - s * (f - r);
  return k * LN2_HI - (s * (f - r) - k * LN2_LO - f);
}

const O_THRESHOLD = 709.782712893384; // 0x40862E42 FEFA39EF
const U_THRESHOLD = -745.1332191019411; // 0xc0874910 D52D3051
const LN2HI = [0.6931471803691238, -0.6931471803691238] as const;
const LN2LO = [1.9082149292705877e-10, -1.9082149292705877e-10] as const;
const HALF = [0.5, -0.5] as const;
const INVLN2 = 1.4426950408889634; // 0x3ff71547 652b82fe
const P1 = 0.16666666666666602; // 0x3FC55555 5555553E
const P2 = -0.0027777777777015593; // 0xBF66C16C 16BEBD93
const P3 = 6.613756321437934e-5; // 0x3F11566A AF25DE2C
const P4 = -1.6533902205465252e-6; // 0xBEBBBD41 C5D26BF1
const P5 = 4.1381367970572385e-8; // 0x3E663769 72BEA4D0
const TWOM1000 = 9.332636185032189e-302; // 2^-1000
const TWO1023 = withHighWord(0, 0x7fe00000); // 2^1023
const E = 2.718281828459045; // 0x4005bf0a 8b145769, correctly rounded e

/** Exponential function (port of fdlibm `__ieee754_exp`, error < 1 ulp). */
export function exp(input: number): number {
  let x = input;
  let hx = highWord(x);
  const xsb = (hx >>> 31) & 1; // sign bit of x
  hx &= 0x7fffffff; // high word of |x|
  let hi = 0;
  let lo = 0;
  let k = 0;

  // filter out non-finite arguments
  if (hx >= 0x40862e42) {
    // |x| >= 709.78...
    if (hx >= 0x7ff00000) {
      if (((hx & 0xfffff) | lowWord(x)) !== 0) return x + x; // NaN
      return xsb === 0 ? x : 0; // exp(+inf) = inf, exp(-inf) = 0
    }
    if (x > O_THRESHOLD) return Infinity; // overflow
    if (x < U_THRESHOLD) return 0; // underflow
  }

  // argument reduction
  if (hx > 0x3fd62e42) {
    // |x| > 0.5 ln2
    if (hx < 0x3ff0a2b2) {
      // and |x| < 1.5 ln2
      // fdlibm's reduction gets the last bit of exp(1) wrong; return the correctly rounded value,
      // as V8 does, so that exp(1) === Math.E.
      if (x === 1) return E;
      hi = x - (xsb === 0 ? LN2HI[0] : LN2HI[1]);
      lo = xsb === 0 ? LN2LO[0] : LN2LO[1];
      k = 1 - xsb - xsb;
    } else {
      k = Math.trunc(INVLN2 * x + (xsb === 0 ? HALF[0] : HALF[1]));
      hi = x - k * LN2HI[0]; // k * ln2hi is exact here
      lo = k * LN2LO[0];
    }
    x = hi - lo;
  } else if (hx < 0x3e300000) {
    // |x| < 2^-28
    return 1 + x;
  }

  // x is now in the primary range
  const t = x * x;
  const c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) return 1 - ((x * c) / (c - 2.0) - x);
  const y = 1 - (lo - (x * c) / (2.0 - c) - hi);
  if (k === 1024) return y * 2 * TWO1023; // FreeBSD msun guard against exponent overflow
  if (k >= -1021) return withHighWord(y, highWord(y) + (k << 20));
  return withHighWord(y, highWord(y) + ((k + 1000) << 20)) * TWOM1000;
}
