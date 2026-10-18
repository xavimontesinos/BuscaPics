import type { StyleSpecification } from 'maplibre-gl';

const ICGC_TOPOGRAPHIC_TILES =
  'https://geoserveis.icgc.cat/servei/catalunya/mapa-base/wmts/topografic-mut/MON3857NW/{z}/{x}/{y}.png';
const ICGC_POPULATION_LABELS = '/data/localitats-baga-10km.geojson';
const EMPTY_PEAK_FEATURES = { type: 'FeatureCollection' as const, features: [] };

export const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'icgc-topographic': {
      type: 'raster',
      tiles: [ICGC_TOPOGRAPHIC_TILES],
      tileSize: 256,
      minzoom: 9,
      maxzoom: 14,
      attribution:
        '<a href="https://www.icgc.cat/" target="_blank" rel="noopener noreferrer">© ICGC</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>',
    },
    'icgc-population-labels': {
      type: 'geojson',
      data: ICGC_POPULATION_LABELS,
    },
    'peak-candidates': {
      type: 'geojson',
      data: EMPTY_PEAK_FEATURES,
    },
  },
  layers: [
    {
      id: 'icgc-topographic-raster',
      type: 'raster',
      source: 'icgc-topographic',
    },
    {
      id: 'icgc-population-labels-symbols',
      type: 'symbol',
      source: 'icgc-population-labels',
      minzoom: 9,
      filter: ['==', ['get', 'CATEGORIA'], 'Àrees de poblament'],
      layout: {
        'symbol-placement': 'point',
        'symbol-sort-key': [
          'case',
          ['==', ['get', 'CAPCOMAR'], 'si'],
          0,
          ['==', ['get', 'CAPMUNI'], 'si'],
          1,
          2,
        ],
        'text-field': ['get', 'NOM'],
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          9,
          10,
          12,
          11,
          14,
          12,
        ],
        'text-rotation-alignment': 'viewport',
        'text-pitch-alignment': 'viewport',
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-padding': 3,
      },
      paint: {
        'text-color': '#263238',
        'text-halo-color': '#fffdf5',
        'text-halo-width': 1.5,
        'text-halo-blur': 0.25,
      },
    },
    {
      id: 'peak-candidate-markers',
      type: 'circle',
      source: 'peak-candidates',
      minzoom: 9,
      paint: {
        'circle-radius': 4,
        'circle-color': '#9b674e',
        'circle-stroke-color': '#fffdf5',
        'circle-stroke-width': 1.5,
      },
    },
    {
      id: 'peak-candidate-labels',
      type: 'symbol',
      source: 'peak-candidates',
      minzoom: 9,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 9, 11, 12, 12, 14, 13],
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-rotation-alignment': 'viewport',
        'text-pitch-alignment': 'viewport',
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-padding': 3,
      },
      paint: {
        'text-color': '#573d31',
        'text-halo-color': '#fffdf5',
        'text-halo-width': 1.5,
        'text-halo-blur': 0.25,
      },
    },
  ],
};

// Derived from the EPSG:3857 example extent published by the ICGC.
export const INITIAL_MAP_VIEW = {
  center: [2.76855, 42.13082] as [number, number],
  zoom: 14,
  minZoom: 9,
  maxZoom: 14,
};
