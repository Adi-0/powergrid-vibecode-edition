import { TERM_BY_ID } from './glossary';

/**
 * Hover (or focus) on any glossary term shows its one-line definition, next to it.
 * The tip is tagged with its data source (the glossary), like every other text that
 * can carry digits.
 */
export function installTermTips(root: HTMLElement): void {
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  tip.setAttribute('role', 'tooltip');
  root.appendChild(tip);
  const show = (target: HTMLElement) => {
    const id = target.dataset.term;
    const t = id ? TERM_BY_ID.get(id) : undefined;
    if (!t) return;
    tip.replaceChildren();
    tip.dataset.prov = `data:glossary.${t.id}`;
    const a = document.createElement('div');
    a.className = 't';
    a.textContent = t.term;
    tip.appendChild(a);
    if (t.notation) {
      const n = document.createElement('div');
      n.className = 'n';
      n.textContent = t.notation;
      tip.appendChild(n);
    }
    const p = document.createElement('div');
    p.textContent = t.plain;
    tip.appendChild(p);
    tip.hidden = false;
    const r = target.getBoundingClientRect();
    const pr = root.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let x = r.left - pr.left;
    let y = r.bottom - pr.top + 6;
    if (x + w > pr.width - 8) x = pr.width - 8 - w;
    if (y + h > pr.height - 8) y = r.top - pr.top - h - 6;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${Math.max(8, y)}px`;
  };
  const hide = () => (tip.hidden = true);
  root.addEventListener('pointerover', (e) => {
    const t = (e.target as HTMLElement).closest?.('.term') as HTMLElement | null;
    if (t) show(t);
  });
  root.addEventListener('pointerout', (e) => {
    if ((e.target as HTMLElement).closest?.('.term')) hide();
  });
  root.addEventListener('focusin', (e) => {
    const t = (e.target as HTMLElement).closest?.('.term') as HTMLElement | null;
    if (t) show(t);
  });
  root.addEventListener('focusout', hide);
}
