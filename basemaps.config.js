// Map configuration for the St. Louis Data Browser.
//
// The City of St. Louis publishes no public vector-tile server, so the basemaps
// are public ones: CARTO's Positron and Dark Matter GL styles, plus Esri World
// Imagery as a raster fallback for aerial context.
//
// Upstream keys basemaps by celestial body and picks a list from a catalog's
// `ssys:targets`. A city catalog is only ever going to be Earth, so that
// indirection is gone and configureBasemap() ignores its argument.

const BASEMAPS = [
  {
    url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    title: 'Light (Positron)',
  },
  {
    url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    title: 'Dark (Dark Matter)',
  },
  {
    title: 'Imagery (Esri)',
    raster: true,
    attribution: 'Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
  },
];

// The City of St. Louis sits on the west bank of the Mississippi at roughly
// [-90.32, 38.53] to [-90.16, 38.77]. These constraints frame the city on load
// and stop the map drifting out of the region: the bounds extend across the
// river into Metro East and west past the inner suburbs, and minZoom keeps the
// city filling the viewport rather than shrinking into a world map.
//
// maxBounds must stay comfortably wider than what minZoom renders, or MapLibre
// ends up fighting its own constraints.
export const MAP_CONSTRAINTS = {
  center: [-90.2394, 38.6270],
  zoom: 11,
  minZoom: 9,
  maxZoom: 18,
  maxBounds: [[-90.75, 38.30], [-89.75, 39.00]],
};

export default function configureBasemap() {
  return BASEMAPS;
}
