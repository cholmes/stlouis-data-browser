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
 * The topic concepts of a collection, as [{id, title}].
 *
 * Prefers concepts from themes with the portal's topic scheme; if no theme
 * declares that scheme, falls back to all concepts so a scheme-less catalog
 * still groups. Concepts without both id and title are dropped; a missing id
 * falls back to a slug of the title and vice versa.
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
 * True when the collection is assigned to the given topic (by id or title).
 */
export function hasTopic(stac, topic) {
  return collectionTopics(stac).some(t => t.id === topic || t.title === topic);
}

/**
 * Aggregates the quick-stat totals across loaded collections: features from
 * `table:row_count`, style count from style-role assets, and the data size
 * from data/visual asset `file:size`. Both the home view and the department
 * catalog pages read their stat rows from this.
 *
 * Defensive: entries without the fields simply contribute nothing, so the
 * totals build up as collections load.
 *
 * @param {Array} children Loaded STAC collections (or any objects).
 * @returns {{features: number, styles: number, bytes: number}}
 */
export function quickStats(children) {
  const totals = { features: 0, styles: 0, bytes: 0 };
  if (!Array.isArray(children)) {
    return totals;
  }
  for (const child of children) {
    const rows = child?.['table:row_count'];
    if (Number.isFinite(rows)) {
      totals.features += rows;
    }
    const assets = child?.assets;
    if (assets && typeof assets === 'object') {
      for (const asset of Object.values(assets)) {
        const roles = Array.isArray(asset?.roles) ? asset.roles : [];
        if (roles.includes('style')) {
          totals.styles++;
        }
        if ((roles.includes('data') || roles.includes('visual')) && Number.isFinite(asset?.['file:size'])) {
          totals.bytes += asset['file:size'];
        }
      }
    }
  }
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
