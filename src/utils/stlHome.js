// Helpers for the St. Louis home view (StlHome.vue): reading the portal's
// topic assignments and tags off child collections, and the icon set for the
// "Datasets By Topic" cards.
//
// Topics follow the STAC Themes extension. Each collection carries:
//   themes: [{ scheme: "https://www.stlouis-mo.gov/data/topics/",
//              concepts: [{ id: "<slug>", title: "<Main Topic>" }] }]
// The catalog is generated, but every accessor here is defensive anyway —
// collections without themes or keywords simply contribute nothing.

import { Link } from 'stac-js';

export const TOPIC_SCHEME = 'https://www.stlouis-mo.gov/data/topics/';
export const DEPARTMENT_SCHEME = 'https://www.stlouis-mo.gov/government/departments/';

/**
 * Expands the root catalog's children one level into leaf entries.
 *
 * The catalog nests its collections one level deep — root → department
 * sub-catalogs → collections — but a child that is itself a collection is
 * kept as-is, so a flat catalog keeps working. A loaded child catalog is
 * replaced by its child links; anything else (a collection, or a child that
 * has not loaded yet) stays a leaf. Only one level is expanded.
 *
 * @param {Array} children The root's child links (or STAC objects).
 * @param {function} getStac Resolves a link/URL/STAC to a loaded stac-js
 *   object or null (the store's `getStac` getter).
 * @returns {Array.<{link: Object, url: ?string, stac: ?Object, expanded: boolean}>}
 *   Leaf entries: `link` is renderable in the collection grid (grandchild
 *   links get an absolute href so they resolve outside their catalog's
 *   context), `url` is the absolute URL (for queueing), `stac` the loaded
 *   STAC object or null, `expanded` whether the leaf came out of a child
 *   catalog.
 */
export function expandChildren(children, getStac) {
  const leaves = [];
  if (!Array.isArray(children) || typeof getStac !== 'function') {
    return leaves;
  }
  for (const child of children) {
    if (!child) {
      continue;
    }
    const url = typeof child.getAbsoluteUrl === 'function' ? child.getAbsoluteUrl() : null;
    const stac = getStac(url ?? child);
    if (stac?.isCatalog && typeof stac.getStacLinksWithRel === 'function') {
      for (const link of stac.getStacLinksWithRel('child')) {
        const grandUrl = typeof link.getAbsoluteUrl === 'function' ? link.getAbsoluteUrl() : null;
        if (!grandUrl) {
          continue;
        }
        leaves.push({
          link: new Link({ href: grandUrl, rel: 'child', title: link.title, type: link.type }),
          url: grandUrl,
          stac: getStac(grandUrl),
          expanded: true
        });
      }
    }
    else {
      leaves.push({ link: child, url, stac, expanded: false });
    }
  }
  return leaves;
}

/**
 * The concepts of the given themes, as deduplicated [{id, title}].
 *
 * Concepts without both id and title are dropped; a missing id falls back to
 * a slug of the title and vice versa.
 */
function readConcepts(pools) {
  const topics = [];
  const seen = new Set();
  for (const theme of pools) {
    if (!Array.isArray(theme?.concepts)) {
      continue;
    }
    for (const concept of theme.concepts) {
      let title = null;
      if (typeof concept?.title === 'string' && concept.title.length > 0) {
        title = concept.title;
      }
      else if (typeof concept?.id === 'string' && concept.id.length > 0) {
        title = concept.id;
      }
      if (!title) {
        continue;
      }
      const id = typeof concept?.id === 'string' && concept.id.length > 0
        ? concept.id
        : title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      topics.push({ id, title });
    }
  }
  return topics;
}

/**
 * The topic concepts of a collection, as [{id, title}].
 *
 * Prefers concepts from themes with the portal's topic scheme; if no theme
 * declares that scheme, falls back to all concepts so a scheme-less catalog
 * still groups. Since the catalog's restructure the topic slug ids double as
 * the ids of the root's topic sub-catalogs.
 *
 * @param {Object} stac A STAC collection (or any object).
 * @returns {Array.<{id: string, title: string}>}
 */
export function collectionTopics(stac) {
  const themes = stac?.themes;
  if (!Array.isArray(themes)) {
    return [];
  }
  let pools = themes.filter(t => t?.scheme === TOPIC_SCHEME);
  if (pools.length === 0) {
    pools = themes;
  }
  return readConcepts(pools);
}

/**
 * The department concepts of a collection, as [{id, title}].
 *
 * Strictly reads themes with the city's departments scheme — unlike topics
 * there is no fallback, so a catalog without department themes simply has no
 * department facet.
 *
 * @param {Object} stac A STAC collection (or any object).
 * @returns {Array.<{id: string, title: string}>}
 */
export function collectionDepartments(stac) {
  const themes = stac?.themes;
  if (!Array.isArray(themes)) {
    return [];
  }
  return readConcepts(themes.filter(t => t?.scheme === DEPARTMENT_SCHEME));
}

/**
 * True when the collection is assigned to the given topic (by id or title).
 */
export function hasTopic(stac, topic) {
  return collectionTopics(stac).some(t => t.id === topic || t.title === topic);
}

/**
 * True when the collection belongs to the given department (by id or title).
 */
export function hasDepartment(stac, department) {
  return collectionDepartments(stac).some(d => d.id === department || d.title === department);
}

/**
 * Aggregates the quick-stat totals across loaded collections: rows from
 * `table:row_count` (shown as "Total Rows"), the count of distinct
 * departments from the departments theme scheme, and the data size from
 * data/visual asset `file:size`. Both the home view and the topic catalog
 * pages read their stat rows from this.
 *
 * Departments are counted by distinct concept title. (Every collection also
 * carries its department as a keyword, but a bare keyword is
 * indistinguishable from a tag, so a collection without the scheme simply
 * contributes no department.)
 *
 * Defensive: entries without the fields simply contribute nothing, so the
 * totals build up as collections load.
 *
 * @param {Array} children Loaded STAC collections (or any objects).
 * @returns {{features: number, departments: number, bytes: number}}
 */
export function quickStats(children) {
  const totals = { features: 0, departments: 0, bytes: 0 };
  if (!Array.isArray(children)) {
    return totals;
  }
  const departments = new Set();
  for (const child of children) {
    const rows = child?.['table:row_count'];
    if (Number.isFinite(rows)) {
      totals.features += rows;
    }
    for (const { title } of collectionDepartments(child)) {
      departments.add(title);
    }
    const assets = child?.assets;
    if (assets && typeof assets === 'object') {
      for (const asset of Object.values(assets)) {
        const roles = Array.isArray(asset?.roles) ? asset.roles : [];
        if ((roles.includes('data') || roles.includes('visual')) && Number.isFinite(asset?.['file:size'])) {
          totals.bytes += asset['file:size'];
        }
      }
    }
  }
  totals.departments = departments.size;
  return totals;
}

/**
 * A byte count as a short human-readable string, e.g. "270.1 MB".
 */
export function humanFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return null;
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${i === 0 ? bytes : bytes.toFixed(1)} ${units[i]}`;
}

// Minimal single-colour stroke icons (24x24 viewBox, drawn with currentColor)
// for the portal's main topics. Inner SVG markup; StlHome injects it into an
// <svg> whose CSS sets fill/stroke.
const ICONS = {
  map: '<path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4z"/><path d="M8 2v16"/><path d="M16 6v16"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  people: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  gradcap: '<path d="M22 9L12 4 2 9l10 5 10-5z"/><path d="M6 11.5V16c0 1.66 2.69 3 6 3s6-1.34 6-3v-4.5"/><path d="M22 9v5"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  dome: '<path d="M3 21h18"/><path d="M5 21v-8h14v8"/><path d="M9 21v-4h6v4"/><path d="M5 13a7 7 0 0 1 14 0"/><path d="M12 6V3"/><path d="M10 3h4"/>',
  cross: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/>',
  house: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  tree: '<path d="M12 2L6 10h3l-4 6h14l-4-6h3z"/><path d="M8 19h8"/><path d="M12 16v6"/>',
  road: '<path d="M4 22L10 2"/><path d="M20 22L14 2"/><path d="M12 6v3"/><path d="M12 13v3"/><path d="M12 20v2"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
};

// Ordered matchers: the first pattern found in the (lowercased) topic title
// wins. Covers the portal's twelve main topics plus a few older fine-grained
// names, so the icons stay sensible if the catalog ever reverts to those.
const ICON_MATCHERS = [
  [/urban|planning|zoning|land/, 'map'],
  [/business|industry|employment|job|career/, 'briefcase'],
  [/community|people/, 'people'],
  [/education|training|school/, 'gradcap'],
  [/environment|beautification|garden/, 'leaf'],
  [/government|election|voting/, 'dome'],
  [/health/, 'cross'],
  [/housing|home ownership/, 'house'],
  [/law|safety|justice|police/, 'shield'],
  [/leisure|culture|park|history|preservation|historic/, 'tree'],
  [/transportation|infrastructure|utilit|street/, 'road'],
];

// The portal's topic slugs — the ids of the root's topic sub-catalogs since
// the catalog restructure — mapped straight to their glyphs.
const TOPIC_SLUG_ICONS = {
  'urban-development-and-planning': 'map',
  'government': 'dome',
  'housing': 'house',
  'business-and-industry': 'briefcase',
  'transportation-infrastructure-and-utilities': 'road',
  'law-safety-and-justice': 'shield',
  'environment': 'leaf',
  'leisure-and-culture': 'tree',
  'health': 'cross',
  'community': 'people',
  'education-and-training': 'gradcap',
};

// The city's own topic glyphs, lifted from the icon font stlouis-mo.gov uses
// on its Datasets By Topic cards (glyphicons_city_of_st_louis-regular.svg).
// Font outlines are y-up in a 2400-unit em; each entry carries the transform
// that flips and fits its own outline into the components' 24x24 viewBox, so
// glyphs of different widths still land centred and the same visual size.
const CITY_GLYPHS = {
  'urban-development-and-planning':
    ['translate(0.250 23.289) scale(0.00940 -0.00940)',
      'M2100 1151l-200 222l-65 -72h-135v-150l-135 -150h-165v100h200v200h-200v100h200v200h-200v100h200v200h-200v100h200v200h-200v-200h-100v200h-200v-200h-200v400h1200v-1250zM600 2001h-300v200h300v-200zM1700 2201v-200h200v200h-200zM1300 518l-159 -177h159v-12 l-259 -288h259v-40h-400v300h-400v-300h-400v1900h1200v-1383zM1700 1901v-200h200v200h-200zM300 1701v-200h200v200h-200zM600 1701v-200h200v200h-200zM900 1701v-200h200v200h-200zM1700 1601v-200h200v200h-200zM300 1401v-200h200v200h-200zM600 1401v-200h200v200 h-200zM900 1401v-200h200v200h-200zM2200 801h-170l270 -300h-170l270 -300h-400v-100h50q21 0 35.5 -14.5t14.5 -35.5v-50h-400v50q0 21 14.5 35.5t35.5 14.5h50v100h-400l270 300h-170l270 300h-170l300 333zM300 1101v-200h200v200h-200zM600 1101v-200h200v200h-200z M900 1101v-200h200v200h-200zM300 801v-200h200v200h-200zM600 801v-200h200v200h-200zM900 801v-200h200v200h-200z'],
  'government':
    ['translate(1.588 22.855) scale(0.00868 -0.00868)',
      'M1400 2301h-200v-200q138 0 245 -84.5t141 -215.5h-772q27 105 104 181.5t182 104.5v364q0 21 14.5 35.5t35.5 14.5h250v-200zM550 1701h1300q21 0 35.5 -14.5t14.5 -35.5v-350h450q21 0 35.5 -14.5t14.5 -35.5v-900q0 -21 -14.5 -35.5t-35.5 -14.5h-2300 q-21 0 -35.5 14.5t-14.5 35.5v900q0 21 14.5 35.5t35.5 14.5h450v350q0 21 14.5 35.5t35.5 14.5zM700 1401v-700h100v700h-100zM1000 1401v-700h100v700h-100zM1300 1401v-700h100v700h-100zM1600 1401v-700h100v700h-100zM100 1101v-200h100v200h-100zM300 1101v-200h100 v200h-100zM2000 1101v-200h100v200h-100zM2200 1101v-200h100v200h-100zM100 801v-200h100v200h-100zM300 801v-200h100v200h-100zM2000 801v-200h100v200h-100zM2200 801v-200h100v200h-100zM-50 201h2500q21 0 35.5 -14.5t14.5 -35.5v-100q0 -21 -14.5 -35.5t-35.5 -14.5 h-2500q-21 0 -35.5 14.5t-14.5 35.5v100q0 21 14.5 35.5t35.5 14.5z'],
  'housing':
    ['translate(0.693 22.589) scale(0.00903 -0.00903)',
      'M1252 2338l348 -345v308h300v-605l600 -595h-400v-1100h-600v600h-500v-600h-600v1100h-397l1248 1242z'],
  'business-and-industry':
    ['translate(0.720 22.349) scale(0.00940 -0.00940)',
      'M900 1201h-300v1000h300v-1000zM2400 1h-400v300h-400v-300h-1600v1100h1100v-900h100v1900h1200v-2100zM1400 1901v-200h200v200h-200zM1700 1901v-200h200v200h-200zM2000 1901v-200h200v200h-200zM500 1201h-300v500h300v-500zM1400 1501v-200h200v200h-200z M1700 1501v-200h200v200h-200zM2000 1501v-200h200v200h-200zM1400 1101v-200h200v200h-200zM1700 1101v-200h200v200h-200zM2000 1101v-200h200v200h-200zM200 901v-200h200v200h-200zM500 901v-200h200v200h-200zM800 901v-200h200v200h-200zM1400 701v-200h200v200h-200z M1700 701v-200h200v200h-200zM2000 701v-200h200v200h-200z'],
  'transportation-infrastructure-and-utilities':
    ['translate(3.540 20.820) scale(0.00705 -0.00705)',
      'M0 2401h900q83 0 150.5 -57.5t79.5 -139.5l170 -803v-300q0 -63 -12.5 -119t-42 -108t-74.5 -90t-114.5 -60.5t-156.5 -22.5h-900q-87 0 -156.5 22.5t-114.5 60.5t-74.5 90t-42 108t-12.5 119v300l170 803q12 82 79.5 139.5t150.5 57.5zM917 2201h-929q-9 0 -20.5 -10 t-12.5 -18l-155 -672q10 -9 29.5 -25t84 -55.5t135 -70t180 -55.5t221.5 -25q82 0 162 12.5t142.5 33t119 45t97 49.5t70.5 45t44 33l15 13l-150 672q-1 5 -6.5 12t-13 11.5t-13.5 4.5zM1348 1901h1013q79 0 112.5 -17.5t65.5 -80.5l126 -402h85q21 0 35.5 -14.5t14.5 -35.5 v-100q0 -21 -14.5 -35.5t-35.5 -14.5h-50v-950q0 -21 -14.5 -35.5t-35.5 -14.5h-200q-21 0 -35.5 14.5t-14.5 35.5v150h-1169l-164 180q383 115 383 504v316h1009q-79 258 -92 286q-2 4 -5 7t-5.5 4.5t-7.5 2t-7.5 0.5h-10h-11.5h-930zM-200 1051l400 -100v150l-400 200 v-250zM700 1101v-150l400 100v250zM2300 1097v-196h269l31 69v161zM1500 801v-200h600v200h-600zM0 101h-400l446 500h220zM1300 101h-400l-273 500h220z'],
  'law-safety-and-justice':
    ['translate(0.720 24.229) scale(0.00940 -0.00940)',
      'M1150 2501h100q21 0 35.5 -14.5t14.5 -35.5v-300q0 -21 -14.5 -35.5t-35.5 -14.5h-100q-21 0 -35.5 14.5t-14.5 35.5v300q0 21 14.5 35.5t35.5 14.5zM314 2110l77 77q14 15 35 15t35 -15l214 -214q15 -14 15 -35t-15 -36l-77 -76q-14 -15 -35 -15t-35 15l-214 214 q-15 14 -15 35t15 35zM2011 2187l77 -77q14 -14 14 -35t-14 -35l-214 -214q-15 -15 -35.5 -15t-35.5 15l-77 76q-14 15 -14 36t14 35l214 214q15 15 35.5 15t35.5 -15zM950 1801h500q54 0 105.5 -26.5t87.5 -71.5t46 -98l203 -1104h-1384l203 1104q16 81 86 138.5t153 57.5z M1137 1601h-199q-7 0 -16.5 -6t-17 -14t-9.5 -15l-158 -865h199l158 865q2 10 17 22.5t26 12.5zM50 1401h300q21 0 35.5 -14.5t14.5 -35.5v-100q0 -10 -4 -19.5t-10.5 -16t-16 -10.5t-19.5 -4h-300q-21 0 -35.5 14.5t-14.5 35.5v100q0 21 14.5 35.5t35.5 14.5zM2050 1401 h300q21 0 35.5 -14.5t14.5 -35.5v-100q0 -21 -14.5 -35.5t-35.5 -14.5h-300q-14 0 -25.5 6.5t-18 18t-6.5 25.5v100q0 21 14.5 35.5t35.5 14.5zM400 401h1600q41 0 70.5 -29.5t29.5 -70.5v-200h-1800v200q0 41 29.5 70.5t70.5 29.5z'],
  'environment':
    ['translate(0.509 23.500) scale(0.00958 -0.00958)',
      'M1200 2379q160 0 312.5 -42.5t281.5 -118.5t238 -185t185 -238t118.5 -281.5t42.5 -312.5t-42.5 -312.5t-118.5 -281.5t-185 -238t-238 -185t-281.5 -118.5t-312.5 -42.5t-312.5 42.5t-281.5 118.5t-238 185t-185 238t-118.5 281.5t-42.5 312.5t42.5 312.5t118.5 281.5 t185 238t238 185t281.5 118.5t312.5 42.5zM1200 2133q-109 0 -213.5 -24.5t-196 -70.5t-173 -109.5t-145 -145t-109.5 -173t-70.5 -196t-24.5 -213.5q0 -127 33.5 -247.5t93.5 -222.5t146.5 -188.5t188.5 -146.5t222.5 -93.5t247.5 -33.5t247.5 33.5t222.5 93.5t188.5 146.5 t146.5 188.5t93.5 222.5t33.5 247.5t-33.5 247.5t-93.5 223t-146.5 188.5t-188.5 146t-222.5 93.5t-247.5 33.5zM1665 1701q8 2 21 -7.5t13 -17.5q-2 -178 -24.5 -323t-55.5 -245.5t-87 -174.5t-102.5 -118t-118 -69t-118.5 -33.5t-120 -4.5t-105 9.5t-90 16.5l-33 6t-24 4 t-21 2q-1 -1 -4.5 0t-13.5 -2t-21 -7.5t-27.5 -16.5t-32.5 -30q-30 -31 -54 -55q-26 -23 -37 -13.5t-11 43.5q0 31 13 53.5t47 53.5q12 10 23 25.5t19 38t6 43.5q-9 55 -10 103t7 111.5t37 130t78 129.5q39 50 80 87t89.5 64t94.5 45t113.5 35.5t129 31.5t157.5 37t182 48z M1616 1609q-5 3 -9.5 3.5t-14 -7.5t-19 -19t-25.5 -30q-38 -48 -119 -104.5t-142 -89.5l-62 -33q-38 -20 -71.5 -39t-75 -45t-76 -51.5t-71.5 -57t-66.5 -63.5t-55 -69t-42.5 -75q-24 -57 -31 -86.5t2 -32t31.5 17t55.5 59.5q25 30 94 76t125.5 77.5t147.5 80.5 q56 30 95.5 54.5t85.5 60t81.5 75t73 95t70.5 123.5q22 50 24 60t-6 20z'],
  'leisure-and-culture':
    ['translate(2.223 23.288) scale(0.00812 -0.00812)',
      'M500 2778q117 0 224 -45.5t184.5 -123t123 -184.5t45.5 -224t-45.5 -224t-123 -184.5t-184.5 -123t-224 -45.5t-224 45.5t-184.5 123t-123 184.5t-45.5 224t45.5 224t123 184.5t184.5 123t224 45.5zM575 2601h-150q-10 0 -17.5 -7.5t-7.5 -17.5v-150q0 -10 7.5 -17.5 t17.5 -7.5h150q10 0 17.5 7.5t7.5 17.5v150q0 10 -7.5 17.5t-17.5 7.5zM1850 2479q62 0 114.5 -30.5t83 -83t30.5 -114.5q0 -94 -67 -161t-161 -67q-46 0 -88.5 18t-73 48.5t-48.5 73t-18 88.5q0 94 67 161t161 67zM575 2301h-250q-10 0 -17.5 -7.5t-7.5 -17.5v-50 q0 -10 7.5 -17.5t17.5 -7.5h75v-200h-75q-10 0 -17.5 -7.5t-7.5 -17.5v-50q0 -10 7.5 -17.5t17.5 -7.5h350q10 0 17.5 7.5t7.5 17.5v50q0 10 -7.5 17.5t-17.5 7.5h-75v275q0 10 -7.5 17.5t-17.5 7.5zM1729 1985q81 -19 124 -91l262 -417l262 -249q1 -2 3 -4.5t7 -10t7 -15 t1 -18t-8 -19.5q-11 -15 -26.5 -20t-26.5 -3l-10 3q-338 209 -345 217l-144 186l-87 -438q369 -353 386 -368q42 -35 48 -69l91 -518l168 -32q19 -4 31 -21.5t12 -38.5t-17.5 -37t-38.5 -16l-297 1q-13 0 -24.5 6.5t-18.5 17.5t-8 25l-2 45l-135 438l-401 329l-207 -342 l-270 -334l35 -68l60 -10q19 -4 31 -21.5t12 -38.5q0 -20 -17.5 -36.5t-38.5 -16.5h-88q-127 100 -157 130q-35 35 9 89l175 351l227 604l135 434l-203 -142q-180 -282 -200 -314q-25 -39 -71 -39h-24q-21 0 -31.5 11t-4.5 31l180 423q10 32 22 41l452 333q75 52 161 32z '],
  'health':
    ['translate(-0.305 24.316) scale(0.01025 -0.01025)',
      'M350 2301h1700q104 0 177 -73t73 -177v-1700q0 -104 -73 -177t-177 -73h-1700q-104 0 -177 73t-73 177v1700q0 104 73 177t177 73zM1350 1901h-300q-21 0 -35.5 -14.5t-14.5 -35.5v-450h-450q-21 0 -35.5 -14.5t-14.5 -35.5v-300q0 -21 14.5 -35.5t35.5 -14.5h450v-450 q0 -21 14.5 -35.5t35.5 -14.5h300q21 0 35.5 14.5t14.5 35.5v450h450q21 0 35.5 14.5t14.5 35.5v300q0 21 -14.5 35.5t-35.5 14.5h-450v450q0 21 -14.5 35.5t-35.5 14.5z'],
  'community':
    ['translate(1.588 22.421) scale(0.00868 -0.00868)',
      'M900 2301h600q83 0 141.5 -58.5t58.5 -141.5v-300q0 -83 -59 -141.5t-141 -58.5h-396l-204 -200v200q-82 0 -141 58.5t-59 141.5v300q0 83 58.5 141.5t141.5 58.5zM1200 1301q81 0 150 -40.5t109.5 -109.5t40.5 -150v-250q0 -46 -31 -98t-69 -52v-75q0 -10 6 -21.5 t15 -17.5l358 -230q9 -5 15 -16.5t6 -21.5v-93q0 -10 -7.5 -17.5t-17.5 -7.5h-1150q-10 0 -17.5 7.5t-7.5 17.5v93q0 10 6 21.5t15 16.5l358 230q9 6 15 17.5t6 21.5v75q-38 0 -69 52t-31 98v250q0 124 88 212t212 88zM200 1101q73 0 130 -50q-40 -72 -40 -150v-117 q0 -68 43 -131v-23l-70 -27l-9 -6q-19 -12 -33.5 -31t-22.5 -41.5t-8 -45.5v-61q0 -4 1.5 -9.5t1.5 -7.5h-276q-5 0 -9 2t-6 6t-2 9v61q0 17 14 26l139 54q14 9 14 25v100q-26 0 -46.5 35t-20.5 65v117q0 83 59 141.5t141 58.5zM599.5 1101q82.5 0 141.5 -58.5t59 -141.5 v-117q0 -30 -20.5 -65t-46.5 -35v-100q0 -16 14 -25l64 -25l-207 -133h-287q-7 0 -12 5t-5 12v61q0 17 14 26l139 54q14 9 14 25v100q-18 0 -33.5 17.5t-24.5 40.5t-9 42v117q0 83 58.5 141.5t141 58.5zM1799.5 1101q82.5 0 141.5 -58.5t59 -141.5v-117q0 -30 -20.5 -65 t-46.5 -35v-100q0 -16 14 -25l139 -54q14 -9 14 -26v-61q0 -5 -2 -9t-6 -6t-9 -2h-287l-207 133l64 25q14 9 14 25v100q-26 0 -46.5 35t-20.5 65v117q0 83 58.5 141.5t141 58.5zM2200 1101q82 0 141 -58.5t59 -141.5v-117q0 -30 -20.5 -65t-46.5 -35v-100q0 -16 14 -25 l139 -54q14 -9 14 -26v-61q0 -7 -5 -12t-12 -5h-276q0 2 1 5t1.5 6t0.5 6v61q0 23 -8 45.5t-22.5 41.5t-33.5 31l-11 7l-68 26v23q43 63 43 131v117q0 78 -40 150q57 50 130 50z'],
  'education-and-training':
    ['translate(0.993 21.955) scale(0.00881 -0.00881)',
      'M2531 1494l-1281 -566l-770 340l-180 -121v-246l100 -300v-400l-200 198l-200 -198v400l100 300v300q0 54 45 83l118 80l-294 130l1281 566zM2000 701l-750 -332l-750 332v394l750 -331l750 331v-394z'],
};

/**
 * Inner SVG markup for a topic's icon; a database glyph when nothing matches.
 */
export function topicIcon(title) {
  const haystack = typeof title === 'string' ? title.toLowerCase() : '';
  for (const [pattern, icon] of ICON_MATCHERS) {
    if (pattern.test(haystack)) {
      return ICONS[icon];
    }
  }
  return ICONS.database;
}

/**
 * Inner SVG markup for a topic catalog's icon, matched by its id (the portal
 * topic slug). Unknown ids fall back to pattern-matching the title (or the id
 * itself), and finally to the database glyph — so department or other
 * non-topic catalogs still get a sensible mark.
 */
export function topicIconForId(id, title) {
  const glyph = CITY_GLYPHS[id];
  if (glyph) {
    const [transform, d] = glyph;
    // The stroke icons are drawn by the CSS in custom.scss (fill: none,
    // stroke-width); these are solid outlines, so they say so themselves.
    return `<g fill="currentColor" stroke="none" transform="${transform}"><path d="${d}"/></g>`;
  }
  const icon = ICONS[TOPIC_SLUG_ICONS[id]];
  if (icon) {
    return icon;
  }
  return topicIcon(typeof title === 'string' && title.length > 0 ? title : id);
}
