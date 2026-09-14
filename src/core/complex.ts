/**
 * Minimal complex arithmetic for power-system work.
 *
 * Convention throughout the project: a complex number is written `a + jb`
 * (electrical engineering uses `j` for sqrt(-1) because `i` is reserved for
 * current). Rectangular form is `{re, im}`; polar form is magnitude and angle
 * in RADIANS internally, degrees only at the display boundary.
 */

export interface Complex {
  readonly re: number;
  readonly im: number;
}

export const C = (re: number, im = 0): Complex => ({ re, im });

/** Build from polar form: magnitude ∠ angle(radians). Written `V∠θ`. */
export const polar = (mag: number, angRad: number): Complex => ({
  re: mag * Math.cos(angRad),
  im: mag * Math.sin(angRad),
});

export const add = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
export const sub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });

export const mul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});

export const div = (a: Complex, b: Complex): Complex => {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};

export const scale = (a: Complex, k: number): Complex => ({ re: a.re * k, im: a.im * k });
export const neg = (a: Complex): Complex => ({ re: -a.re, im: -a.im });

/** Complex conjugate, written `conj(S)` or `S*`. */
export const conj = (a: Complex): Complex => ({ re: a.re, im: -a.im });

export const abs = (a: Complex): number => Math.hypot(a.re, a.im);
export const arg = (a: Complex): number => Math.atan2(a.im, a.re);

/** Reciprocal. Used constantly: admittance Y = 1/Z. */
export const inv = (a: Complex): Complex => {
  const d = a.re * a.re + a.im * a.im;
  return { re: a.re / d, im: -a.im / d };
};

export const ZERO: Complex = { re: 0, im: 0 };
export const ONE: Complex = { re: 1, im: 0 };
/** The imaginary unit. Named `J` because electrical engineering writes `j`. */
export const J: Complex = { re: 0, im: 1 };

export const eq = (a: Complex, b: Complex, tol = 1e-9): boolean =>
  Math.abs(a.re - b.re) <= tol && Math.abs(a.im - b.im) <= tol;

export const RAD = Math.PI / 180;
export const DEG = 180 / Math.PI;
export const toDeg = (rad: number): number => rad * DEG;
export const toRad = (deg: number): number => deg * RAD;

/** Format as `a + jb` / `a - jb`, the way it is written on paper. */
export const fmtRect = (a: Complex, digits = 4): string =>
  `${a.re.toFixed(digits)} ${a.im < 0 ? '-' : '+'} j${Math.abs(a.im).toFixed(digits)}`;

/** Format as `M∠θ°`, the way it is written on paper. */
export const fmtPolar = (a: Complex, magDigits = 4, angDigits = 2): string =>
  `${abs(a).toFixed(magDigits)}∠${toDeg(arg(a)).toFixed(angDigits)}°`;
