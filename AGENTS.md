# St. Louis Data Browser — Agent Notes

A St. Louis-branded fork of [portolan-browser](https://github.com/portolan-sdi/portolan-browser),
which is itself a fork of [STAC Browser](https://github.com/radiantearth/stac-browser). It serves
one catalog: the St. Louis open-data mirror at
`data.source.coop/tge-labs/st-louis-open-data-mirror`, built with
[portolan-catalog-stlouis](https://github.com/cholmes/portolan-catalog-stlouis).

This repo is personal, not part of the Portolan org. The portolan-ops norms — the PR body contract,
VOICE.md, the issue templates — do not apply here. What follows does.

## Where the Customization Lives

Everything that makes this a St. Louis browser rather than a generic one sits in eight places.
Change these; leave the rest of the tree matching upstream so `git pull upstream main` stays cheap.

| File | Owns |
| --- | --- |
| `config.js` | Catalog URL, title, locales, footer links |
| `basemaps.config.js` | The three basemaps and `MAP_CONSTRAINTS` (bounds, zoom limits, home view) |
| `src/components/StlHeader.vue` | The white wordmark bar, the blue action band, the MENU button |
| `src/components/StlHome.vue` + `src/utils/stlHome.js` | The portal-style home: hero, Datasets By Topic, Quick Stats, Data by Tag |
| `src/theme/variables.scss` | The palette and fonts, as Sass variables |
| `src/theme/custom.scss` | Component-level styling, referencing those variables |
| `index.html` | Favicon, font link, meta tags |
| `.github/workflows/deploy.yml` | The GitHub Pages build (`SB_pathPrefix`, hash routing) |

Brand values have exactly one home: the `$stl-*` variables in `variables.scss`. Do not paste hex
literals into components.

Small supporting edits ride along with those files: `src/StacBrowser.vue` mounts `StlHeader` in
place of upstream's `.site` row, hides the page-title strip on the home view (the hero carries the
title and the catalog-stats trigger there), and carries the footer disclaimer;
`src/views/Catalog.vue` mounts `StlHome` on the root catalog and filters the collection grid by the
selected topic/tag; `src/components/maps/MapMixin.js` spreads `MAP_CONSTRAINTS` into the MapLibre
constructor.

The home view reads the portal's own metadata off the leaf collections: topics from the STAC
Themes extension (`themes[].concepts` under the scheme `https://www.stlouis-mo.gov/data/topics/`),
tags from `keywords`, and the Quick Stats from `table:row_count` and asset `file:size`/roles. The
catalog nests one level — root → department sub-catalogs → collections — so `expandChildren` in
`src/utils/stlHome.js` expands each loaded child catalog into its child collections (a child that
is itself a collection is used directly, so a flat catalog keeps working). The topic/tag selection
travels in the state query parameters (`#/?.topic=<slug>`, `#/?.tag=<tag>`), so filtered views are
linkable; without a filter the root grid shows the department cards, with one active it switches
to the matching leaf collections. Sections whose data is absent simply do not render — the accessors in
`src/utils/stlHome.js` are defensive, and `tests/unit/stlHome.spec.js` pins that down.

## Brand Facts

The palette is stlouis-mo.gov's, fetched from the city's own pages rather than guessed:

- Dark blue `#1E526B` — headings, links, the header's accent band; hover darkens to `#174054`
- Brick red `#C03221` — the fleur-de-lis and the MENU button
- Green `#538400`, light blue `#A8D4E8`, orange `#E89D07` — supporting accents
- Page background `#EFEFEF`, with white content cards under a
  `0 1px 3px rgba(0,0,0,.2)` shadow and 3px radius — the city site's card treatment
- Body: `"Open Sans", verdana, sans-serif`. Headings h1–h3: `"Merriweather", georgia, serif`
  (h4–h6 go back to Open Sans in `custom.scss`). Both load from Google Fonts in `index.html`.

The wordmark is rebuilt in markup — bold `STLOUIS`, regular `-MO`, the fleur-de-lis, `GOV` — the
way stlouis-mo.gov's own `.logo` markup does it. `public/fleur-de-lis.svg` is the city's actual
mark: it ships base64-embedded in every stlouis-mo.gov page (fill `#C03221`, title "Fleur De Lis"),
decoded from there, and doubles as the favicon.

The supporting neutrals (`$stl-ink` body text, `$stl-slate` secondary text) are *not* sampled —
they are neutral choices made to sit with the blues. Everything else was fetched. If you need a new
brand value, go get it from stlouis-mo.gov; never eyeball one.

## Local Development

The catalog lives at `https://data.source.coop/tge-labs/st-louis-open-data-mirror/catalog.json`.
To work against a local copy instead:

```sh
npx serve ~/repos/portolan-catalog-stlouis/catalog --cors -l 8081
SB_catalogUrl=http://localhost:8081/catalog.json pnpm start
```

Any `SB_*` environment variable overrides the matching key in `config.js`.

## Verification

`verify-stlouis.mjs` is this fork's real test. It drives a browser against the running site and
asserts the things this fork actually promises: the exact brand colours, the wordmark, the fonts,
the footer provenance, and — once the catalog is live — the three basemaps, the city bounds
clamping pan and zoom, and that collections render. Catalog-dependent checks are skipped, not
failed, while the catalog is not yet published.

```sh
node_modules/.bin/vite --port 8080 --strictPort &
node verify-stlouis.mjs         # screenshots in ./verify-out
```

`tests/unit` still applies and runs in CI.

`tests/e2e` does not. That suite is inherited and asserts the upstream product — a data-source
picker at `/`, `/external/` routing, an API-backed search page — none of which this fork has. Its
workflow is manual-only for that reason. The files are left untouched so merges from upstream stay
clean; do not "fix" them to pass against this configuration.

Note that MapLibre only renders when the page is actually visible. Automation that drives a
backgrounded tab will show an inert map with no style loaded and no tile requests, which looks
exactly like a broken basemap. Verify maps through this script, not a hidden tab.

## Upstream

`upstream` points at portolan-sdi/portolan-browser. Pull improvements with `git pull upstream main`.
Conflicts will concentrate in the seven files above, which is why they are kept small and separate.

`gh` commands default to `origin` (this repo). That is deliberate — do not add a fork relationship.

## Working Rules

Verify before claiming. This is a visual project: a change to the header or a basemap is not done
until it has been loaded in a browser and looked at. Screenshots beat assertions.

Never fabricate a tile URL, a style name, or a hex value. Every one in this repo was fetched or
sampled. If you need a new one, go get it.

The catalog is the source of truth for what data exists. Read it; do not infer collection names.
