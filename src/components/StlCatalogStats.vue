<template>
  <section v-if="stats.length > 0" class="stl-catalog-stats" aria-label="Quick stats">
    <div v-for="stat in stats" :key="stat.label" class="stl-stat-card">
      <span class="stl-stat-number">{{ stat.value }}</span>
      <span class="stl-stat-label">{{ stat.label }}</span>
    </div>
  </section>
</template>

<script>
// A compact Quick Stats row for the department catalog pages: the same
// treatment as the home view's stat cards (StlHome.vue), scaled down. Shown on
// a non-root catalog whose children are collections — i.e. a department
// sub-catalog of the St. Louis mirror — and computed from those child
// collections: dataset count from the child links, features and data size
// summed via quickStats() as the collections load.
import { defineComponent } from 'vue';
import { mapGetters } from 'vuex';
import { STAC } from 'stac-js';
import { humanFileSize, quickStats } from '../utils/stlHome';

export default defineComponent({
  name: 'StlCatalogStats',
  computed: {
    ...mapGetters(['catalogs', 'getStac']),
    // The catalog's child links paired with their loaded STAC objects (null
    // while a child is still loading).
    entries() {
      if (!Array.isArray(this.catalogs)) {
        return [];
      }
      return this.catalogs.map(child => {
        const url = typeof child?.getAbsoluteUrl === 'function' ? child.getAbsoluteUrl() : null;
        return { url, stac: this.getStac(url ?? child) };
      });
    },
    loaded() {
      return this.entries
        .map(entry => entry.stac)
        .filter(stac => stac instanceof STAC);
    },
    // Department pages hold collections only. If a loaded child turns out to
    // be a catalog, this is some deeper nesting the stats would misrepresent —
    // render nothing.
    isDepartment() {
      return this.entries.length > 0 && !this.loaded.some(stac => stac.isCatalog);
    },
    stats() {
      if (!this.isDepartment) {
        return [];
      }
      const stats = [{ label: 'Datasets', value: this.entries.length.toLocaleString() }];
      const { features, bytes } = quickStats(this.loaded);
      if (features > 0) {
        stats.push({ label: 'Total features', value: features.toLocaleString() });
      }
      const size = humanFileSize(bytes);
      if (bytes > 0 && size) {
        stats.push({ label: 'Data size', value: size });
      }
      return stats;
    }
  },
  watch: {
    // Feature and size totals need every child's collection.json, but the
    // background loader is normally fed by card visibility alone. Queue the
    // unloaded children up front so the row fills in without scrolling; a
    // department holds only a handful of collections.
    entries: {
      immediate: true,
      handler(entries) {
        // Lazily created: immediate watchers run before the created() hook.
        if (!this.queued) {
          this.queued = new Set();
        }
        for (const { url, stac } of entries) {
          if (url && !stac && !this.queued.has(url)) {
            this.queued.add(url);
            this.$store.commit('queue', url);
          }
        }
      }
    }
  }
});
</script>

<style lang="scss">
@import "../theme/variables.scss";

// The home view's stat cards (see StlHome.vue), smaller: a row of pills
// instead of a full-width grid.
#stac-browser .stl-catalog-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: $block-gap;

  .stl-stat-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
    min-width: 8.5rem;
    padding: 0.65rem 1.1rem;
    background-color: white;
    border-radius: $border-radius;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .stl-stat-number {
    font-family: $headings-font-family;
    font-weight: 700;
    font-size: 1.25rem;
    line-height: 1.2;
    color: $stl-blue;
  }

  .stl-stat-label {
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: $stl-slate;
  }
}
</style>
