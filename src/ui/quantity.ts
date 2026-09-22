/**
 * The display layer. Every number the app shows is a Quantity: a value with its
 * unit, its symbol, the conventions that make it unambiguous (line-to-line or
 * line-to-neutral, three-phase or per-phase, RMS, per-unit base), and a provenance
 * reference — the solver output or the data-file key it came from. Rendering code
 * never formats a bare number; it passes a Quantity here. A test walks the rendered
 * page and fails on any digit that did not come through this layer.
 */

export type Prov =
  | { src: 'solver'; key: string }
  | { src: 'data'; key: string }
  | { src: 'input'; key: string }
  | { src: 'derived'; key: string; from: Prov[] };

export const solver = (key: string): Prov => ({ src: 'solver', key });
export const data = (key: string): Prov => ({ src: 'data', key });
export const input = (key: string): Prov => ({ src: 'input', key });
export const derived = (key: string, ...from: Prov[]): Prov => ({ src: 'derived', key, from });

export function provKey(p: Prov): string {
  return `${p.src}:${p.key}`;
}

export interface Quantity {
  value: number;
  unit: string;
  /** Standard symbol, e.g. P, Q, |V|, θ, S, I, f, δ. Italic in display. */
  symbol?: string;
  /** Subscript on the symbol, e.g. "ft" in P_ft. */
  sub?: string;
  prov: Prov;
  /** Voltage basis: line-to-line or line-to-neutral. */
  basis?: 'LL' | 'LN';
  /** Power or impedance basis: three-phase total or per phase. */
  phases?: '3φ' | '1φ';
  /** Phasor magnitudes are RMS unless marked peak. */
  peak?: boolean;
  /** For per-unit values: the base it is on. */
  base?: Quantity;
  /** Decimals to show (overrides the unit's default). */
  digits?: number;
}

export function qty(value: number, unit: string, prov: Prov, extra: Partial<Omit<Quantity, 'value' | 'unit' | 'prov'>> = {}): Quantity {
  return { value, unit, prov, ...extra };
}

/**
 * A quantity given in a base SI unit, shown with the prefix that puts it between 1
 * and 1000 and to `sig` significant figures — for values that span many decades,
 * like a solver's residual (0.12 mW reads as small; 0.000 W reads as zero).
 */
export function siQty(value: number, unit: string, prov: Prov, sig = 2): Quantity {
  const prefixes: Array<[number, string]> = [[1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  const a = Math.abs(value);
  const [f, p] = a === 0 ? [1, ''] : (prefixes.find(([f]) => a >= f) ?? prefixes[prefixes.length - 1]!);
  const v = value / f;
  const digits = v === 0 ? 0 : Math.max(0, sig - 1 - Math.floor(Math.log10(Math.abs(v))));
  return qty(v, p + unit, prov, { digits });
}

/** Default decimals by unit, chosen so displayed arithmetic can be reproduced. */
function defaultDigits(q: Quantity): number {
  const a = Math.abs(q.value);
  switch (q.unit) {
    case 'pu':
      return 4;
    case '°':
      return 2;
    case 'Hz':
      return 3;
    case 'MW':
    case 'MVAr':
    case 'MVA':
      return a >= 1000 ? 0 : a >= 100 ? 1 : 2;
    case 'kW':
    case 'kvar':
    case 'kVA':
      return a >= 100 ? 1 : 2;
    case 'kV':
      return a >= 100 ? 1 : 2;
    case 'V':
      return a >= 1000 ? 0 : 1;
    case 'A':
      return a >= 100 ? 0 : 1;
    case 'Ω':
    case 'S':
      return a >= 100 ? 1 : a >= 1 ? 3 : 4;
    case '$/MWh':
      return 2;
    case '%':
      return 1;
    case 's':
      return 2;
    default:
      return a >= 1000 ? 0 : a >= 10 ? 1 : 3;
  }
}

export function digitsOf(q: Quantity): number {
  return q.digits ?? defaultDigits(q);
}

/** The number as text, with a proper minus sign and thin-space thousands grouping. */
export function numberText(value: number, digits: number): string {
  if (!Number.isFinite(value)) return '—';
  const s = Math.abs(value).toFixed(digits);
  const [int, frac] = s.split('.');
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const neg = value < 0 && Number(s) !== 0;
  return (neg ? '−' : '') + grouped + (frac ? '.' + frac : '');
}

/** Displayed value rounded exactly as shown (what a reader would copy down). */
export function shownValue(q: Quantity): number {
  const d = digitsOf(q);
  return Number(Math.abs(q.value).toFixed(d)) * Math.sign(q.value);
}

export function conventions(q: Quantity): string {
  const parts: string[] = [];
  if (q.basis) parts.push(q.basis === 'LL' ? 'line-to-line' : 'line-to-neutral');
  if (q.phases) parts.push(q.phases === '3φ' ? 'three-phase' : 'per phase');
  if (q.peak) parts.push('peak');
  return parts.join(', ');
}

/** Plain text for a quantity, e.g. "1.0412 pu" or "−312.5 MW". */
export function text(q: Quantity): string {
  return `${numberText(q.value, digitsOf(q))}${q.unit ? ' ' + q.unit : ''}`;
}

// ---------------------------------------------------------------- DOM

/** Every quantity rendered so far (for the provenance test and for debugging). */
export const displayed = new Map<string, number>();

/**
 * A span for a quantity. data-prov carries the provenance; data-value the full value;
 * data-digits the displayed precision. Conventions appear as a small suffix
 * (e.g. "LL", "3φ") with the long form in the title.
 */
export function el(q: Quantity, opts: { symbol?: boolean; conv?: boolean } = {}): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'qty';
  const key = provKey(q.prov);
  span.dataset.prov = key;
  span.dataset.value = String(q.value);
  span.dataset.digits = String(digitsOf(q));
  displayed.set(key, q.value);
  if (opts.symbol && q.symbol) {
    const sym = document.createElement('span');
    sym.className = 'sym';
    sym.textContent = q.symbol;
    if (q.sub) {
      const sub = document.createElement('sub');
      sub.textContent = q.sub;
      sym.appendChild(sub);
    }
    span.appendChild(sym);
    span.appendChild(document.createTextNode(' = '));
  }
  const num = document.createElement('span');
  num.className = 'num';
  num.textContent = numberText(q.value, digitsOf(q));
  span.appendChild(num);
  if (q.unit) {
    const u = document.createElement('span');
    u.className = 'unit';
    u.textContent = ' ' + q.unit;
    span.appendChild(u);
  }
  const conv = conventions(q);
  if (opts.conv !== false && (q.basis || q.phases)) {
    const c = document.createElement('span');
    c.className = 'conv';
    c.textContent = [q.basis, q.phases].filter(Boolean).join(' ');
    c.title = conv;
    span.appendChild(c);
  }
  if (q.base) {
    const b = document.createElement('span');
    b.className = 'base';
    b.append(' (base ', el(q.base, { conv: true }), ')');
    span.appendChild(b);
  }
  span.title = [q.symbol ? `${q.symbol}${q.sub ?? ''}` : '', conv, `source: ${key}`].filter(Boolean).join(' · ');
  return span;
}

/** Update an existing quantity span in place (no re-creation, digits keep their width). */
export function update(span: HTMLElement, q: Quantity): void {
  const key = provKey(q.prov);
  span.dataset.prov = key;
  span.dataset.value = String(q.value);
  span.dataset.digits = String(digitsOf(q));
  displayed.set(key, q.value);
  const num = span.querySelector('.num');
  if (num) num.textContent = numberText(q.value, digitsOf(q));
}

/** A clock time (interval start, or a range) as a provenance-tagged span, e.g. "19:00–19:15". */
export function clockEl(startHour: number, minutes: number, prov: Prov): HTMLSpanElement {
  const f = (h: number) => {
    const hh = Math.floor(((h % 24) + 24) % 24);
    const mm = Math.round((h - Math.floor(h)) * 60) % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };
  const span = document.createElement('span');
  span.className = 'qty clock';
  span.dataset.prov = provKey(prov);
  span.dataset.value = String(startHour);
  span.textContent = minutes > 0 ? `${f(startHour)}–${f(startHour + minutes / 60)}` : f(startHour);
  return span;
}

/** Text from a data file or an ordinal that happens to contain digits (a date, a zone mark). */
export function dataText(text: string, prov: Prov, cls = ''): HTMLSpanElement {
  const span = document.createElement('span');
  if (cls) span.className = cls;
  span.dataset.prov = provKey(prov);
  span.textContent = text;
  return span;
}
