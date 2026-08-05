<template>
  <div class="stl-home">
    <!-- Hero band, echoing the portal's dark blue hero -->
    <section class="stl-hero">
      <div class="stl-hero-inner">
        <h1>
          {{ heroTitle }}
          <span v-if="heroSuffix" class="stl-hero-suffix">{{ heroSuffix }}</span>
        </h1>
        <Description v-if="data && data.description" :description="data.description" class="stl-hero-sub" />
        <b-button
          v-if="root" size="sm" id="popover-root-btn" class="stl-hero-stats-btn"
          :title="serviceType" tabindex="0"
        >
          <b-icon-database /> {{ serviceType }}
        </b-button>
      </div>
    </section>

    <!-- Datasets By Topic -->
    <section v-if="topics.length > 0" class="stl-home-section stl-topics">
      <h2>Datasets By Topic</h2>
      <div class="stl-topic-grid">
        <button
          v-for="topic in topics" :key="topic.id" type="button"
          class="stl-topic-card" :class="{ active: topic.id === selectedTopic }"
          :aria-pressed="topic.id === selectedTopic ? 'true' : 'false'"
          @click="toggleTopic(topic.id)"
        >
          <!-- eslint-disable-next-line vue/no-v-html -- icon markup is a hardcoded constant, see utils/stlHome.js -->
          <svg class="stl-topic-icon" viewBox="0 0 24 24" aria-hidden="true" v-html="topicIcon(topic.title)" />
          <span class="stl-topic-body">
            <span class="stl-topic-name">{{ topic.title }}</span>
            <span class="stl-topic-caption">{{ topic.collections.join(', ') }}</span>
          </span>
        </button>
      </div>
    </section>

    <!-- Quick Stats -->
    <section v-if="stats.length > 0" class="stl-home-section stl-stats">
      <h2>Quick Stats</h2>
      <div class="stl-stat-grid">
        <div v-for="stat in stats" :key="stat.label" class="stl-stat-card">
          <span class="stl-stat-number">{{ stat.value }}</span>
          <span class="stl-stat-label">{{ stat.label }}</span>
        </div>
      </div>
    </section>

    <!-- Data by Tag -->
    <section v-if="tags.length > 0" class="stl-home-section stl-tags">
      <h2>Data by Tag</h2>
      <div class="stl-tag-cloud">
        <button
          v-for="tag in tags" :key="tag.tag" type="button"
          class="stl-tag" :class="{ active: tag.tag === selectedTag }"
          :aria-pressed="tag.tag === selectedTag ? 'true' : 'false'"
          @click="toggleTag(tag.tag)"
        >
          {{ tag.tag }}<span class="stl-tag-count">{{ tag.count }}</span>
        </button>
      </div>
    </section>
  </div>
</template>

<script>
import { defineComponent, defineAsyncComponent } from 'vue';
import { mapGetters, mapState } from 'vuex';
import { STAC } from 'stac-js';
import BIconDatabase from '~icons/bi/database';
import { collectionTopics, expandChildren, humanFileSize, quickStats, topicIcon } from '../utils/stlHome';

export default defineComponent({
  name: 'StlHome',
  components: {
    BIconDatabase,
    Description: defineAsyncComponent(() => import('./Description.vue'))
  },
  computed: {
    ...mapState(['data', 'conformsTo', 'stateQueryParameters']),
    ...mapGetters(['catalogs', 'getStac', 'root']),
    // The catalog title, split so a parenthetical qualifier — "City of
    // St. Louis Open Data (Cloud-Native Mirror)" — reads as a suffix rather
    // than inflating the headline.
    heroTitle() {
      const title = this.data?.title || '';
      const match = title.match(/^(.*?)\s*\((.+)\)\s*$/);
      return match ? match[1] : title;
    },
    heroSuffix() {
      const match = (this.data?.title || '').match(/^(.*?)\s*\((.+)\)\s*$/);
      return match ? match[2] : null;
    },
    serviceType() {
      const isApi = Array.isArray(this.conformsTo) && this.conformsTo.length > 0;
      return isApi ? this.$t('index.api') : this.$t('index.catalog');
    },
    // The root's children expanded one level: department sub-catalogs are
    // replaced by their child collections, while a child that is itself a
    // collection stays a leaf (so a flat catalog keeps working).
    leaves() {
      return expandChildren(this.catalogs, this.getStac);
    },
    // The leaves that have finished loading as full STAC entities. The
    // sections below build up reactively while the background loader works
    // through the queue (see the `leaves` watcher).
    children() {
      return this.leaves
        .map(leaf => leaf.stac)
        .filter(stac => stac instanceof STAC);
    },
    selectedTopic() {
      return this.stateQueryParameters.topic ?? null;
    },
    selectedTag() {
      return this.stateQueryParameters.tag ?? null;
    },
    // Topics aggregated across children, most collections first. Only topics
    // that actually have collections exist here by construction.
    topics() {
      const byId = new Map();
      for (const child of this.children) {
        const label = child.title || child.id;
        for (const { id, title } of collectionTopics(child)) {
          if (!byId.has(id)) {
            byId.set(id, { id, title, collections: [] });
          }
          byId.get(id).collections.push(label);
        }
      }
      return [...byId.values()].sort((a, b) =>
        (b.collections.length - a.collections.length) || a.title.localeCompare(b.title));
    },
    tags() {
      const counts = new Map();
      for (const child of this.children) {
        if (!Array.isArray(child.keywords)) {
          continue;
        }
        for (const keyword of child.keywords) {
          counts.set(keyword, (counts.get(keyword) || 0) + 1);
        }
      }
      return [...counts.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => (b.count - a.count) || a.tag.localeCompare(b.tag));
    },
    stats() {
      if (this.children.length === 0) {
        return [];
      }
      const { features, styles, bytes } = quickStats(this.children);
      // Leaves count as collections once known to be one: either loaded as a
      // collection, or linked from a department sub-catalog (whose children
      // are its collections). Unloaded top-level children stay uncounted so
      // department catalogs are never mistaken for collections.
      const collections = this.leaves
        .filter(leaf => leaf.stac?.isCollection || (leaf.expanded && !leaf.stac?.isCatalog))
        .length;
      const stats = [];
      if (collections > 0) {
        stats.push({ label: 'Collections', value: collections.toLocaleString() });
      }
      if (features > 0) {
        stats.push({ label: 'Total features', value: features.toLocaleString() });
      }
      if (styles > 0) {
        stats.push({ label: 'Map styles', value: styles.toLocaleString() });
      }
      const size = humanFileSize(bytes);
      if (bytes > 0 && size) {
        stats.push({ label: 'Data size', value: size });
      }
      return stats;
    }
  },
  watch: {
    // Topics, tags and stats need every leaf's collection.json, but the
    // background loader is normally fed by card visibility alone. Queue every
    // unloaded leaf up front; while the department sub-catalogs are still
    // loading they are leaves themselves, and once loaded they re-fire this
    // watcher with their child collections. The catalog is small (~13
    // departments, ~50 collections), so this settles fast.
    leaves: {
      immediate: true,
      handler(leaves) {
        if (!Array.isArray(leaves)) {
          return;
        }
        // Lazily created: immediate watchers run before the created() hook.
        if (!this.queued) {
          this.queued = new Set();
        }
        for (const leaf of leaves) {
          const url = leaf?.url;
          if (url && !leaf.stac && !this.queued.has(url)) {
            this.queued.add(url);
            this.$store.commit('queue', url);
          }
        }
      }
    }
  },
  methods: {
    topicIcon,
    toggleTopic(id) {
      this.$store.commit('updateState', {
        type: 'topic',
        value: this.selectedTopic === id ? null : id
      });
    },
    toggleTag(tag) {
      this.$store.commit('updateState', {
        type: 'tag',
        value: this.selectedTag === tag ? null : tag
      });
    }
  }
});
</script>

<style lang="scss">
@import 'bootstrap/scss/mixins';
@import "../theme/variables.scss";

#stac-browser .stl-home {
  // Full-bleed hero on the portal's dark blue; the page container clips
  // overflow (see page.scss), so the 50vw breakout cannot add a scrollbar.
  .stl-hero {
    margin-inline: calc(50% - 50vw);
    background-color: $stl-blue;
    color: white;
    margin-bottom: $block-gap;
  }

  .stl-hero-inner {
    margin-inline: auto;
    padding: 2.25rem $block-gap 2rem;

    @include media-breakpoint-up(xxxl) {
      max-width: 75vw;
    }

    h1 {
      color: white;
      font-family: $headings-font-family;
      font-weight: 700;
      font-size: 2.1rem;
      margin-bottom: 0.75rem;

      @include media-breakpoint-down(md) {
        font-size: 1.6rem;
      }
    }

    .stl-hero-suffix {
      display: inline-block;
      font-family: $font-family-sans-serif;
      font-size: 0.85rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: $stl-light-blue;
      border: 1px solid rgba($stl-light-blue, 0.6);
      border-radius: 999px;
      padding: 0.15rem 0.7rem;
      vertical-align: middle;
      margin-left: 0.5rem;
    }
  }

  .stl-hero-sub {
    max-width: 52rem;

    p {
      color: rgba(white, 0.9);
      font-size: 1rem;
      line-height: 1.6;
      margin: 0;
    }

    a {
      color: white;
      text-decoration: underline;

      &:hover,
      &:focus {
        color: $stl-light-blue;
      }
    }
  }

  .stl-hero-stats-btn {
    margin-top: 1rem;
    background: transparent;
    border: 1px solid rgba(white, 0.55);
    color: white;

    &:hover,
    &:focus,
    &:active {
      background-color: rgba(white, 0.15);
      border-color: white;
      color: white;
    }
  }

  .stl-home-section {
    margin-bottom: 1.75rem;
  }

  // ----- Datasets By Topic -----
  .stl-topic-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 1rem;
    padding: 0.5rem 0;
  }

  .stl-topic-card {
    display: flex;
    align-items: flex-start;
    gap: 0.85rem;
    padding: 1rem;
    text-align: left;
    background-color: white;
    border: 1px solid transparent;
    border-radius: $border-radius;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    transition: box-shadow 0.15s ease, border-color 0.15s ease;
    cursor: pointer;

    &:hover,
    &:focus-visible {
      box-shadow: 0 2px 8px rgba($stl-blue, 0.25);
    }

    &.active {
      border-color: $stl-blue;
      box-shadow: inset 0 0 0 1px $stl-blue, 0 2px 8px rgba($stl-blue, 0.25);
    }
  }

  .stl-topic-icon {
    flex-shrink: 0;
    width: 2.4rem;
    height: 2.4rem;
    margin-top: 0.1rem;
    color: $stl-blue;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .stl-topic-body {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .stl-topic-name {
    font-family: $headings-font-family;
    font-weight: 700;
    font-size: 1rem;
    color: $stl-blue;
  }

  .stl-topic-caption {
    font-size: 0.78rem;
    line-height: 1.4;
    color: $stl-slate;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  // ----- Quick Stats -----
  .stl-stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 1rem;
    padding: 0.5rem 0;
  }

  .stl-stat-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    padding: 1.1rem 1rem;
    background-color: white;
    border-radius: $border-radius;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .stl-stat-number {
    font-family: $headings-font-family;
    font-weight: 700;
    font-size: 1.7rem;
    line-height: 1.2;
    color: $stl-blue;
  }

  .stl-stat-label {
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: $stl-slate;
  }

  // ----- Data by Tag -----
  .stl-tag-cloud {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.5rem 0;
  }

  .stl-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.8rem;
    font-size: 0.82rem;
    font-weight: 600;
    color: $stl-blue;
    background-color: white;
    border: 1px solid rgba($stl-blue, 0.35);
    border-radius: 999px;
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease;

    &:hover,
    &:focus-visible {
      border-color: $stl-blue;
      background-color: rgba($stl-light-blue, 0.35);
    }

    &.active {
      background-color: $stl-blue;
      border-color: $stl-blue;
      color: white;

      .stl-tag-count {
        background-color: rgba(white, 0.25);
        color: white;
      }
    }
  }

  .stl-tag-count {
    font-size: 0.72rem;
    font-weight: 700;
    padding: 0 0.4rem;
    border-radius: 999px;
    background-color: rgba($stl-blue, 0.12);
    color: $stl-blue-dark;
  }
}
</style>
