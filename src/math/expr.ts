/**
 * The arithmetic of a math panel, as data.
 *
 * A panel is a list of steps: a general form in standard notation, the same form with
 * the displayed values substituted, and the result with its unit. Every number in a
 * substitution is shown rounded, and the step's result is computed from those rounded
 * numbers — exactly what a reader with a calculator would get — then rounded as shown.
 * Later steps use earlier results as shown. So the displayed arithmetic always reaches
 * the displayed result; the solver's own (unrounded) value is quoted beside it, and a
 * test checks that the displayed precision is enough for the two to agree.
 */
import { numberText } from '../ui/quantity';

export type Expr =
  | { k: 'num'; value: number; digits: number; unit: string; prov: string; sym?: string }
  | { k: 'ref'; step: number }
  | { k: 'op'; op: '+' | '−' | '×' | '÷'; a: Expr; b: Expr }
  | { k: 'fn'; fn: 'cos' | 'sin' | 'sqrt'; a: Expr }
  | { k: 'sq'; a: Expr }
  | { k: 'neg'; a: Expr }
  | { k: 'paren'; a: Expr };

export interface Step {
  /** What this step finds, in words. */
  label: string;
  /** Standard notation, in the `$…$` formula syntax of rich text (without the dollars). */
  general: string;
  /** Symbol for the result (formula syntax), e.g. "P_{ij}". */
  sym: string;
  expr: Expr;
  unit: string;
  digits: number;
  prov: string;
  /** The solver's own value, when the step reproduces one. */
  solver?: number;
  /** A step that is an approximation (said so), with how far it may sit from the solver. */
  approx?: { note: string; tol: number };
}

export interface Panel {
  title: string;
  /** Plain words; `{0}`, `{1}`… here and in the title stand for `introNums`, which carry their provenance. */
  intro?: string;
  introNums?: Array<Extract<Expr, { k: 'num' }>>;
  steps: Step[];
}

/** The number as displayed (what the reader copies down). */
export function shown(value: number, digits: number): number {
  return parseDisplayed(numberText(value, digits));
}

/** Read a displayed number back ("−1 028.4" → −1028.4). */
export function parseDisplayed(s: string): number {
  return Number(s.replace(/[\s  ]/g, '').replace('−', '-'));
}

const DEG = Math.PI / 180;

/** Evaluate using displayed values; `results` are earlier steps' displayed results. */
export function evaluate(e: Expr, results: number[]): number {
  switch (e.k) {
    case 'num':
      return shown(e.value, e.digits);
    case 'ref':
      return results[e.step]!;
    case 'neg':
      return -evaluate(e.a, results);
    case 'paren':
      return evaluate(e.a, results);
    case 'sq': {
      const v = evaluate(e.a, results);
      return v * v;
    }
    case 'fn': {
      const v = evaluate(e.a, results);
      return e.fn === 'cos' ? Math.cos(v * DEG) : e.fn === 'sin' ? Math.sin(v * DEG) : Math.sqrt(v);
    }
    case 'op': {
      const a = evaluate(e.a, results);
      const b = evaluate(e.b, results);
      return e.op === '+' ? a + b : e.op === '−' ? a - b : e.op === '×' ? a * b : a / b;
    }
  }
}

/** Each step's displayed result, in order. */
export function results(p: Panel): number[] {
  const out: number[] = [];
  for (const s of p.steps) out.push(shown(evaluate(s.expr, out), s.digits));
  return out;
}

// builders
export const num = (value: number, digits: number, unit: string, prov: string, sym?: string): Expr => ({ k: 'num', value, digits, unit, prov, ...(sym ? { sym } : {}) });
export const ref = (step: number): Expr => ({ k: 'ref', step });
export const add = (a: Expr, b: Expr): Expr => ({ k: 'op', op: '+', a, b });
export const sub = (a: Expr, b: Expr): Expr => ({ k: 'op', op: '−', a, b });
export const mul = (a: Expr, b: Expr): Expr => ({ k: 'op', op: '×', a, b });
export const div = (a: Expr, b: Expr): Expr => ({ k: 'op', op: '÷', a, b });
export const cos = (a: Expr): Expr => ({ k: 'fn', fn: 'cos', a });
export const sin = (a: Expr): Expr => ({ k: 'fn', fn: 'sin', a });
export const sqrt = (a: Expr): Expr => ({ k: 'fn', fn: 'sqrt', a });
export const sq = (a: Expr): Expr => ({ k: 'sq', a });
export const neg = (a: Expr): Expr => ({ k: 'neg', a });
export const par = (a: Expr): Expr => ({ k: 'paren', a });

/** Decimals that show `sig` significant figures of v. */
export function sigDigits(v: number, sig: number): number {
  if (v === 0 || !Number.isFinite(v)) return sig - 1;
  return Math.max(0, sig - 1 - Math.floor(Math.log10(Math.abs(v))));
}
