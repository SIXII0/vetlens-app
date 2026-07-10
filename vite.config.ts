import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    host: '0.0.0.0',
    port: 3000
  },
  optimizeDeps: {
    exclude: ['better-sqlite3']
  },
  ssr: {
    // @lucide/svelte 导出 .svelte 文件，SSR 时必须由 Svelte 编译器处理（不能 externalize）
    noExternal: ['@lucide/svelte'],
    // tesseract.js 是浏览器端库（依赖 Web Workers / WASM），SSR 时必须 externalize
    external: ['better-sqlite3', 'sharp', 'tesseract.js']
  }
});
