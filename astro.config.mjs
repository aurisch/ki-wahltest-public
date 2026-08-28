import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://ki-wahltest.de',
  output: 'static',
  integrations: [sitemap()],
});
