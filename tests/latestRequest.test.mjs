import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/domain/visibility/latestRequest.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { isLatestRequest } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('results from an older observer, radius or orientation generation are rejected', () => {
  const currentCalculationRequest = 4;
  for (const staleRequest of [1, 2, 3]) {
    assert.equal(isLatestRequest(staleRequest, currentCalculationRequest), false);
  }
  assert.equal(isLatestRequest(currentCalculationRequest, currentCalculationRequest), true);
});
