/**
 * The no-unglossed-jargon rule, made enforceable.
 *
 * The brief is absolute about this: the first time a term appears anywhere in
 * the interface it carries a one-line plain-language definition. A rule like
 * that survives exactly as long as something checks it, so this walks the
 * source of every panel, pulls out every `term('…')` call, and fails if any of
 * them names something the glossary does not define.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { GLOSSARY, lookup, searchGlossary, GLOSSARY_CATEGORIES } from '../src/data/glossary.js';

const APP_DIR = join(process.cwd(), 'src', 'app');

/** Every `term('id'…)` call in the interface source. */
function termsUsedInUI(): { id: string; file: string }[] {
  const out: { id: string; file: string }[] = [];
  for (const file of readdirSync(APP_DIR)) {
    if (!file.endsWith('.ts')) continue;
    const src = readFileSync(join(APP_DIR, file), 'utf8');
    for (const m of src.matchAll(/\bterm\(\s*'([^']+)'/g)) {
      out.push({ id: m[1], file });
    }
  }
  return out;
}

describe('every term the interface uses is defined', () => {
  const used = termsUsedInUI();

  it('finds term() calls to check at all', () => {
    // If this ever drops to zero the check below has quietly stopped meaning
    // anything, which is worse than failing.
    expect(used.length).toBeGreaterThan(10);
  });

  it('resolves every one of them to a glossary entry', () => {
    const missing = used.filter((u) => lookup(u.id) === undefined);
    expect(
      missing.map((m) => `${m.id} (used in ${m.file})`)
    ).toEqual([]);
  });
});

describe('glossary entries are well formed', () => {
  it('gives every entry a plain-language definition a beginner could read', () => {
    for (const e of GLOSSARY) {
      expect(e.short.length, e.id).toBeGreaterThan(25);
      // A definition ending without a full stop is usually a truncated one.
      expect(e.short.trim().endsWith('.'), e.id).toBe(true);
    }
  });

  it('uses unique ids and unique terms', () => {
    const ids = GLOSSARY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const terms = GLOSSARY.map((e) => e.term.toLowerCase());
    expect(new Set(terms).size).toBe(terms.length);
  });

  it('puts every entry in a category the glossary panel renders', () => {
    const known = new Set(GLOSSARY_CATEGORIES.map((c) => c.id));
    for (const e of GLOSSARY) expect(known.has(e.category), e.id).toBe(true);
  });

  it('resolves every cross-reference', () => {
    const broken: string[] = [];
    for (const e of GLOSSARY) {
      for (const ref of e.see ?? []) {
        if (!lookup(ref)) broken.push(`${e.id} → ${ref}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('gives a symbol and a unit to the quantities that have them', () => {
    // The brief: every quantity carries its symbol, its unit, and a sense of
    // scale. Anything filed as a quantity had better have the first two —
    // except an entry whose "symbol" is a RELATIONSHIP between quantities
    // rather than a quantity of its own. S² = P² + Q² has no unit, and giving
    // it one would be a category error rather than a kindness.
    for (const e of GLOSSARY) {
      if (e.category !== 'quantity') continue;
      expect(e.symbol, `${e.id} needs a symbol`).toBeTruthy();
      const isRelationship = (e.symbol ?? '').includes('=');
      if (!isRelationship) {
        expect(e.unit, `${e.id} needs a unit`).toBeTruthy();
      }
    }
  });

  it('uses the field’s own vocabulary rather than friendly renames', () => {
    // A spot check on the terms the brief names explicitly as opaque-but-real:
    // these must be present under their standard names, not under invented ones.
    for (const required of [
      'bus', 'reactive power', 'per-unit', 'slack bus', 'power factor',
      'impedance', 'reactance', 'phase angle', 'power flow',
    ]) {
      expect(lookup(required), `"${required}" must be in the glossary`).toBeTruthy();
    }
  });

  it('cites the standard where one exists', () => {
    const shouldCite = ['device-number', 'relay', 'saifi', 'saidi', 'caidi', 'vector-group'];
    for (const id of shouldCite) {
      expect(lookup(id)?.standard, `${id} should name its standard`).toBeTruthy();
    }
  });
});

describe('glossary search', () => {
  it('finds an entry by its exact term', () => {
    expect(searchGlossary('reactive power')[0].id).toBe('reactive-power');
  });

  it('finds an entry by a prefix', () => {
    expect(searchGlossary('react').map((e) => e.id)).toContain('reactive-power');
  });

  it('finds an entry by an alias', () => {
    expect(searchGlossary('VAr').map((e) => e.id)).toContain('reactive-power');
  });

  it('falls back to searching the definitions', () => {
    expect(searchGlossary('magnetic field').length).toBeGreaterThan(0);
  });

  it('returns everything for an empty query', () => {
    expect(searchGlossary('').length).toBe(GLOSSARY.length);
  });
});
