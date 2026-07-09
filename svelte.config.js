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
    csp: {
      directives: {
        'default-src': ['self', '*.amap.com', '*.autonavi.com', 'fonts.googleapis.com', 'fonts.gstatic.com'],
        'script-src': ['self', 'unsafe-inline', 'unsafe-eval', 'wasm-unsafe-eval', '*.amap.com', '*.autonavi.com', 'blob:'],
        'worker-src': ['self', 'blob:', '*.amap.com'],
        'connect-src': ['self', '*.amap.com', '*.autonavi.com', 'blob:', 'data:', '*'],
        'img-src': ['self', 'data:', 'blob:', '*'],
        'style-src': ['self', 'unsafe-inline', '*'],
        'font-src': ['self', 'data:', '*'],
      }
    }
  }
};

export default config;
