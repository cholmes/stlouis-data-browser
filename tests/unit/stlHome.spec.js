import { describe, it, expect } from 'vitest';
import { collectionTopics, hasTopic, humanFileSize, topicIcon, TOPIC_SCHEME } from '../../src/utils/stlHome.js';

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
