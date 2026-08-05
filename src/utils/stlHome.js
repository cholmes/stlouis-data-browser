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
  const icon = ICONS[TOPIC_SLUG_ICONS[id]];
  if (icon) {
    return icon;
  }
  return topicIcon(typeof title === 'string' && title.length > 0 ? title : id);
}
