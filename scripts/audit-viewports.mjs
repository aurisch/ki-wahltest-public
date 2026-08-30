import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, normalize, relative } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const dist = join(root, 'dist');
if (!existsSync(dist)) throw new Error('VIEWPORT AUDIT: dist fehlt');

const allFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? allFiles(join(dir, entry.name)) : [join(dir, entry.name)],
);
const htmlFiles = allFiles(dist).filter((path) => path.endsWith('.html'));
const routes = htmlFiles.map((path) => {
  const rel = relative(dist, path).replaceAll('\\', '/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return `/${rel.slice(0, -10)}`;
  return `/${rel}`;
}).sort();

const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  let candidate = join(dist, pathname.replace(/^\/+/, ''));
  if (pathname.endsWith('/')) candidate = join(candidate, 'index.html');
  else if (!extname(candidate) && existsSync(join(candidate, 'index.html'))) candidate = join(candidate, 'index.html');
  candidate = normalize(candidate);
  if (!candidate.startsWith(normalize(dist)) || !existsSync(candidate) || statSync(candidate).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'content-type': types[extname(candidate)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(readFileSync(candidate));
});
await new Promise((resolve) => server.listen(4179, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:4179';
const browser = await chromium.launch({ headless: true });

const viewports = [
  ['desktop-1440', { width: 1440, height: 900 }],
  ['laptop-1280', { width: 1280, height: 800 }],
  ['mobile-390', { width: 390, height: 844 }],
];
let checked = 0;

try {
  for (const [name, viewport] of viewports) {
    const context = await browser.newContext({ viewport });
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === base) await route.continue(); else await route.abort();
    });
    const page = await context.newPage();
    for (const route of routes) {
      const response = await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 15000 });
      if (response?.status() !== 200) throw new Error(`VIEWPORT AUDIT: ${name} ${route}: HTTP ${response?.status()}`);
      const geometry = await page.evaluate(() => {
        const viewport = window.innerWidth;
        const documentWidth = document.documentElement.scrollWidth;
        const bodyWidth = document.body.scrollWidth;
        const candidates = [...document.querySelectorAll('body *')].map((el) => {
          const r = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
          return {
            tag: el.tagName.toLowerCase(),
            cls: typeof el.className === 'string' ? el.className : '',
            left: r.left, right: r.right, width: r.width,
            clientWidth: el.clientWidth, scrollWidth: el.scrollWidth,
            minWidth: style.minWidth, widthCss: style.width,
            whiteSpace: style.whiteSpace, overflowX: style.overflowX,
            display: style.display, text,
          };
        });
        const offenders = candidates
          .filter((x) => x.right > viewport + 2 || x.left < -2 || x.scrollWidth > x.clientWidth + 2 || x.width > viewport + 2)
          .sort((a, b) => {
            const score = (x) => Math.max(x.right - viewport, -x.left, x.scrollWidth - x.clientWidth, x.width - viewport);
            return score(b) - score(a);
          })
          .slice(0, 8);
        return { viewport, documentWidth, bodyWidth, offenders };
      });
      if (geometry.documentWidth > geometry.viewport + 2 || geometry.bodyWidth > geometry.viewport + 2) {
        const details = geometry.offenders.map((x) => {
          const selector = `${x.tag}${x.cls ? '.' + x.cls.trim().replace(/\s+/g, '.') : ''}`;
          return `${selector} rect=${x.left.toFixed(0)}..${x.right.toFixed(0)} w=${x.width.toFixed(0)} scroll/client=${x.scrollWidth}/${x.clientWidth} min=${x.minWidth} cssW=${x.widthCss} white=${x.whiteSpace} overflowX=${x.overflowX} text="${x.text}"`;
        }).join(' | ');
        throw new Error(`VIEWPORT AUDIT: ${name} ${route}: horizontaler Überlauf doc=${geometry.documentWidth}px body=${geometry.bodyWidth}px viewport=${geometry.viewport}px; ${details || 'kein einzelnes Element ermittelt'}`);
      }
      checked += 1;
    }
    await context.close();
  }
  console.log(`VIEWPORT AUDIT: PASS · ${routes.length} Seiten × ${viewports.length} Viewports = ${checked} Renderings ohne Dokument-Überlauf.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
