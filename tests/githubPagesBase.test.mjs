import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../scripts/githubPagesBase.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const config = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);

test('GitHub Actions builds a project-site base from the repository name', () => {
  assert.equal(config.resolveGitHubPagesBase('xavimontesinos/BuscaPics', true), '/BuscaPics/');
});

test('local builds and user/organization sites use the root base', () => {
  assert.equal(config.resolveGitHubPagesBase('xavimontesinos/BuscaPics', false), '/');
  assert.equal(config.resolveGitHubPagesBase('xavimontesinos/xavimontesinos.github.io', true), '/');
  assert.equal(config.resolveGitHubPagesBase(undefined, true), '/');
});
