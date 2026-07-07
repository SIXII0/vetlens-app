import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ out: 'build' }),
    alias: {
      $lib: 'src/lib',
      $components: 'src/lib/components',
      $server: 'src/lib/server',
      $stores: 'src/lib/stores',
      $utils: 'src/lib/utils'
    },
    csrf: {
      checkOrigin: false
    },
    // Allow all origins for local Docker deployment
    csp: {
      directives: {
        'script-src': ['self', 'wasm-unsafe-eval'],
        'worker-src': ['self', 'blob:'],
      }
    }
  }
};

export default config;
