/**
 * The model-honesty documentation must stay in sync with the data the app
 * reads. The brief requires it; this test makes it true by construction rather
 * than by discipline.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { SIMPLIFICATIONS, simplificationsFor, ScopeId } from '../src/data/simplifications.js';

describe('model honesty', () => {
  it('has docs/simplifications.md regenerated from the source data', () => {
    expect(() =>
      execFileSync(process.execPath, ['tools/gen-simplifications.mjs', '--check'], {
        encoding: 'utf8',
      })
    ).not.toThrow();
  });

  it('gives every entry a scope, a severity, and all three explanations', () => {
    for (const s of SIMPLIFICATIONS) {
      expect(s.scope.length, s.id).toBeGreaterThan(0);
      expect(s.title.length, s.id).toBeGreaterThan(10);
      expect(s.whatWeDo.length, s.id).toBeGreaterThan(30);
      expect(s.fullTreatment.length, s.id).toBeGreaterThan(30);
      expect(s.consequence.length, s.id).toBeGreaterThan(30);
      expect(['cosmetic', 'modest', 'material']).toContain(s.severity);
    }
  });

  it('uses unique ids', () => {
    const ids = SIMPLIFICATIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has something to say about every view in the zoom tree', () => {
    // A view with nothing to declare is a view that has not been thought about.
    const scopes: ScopeId[] = [
      'system', 'region', 'substation', 'feeder', 'service', 'plant', 'machine', 'math',
    ];
    for (const scope of scopes) {
      expect(simplificationsFor(scope).length, scope).toBeGreaterThan(0);
    }
  });
});
