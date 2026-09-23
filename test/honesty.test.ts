import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { HONESTY, LEVEL_SECTIONS, parseSimplifications, type HonestyContext } from '../src/ui/honesty';

/**
 * The model-honesty panel and docs/simplifications.md stay in step: every section the
 * app asks for exists, every section can be reached from some view, and every item in
 * the document is parsed (none silently dropped by a formatting slip).
 */
const CONTEXTS: HonestyContext[] = ['trip', 'frequency', 'fault', 'math'];

describe('model honesty', () => {
  const md = readFileSync(new URL('../docs/simplifications.md', import.meta.url), 'utf8');

  it('every item in the document is parsed, and every section has one', () => {
    const bullets = md.split('\n').filter((l) => l.startsWith('- **Simplified:**')).length;
    const parsed = parseSimplifications(md).reduce((a, s) => a + s.items.length, 0);
    expect(parsed).toBe(bullets);
    for (const s of HONESTY) expect(s.items.length, s.id).toBeGreaterThan(0);
    // every bullet in a section is an item (no bullet in another format)
    expect(md.split('\n').filter((l) => /^- /.test(l) && !l.startsWith('- **Simplified:**') && md.indexOf(l) > md.indexOf('## ')).length).toBe(0);
  });

  it('every section the app asks for exists', () => {
    const ids = new Set(HONESTY.map((s) => s.id));
    for (const list of Object.values(LEVEL_SECTIONS)) for (const id of list) expect(ids.has(id), id).toBe(true);
    for (const c of CONTEXTS) expect(ids.has(c), c).toBe(true);
    expect(ids.has('global')).toBe(true);
  });

  it('every section is reachable from some view', () => {
    const reach = new Set<string>(['global', ...CONTEXTS, ...Object.values(LEVEL_SECTIONS).flat()]);
    for (const s of HONESTY) expect(reach.has(s.id), `${s.id} is in the document but no view shows it`).toBe(true);
  });
});
