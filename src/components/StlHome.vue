<template>
  <div class="stl-home">
    <!-- Hero band, echoing the portal's dark blue hero -->
    <section v-if="section !== 'tags'" class="stl-hero">
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

    <!-- Quick Stats -->
    <section v-if="section !== 'tags' && stats.length > 0" class="stl-home-section stl-stats">
      <h2>Quick Stats</h2>
      <div class="stl-stat-grid">
        <div v-for="stat in stats" :key="stat.label" class="stl-stat-card">
          <span class="stl-stat-number">{{ stat.value }}</span>
          <span class="stl-stat-label">{{ stat.label }}</span>
        </div>
      </div>
    </section>

    <!-- Data by Department -->
    <section v-if="section !== 'tags' && departments.length > 0" class="stl-home-section stl-departments">
      <h2>Data by Department</h2>
      <div class="stl-tag-cloud">
        <button
          v-for="department in departments" :key="department.id" type="button"
          class="stl-tag" :class="{ active: department.id === selectedDepartment }"
          :aria-pressed="department.id === selectedDepartment ? 'true' : 'false'"
          @click="toggleDepartment(department.id)"
        >
          {{ department.title }}<span class="stl-tag-count">{{ department.count }}</span>
        </button>
      </div>
    </section>

    <!-- Data by Tag -->
    <section v-if="section !== 'top' && tags.length > 0" class="stl-home-section stl-tags">
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
import { collectionDepartments, expandChildren, humanFileSize, quickStats } from '../utils/stlHome';

export default defineComponent({
  name: 'StlHome',
  components: {
    BIconDatabase,
    Description: defineAsyncComponent(() => import('./Description.vue'))
  },
  props: {
    // Catalog.vue renders the browse grid between two StlHome instances:
    // 'top' is the hero, Quick Stats and the department chips, all above the
    // grid; 'tags' is the tag cloud below it — a long list that reads better
    // as a footer than as something to scroll past. Unset renders everything
    // (kept for a standalone use).
    section: {
      type: String,
      default: null
    }
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
    selectedTag() {
      return this.stateQueryParameters.tag ?? null;
    },
    selectedDepartment() {
      return this.stateQueryParameters.department ?? null;
    },
    // Department chips, aggregated across the loaded leaf collections from
    // the city's departments theme scheme; most collections first.
    departments() {
      const byId = new Map();
      for (const child of this.children) {
        for (const { id, title } of collectionDepartments(child)) {
          if (!byId.has(id)) {
            byId.set(id, { id, title, count: 0 });
          }
          byId.get(id).count++;
        }
      }
      return [...byId.values()].sort((a, b) => (b.count - a.count) || a.title.localeCompare(b.title));
    },
    tags() {
      // Every collection also carries its department as a keyword; the
      // departments have their own chip row, so keep their names out of the
      // tag cloud rather than listing them twice.
      const departmentNames = new Set();
      const counts = new Map();
      for (const child of this.children) {
        for (const { title } of collectionDepartments(child)) {
          departmentNames.add(title);
        }
      }
      for (const child of this.children) {
        if (!Array.isArray(child.keywords)) {
          continue;
        }
        for (const keyword of child.keywords) {
          if (departmentNames.has(keyword)) {
            continue;
          }
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
      const { features, departments, bytes } = quickStats(this.children);
      // Leaves count as datasets once known to be collections: either loaded
      // as one, or linked from a topic sub-catalog (whose children are its
      // collections). Unloaded top-level children stay uncounted so topic
      // catalogs are never mistaken for datasets.
      const datasets = this.leaves
        .filter(leaf => leaf.stac?.isCollection || (leaf.expanded && !leaf.stac?.isCatalog))
        .length;
      const stats = [];
      if (datasets > 0) {
        stats.push({ label: 'Datasets', value: datasets.toLocaleString() });
      }
      if (features > 0) {
        stats.push({ label: 'Total Rows', value: features.toLocaleString() });
      }
      if (departments > 0) {
        stats.push({ label: 'Departments', value: departments.toLocaleString() });
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
        // Two instances render on the home view (hero above the grid, facets
        // below it); the hero needs no collection data, so only the other
        // instance queues.
        if (this.section === 'hero' || !Array.isArray(leaves)) {
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
    toggleTag(tag) {
      this.$store.commit('updateState', {
        type: 'tag',
        value: this.selectedTag === tag ? null : tag
      });
    },
    toggleDepartment(id) {
      this.$store.commit('updateState', {
        type: 'department',
        value: this.selectedDepartment === id ? null : id
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
