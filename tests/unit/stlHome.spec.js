import { describe, it, expect } from 'vitest';
import { Catalog, Collection } from 'stac-js';
import { collectionTopics, expandChildren, hasTopic, humanFileSize, topicIcon, TOPIC_SCHEME } from '../../src/utils/stlHome.js';

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
});
