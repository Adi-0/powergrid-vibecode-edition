/**
 * Generate docs/simplifications.md from src/data/simplifications.ts.
 *
 * The TypeScript file is the source of truth, because the in-app model-honesty
 * panel reads it. Generating the document from the same array is what keeps the
 * brief's "keep them in sync" requirement true by construction rather than by
 * discipline. test/simplifications.test.ts fails if this has not been re-run.
 *
 *   node tools/gen-simplifications.mjs            # write the file
 *   node tools/gen-simplifications.mjs --check    # exit 1 if out of date
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const json = execFileSync(process.execPath, [
  '--experimental-strip-types', '--no-warnings', '-e',
  "import('./src/data/simplifications.ts').then(m => " +
  "process.stdout.write(JSON.stringify(m.SIMPLIFICATIONS)))",
], { encoding: 'utf8' });

const items = JSON.parse(json);

const SEVERITY_NOTE = {
  cosmetic: 'Would not change any answer a user reads.',
  modest: 'Shifts numbers by a few per cent, or hides a secondary effect.',
  material: 'Changes the kind of answer you get. Read this one.',
};

let out = `# What this model does not represent

<!-- GENERATED FILE — do not edit by hand.
     Source of truth: src/data/simplifications.ts
     Regenerate:      node tools/gen-simplifications.mjs
     The in-app model-honesty panel reads the same array, so this document and
     the panel cannot disagree. -->

Every view in the app carries a quiet control that opens this list, filtered to
what applies there. A teaching model that hides its own edges teaches confident
wrongness; one that shows them teaches how models work.

Severity is how badly a simplification would change an answer:

| Severity | Meaning |
|---|---|
${Object.entries(SEVERITY_NOTE).map(([k, v]) => `| \`${k}\` | ${v} |`).join('\n')}

---

`;

const bySeverity = { material: [], modest: [], cosmetic: [] };
for (const s of items) bySeverity[s.severity].push(s);

for (const sev of ['material', 'modest', 'cosmetic']) {
  if (bySeverity[sev].length === 0) continue;
  out += `## ${sev[0].toUpperCase()}${sev.slice(1)}\n\n`;
  for (const s of bySeverity[sev]) {
    out += `### ${s.title}\n\n`;
    out += `*Applies to: ${s.scope.join(', ')}* · \`${s.id}\`\n\n`;
    out += `**What the model does.** ${s.whatWeDo}\n\n`;
    out += `**What the full treatment would involve.** ${s.fullTreatment}\n\n`;
    out += `**What that means for you.** ${s.consequence}\n\n`;
  }
}

out += `---\n\n*${items.length} entries.*\n`;

if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync('docs/simplifications.md', 'utf8'); } catch {}
  if (current !== out) {
    console.error('docs/simplifications.md is out of date. Run: node tools/gen-simplifications.mjs');
    process.exit(1);
  }
  console.log('docs/simplifications.md is up to date.');
} else {
  writeFileSync('docs/simplifications.md', out);
  console.log(`wrote docs/simplifications.md (${items.length} entries)`);
}
