export default {
  // The St. Louis open-data mirror on Source Cooperative. Override with
  // SB_catalogUrl to point at a local copy while developing — see AGENTS.md.
  catalogUrl: "https://data.source.coop/tge-labs/st-louis-open-data-mirror/catalog.json",
  catalogTitle: "St. Louis Data Browser",
  catalogTitleAfterImage: null,
  // StlHeader draws the wordmark itself, so there is no logo to resolve.
  catalogImage: null,
  // This browser serves one catalog; it is not a general STAC viewer.
  allowExternalAccess: false,
  allowedDomains: ["data.source.coop"],
  // The St. Louis palette is a light theme; there is no dark variant.
  enforcedColorMode: "light",
  detectLocaleFromBrowser: true,
  storeLocale: true,
  locale: "en",
  fallbackLocale: "en",
  // The catalog is English-only, so the language chooser has nothing to offer.
  supportedLocales: [
    "en"
  ],
  apiCatalogPriority: null,
  useTileLayerAsFallback: false,
  displayGeoTiffByDefault: false,
  displayPreview: true,
  displayOverview: true,
  displayOverviewsForChildren: false,
  buildTileUrlTemplate: null,
  getMapSourceOptions: null,
  // Overridden at build time by the Pages deploy; "/" keeps dev at the root.
  pathPrefix: "/",
  historyMode: "hash",
  cardViewMode: "cards",
  defaultCollectionSort: "title",
  defaultItemSort: null,
  showKeywordsInItemCards: false,
  showKeywordsInCatalogCards: false,
  preferredAssets: true,
  showThumbnailsAsAssets: false,
  searchResultsPerPage: null,
  itemsPerPage: null,
  collectionsPerPage: null,
  maxEntriesPerPage: 1000,
  defaultThumbnailSize: null,
  crossOriginMedia: null,
  requestHeaders: {},
  requestQueryParameters: {},
  socialSharing: ['email', 'bsky', 'mastodon', 'x'],
  preprocessSTAC: null,
  authConfig: null,
  transactions: 'auto',
  transactionsRequireLogin: true,
  transactionsRequirePreflight: true,
  crs: {},
  // Where the data comes from, then where the data and this site live.
  footerLinks: [
    { label: "City of St. Louis", url: "https://www.stlouis-mo.gov/" },
    { label: "St. Louis Open Data", url: "https://www.stlouis-mo.gov/data/" },
    { label: "Catalog on Source Cooperative", url: "https://source.coop/tge-labs/st-louis-open-data-mirror" },
    { label: "Source code on GitHub", url: "https://github.com/cholmes/stlouis-data-browser" }
  ]
};
