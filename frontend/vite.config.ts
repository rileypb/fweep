import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export const viteConfig = defineConfig({
  plugins: [react()],
  base: '/fweep/',
});

export default viteConfig;
