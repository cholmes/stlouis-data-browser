import { describe, it, expect, beforeEach, vi } from 'vitest'

// MapMixin's module scope constructs a pmtiles Protocol and registers it with
// maplibre; the same minimal double used by stacMapLayer.spec.js keeps that
// import side-effect inert.
vi.mock('pmtiles', () => {
  class PMTiles {}
  class SharedPromiseCache {}
  class Protocol {
    constructor() {
      this.tile = () => {}
    }
    add() {}
  }
  return { PMTiles, SharedPromiseCache, Protocol }
})

import MapMixin from '../../src/components/maps/MapMixin.js'

// Regression coverage for the raster-basemap layer ordering bug: switching to
// the Esri Imagery basemap (a style *object*, unlike the Positron/Dark Matter
// style URLs) went through MapLibre's diff-based setStyle. The diff patched
// the style in place, never fired `style.load`, and stripped the
// imperatively-added data layers — so the imagery rendered with no data on
// top. The fix forces `diff: false` for object styles, guaranteeing a full
// style load whose `style.load` event re-adds the data layers above the
// raster. URL styles keep MapLibre's default — their fetch + diff already
// ends in a full rebuild that fires `style.load`, and forcing `diff: false`
// on them would tear the style down for the whole network fetch, a window in
// which concurrent addLayer calls throw "Style is not done loading".
//
// The fake map mirrors the slice of MapLibre behavior the bug hinged on:
// - setStyle with { diff: false } replaces all layers and fires `style.load`;
// - setStyle with a URL string full-loads too (these basemaps' diffs bail to
//   a rebuild), so it also fires `style.load`;
// - setStyle with an object in diff mode patches in place and does NOT fire
//   `style.load` — the bug;
// - addLayer appends, so re-added data layers land above the basemap layers.
function createFakeMap() {
  const listeners = new Map()
  const map = {
    layers: [],
    setStyleCalls: [],
    setStyle(style, options) {
      map.setStyleCalls.push({ style, options })
      const incoming = (typeof style === 'object' && style?.layers) ? [...style.layers] : []
      if (options?.diff === false || typeof style === 'string') {
        map.layers = incoming
        // Real MapLibre fires style.load asynchronously, after callers like
        // switchBasemap have had a chance to register their `once` listener —
        // a microtask reproduces that ordering.
        queueMicrotask(() => {
          const fire = listeners.get('style.load') || []
          listeners.set('style.load', [])
          for (const cb of fire) {cb()}
        })
      } else {
        // Object-style diff path: patch in place, no style.load. The diff
        // drops layers the new style doesn't declare — all the data layers.
        map.layers = incoming
      }
    },
    once(event, cb) {
      if (!listeners.has(event)) {listeners.set(event, [])}
      listeners.get(event).push(cb)
    },
    addLayer(spec) {
      map.layers.push(spec)
    },
    getLayer(id) {
      return map.layers.find(l => l.id === id)
    },
    getStyle() {
      return { layers: [...map.layers] }
    },
  }
  return map
}

// Instantiate the mixin's methods/data without mounting a component.
function createHost(map, basemaps, onBasemapChanged) {
  const host = Object.create(MapMixin.methods)
  Object.assign(host, MapMixin.data())
  host.map = map
  host.basemaps = basemaps
  if (onBasemapChanged) {host.onBasemapChanged = onBasemapChanged}
  return host
}

const BASEMAPS = [
  { url: 'https://example.com/positron/style.json', title: 'Light' },
  {
    title: 'Imagery (Esri)',
    raster: true,
    attribution: 'Esri',
    tiles: ['https://example.com/imagery/{z}/{y}/{x}'],
  },
]

describe('basemap switch layer ordering', () => {
  let map

  beforeEach(() => {
    map = createFakeMap()
  })

  it('forces a full (non-diff) style load when switching to the raster style object', async () => {
    const host = createHost(map, BASEMAPS)
    await host.switchBasemap(1)
    expect(map.setStyleCalls).toHaveLength(1)
    expect(map.setStyleCalls[0].options).toEqual({ diff: false })
  })

  it('keeps diffing enabled for URL styles so the old style survives the fetch', async () => {
    // diff: false on a URL would tear the style down for the whole network
    // fetch; MapLibre already ends URL swaps in a full rebuild.
    const host = createHost(map, BASEMAPS)
    host.activeBasemapIndex = 1
    await host.switchBasemap(0)
    expect(map.setStyleCalls).toHaveLength(1)
    expect(map.setStyleCalls[0].style).toBe(BASEMAPS[0].url)
    expect(map.setStyleCalls[0].options).toEqual({ diff: true })
  })

  it('re-adds data layers above the raster basemap layer', async () => {
    const host = createHost(map, BASEMAPS, () => {
      // Stands in for StacMapLayer.readdAfterStyleChange(): re-add the
      // collection's layers after the basemap style settles.
      map.addLayer({ id: 'stl-data-fill', type: 'fill' })
      map.addLayer({ id: 'stl-data-point', type: 'circle' })
    })

    await host.switchBasemap(1)

    const ids = map.layers.map(l => l.id)
    const rasterIdx = ids.indexOf('raster-basemap-layer')
    expect(rasterIdx).toBeGreaterThanOrEqual(0)
    expect(ids.indexOf('stl-data-fill')).toBeGreaterThan(rasterIdx)
    expect(ids.indexOf('stl-data-point')).toBeGreaterThan(rasterIdx)
  })

  it('re-adds data layers after switching from raster back to a vector basemap', async () => {
    let readds = 0
    const host = createHost(map, BASEMAPS, () => {
      readds++
      map.addLayer({ id: 'stl-data-point', type: 'circle' })
    })

    await host.switchBasemap(1)
    await host.switchBasemap(0)

    expect(readds).toBe(2)
    expect(map.getLayer('stl-data-point')).toBeTruthy()
    // Object style forced full load; URL style left on the default diff path.
    expect(map.setStyleCalls.map(c => c.options)).toEqual([{ diff: false }, { diff: true }])
  })

  it('initial basemap load also bypasses style diffing', async () => {
    const host = createHost(map, BASEMAPS, () => {
      map.addLayer({ id: 'stl-data-point', type: 'circle' })
    })
    host._loadBasemapAsync(BASEMAPS[1])
    await Promise.resolve() // let the fake's deferred style.load fire
    expect(map.setStyleCalls[0].options).toEqual({ diff: false })
    const ids = map.layers.map(l => l.id)
    expect(ids.indexOf('stl-data-point')).toBeGreaterThan(ids.indexOf('raster-basemap-layer'))
  })
})
