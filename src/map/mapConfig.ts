import type { StyleSpecification } from 'maplibre-gl';

const ICGC_TOPOGRAPHIC_TILES =
  'https://geoserveis.icgc.cat/servei/catalunya/mapa-base/wmts/topografic/MON3857NW/{z}/{x}/{y}.png';

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
  },
  layers: [
    {
      id: 'icgc-topographic-raster',
      type: 'raster',
      source: 'icgc-topographic',
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
