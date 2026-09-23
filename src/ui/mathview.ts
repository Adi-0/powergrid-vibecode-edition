import { math, rich } from './glossary';
import { el, qty, type Prov } from './quantity';
import { results, type Expr, type Panel } from '../math/expr';

/**
 * A math panel on the page: for each step, what it finds, the general form in standard
 * notation, the same form with the displayed values substituted, and the result — the
 * arithmetic of the displayed numbers, rounded as shown — with the solver's own value
 * beside it. Every number is a display-layer span with its source.
 */

const prov = (s: string): Prov => {
  const i = s.indexOf(':');
  const src = i > 0 ? s.slice(0, i) : 'data';
  const key = i > 0 ? s.slice(i + 1) : s;
  return src === 'derived' ? { src, key, from: [] } : { src: src as 'solver' | 'data' | 'input', key };
};

function atomic(e: Expr): boolean {
  return e.k === 'num' || e.k === 'ref' || e.k === 'paren' || e.k === 'fn';
}

/** A leaf that prints with a leading minus sign, and so needs brackets after an operator. */
function negLeaf(e: Expr, shown: number[]): boolean {
  return (e.k === 'num' && e.value < 0) || (e.k === 'ref' && shown[e.step]! < 0);
}

/** Units printed beside a substituted value; per-unit and pure numbers go bare. */
function unitSpan(unit: string): Node | null {
  if (!unit || unit === 'pu') return null;
  const u = document.createElement('span');
  u.className = 'u';
  u.textContent = unit === '°' || unit === '%' ? unit : `\u2009${unit}`;
  return u;
}

function render(e: Expr, shown: number[], units: Array<{ unit: string; prov: string; digits: number }>, bare = false): Node {
  const f = document.createDocumentFragment();
  const t = (s: string) => f.appendChild(document.createTextNode(s));
  const unit = (u: string) => {
    const n = bare ? null : unitSpan(u);
    if (n) f.appendChild(n);
  };
  switch (e.k) {
    case 'num': {
      f.appendChild(el(qty(e.value, '', prov(e.prov), { digits: e.digits })));
      unit(e.unit);
      break;
    }
    case 'ref': {
      const u = units[e.step]!;
      f.appendChild(el(qty(shown[e.step]!, '', prov(u.prov), { digits: u.digits })));
      unit(u.unit);
      break;
    }
    case 'neg':
      t('−');
      if (!atomic(e.a) || negLeaf(e.a, shown)) t('(');
      f.appendChild(render(e.a, shown, units, bare));
      if (!atomic(e.a) || negLeaf(e.a, shown)) t(')');
      break;
    case 'paren':
      t('(');
      f.appendChild(render(e.a, shown, units, bare));
      t(')');
      break;
    case 'sq': {
      const leafUnit = e.a.k === 'num' ? e.a.unit : e.a.k === 'ref' ? units[e.a.step]!.unit : '';
      const wrap = !atomic(e.a) || negLeaf(e.a, shown) || (!bare && unitSpan(leafUnit) !== null);
      if (wrap) t('(');
      f.appendChild(render(e.a, shown, units, bare));
      if (wrap) t(')');
      const sup = document.createElement('sup');
      sup.dataset.prov = 'notation:formula';
      sup.textContent = '2';
      f.appendChild(sup);
      break;
    }
    case 'fn':
      // cos and sin of an angle in degrees; atan of a ratio (its result in degrees)
      t(e.fn === 'sqrt' ? '√(' : `${e.fn} (`);
      f.appendChild(render(e.a, shown, units, e.fn === 'cos' || e.fn === 'sin'));
      t(e.fn === 'cos' || e.fn === 'sin' ? '°)' : ')');
      break;
    case 'op':
      f.appendChild(render(e.a, shown, units, bare));
      t(` ${e.op} `);
      if (negLeaf(e.b, shown)) t('(');
      f.appendChild(render(e.b, shown, units, bare));
      if (negLeaf(e.b, shown)) t(')');
      break;
  }
  return f;
}

/** Words with `{k}` standing for the panel's numbers, each a display-layer span. */
function words(p: Panel, text: string, into: HTMLElement): void {
  text.split(/\{(\d+)\}/).forEach((part, j) => {
    if (j % 2 === 0) into.appendChild(rich(part));
    else {
      const n = p.introNums![Number(part)]!;
      into.appendChild(el(qty(n.value, n.unit, prov(n.prov), { digits: n.digits })));
    }
  });
}

/** `intro: false` leaves out an introduction the panel above has already given. */
export function mathPanel(p: Panel, opts: { intro?: boolean } = {}): HTMLElement {
  const box = document.createElement('div');
  box.className = 'mathpanel';
  const h = document.createElement('h3');
  words(p, p.title, h);
  box.appendChild(h);
  if (p.intro && opts.intro !== false) {
    const i = document.createElement('p');
    words(p, p.intro, i);
    box.appendChild(i);
  }
  const shown = results(p);
  const units = p.steps.map((s) => ({ unit: s.unit, prov: s.prov, digits: s.digits }));
  p.steps.forEach((st, k) => {
    const d = document.createElement('div');
    d.className = 'step';
    const lab = document.createElement('div');
    lab.className = 'what';
    lab.appendChild(rich(st.label));
    const gen = document.createElement('div');
    gen.className = 'general';
    gen.appendChild(math(st.general));
    const subst = document.createElement('div');
    subst.className = 'subst';
    subst.append(document.createTextNode('= '), render(st.expr, shown, units));
    const res = document.createElement('div');
    res.className = 'result';
    res.append(document.createTextNode('= '), el(qty(shown[k]!, st.unit, prov(st.prov), { digits: st.digits })));
    if (st.solver !== undefined) {
      const note = document.createElement('span');
      note.className = 'solver';
      note.append(
        document.createTextNode(st.approx ? ` (approximate: ${st.approx.note}; the solver has ` : ' (the solver, unrounded: '),
        el(qty(st.solver, st.unit, prov(st.prov.replace(/^derived:/, 'solver:')), { digits: st.digits + 1 })),
        document.createTextNode(')'),
      );
      res.appendChild(note);
    }
    d.append(lab, gen, subst, res);
    box.appendChild(d);
  });
  return box;
}
