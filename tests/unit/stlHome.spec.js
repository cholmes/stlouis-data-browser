import { describe, it, expect } from 'vitest';
import { Catalog, Collection } from 'stac-js';
import {
  collectionDepartments, collectionTopics, expandChildren, hasDepartment, hasTopic,
  humanFileSize, quickStats, topicIcon, topicIconForId, DEPARTMENT_SCHEME, TOPIC_SCHEME
} from '../../src/utils/stlHome.js';

// The shape the St. Louis catalog publishes (STAC Themes extension).
const themed = (concepts, scheme = TOPIC_SCHEME) => ({ themes: [{ scheme, concepts }] });

describe('stlHome', () => {
  describe('collectionTopics', () => {
    it('reads concepts from the portal topic scheme', () => {
      const stac = themed([{ id: 'government', title: 'Government' }]);
      expect(collectionTopics(stac)).toEqual([{ id: 'government', title: 'Government' }]);
    });

    it('collects multiple concepts across themes', () => {
      const stac = {
        themes: [
          { scheme: TOPIC_SCHEME, concepts: [{ id: 'housing', title: 'Housing' }] },
          { scheme: TOPIC_SCHEME, concepts: [{ id: 'community', title: 'Community' }] }
        ]
      };
      expect(collectionTopics(stac).map(t => t.id)).toEqual(['housing', 'community']);
    });

    it('falls back to all themes when none carries the portal scheme', () => {
      const stac = themed([{ id: 'x', title: 'X' }], 'https://example.com/other/');
      expect(collectionTopics(stac)).toEqual([{ id: 'x', title: 'X' }]);
    });

    it('prefers portal-scheme themes over others when both exist', () => {
      const stac = {
        themes: [
          { scheme: 'https://example.com/other/', concepts: [{ id: 'other', title: 'Other' }] },
          { scheme: TOPIC_SCHEME, concepts: [{ id: 'government', title: 'Government' }] }
        ]
      };
      expect(collectionTopics(stac).map(t => t.id)).toEqual(['government']);
    });

    it('slugs a missing id from the title', () => {
      const stac = themed([{ title: 'Law, Safety, and Justice' }]);
      expect(collectionTopics(stac)).toEqual([{ id: 'law-safety-and-justice', title: 'Law, Safety, and Justice' }]);
    });

    it('uses the id as title when the title is missing', () => {
      const stac = themed([{ id: 'government' }]);
      expect(collectionTopics(stac)).toEqual([{ id: 'government', title: 'government' }]);
    });

    it('deduplicates by id', () => {
      const stac = themed([
        { id: 'government', title: 'Government' },
        { id: 'government', title: 'Government' }
      ]);
      expect(collectionTopics(stac)).toHaveLength(1);
    });

    it.each([
      ['no themes', {}],
      ['null', null],
      ['themes not an array', { themes: 'Government' }],
      ['theme without concepts', { themes: [{ scheme: TOPIC_SCHEME }] }],
      ['concepts not an array', { themes: [{ scheme: TOPIC_SCHEME, concepts: 'x' }] }],
      ['concept without id and title', { themes: [{ scheme: TOPIC_SCHEME, concepts: [{}] }] }]
    ])('returns [] for malformed input: %s', (_, stac) => {
      expect(collectionTopics(stac)).toEqual([]);
    });
  });

  describe('collectionDepartments', () => {
    // The live shape: topic themes and department themes side by side, and
    // the department name duplicated as a keyword.
    const wards = {
      themes: [
        { scheme: TOPIC_SCHEME, concepts: [
          { id: 'government', title: 'Government' },
          { id: 'urban-development-and-planning', title: 'Urban Development and Planning' }
        ] },
        { scheme: DEPARTMENT_SCHEME, concepts: [
          { id: 'planning-and-urban-design', title: 'Planning and Urban Design' }
        ] }
      ],
      keywords: ['Planning and Urban Design']
    };

    it('reads concepts from the departments scheme only', () => {
      expect(collectionDepartments(wards)).toEqual([
        { id: 'planning-and-urban-design', title: 'Planning and Urban Design' }
      ]);
    });

    it('does not fall back to other schemes', () => {
      const topicOnly = themed([{ id: 'government', title: 'Government' }]);
      expect(collectionDepartments(topicOnly)).toEqual([]);
    });

    it.each([
      ['no themes', {}],
      ['null', null],
      ['themes not an array', { themes: 'Assessor' }]
    ])('returns [] for malformed input: %s', (_, stac) => {
      expect(collectionDepartments(stac)).toEqual([]);
    });

    describe('hasDepartment', () => {
      it('matches by id and by title', () => {
        expect(hasDepartment(wards, 'planning-and-urban-design')).toBe(true);
        expect(hasDepartment(wards, 'Planning and Urban Design')).toBe(true);
      });

      it('rejects other departments, topics and empty objects', () => {
        expect(hasDepartment(wards, 'assessor-s-office')).toBe(false);
        expect(hasDepartment(wards, 'government')).toBe(false);
        expect(hasDepartment({}, 'parks')).toBe(false);
      });
    });
  });

  describe('expandChildren', () => {
    // A miniature of the live catalog: root → department sub-catalogs →
    // collections, with ids that are POSIX paths like "assessor/parcels".
    const BASE = 'https://example.com/data/';
    const collectionJson = (id) => ({
      type: 'Collection', id, stac_version: '1.1.0', description: id,
      license: 'other', extent: { spatial: { bbox: [[0, 0, 1, 1]] }, temporal: { interval: [[null, null]] } },
      links: []
    });
    const catalogJson = (id, childHrefs) => ({
      type: 'Catalog', id, stac_version: '1.1.0', description: id,
      links: childHrefs.map(href => ({ rel: 'child', href, type: 'application/json' }))
    });

    const root = new Catalog(
      catalogJson('root', ['./assessor/catalog.json', './citywide/catalog.json', './flat/collection.json']),
      `${BASE}catalog.json`
    );
    const assessor = new Catalog(
      catalogJson('assessor', ['./parcels/collection.json', './city-blocks/collection.json']),
      `${BASE}assessor/catalog.json`
    );
    const parcels = new Collection(collectionJson('assessor/parcels'), `${BASE}assessor/parcels/collection.json`);
    const flat = new Collection(collectionJson('flat'), `${BASE}flat/collection.json`);

    const database = {
      [`${BASE}assessor/catalog.json`]: assessor,
      [`${BASE}assessor/parcels/collection.json`]: parcels,
      [`${BASE}flat/collection.json`]: flat
    };
    const getStac = source => (typeof source === 'string' ? database[source] : null) ?? null;
    const children = root.getStacLinksWithRel('child');

    it('replaces a loaded child catalog with its child collections', () => {
      const leaves = expandChildren(children, getStac);
      expect(leaves.map(leaf => leaf.url)).toEqual([
        `${BASE}assessor/parcels/collection.json`,
        `${BASE}assessor/city-blocks/collection.json`,
        `${BASE}citywide/catalog.json`,
        `${BASE}flat/collection.json`
      ]);
    });

    it('attaches the loaded STAC objects to their leaves', () => {
      const leaves = expandChildren(children, getStac);
      expect(leaves[0].stac).toBe(parcels);
      expect(leaves[1].stac).toBeNull(); // grandchild not loaded yet
      expect(leaves[3].stac).toBe(flat);
    });

    it('keeps a child that is itself a collection as a direct leaf', () => {
      const leaves = expandChildren(children, getStac);
      const leaf = leaves.find(l => l.url === `${BASE}flat/collection.json`);
      expect(leaf.expanded).toBe(false);
      expect(leaf.link).toBe(children[2]);
    });

    it('keeps an unloaded child as a leaf so it can be queued', () => {
      const leaves = expandChildren(children, getStac);
      const leaf = leaves.find(l => l.url === `${BASE}citywide/catalog.json`);
      expect(leaf.stac).toBeNull();
      expect(leaf.expanded).toBe(false);
    });

    it('gives expanded leaves grid-renderable links with absolute hrefs', () => {
      const leaf = expandChildren(children, getStac)[0];
      expect(leaf.expanded).toBe(true);
      expect(leaf.link.href).toBe(`${BASE}assessor/parcels/collection.json`);
      expect(leaf.link.getAbsoluteUrl()).toBe(`${BASE}assessor/parcels/collection.json`);
      expect(leaf.link.rel).toBe('child');
    });

    it('drops a loaded child catalog that has no children', () => {
      const emptyRoot = new Catalog(catalogJson('root', ['./empty/catalog.json']), `${BASE}catalog.json`);
      const empty = new Catalog(catalogJson('empty', []), `${BASE}empty/catalog.json`);
      const leaves = expandChildren(
        emptyRoot.getStacLinksWithRel('child'),
        source => (source === `${BASE}empty/catalog.json` ? empty : null)
      );
      expect(leaves).toEqual([]);
    });

    it('expands one level only: a loaded grandchild catalog stays a leaf', () => {
      const deep = new Catalog(catalogJson('assessor/parcels', ['./deeper/collection.json']), `${BASE}assessor/parcels/collection.json`);
      const leaves = expandChildren(children, source => {
        if (source === `${BASE}assessor/parcels/collection.json`) {
          return deep;
        }
        return getStac(source);
      });
      expect(leaves.find(l => l.stac === deep)).toBeTruthy();
      expect(leaves.some(l => l.url?.endsWith('deeper/collection.json'))).toBe(false);
    });

    it.each([
      ['children not an array', 'nope', getStac],
      ['children null', null, getStac],
      ['getStac not a function', [], null]
    ])('returns [] for malformed input: %s', (_, entries, resolver) => {
      expect(expandChildren(entries, resolver)).toEqual([]);
    });

    describe('over the restructured topic tree', () => {
      // A miniature of the restructured catalog: root → topic sub-catalogs
      // (ids are the portal topic slugs) → collections, each collection
      // carrying topic and department themes. The live tree holds 11 topics
      // and 51 collections; three topics stand in for them here.
      const TOPICS = {
        'government': ['wards', 'polling-places'],
        'environment': ['forest-park-trees'],
        'urban-development-and-planning': ['parcels', 'zoning', 'city-blocks']
      };
      const topicRoot = new Catalog(
        catalogJson('st-louis-open-data-mirror', Object.keys(TOPICS).map(slug => `./${slug}/catalog.json`)),
        `${BASE}catalog.json`
      );
      const database = {};
      for (const [slug, ids] of Object.entries(TOPICS)) {
        database[`${BASE}${slug}/catalog.json`] = new Catalog(
          catalogJson(slug, ids.map(id => `./${id}/collection.json`)),
          `${BASE}${slug}/catalog.json`
        );
        for (const id of ids) {
          const json = collectionJson(`${slug}/${id}`);
          json['table:row_count'] = 100;
          json.themes = [
            { scheme: TOPIC_SCHEME, concepts: [{ id: slug, title: slug }] },
            { scheme: DEPARTMENT_SCHEME, concepts: [{ id: `dept-of-${slug}`, title: `Dept of ${slug}` }] }
          ];
          json.assets = {
            data: { href: `./${id}.parquet`, roles: ['data'], 'file:size': 1000 },
            'styles/default': { href: './styles/default.json', roles: ['style'] }
          };
          database[`${BASE}${slug}/${id}/collection.json`] =
            new Collection(json, `${BASE}${slug}/${id}/collection.json`);
        }
      }
      const resolve = source => (typeof source === 'string' ? database[source] : null) ?? null;
      const leaves = expandChildren(topicRoot.getStacLinksWithRel('child'), resolve);

      it('expands every topic catalog into its collections', () => {
        expect(leaves).toHaveLength(6);
        expect(leaves.every(leaf => leaf.expanded)).toBe(true);
        expect(leaves.every(leaf => leaf.stac?.isCollection)).toBe(true);
      });

      it('feeds quickStats the full set of collections', () => {
        expect(quickStats(leaves.map(leaf => leaf.stac))).toEqual({
          features: 600,
          departments: 3, // one department per topic in this miniature
          bytes: 6000
        });
      });
    });
  });

  describe('hasTopic', () => {
    const stac = themed([{ id: 'urban-development-and-planning', title: 'Urban Development and Planning' }]);

    it('matches by id', () => {
      expect(hasTopic(stac, 'urban-development-and-planning')).toBe(true);
    });

    it('matches by title', () => {
      expect(hasTopic(stac, 'Urban Development and Planning')).toBe(true);
    });

    it('rejects other topics and empty objects', () => {
      expect(hasTopic(stac, 'government')).toBe(false);
      expect(hasTopic({}, 'government')).toBe(false);
    });
  });

  describe('quickStats', () => {
    // The shape the St. Louis collections publish: table:row_count and the
    // departments theme on the collection, file:size and roles on the assets.
    const parcels = {
      'table:row_count': 134362,
      themes: [{ scheme: DEPARTMENT_SCHEME, concepts: [{ id: 'assessor-s-office', title: "Assessor's Office" }] }],
      assets: {
        parcels: { roles: ['data'], 'file:size': 31354481 },
        'parcels-tiles': { roles: ['visual'], 'file:size': 36066850 },
        'styles/default': { roles: ['default', 'style'], 'file:size': 797 },
        'styles/year-built': { roles: ['style'], 'file:size': 1362 },
        thumbnail: { roles: ['thumbnail'], 'file:size': 387596 }
      }
    };
    const sales = {
      'table:row_count': 250000,
      themes: [{ scheme: DEPARTMENT_SCHEME, concepts: [{ id: 'assessor-s-office', title: "Assessor's Office" }] }],
      assets: {
        sales: { roles: ['data'], 'file:size': 5000000 }
      }
    };

    it('sums rows and data/visual asset sizes, counts distinct departments', () => {
      expect(quickStats([parcels, sales])).toEqual({
        features: 384362,
        departments: 1, // both collections belong to the Assessor's Office
        bytes: 72421331
      });
    });

    it('ignores thumbnail and style asset sizes', () => {
      const { bytes } = quickStats([parcels]);
      expect(bytes).toBe(31354481 + 36066850);
    });

    it('builds up as collections load: partial input still counts', () => {
      expect(quickStats([sales])).toEqual({ features: 250000, departments: 1, bytes: 5000000 });
    });

    it('contributes nothing for collections without the fields', () => {
      const bare = [{}, { assets: {} }, { 'table:row_count': 'many' }, null];
      expect(quickStats(bare)).toEqual({ features: 0, departments: 0, bytes: 0 });
    });

    it('does not count topic concepts or bare keywords as departments', () => {
      const topicOnly = {
        themes: [{ scheme: TOPIC_SCHEME, concepts: [{ id: 'government', title: 'Government' }] }],
        keywords: ['Forestry']
      };
      expect(quickStats([topicOnly]).departments).toBe(0);
    });

    it('ignores assets without numeric sizes or roles', () => {
      const odd = {
        assets: {
          a: { roles: ['data'] },                       // no size
          b: { roles: ['data'], 'file:size': '9000' },  // size not a number
          c: { 'file:size': 9000 }                      // no roles
        }
      };
      expect(quickStats([odd])).toEqual({ features: 0, departments: 0, bytes: 0 });
    });

    it('returns zeros for malformed input', () => {
      expect(quickStats(null)).toEqual({ features: 0, departments: 0, bytes: 0 });
      expect(quickStats('nope')).toEqual({ features: 0, departments: 0, bytes: 0 });
    });
  });

  describe('humanFileSize', () => {
    it.each([
      [0, '0 B'],
      [512, '512 B'],
      [2048, '2.0 KB'],
      [269919873, '257.4 MB'],
      [5 * 1024 ** 3, '5.0 GB']
    ])('formats %d as %s', (bytes, expected) => {
      expect(humanFileSize(bytes)).toBe(expected);
    });

    it('returns null for non-numbers and negatives', () => {
      expect(humanFileSize(-1)).toBeNull();
      expect(humanFileSize('big')).toBeNull();
      expect(humanFileSize(undefined)).toBeNull();
    });
  });

  describe('topicIcon', () => {
    // The portal's twelve main topics each map to a distinct-enough glyph.
    it.each([
      ['Business and Industry', 'rect x="2" y="7"'],       // briefcase
      ['Community', 'circle cx="9" cy="7"'],               // people
      ['Education and Training', 'M22 9L12 4'],            // grad cap
      ['Employment, Jobs, and Careers', 'rect x="2" y="7"'], // briefcase
      ['Environment', 'M11 20A7 7'],                       // leaf
      ['Government', 'M5 13a7 7'],                         // dome
      ['Health', 'M12 8v8'],                               // cross
      ['Housing', 'M3 9l9-7'],                             // house
      ['Law, Safety, and Justice', 'M12 22s8-4'],          // shield
      ['Leisure and Culture', 'M12 2L6 10'],               // tree
      ['Transportation, Infrastructure, and Utilities', 'M4 22L10 2'], // road
      ['Urban Development and Planning', 'M1 6v16']        // map
    ])('maps "%s"', (title, marker) => {
      expect(topicIcon(title)).toContain(marker);
    });

    it('falls back to the database glyph', () => {
      expect(topicIcon('Something Else')).toContain('ellipse');
      expect(topicIcon(undefined)).toContain('ellipse');
    });
  });

  describe('topicIconForId', () => {
    // The restructured catalog's topic sub-catalog ids ARE the portal topic
    // slugs; each gets the city's own glyph for that topic, lifted from the
    // icon font on stlouis-mo.gov. Markers are the start of each outline.
    it.each([
      ['urban-development-and-planning', 'M2100 1151l-200 222'],   // skyline
      ['government', 'M1400 2301h-200v-200q138'],                  // city hall
      ['housing', 'M1252 2338l348 -345'],                          // house
      ['business-and-industry', 'M900 1201h-300v1000h300'],        // factory
      ['transportation-infrastructure-and-utilities',
        'M0 2401h900q83 0 150.5'],                                 // bus and truck
      ['law-safety-and-justice', 'M1150 2501h100q21'],             // police
      ['environment', 'M1200 2379q160 0 312.5'],                   // leaf in circle
      ['leisure-and-culture', 'M500 2778q117 0 224'],              // runner
      ['health', 'M350 2301h1700q104'],                            // first aid
      ['community', 'M900 2301h600q83'],                           // people
      ['education-and-training', 'M2531 1494l-1281 -566']          // grad cap
    ])('maps the topic slug "%s"', (id, marker) => {
      expect(topicIconForId(id)).toContain(marker);
    });

    // These are solid outlines, not the stroked shapes custom.scss draws, so
    // each has to carry its own fill/stroke and its own fit transform.
    it('renders the city glyphs filled and fitted', () => {
      const svg = topicIconForId('housing');
      expect(svg).toContain('fill="currentColor"');
      expect(svg).toContain('stroke="none"');
      expect(svg).toMatch(/transform="translate\([-\d. ]+\) scale\([-\d. ]+\)"/);
    });

    it('falls back to pattern-matching the title for unknown ids', () => {
      expect(topicIconForId('some-dept', 'Parks and Recreation')).toContain('M12 2L6 10'); // tree
    });

    it('falls back to pattern-matching the id itself without a title', () => {
      expect(topicIconForId('police-department')).toContain('M12 22s8-4'); // shield
    });

    it('lands on the database glyph when nothing matches', () => {
      expect(topicIconForId('assessor-s-office')).toContain('ellipse');
      expect(topicIconForId(undefined)).toContain('ellipse');
    });
  });
});
