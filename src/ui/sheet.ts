import { dataText } from './quantity';

/**
 * The drawing border: a hairline frame with zone marks, numbers along the top and
 * bottom and letters down the sides, as on an engineering sheet. Zone numbers are
 * ordinals, tagged as such for the provenance check.
 */
export function drawSheet(parent: HTMLElement): HTMLElement {
  const s = document.createElement('div');
  s.className = 'sheet';
  s.setAttribute('aria-hidden', 'true');
  parent.appendChild(s);
  const redraw = () => {
    s.replaceChildren();
    const W = s.clientWidth;
    const H = s.clientHeight;
    const nx = Math.max(4, Math.round(W / 220));
    const ny = Math.max(3, Math.round(H / 220));
    for (let i = 0; i < nx; i++) {
      const x = ((i + 0.5) * W) / nx;
      for (const top of [true, false]) {
        const z = dataText(String(i + 1), { src: 'data', key: `ordinal:sheet.zone.${i + 1}` }, 'zone');
        z.style.left = `${x - 3}px`;
        z.style[top ? 'top' : 'bottom'] = '-1px';
        z.style.transform = top ? 'translateY(-100%)' : 'translateY(100%)';
        s.appendChild(z);
      }
      if (i > 0) {
        for (const top of [true, false]) {
          const t = document.createElement('div');
          t.className = 'tick';
          t.style.left = `${(i * W) / nx}px`;
          t.style.width = '1px';
          t.style.height = '5px';
          t.style[top ? 'top' : 'bottom'] = '0';
          s.appendChild(t);
        }
      }
    }
    for (let j = 0; j < ny; j++) {
      const y = ((j + 0.5) * H) / ny;
      const letter = String.fromCharCode(65 + j);
      for (const left of [true, false]) {
        const z = document.createElement('span');
        z.className = 'zone';
        z.textContent = letter;
        z.style.top = `${y - 7}px`;
        z.style[left ? 'left' : 'right'] = '-1px';
        z.style.transform = left ? 'translateX(-100%)' : 'translateX(100%)';
        s.appendChild(z);
      }
      if (j > 0) {
        for (const left of [true, false]) {
          const t = document.createElement('div');
          t.className = 'tick';
          t.style.top = `${(j * H) / ny}px`;
          t.style.height = '1px';
          t.style.width = '5px';
          t.style[left ? 'left' : 'right'] = '0';
          s.appendChild(t);
        }
      }
    }
  };
  new ResizeObserver(redraw).observe(s);
  redraw();
  return s;
}
