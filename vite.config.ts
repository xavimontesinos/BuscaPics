import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createIgcMdtProxy } from './scripts/icgcMdtProxy';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: createIgcMdtProxy(),
  },
});
