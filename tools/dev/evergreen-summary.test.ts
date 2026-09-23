import { it } from 'vitest';
import { buildEvergreen, EVERGREEN } from '../../src/data/dist/evergreen';
it('evergreen summary', () => {
  const { net, layout } = buildEvergreen();
  console.log('root', net.root, 'nodes', net.nodes.size, 'branches', net.branches.length, 'caps', net.caps.map((c) => `${c.id}@${c.node}`).join(','));
  console.log('first branches', net.branches.slice(0, 12).map((b) => `${b.id}:${b.kind}:${b.from}->${b.to}`).join(' | '));
  const kinds: Record<string, number> = {};
  for (const b of net.branches) kinds[b.kind] = (kinds[b.kind] ?? 0) + 1;
  console.log('kinds', JSON.stringify(kinds));
  console.log('devices', layout.devices.map((d) => `${d.kind}:${d.id}@${d.branchOrNode}`).join(' | '));
  console.log('trunk', layout.trunk.length, layout.trunk.slice(0, 6).join(','), '...');
  console.log('laterals', layout.laterals.length, layout.laterals.slice(0, 3).map((l) => `${l.id}:${l.tap}:${'abc'[l.phase]}:${l.nodes.length}`).join(' | '));
  console.log('xfmrs', layout.transformers.length, layout.transformers.slice(0, 3).map((t) => `${t.id}:${t.primary}->${t.secondary}:${t.kva}kVA`).join(' | '));
  console.log('homes', layout.homes.length, JSON.stringify(layout.homes[0]));
  console.log('outlet', JSON.stringify(layout.outlet));
  const xs = [...layout.pos.values()];
  console.log('extent x', Math.min(...xs.map((p) => p.x)), Math.max(...xs.map((p) => p.x)), 'z', Math.min(...xs.map((p) => p.z)), Math.max(...xs.map((p) => p.z)));
  console.log('EVERGREEN', JSON.stringify(EVERGREEN));
  const outletPath: string[] = [];
  const parent = new Map(net.branches.map((b) => [b.to, b]));
  for (let n = layout.outlet.node; n !== net.root; ) { const b = parent.get(n)!; outletPath.push(`${b.id}(${b.kind})`); n = b.from; }
  console.log('outlet path', outletPath.length, outletPath.join(' <- '));
});
