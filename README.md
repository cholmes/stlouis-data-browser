# St. Louis Data Browser

A browser for the City of St. Louis's published open data, in the city's own colours.

**<https://cholmes.github.io/stlouis-data-browser/>**

The City of St. Louis publishes open data at
[stlouis-mo.gov/data](https://www.stlouis-mo.gov/data/). The
[St. Louis open-data mirror](https://source.coop/tge-labs/st-louis-open-data-mirror) republishes the
geospatial datasets as cloud-native formats (GeoParquet, PMTiles) with STAC metadata, built with
[portolan-catalog-stlouis](https://github.com/cholmes/portolan-catalog-stlouis). This is the front
door to that catalog: browse the collections, preview the data on a map, and read every field's
description without downloading anything.

Unofficial, and not affiliated with the City of St. Louis.

## What Makes This Different From STAC Browser

This is a fork of [portolan-browser](https://github.com/portolan-sdi/portolan-browser), itself a
fork of [STAC Browser](https://github.com/radiantearth/stac-browser). Four things changed:

- **Basemaps** are CARTO Positron, CARTO Dark Matter and Esri World Imagery — the city runs no
  public vector-tile server of its own.
- **The map is bounded** to the St. Louis region, so it cannot drift to the middle of the ocean.
- **The header** is stlouis-mo.gov's: the `STLOUIS-MO⚜GOV` wordmark with the city's fleur-de-lis,
  a dark blue accent band, and the palette sampled from the city's own site.
- **One catalog.** There is no data-source picker; the browser only ever shows St. Louis data.

## Develop

Requires Node.js and pnpm.

```sh
pnpm install
pnpm start                     # http://localhost:8080, reads the live catalog
```

To work against a local copy of the catalog instead:

```sh
npx serve ~/repos/portolan-catalog-stlouis/catalog --cors -l 8081
SB_catalogUrl=http://localhost:8081/catalog.json pnpm start
```

Any `SB_*` environment variable overrides the matching key in `config.js`.

## Test

```sh
pnpm run test:unit
pnpm run lint

node_modules/.bin/vite --port 8080 --strictPort &
node verify-stlouis.mjs        # end-to-end checks against the running site
```

`verify-stlouis.mjs` is the one that matters for this fork: it asserts the brand colours, the
wordmark, the typography, and — once the catalog is live — the basemaps and the bounds clamping.
`tests/e2e` is inherited from upstream, tests a product shape this fork no longer has, and is
manual-only — see [AGENTS.md](AGENTS.md).

## Deploy

Pushing to `main` builds and publishes to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## Configure

The customization surface is seven files, listed in [AGENTS.md](AGENTS.md). Upstream's full
configuration reference lives in [`docs/`](docs/) and still applies to everything this fork did
not change.

## License

ISC, inherited from STAC Browser. The stlouis-mo.gov name, wordmark and fleur-de-lis belong to the
City of St. Louis. The underlying data is published by the City of St. Louis under
[its own terms](https://www.stlouis-mo.gov/data/).
