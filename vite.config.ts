import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // The proof-of-concept page (#40) ships with the app at /poc/.
      input: { main: 'index.html', poc: 'poc/index.html' },
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'harness/**/*.test.ts'],
    environment: 'node',
  },
})
