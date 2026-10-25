import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createIgcMdtProxy } from './scripts/icgcMdtProxy';
import { resolveGitHubPagesBase } from './scripts/githubPagesBase';

const nodeEnvironment = (globalThis as typeof globalThis & {
  process?: { env: Record<string, string | undefined> };
}).process?.env ?? {};

export default defineConfig({
  base: resolveGitHubPagesBase(nodeEnvironment.GITHUB_REPOSITORY, nodeEnvironment.GITHUB_ACTIONS === 'true'),
  plugins: [react()],
  server: {
    proxy: createIgcMdtProxy(),
  },
});
