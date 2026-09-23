/**
 * The fixed-step integrator every time-domain model here uses: classical fourth-order
 * Runge–Kutta (RK4). Fixed step so a run is reproducible and its step can be stated;
 * the step is chosen per model (and said in the UI) well below the fastest time
 * constant it integrates.
 */
export type Deriv = (t: number, x: Float64Array, dx: Float64Array) => void;

export class RK4 {
  private k1: Float64Array;
  private k2: Float64Array;
  private k3: Float64Array;
  private k4: Float64Array;
  private tmp: Float64Array;

  constructor(
    readonly n: number,
    readonly h: number,
    private f: Deriv,
  ) {
    this.k1 = new Float64Array(n);
    this.k2 = new Float64Array(n);
    this.k3 = new Float64Array(n);
    this.k4 = new Float64Array(n);
    this.tmp = new Float64Array(n);
  }

  /** Advance x (in place) from t to t + h. */
  step(t: number, x: Float64Array): void {
    const { n, h, k1, k2, k3, k4, tmp, f } = this;
    f(t, x, k1);
    for (let i = 0; i < n; i++) tmp[i] = x[i]! + 0.5 * h * k1[i]!;
    f(t + 0.5 * h, tmp, k2);
    for (let i = 0; i < n; i++) tmp[i] = x[i]! + 0.5 * h * k2[i]!;
    f(t + 0.5 * h, tmp, k3);
    for (let i = 0; i < n; i++) tmp[i] = x[i]! + h * k3[i]!;
    f(t + h, tmp, k4);
    for (let i = 0; i < n; i++) x[i] = x[i]! + (h / 6) * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!);
  }
}
