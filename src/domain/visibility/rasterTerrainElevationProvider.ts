import type { GeographicPosition, TerrainElevationLookup, VerticalReference } from "./types";
import type { PreparedRasterElevationProvider } from "./rasterElevationProvider";
import type { TerrainElevationProvider } from "./lineOfSight";

/**
 * Adapts prepared raster lookups to the visibility domain contract.
 * The expected reference must be selected by the caller for the elevations used
 * in a calculation; this adapter never converts vertical datums.
 */
export class RasterTerrainElevationProvider implements TerrainElevationProvider {
  constructor(
    private readonly raster: Pick<PreparedRasterElevationProvider, "getElevationAt">,
    private readonly expectedVerticalReference: VerticalReference,
  ) {
    if (!isValidReference(expectedVerticalReference)) {
      throw new RangeError("A valid expected vertical reference is required");
    }
  }

  getElevationAt(position: GeographicPosition): TerrainElevationLookup {
    return this.raster.getElevationAt(position, this.expectedVerticalReference);
  }
}

function isValidReference(reference: VerticalReference): boolean {
  return (reference.kind === "ellipsoidal" || reference.kind === "orthometric") &&
    typeof reference.datum === "string" && reference.datum.trim().length > 0;
}
