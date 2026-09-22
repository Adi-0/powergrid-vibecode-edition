import type { PFCase } from './case';

/**
 * Electrical islands: groups of buses joined by in-service branches. When lines
 * trip, the network can split. Each island must balance its own generation and
 * load; an island with no source has no operating point at all.
 */
export function islands(c: PFCase): number[][] {
  const n = c.buses.length;
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  for (const br of c.branches) {
    if (!br.inService) continue;
    const a = find(br.from);
    const b = find(br.to);
    if (a !== b) parent[a] = b;
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let g = groups.get(r);
    if (!g) groups.set(r, (g = []));
    g.push(i);
  }
  // largest island first
  return [...groups.values()].sort((a, b) => b.length - a.length);
}
