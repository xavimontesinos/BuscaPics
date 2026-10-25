import { GeoTiffRasterBlockReader } from "./geoTiffRasterBlockReader";
import { Proj4HorizontalCoordinateTransformer } from "./Proj4HorizontalCoordinateTransformer";
import type { GeographicPosition, TerrainElevationLookup } from "./types";
import { PreparedRasterElevationProvider } from "./rasterElevationProvider";
import { getIgcMdtUrl, ICGC_MDT_SOURCE_URL } from "./icgcMdtConfig";

const ICGC_MDT_URL = getIgcMdtUrl(import.meta.env.DEV);
const WGS84 = {
  kind: "geographic" as const, code: "EPSG:4326", axisOrder: "longitude-latitude" as const, angularUnit: "degree" as const,
};
const ETRS89_UTM31 = { kind: "projected" as const, code: "EPSG:25831", axisOrder: "x-y" as const, linearUnit: "metre" };
const transformer = new Proj4HorizontalCoordinateTransformer([
  { code: "EPSG:4326", definition: "+proj=longlat +datum=WGS84 +no_defs +type=crs" },
  { code: "EPSG:25831", definition: "+proj=utm +zone=31 +ellps=GRS80 +units=m +no_defs +type=crs" },
]);
let providerPromise: Promise<PreparedRasterElevationProvider> | null = null;

function getProvider(): Promise<PreparedRasterElevationProvider> {
  if (!providerPromise) {
    providerPromise = GeoTiffRasterBlockReader.open(ICGC_MDT_URL, {
      product: {
        id: "model-elevacions-terreny-lidar-catalunya-5m-2021-2023",
        producer: "Institut Cartogràfic i Geològic de Catalunya",
        source: ICGC_MDT_SOURCE_URL,
        version: "2021-2023",
        dataDate: "2023-11-20",
        license: { status: "confirmed", identifier: "CC BY 4.0", attribution: "Institut Cartogràfic i Geològic de Catalunya (ICGC)" },
        nominalResolutionMeters: 5,
        effectiveResolutionMeters: 5,
        horizontalCrs: { code: "EPSG:25831" },
        verticalReference: { status: "confirmed", reference: { kind: "orthometric", datum: "EGM08D595" }, units: "metres" },
      },
      imageIndex: 0,
      sampleIndex: 0,
    }).then((opened) => new PreparedRasterElevationProvider(
      opened.metadata, opened.reader, transformer, WGS84, ETRS89_UTM31,
    )).catch((error: unknown) => {
      providerPromise = null;
      throw error;
    });
  }
  return providerPromise;
}

/** Queries one observer location from the official COG; reads only the containing raster block. */
export async function getIgcObserverGroundElevation(position: GeographicPosition): Promise<TerrainElevationLookup> {
  try {
    const provider = await getProvider();
    await provider.prepareForPositions([position]);
    const result = provider.getElevationAt(position);
    if (result.state !== "available") return { state: result.state };
    return { state: "available", sample: { ...result.sample, position } };
  } catch {
    // Network, COG, or coordinate-transform failures are explicitly unknown to the UI.
    return { state: "missing" };
  }
}

/** Prepares only blocks touched by a visibility path, using the same cached COG reader. */
export async function prepareIgcTerrain(positions: readonly GeographicPosition[]): Promise<PreparedRasterElevationProvider> {
  const provider = await getProvider();
  await provider.prepareForPositions(positions);
  return provider;
}
