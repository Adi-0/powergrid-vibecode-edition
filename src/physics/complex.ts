/**
 * Complex numbers, immutable. The field writes phasors as V∠θ and impedances as
 * R + jX; this type keeps both views (rectangular and polar) one call away.
 * Angles are radians inside the maths; convert to degrees only for display.
 */
export class Complex {
  constructor(
    readonly re: number,
    readonly im: number,
  ) {}

  static readonly ZERO = new Complex(0, 0);
  static readonly ONE = new Complex(1, 0);
  static readonly J = new Complex(0, 1);

  /** Phasor from RMS magnitude and angle in radians. */
  static polar(mag: number, angleRad: number): Complex {
    return new Complex(mag * Math.cos(angleRad), mag * Math.sin(angleRad));
  }

  /** Phasor from magnitude and angle in degrees. */
  static polarDeg(mag: number, angleDeg: number): Complex {
    return Complex.polar(mag, (angleDeg * Math.PI) / 180);
  }

  add(o: Complex): Complex {
    return new Complex(this.re + o.re, this.im + o.im);
  }
  sub(o: Complex): Complex {
    return new Complex(this.re - o.re, this.im - o.im);
  }
  mul(o: Complex): Complex {
    return new Complex(this.re * o.re - this.im * o.im, this.re * o.im + this.im * o.re);
  }
  div(o: Complex): Complex {
    const d = o.re * o.re + o.im * o.im;
    return new Complex((this.re * o.re + this.im * o.im) / d, (this.im * o.re - this.re * o.im) / d);
  }
  scale(k: number): Complex {
    return new Complex(this.re * k, this.im * k);
  }
  neg(): Complex {
    return new Complex(-this.re, -this.im);
  }
  /** Complex conjugate, written I* in S = V·I*. */
  conj(): Complex {
    return new Complex(this.re, -this.im);
  }
  inv(): Complex {
    return Complex.ONE.div(this);
  }
  abs(): number {
    return Math.hypot(this.re, this.im);
  }
  abs2(): number {
    return this.re * this.re + this.im * this.im;
  }
  /** Angle in radians, (−π, π]. */
  arg(): number {
    return Math.atan2(this.im, this.re);
  }
  argDeg(): number {
    return (this.arg() * 180) / Math.PI;
  }
  sqrt(): Complex {
    const r = Math.sqrt(this.abs());
    const t = this.arg() / 2;
    return Complex.polar(r, t);
  }
  exp(): Complex {
    return Complex.polar(Math.exp(this.re), this.im);
  }
  equals(o: Complex, tol = 0): boolean {
    return Math.abs(this.re - o.re) <= tol && Math.abs(this.im - o.im) <= tol;
  }
  toString(): string {
    const s = this.im < 0 ? '−' : '+';
    return `${this.re} ${s} j${Math.abs(this.im)}`;
  }
}

export const c = (re: number, im = 0): Complex => new Complex(re, im);

/** The 120° rotation operator a = 1∠120°, used by symmetrical components. */
export const A_OP = Complex.polarDeg(1, 120);
export const A2_OP = Complex.polarDeg(1, 240);

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
