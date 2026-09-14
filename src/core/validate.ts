/**
 * Structural validation of a network case.
 *
 * A power-flow solver will happily produce nonsense from a malformed network,
 * or fail with a message about a singular matrix that says nothing about the
 * real problem. These checks run before the solver and say what is actually
 * wrong, in terms a person can act on.
 */

import { NetworkCase } from './network.js';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  /** Element the issue concerns, if any. */
  elementId?: string;
}

export function validateCase(net: NetworkCase): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (code: string, message: string, elementId?: string) =>
    issues.push({ severity: 'error', code, message, ...(elementId ? { elementId } : {}) });
  const warn = (code: string, message: string, elementId?: string) =>
    issues.push({ severity: 'warning', code, message, ...(elementId ? { elementId } : {}) });

  const busIds = new Set<string>();
  for (const b of net.buses) {
    if (busIds.has(b.id)) err('duplicate-bus', `Two buses share the id "${b.id}".`, b.id);
    busIds.add(b.id);
    if (!(b.baseKV > 0)) err('bad-basekv', `Bus "${b.id}" has no nominal voltage.`, b.id);
    if (b.type !== 'PQ' && b.vSched === undefined) {
      err('missing-vsched', `Bus "${b.id}" is type ${b.type} but has no scheduled voltage.`, b.id);
    }
  }

  const slacks = net.buses.filter((b) => b.type === 'slack');
  if (slacks.length === 0) err('no-slack', 'The case has no slack bus, so nothing sets the angle reference.');
  if (slacks.length > 1) {
    err('many-slacks', `The case has ${slacks.length} slack buses: ${slacks.map((b) => b.id).join(', ')}. ` +
      'Each connected island needs exactly one.');
  }

  const branchIds = new Set<string>();
  for (const br of net.branches) {
    if (branchIds.has(br.id)) err('duplicate-branch', `Two branches share the id "${br.id}".`, br.id);
    branchIds.add(br.id);
    if (!busIds.has(br.from)) err('dangling-branch', `Branch "${br.id}" starts at bus "${br.from}", which does not exist.`, br.id);
    if (!busIds.has(br.to)) err('dangling-branch', `Branch "${br.id}" ends at bus "${br.to}", which does not exist.`, br.id);
    if (br.from === br.to) err('self-loop', `Branch "${br.id}" connects bus "${br.from}" to itself.`, br.id);
    if (br.r === 0 && br.x === 0) err('zero-impedance', `Branch "${br.id}" has zero impedance, which makes the admittance infinite.`, br.id);
    if (br.r < 0) warn('negative-r', `Branch "${br.id}" has negative resistance, so it would produce real power.`, br.id);
    if (br.ratingMVA <= 0) warn('no-rating', `Branch "${br.id}" has no thermal rating, so overload cannot be detected.`, br.id);
    if (br.kind === 'transformer' && br.b !== 0) {
      warn('transformer-charging', `Transformer "${br.id}" has line charging, which a transformer does not have.`, br.id);
    }
  }

  for (const g of net.generators) {
    if (!busIds.has(g.bus)) err('dangling-generator', `Generator "${g.id}" is at bus "${g.bus}", which does not exist.`, g.id);
    if (g.pMaxMW < g.pMinMW) err('bad-plimits', `Generator "${g.id}" has pMax below pMin.`, g.id);
    if (g.qMaxMVAr < g.qMinMVAr) err('bad-qlimits', `Generator "${g.id}" has qMax below qMin.`, g.id);
    if (g.mBaseMVA <= 0) warn('no-mbase', `Generator "${g.id}" has no machine base, so per-unit conversion is undefined.`, g.id);
  }

  for (const l of net.loads) {
    if (!busIds.has(l.bus)) err('dangling-load', `Load "${l.id}" is at bus "${l.bus}", which does not exist.`, l.id);
  }
  for (const s of net.shunts ?? []) {
    if (!busIds.has(s.bus)) err('dangling-shunt', `Shunt "${s.id}" is at bus "${s.bus}", which does not exist.`, s.id);
  }

  // Connectivity: every bus must have a path to the slack, or the Jacobian is
  // singular and the solver cannot place it relative to the reference.
  if (slacks.length === 1) {
    const adj = new Map<string, string[]>();
    for (const b of net.buses) adj.set(b.id, []);
    for (const br of net.branches) {
      if (!br.inService) continue;
      adj.get(br.from)?.push(br.to);
      adj.get(br.to)?.push(br.from);
    }
    const seen = new Set<string>([slacks[0].id]);
    const queue = [slacks[0].id];
    while (queue.length) {
      const cur = queue.pop()!;
      for (const nb of adj.get(cur) ?? []) {
        if (!seen.has(nb)) { seen.add(nb); queue.push(nb); }
      }
    }
    const orphans = net.buses.filter((b) => !seen.has(b.id));
    if (orphans.length > 0) {
      err('island', `${orphans.length} bus(es) have no path to the slack bus: ` +
        orphans.slice(0, 8).map((b) => b.id).join(', ') +
        (orphans.length > 8 ? ', …' : '') + '.');
    }
  }

  // A bus with generation but no scheduled voltage control is easy to miss.
  const genBuses = new Set(net.generators.filter((g) => g.inService).map((g) => g.bus));
  for (const b of net.buses) {
    if (genBuses.has(b.id) && b.type === 'PQ') {
      warn('gen-on-pq', `Bus "${b.id}" has a generator but is type PQ, so nothing holds its voltage.`, b.id);
    }
  }

  return issues;
}

export function assertValid(net: NetworkCase): void {
  const issues = validateCase(net).filter((i) => i.severity === 'error');
  if (issues.length > 0) {
    throw new Error(
      `Network case "${net.id}" is not valid:\n` +
      issues.map((i) => `  [${i.code}] ${i.message}`).join('\n')
    );
  }
}
