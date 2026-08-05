<template>
  <div class="stl-header">
    <div class="stl-bar">
      <router-link to="/" class="stl-brand" :title="catalogTitle">
        <span class="stl-word strong">STLOUIS</span>
        <span class="stl-word">-MO</span>
        <img :src="fleur" alt="" class="stl-fleur" aria-hidden="true">
        <span class="stl-word">GOV</span>
        <span class="visually-hidden">{{ catalogTitle }}</span>
      </router-link>

      <nav class="stl-actions">
        <router-link v-if="canSearch" :to="searchLink" class="stl-link" :class="{ active: isSearchPage }">
          <b-icon-search /><span class="stl-link-label">{{ $t('search.title') }}</span>
        </router-link>

        <button v-if="canAuthenticate" type="button" class="stl-link" :title="authTitle" @click="$emit('logInOut')">
          <component :is="authIcon" /><span class="stl-link-label">{{ authLabel }}</span>
        </button>

        <LanguageChooser
          v-if="locales.length > 1"
          class="stl-lang"
          :data="data" :currentLocale="currentLocale" :locales="locales"
          @set-locale="locale => $emit('setLocale', locale)"
        />

        <button
          v-if="!isServerSelector" type="button" class="stl-menu"
          :aria-expanded="menuOpen ? 'true' : 'false'" :title="$t('browse')"
          @click="$emit('toggleSidebar')"
        >
          <b-icon-list /><span class="stl-menu-label">{{ $t('browse') }}</span>
        </button>
      </nav>
    </div>
  </div>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import BIconList from '~icons/bi/list';
import BIconSearch from '~icons/bi/search';

export default {
  name: 'StlHeader',
  components: {
    BIconList,
    BIconSearch,
    LanguageChooser: defineAsyncComponent(() => import('./LanguageChooser.vue'))
  },
  props: {
    catalogTitle: {
      type: String,
      default: ''
    },
    canSearch: {
      type: Boolean,
      default: false
    },
    isSearchPage: {
      type: Boolean,
      default: false
    },
    searchLink: {
      type: [String, Object],
      default: '/search'
    },
    isServerSelector: {
      type: Boolean,
      default: false
    },
    canAuthenticate: {
      type: Boolean,
      default: false
    },
    authIcon: {
      type: [String, Object, Function],
      default: null
    },
    authLabel: {
      type: String,
      default: ''
    },
    authTitle: {
      type: String,
      default: ''
    },
    data: {
      type: Object,
      default: null
    },
    currentLocale: {
      type: String,
      default: 'en'
    },
    locales: {
      type: Array,
      default: () => []
    },
    menuOpen: {
      type: Boolean,
      default: false
    }
  },
  emits: ['toggleSidebar', 'logInOut', 'setLocale'],
  computed: {
    fleur() {
      return `${import.meta.env.BASE_URL}fleur-de-lis.svg`;
    }
  }
};
</script>

<style lang="scss">
@import 'bootstrap/scss/mixins';
@import "../theme/variables.scss";

.stl-header {
  // The header lives inside a max-width b-container but both bars read as full
  // bleed, so it breaks out to the viewport edges and re-pads itself. The
  // parent clips overflow (see page.scss) so this cannot induce a horizontal
  // scrollbar, which would otherwise feed back into the 50vw term.
  margin-inline: calc(50% - 50vw);
  background-color: white;
}

.stl-bar {
  margin-inline: auto;

  @include media-breakpoint-up(xxxl) {
    max-width: 75vw;
  }
}

// The white bar: the stlouis-mo.gov wordmark on the left, the browser's
// actions on the right — one strip, as on the city's own pages.
.stl-bar {
  display: flex;
  align-items: center;
  height: $stl-bar-height;
  padding-inline: $block-gap;
}

.stl-brand {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: $stl-blue;
  text-decoration: none;
  font-family: $font-family-sans-serif;
  font-size: 1.5rem;
  font-weight: 400;
  letter-spacing: 0.01em;
  line-height: 1;

  .strong {
    font-weight: 700;
  }

  &:hover,
  &:focus {
    color: $stl-blue-dark;
    text-decoration: none;
  }

  @include media-breakpoint-down(sm) {
    font-size: 1.2rem;
  }
}

.stl-fleur {
  height: 0.95em;
  width: 0.95em;
  // The mark sits fractionally high against the caps without this nudge.
  margin: 0 0.06em -0.04em;
}

.stl-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-left: auto;
}

// Secondary actions are flat blue text on the white bar; only BROWSE reads as
// a button, the way the city's own header leads with its one filled control.
.stl-link {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.7rem;
  border: 0;
  background: none;
  color: $stl-blue;
  font-size: 0.95rem;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;

  &:hover,
  &:focus {
    color: $stl-red-dark;
    text-decoration: none;
  }

  &.active {
    color: $stl-blue-dark;
    box-shadow: inset 0 -3px 0 $stl-blue;
  }

  @include media-breakpoint-down(md) {
    .stl-link-label {
      display: none;
    }
  }
}

// The BROWSE button copies stlouis-mo.gov's own Search button treatment
// (screen.css `.site-search input[type="submit"]`): the city's dark blue at
// rest, turning red with white text on hover.
.stl-menu {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 1.35rem;
  border: 0;
  border-radius: $border-radius;
  background-color: $stl-blue;
  color: white;
  font-size: 0.95rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  white-space: nowrap;

  &:hover,
  &:focus-visible {
    background-color: $stl-red-dark;
    color: white;
  }

  // Keyboard focus must stay visible on either background.
  &:focus-visible {
    outline: 2px solid $stl-light-blue;
    outline-offset: -3px;
  }

  @include media-breakpoint-down(sm) {
    padding: 0.45rem 0.8rem;

    .stl-menu-label {
      display: none;
    }
  }
}

// The language dropdown is the one place a Bootstrap component shows through;
// flatten it so it reads as part of the white bar.
.stl-lang .btn {
  border: 0;
  background-color: transparent;
  color: $stl-blue;
  font-weight: 600;

  &:hover,
  &:focus,
  &:active {
    background-color: rgba($stl-blue, 0.08);
    color: $stl-blue-dark;
  }
}
</style>
