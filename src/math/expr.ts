/**
 * Arithmetic that can be read by a person and checked by a machine.
 *
 * THE PROBLEM THIS SOLVES. The brief requires two things of the math panel that
 * pull against each other: every calculation must be reproducible by hand, and
 * the panel's arithmetic must be provably internally consistent. The usual way
 * to build a derivation panel is to compute a number in TypeScript and then
 * write a string describing how it was computed. Those two can drift apart
 * silently, and a panel whose prose disagrees with its own number is worse than
 * no panel at all.
 *
 * So the substituted line is not a description of the arithmetic. It IS the
 * arithmetic: a string of numbers and operators, which this module evaluates to
 * produce the result shown beneath it, and which `test/math-panel.test.ts`
 * evaluates independently and checks against the solver's own answer. The
 * string a reader sees and the string the test checks are the same string. If
 * anybody ever edits one without the other, the test fails.
 *
 * The grammar is ordinary infix arithmetic — the notation on the page of any
 * textbook — with the functions that turn up in power engineering. It is
 * deliberately small: this is not a scripting language and must never become
 * one. There is no variable lookup, no assignment, and no property access, so
 * an expression cannot reach anything outside itself.
 */

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

type Fn = (x: number) => number;

/**
 * The functions an expression may call.
 *
 * `ln` is natural log and `log` is base ten, which is the convention in
 * engineering texts and the opposite of the one most programming languages use.
 * Getting that backwards silently changes a line's inductance by a factor of
 * 2.3, so it is spelled out here rather than assumed.
 */
const FUNCTIONS: Record<string, Fn> = {
  sqrt: Math.sqrt,
  /**
   * A cube root as its own function, so that an expression can be written
   * ∛(a · b · c) the way a textbook writes it. As `(a · b · c)^(1/3)` it is
   * the same number and much harder to read, and the exponent then cannot be
   * set as a superscript without lying about what it is.
   */
  cbrt: Math.cbrt,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  /** Degrees in, because angles in power engineering are quoted in degrees. */
  sind: (x) => Math.sin((x * Math.PI) / 180),
  cosd: (x) => Math.cos((x * Math.PI) / 180),
  tand: (x) => Math.tan((x * Math.PI) / 180),
};

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

export class ExpressionError extends Error {}

interface Cursor { s: string; i: number }

const skip = (c: Cursor): void => {
  while (c.i < c.s.length && /[\s,]/.test(c.s[c.i])) c.i++;
};

/** expression := term (('+' | '-') term)* */
function parseExpression(c: Cursor): number {
  let v = parseTerm(c);
  for (;;) {
    skip(c);
    const ch = c.s[c.i];
    if (ch === '+') { c.i++; v += parseTerm(c); }
    else if (ch === '-' || ch === '−') { c.i++; v -= parseTerm(c); }
    else return v;
  }
}

/** term := power (('*' | '·' | '×' | '/') power)* */
function parseTerm(c: Cursor): number {
  let v = parsePower(c);
  for (;;) {
    skip(c);
    const ch = c.s[c.i];
    if (ch === '*' || ch === '·' || ch === '×') { c.i++; v *= parsePower(c); }
    else if (ch === '/' || ch === '÷') {
      c.i++;
      const d = parsePower(c);
      if (d === 0) throw new ExpressionError(`division by zero in "${c.s}"`);
      v /= d;
    } else return v;
  }
}

/**
 * power := unary ('^' power)?
 *
 * Right-associative, so 2^3^2 is 512 and not 64 — which is what a reader of an
 * equation expects, and the opposite of what a left fold would give.
 */
function parsePower(c: Cursor): number {
  const base = parseUnary(c);
  skip(c);
  if (c.s[c.i] === '^') {
    c.i++;
    return Math.pow(base, parsePower(c));
  }
  return base;
}

function parseUnary(c: Cursor): number {
  skip(c);
  const ch = c.s[c.i];
  if (ch === '-' || ch === '−') { c.i++; return -parseUnary(c); }
  if (ch === '+') { c.i++; return parseUnary(c); }
  return parsePrimary(c);
}

function parsePrimary(c: Cursor): number {
  skip(c);
  const ch = c.s[c.i];
  if (ch === undefined) throw new ExpressionError(`unexpected end of "${c.s}"`);

  if (ch === '(') {
    c.i++;
    const v = parseExpression(c);
    skip(c);
    if (c.s[c.i] !== ')') throw new ExpressionError(`missing ")" in "${c.s}"`);
    c.i++;
    return v;
  }

  // A number, possibly in scientific notation written either as 1.2e-7 or as
  // the 1.2×10^-7 an engineer would write on paper.
  const num = /^\d+(\.\d+)?([eE][+-]?\d+)?/.exec(c.s.slice(c.i));
  if (num) {
    c.i += num[0].length;
    return Number(num[0]);
  }

  const name = /^[A-Za-z][A-Za-z0-9]*/.exec(c.s.slice(c.i));
  if (name) {
    const id = name[0];
    c.i += id.length;
    if (id in CONSTANTS) return CONSTANTS[id];
    const fn = FUNCTIONS[id];
    if (!fn) throw new ExpressionError(`unknown name "${id}" in "${c.s}"`);
    skip(c);
    if (c.s[c.i] !== '(') throw new ExpressionError(`"${id}" needs parentheses in "${c.s}"`);
    c.i++;
    const arg = parseExpression(c);
    skip(c);
    if (c.s[c.i] !== ')') throw new ExpressionError(`missing ")" after ${id}( in "${c.s}"`);
    c.i++;
    return fn(arg);
  }

  throw new ExpressionError(`cannot read "${c.s.slice(c.i)}" in "${c.s}"`);
}

/** Evaluate an arithmetic string. Throws rather than returning NaN silently. */
export function evaluate(expr: string): number {
  const c: Cursor = { s: expr, i: 0 };
  const v = parseExpression(c);
  skip(c);
  if (c.i < c.s.length) {
    throw new ExpressionError(`unexpected "${c.s.slice(c.i)}" in "${expr}"`);
  }
  if (!Number.isFinite(v)) throw new ExpressionError(`"${expr}" is not finite`);
  return v;
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '-': '⁻', '+': '⁺',
};

const superscript = (s: string): string =>
  [...s].map((ch) => SUPERSCRIPT[ch] ?? ch).join('');

/**
 * Set an arithmetic string the way it would be written by hand.
 *
 * Multiplication becomes a middle dot, scientific notation becomes ×10 with a
 * raised exponent, and small integer powers are raised. Nothing is reordered or
 * simplified: what is printed is exactly what is evaluated, character for
 * character in everything that matters.
 */
export function pretty(expr: string): string {
  return expr
    .replace(/(\d)[eE]([+-]?)(\d+)/g,
      (_, mantissa: string, sign: string, digits: string) =>
        `${mantissa}×10${superscript((sign === '-' ? '-' : '') + digits)}`)
    // Integer exponents only, bare or fully parenthesised. A fractional
    // exponent must NOT be raised: "^(1/3)" set as a superscript 1 followed by
    // a literal "/3)" is not a typographic nicety, it is a different number.
    // Roots are written as roots instead — see `cbrt` above.
    .replace(/\^\((-?\d+)\)/g, (_, p: string) => superscript(p))
    .replace(/\^(-?\d+)(?![\d/.])/g, (_, p: string) => superscript(p))
    .replace(/\*/g, ' · ')
    .replace(/\bsqrt\(/g, '√(')
    .replace(/\bcbrt\(/g, '∛(')
    .replace(/\bpi\b/g, 'π')
    // Spaces are kept around every operator. Tightening "1000 · 7.6" to
    // "1000·7.6" saves two characters and makes a chain of divisions and
    // multiplications look like it has a precedence it does not have, which
    // is the exact misreading this panel exists to prevent.
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A number as it should appear in a derivation.
 *
 * Fixed decimals where the magnitude is ordinary, scientific notation where it
 * is not — because 0.0000408 and 4.08×10⁻⁵ are the same number but only one of
 * them can be read at a glance, and a line's series inductance per metre is
 * always going to be the second kind.
 */
export function num(value: number, decimals = 4, trim = false): string {
  if (value === 0) return '0';
  const mag = Math.abs(value);
  if (mag >= 1e6 || mag < 1e-3) {
    const exp = Math.floor(Math.log10(mag));
    const mantissa = value / Math.pow(10, exp);
    return `${trimZeros(mantissa.toFixed(3))}e${exp}`;
  }
  const fixed = value.toFixed(decimals);
  return trim ? trimZeros(fixed) : fixed;
}

/**
 * Drop trailing zeros after the decimal point.
 *
 * Used for the OPERANDS inside an arithmetic string and for the per-unit
 * bases, never for a result. "2500.000000 Ω" as a base is noise that makes the
 * line harder to scan; "1.00" as a computed loading is a statement about
 * precision and keeps its zeros.
 */
const trimZeros = (s: string): string =>
  s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;

/** The same, already set for the page. */
export const prettyNum = (value: number, decimals = 4): string =>
  pretty(num(value, decimals));
