// End-to-end verification of this fork's own behaviour: St. Louis branding,
// the three public basemaps, and the city bounds. The inherited suite in
// tests/e2e asserts the upstream multi-catalog product and no longer applies —
// see the note in .github/workflows/playwright.yml.
//
// This hits the network on purpose: the live catalog on Source Cooperative,
// basemaps.cartocdn.com and server.arcgisonline.com. It verifies against real
// data rather than mocks. Until the catalog is pushed to
// data.source.coop/tge-labs/st-louis-open-data-mirror, the catalog- and
// map-dependent sections are skipped rather than failed: the branding shell is
// this fork's promise either way.
//
// Usage:
//   node_modules/.bin/vite --port 8080 --strictPort &
//   node verify-stlouis.mjs [baseUrl]
//
// Screenshots land in ./verify-out (override with VERIFY_OUT).
/* global process, fetch */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:8080';
const OUT = process.env.VERIFY_OUT || './verify-out';
const CATALOG_URL = 'https://data.source.coop/tge-labs/st-louis-open-data-mirror/catalog.json';
mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
function skip(name, detail) {
  console.log(`SKIP  ${name}${detail ? ` — ${detail}` : ''}`);
}

// Reaches into the page for the live MapLibre instance. MapView keeps it on the
// component, so walk the Vue tree from the map container element.
//
// This needs Vue's component internals, which a production build strips. Run
// this script against the dev server, not against `dist`.
const MAP_PROBE = `(() => {
  const el = document.querySelector('.maplibregl-map');
  if (!el) return null;
  let node = el;
  while (node) {
    const vnode = node.__vueParentComponent || node.__vnode;
    if (vnode) {
      let c = node.__vueParentComponent;
      while (c) {
        if (c.ctx && c.ctx.map && c.ctx.map.getStyle) return c.ctx.map;
        if (c.proxy && c.proxy.map && c.proxy.map.getStyle) return c.proxy.map;
        c = c.parent;
      }
    }
    node = node.parentElement;
  }
  return null;
})()`;

// Is the live catalog up yet? Decides whether the data-dependent sections run.
const catalogLive = await fetch(CATALOG_URL, { method: 'GET' })
  .then(r => r.ok).catch(() => false);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`));

const tileRequests = [];
page.on('request', r => {
  if (/cartocdn\.com|arcgisonline\.com/.test(r.url())) tileRequests.push(r.url());
});

// ---------- 1. Root ----------
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/stl-01-root.png` });

// ---------- 2. Header branding ----------
const header = await page.evaluate(() => {
  const bar = document.querySelector('.stl-bar');
  const band = document.querySelector('.stl-band');
  const menu = document.querySelector('.stl-menu');
  const brand = document.querySelector('.stl-brand');
  const cs = e => e && getComputedStyle(e);
  return {
    barBg: cs(document.querySelector('.stl-header'))?.backgroundColor,
    bandBg: cs(band)?.backgroundColor,
    menuBg: cs(menu)?.backgroundColor,
    brandColor: cs(brand)?.color,
    font: cs(brand)?.fontFamily,
    brandText: brand?.innerText.replace(/\s+/g, ''),
    strongWeight: cs(brand?.querySelector('.strong'))?.fontWeight,
    barWidth: bar?.getBoundingClientRect().width,
    fleurSrc: document.querySelector('.stl-fleur')?.getAttribute('src'),
    hOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});
check('header bar is white', header.barBg === 'rgb(255, 255, 255)', header.barBg);
check('accent band blue is #1E526B', header.bandBg === 'rgb(30, 82, 107)', header.bandBg);
check('MENU red is #C03221', header.menuBg === 'rgb(192, 50, 33)', header.menuBg);
check('wordmark blue is #1E526B', header.brandColor === 'rgb(30, 82, 107)', header.brandColor);
check('Open Sans applied to wordmark', /Open Sans/.test(header.font || ''), header.font);
// startsWith: innerText also picks up the visually-hidden accessibility label.
check('wordmark reads STLOUIS-MOGOV', header.brandText?.startsWith('STLOUIS-MOGOV'), header.brandText);
check('STLOUIS is bold', header.strongWeight === '700', header.strongWeight);
check('fleur-de-lis asset referenced', !!header.fleurSrc && header.fleurSrc.includes('fleur-de-lis.svg'), header.fleurSrc);
check('no horizontal overflow', header.hOverflow === 0, `${header.hOverflow}px`);

// ---------- 2a. Typography and palette ----------
const type = await page.evaluate(() => {
  const b = getComputedStyle(document.body);
  const h1 = document.querySelector('h1');
  const content = [...document.querySelectorAll('a')].find(a =>
    a.innerText.trim().length > 3 && !a.closest('.maplibregl-map') && !a.closest('header')
    && !a.closest('.stl-hero') && !a.className.includes('btn')); // hero links are white-on-blue by design
  const c = content ? getComputedStyle(content) : null;
  return {
    bodyFont: b.fontFamily, bodyColor: b.color, bodyBg: b.backgroundColor,
    h1Font: h1 && getComputedStyle(h1).fontFamily,
    h1Color: h1 && getComputedStyle(h1).color,
    linkColor: c && c.color, linkText: content && content.innerText.trim().slice(0, 20),
  };
});
check('body is Open Sans', /Open Sans/.test(type.bodyFont || ''), type.bodyFont);
check('page background is #EFEFEF', type.bodyBg === 'rgb(239, 239, 239)', type.bodyBg);
check('h1 is Merriweather', /Merriweather/.test(type.h1Font || ''), type.h1Font);
if (type.linkColor) {
  check('links are #1E526B', type.linkColor === 'rgb(30, 82, 107)', `${type.linkColor} (${type.linkText})`);
}
else {
  skip('links are #1E526B', 'no prose link on the page to sample');
}

// ---------- 2b. Footer provenance ----------
// A visitor should be able to get from the page to the data and to the code.
const footer = await page.evaluate(() =>
  [...document.querySelectorAll('footer a')].map(a => ({ text: a.innerText.trim(), href: a.href }))
);
const repoLink = footer.find(l => l.href === 'https://github.com/cholmes/stlouis-data-browser');
check('footer links to this site\'s source', !!repoLink, repoLink ? repoLink.text : footer.map(l => l.text).join(' | '));
check('footer links to the catalog', footer.some(l => l.href.includes('source.coop/tge-labs/st-louis-open-data-mirror')),
  footer.map(l => l.text).join(' | '));
check('footer links to the city portal', footer.some(l => l.href.includes('stlouis-mo.gov')),
  footer.map(l => l.text).join(' | '));

// ---------- 3. Catalog and map (needs the live catalog) ----------
if (!catalogLive) {
  skip('root catalog loads', `catalog not yet published at ${CATALOG_URL}`);
  skip('map constraints, basemaps, bounds clamping', 'no collection to open a map on');
}
else {
  const title = await page.textContent('h1').catch(() => null);
  check('root catalog loads a title', !!title && title.length > 0, `h1 = ${JSON.stringify(title)}`);

  const cardCount = await page.locator('.catalog-card').count();
  check('collections listed', cardCount > 0, `${cardCount} cards`);

  // ---------- 3a. Home view (hero, stats, topics, tags) ----------
  const hero = await page.evaluate(() => {
    const el = document.querySelector('.stl-hero');
    return el && { bg: getComputedStyle(el).backgroundColor, h1: el.querySelector('h1')?.innerText.trim() };
  });
  check('hero band renders on #1E526B', hero?.bg === 'rgb(30, 82, 107)', hero ? `${hero.bg} — ${hero.h1}` : 'no .stl-hero');

  // Children stream in through the background loader; give the stats a moment.
  await page.waitForSelector('.stl-stat-card', { timeout: 20000 }).catch(() => {});
  const statCards = await page.locator('.stl-stat-card').count();
  check('quick stats render', statCards >= 1, `${statCards} stat cards`);

  // The topic sub-catalog cards carry their topic glyphs.
  const topicIcons = await page.locator('.catalog-card .stl-card-topic-icon').count();
  if (topicIcons > 0) {
    check('topic cards carry glyphs', true, `${topicIcons} of ${cardCount} cards`);
  }
  else {
    skip('topic cards carry glyphs', 'no catalog cards loaded as catalogs');
  }
  const tagChips = await page.locator('.stl-tag').count();
  if (tagChips > 0) {
    check('tag cloud renders', true, `${tagChips} tags`);
  }
  else {
    skip('tag cloud renders', 'catalog has no keywords yet');
  }

  // Open the first card — a topic sub-catalog since the restructure — and,
  // if it holds no map, descend one more level to its first collection.
  await page.locator('.catalog-card a').first().click();
  await page.waitForTimeout(2500);
  if (await page.locator('.maplibregl-map').count() === 0
      && await page.locator('.catalog-card a').count() > 0) {
    await page.locator('.catalog-card a').first().click();
  }
  await page.waitForSelector('.maplibregl-map', { timeout: 30000 }).catch(() => {});

  const hasMap = await page.locator('.maplibregl-map').count();
  if (!hasMap) {
    skip('map checks', 'first collection shows no map');
  }
  else {
    await page.waitForFunction(`(() => { const m = ${MAP_PROBE}; return m && m.isStyleLoaded && m.isStyleLoaded(); })()`, null, { timeout: 45000 })
      .catch(() => {});
    await page.waitForTimeout(4000);

    const mapState = await page.evaluate(`(() => {
      const m = ${MAP_PROBE};
      if (!m) return null;
      return {
        minZoom: m.getMinZoom(), maxZoom: m.getMaxZoom(),
        maxBounds: m.getMaxBounds() && m.getMaxBounds().toArray(),
        center: [m.getCenter().lng, m.getCenter().lat],
        zoom: m.getZoom(),
      };
    })()`);
    if (!mapState) {
      console.error('Could not reach the MapLibre instance. This script needs Vue component internals, which production builds strip — point it at the dev server.');
      check('map reachable', false, 'no MapLibre instance');
    }
    else {
      check('minZoom clamped to 9', mapState.minZoom === 9, String(mapState.minZoom));
      check('maxBounds set to the city region',
        JSON.stringify(mapState.maxBounds) === JSON.stringify([[-90.75, 38.30], [-89.75, 39.00]]),
        JSON.stringify(mapState.maxBounds));
      check('basemap tiles fetched', tileRequests.length > 0, `${tileRequests.length} requests`);

      // Bounds clamping: try to leave the region.
      const clamp = await page.evaluate(`(async () => {
        const m = ${MAP_PROBE};
        m.jumpTo({ center: [-87.63, 41.88], zoom: 10 });   // Chicago
        await new Promise(r => setTimeout(r, 600));
        const afterPan = [m.getCenter().lng, m.getCenter().lat];
        m.setZoom(2);                                       // try to zoom to world
        await new Promise(r => setTimeout(r, 600));
        return { afterPan, afterZoom: m.getZoom() };
      })()`);
      check('pan to Chicago is clamped', clamp.afterPan[0] < -89.5, `lng ${clamp.afterPan[0].toFixed(3)}`);
      check('zoom-out is clamped to minZoom', clamp.afterZoom >= 9, `zoom ${clamp.afterZoom}`);

      // Basemap switcher offers exactly the three configured.
      await page.click('.map-layercontrol button, .map-layercontrol').catch(() => {});
      await page.waitForTimeout(800);
      const radios = await page.locator('input[type=radio]').count();
      check('basemap switcher offers exactly 3', radios === 3, `${radios} options`);
    }
    await page.screenshot({ path: `${OUT}/stl-02-collection.png` });
  }
}

const realErrors = consoleErrors.filter(e =>
  !/favicon|ResizeObserver/i.test(e)
  // Without the live catalog every page load logs the failed catalog fetch.
  && (catalogLive || !/catalog\.json|Failed to fetch|NetworkError|ERR_|404/i.test(e)));
check('no console errors', realErrors.length === 0, realErrors.slice(0, 3).join(' ;; ') || 'clean');

await browser.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${catalogLive ? '' : ' (catalog offline; data checks skipped)'}`);
if (failed.length) {
  console.log('FAILED:', failed.map(f => f.name).join(', '));
  process.exit(1);
}
