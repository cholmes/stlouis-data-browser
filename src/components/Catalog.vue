<template>
  <b-card no-body :class="classes" v-visible.400="load" :img-placement="isList ? 'end' : undefined">
    <div class="card-img-wrapper">
      <b-card-img v-if="hasImage" class="thumbnail" v-bind="thumbnail" lazy />
    </div>
    <b-card-body :class="{ 'stl-topic-card-body': stlTopicIcon }">
      <!-- St. Louis fork: catalog cards (the root's topic sub-catalogs)
           carry their topic's glyph, matched by id, at the left of the
           title/caption block; see utils/stlHome.js and custom.scss. -->
      <!-- eslint-disable-next-line vue/no-v-html -- icon markup is a hardcoded constant, see utils/stlHome.js -->
      <svg v-if="stlTopicIcon" class="stl-card-topic-icon" viewBox="0 0 24 24" aria-hidden="true" v-html="stlTopicIcon" />
      <b-card-title>
        <StacLink :data="[data, catalog]" class="stretched-link" />
      </b-card-title>
      <b-card-text v-if="fileFormats.length > 0 || hasDescription || isDeprecated" class="intro">
        <b-badge v-if="isDeprecated" variant="warning" class="me-1 mt-1 deprecated">{{ $t('deprecated') }}</b-badge>
        <b-badge v-for="format in fileFormats" :key="format" variant="secondary" class="me-1 mt-1 fileformat">{{ format }}</b-badge>
        {{ summarizeDescription }}
      </b-card-text>
      <Keywords v-if="showKeywordsInCatalogCards && keywords.length > 0" :keywords="keywords" variant="primary" />
      <b-card-text v-if="temporalExtent" class="datetime"><small v-html="temporalExtent" /></b-card-text>
    </b-card-body>
    <b-card-footer>
      <slot name="footer" :data="data" />
    </b-card-footer>
  </b-card>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import { mapState, mapGetters } from 'vuex';
import FileFormatsMixin from './FileFormatsMixin';
import StacFieldsMixin from './StacFieldsMixin';
import CardMixin from './CardMixin';
import StacLink from './StacLink.vue';
import { STAC } from 'stac-js';
import { formatTemporalExtent } from '@radiantearth/stac-fields/formatters';
import { BCard, BCardBody, BCardFooter, BCardImg, BCardText, BCardTitle } from 'bootstrap-vue-next';
import { topicIconForId } from '../utils/stlHome';

export default {
  name: 'Catalog',
  components: {
    BCard,
    BCardBody,
    BCardFooter,
    BCardImg,
    BCardText,
    BCardTitle,
    StacLink,
    Keywords: defineAsyncComponent(() => import('./Keywords.vue'))
  },
  mixins: [
    FileFormatsMixin,
    CardMixin,
    StacFieldsMixin({ formatTemporalExtent })
  ],
  props: {
    catalog: {
      type: Object,
      required: true
    }
  },
  computed: {
    ...mapState(['showKeywordsInCatalogCards']),
    ...mapGetters(['getStac']),
    classes() {
      let classes = ['catalog-card'];
      if (!this.data) {
        classes.push('queued');
      }
      if (this.data && this.data.deprecated) {
        classes.push('deprecated');
      }
      if (this.hasImage) {
        classes.push('has-thumbnail');
      }
      return classes;
    },
    data() {
      return this.getStac(this.catalog);
    },
    // St. Louis fork: a loaded card that is a catalog — in this tree, one of
    // the root's topic sub-catalogs — shows its topic glyph (matched by the
    // catalog id, which is the portal topic slug; database glyph otherwise).
    stlTopicIcon() {
      if (this.data?.isCatalog) {
        return topicIconForId(this.data.id, this.data.title);
      }
      return null;
    },
    temporalExtent() {
      if (this.data?.isCollection && this.data.extent?.temporal?.interval.length > 0) {
        let extent = this.data.extent.temporal.interval[0];
        if (Array.isArray(extent) && (typeof extent[0] === 'string' || typeof extent[1] === 'string')) {
          return this.formatTemporalExtent(this.data.extent.temporal.interval[0], true);
        }
      }
      return null;
    }
  },
  methods: {
    load(visible) {
      if (this.catalog instanceof STAC) {
        return;
      }
      this.$store.commit(visible ? 'queue' : 'unqueue', this.catalog.getAbsoluteUrl());
    }
  }
};
</script>
