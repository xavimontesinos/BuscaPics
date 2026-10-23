import type { VerticalReference } from "./types";

/** Spatial bounds are expressed in the units and axis order of the horizontal CRS. */
export interface TerrainSpatialExtent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A license may remain explicitly pending while a dataset is being assessed. */
export type DatasetLicense =
  | { status: "confirmed"; identifier: string; attribution: string }
  | { status: "pending"; note: string };

/** Vertical metadata is separate from the horizontal coordinate system. */
export type DatasetVerticalReference =
  | { status: "confirmed"; reference: VerticalReference; units: "metres" }
  | { status: "pending"; note: string };

export type NoDataPolicy =
  | { kind: "value"; value: number }
  | { kind: "nan" }
  | { kind: "mask" }
  | { kind: "value-or-mask"; value: number };

/** Standard six-coefficient affine transform from pixel corners to CRS coordinates. */
export interface RasterAffineTransform {
  originX: number;
  pixelX: number;
  rowX: number;
  originY: number;
  pixelY: number;
  rowY: number;
}

/** Metadata required to interpret a raster dataset without guessing its provenance or references. */
export interface TerrainDatasetMetadata {
  id: string;
  producer: string;
  source: string;
  version: string;
  dataDate: string | null;
  license: DatasetLicense;
  nominalResolutionMeters: number;
  effectiveResolutionMeters: number;
  extent: TerrainSpatialExtent;
  horizontalCrs: { code: string; definition?: string };
  verticalReference: DatasetVerticalReference;
  format: string;
  width: number;
  height: number;
  geotransform: RasterAffineTransform;
  noData: NoDataPolicy;
  blockSize?: { width: number; height: number };
}

export interface TerrainMetadataValidation {
  valid: boolean;
  errors: string[];
}

/** Checks structural completeness and rejects unresolved license/reference metadata. */
export function validateTerrainDatasetMetadata(
  metadata: TerrainDatasetMetadata,
): TerrainMetadataValidation {
  const errors: string[] = [];
  if (!metadata.id.trim()) errors.push("Dataset id is required");
  if (!metadata.producer.trim()) errors.push("Producer is required");
  if (!metadata.source.trim()) errors.push("Source is required");
  if (!metadata.version.trim()) errors.push("Version is required");
  if (!metadata.dataDate || !isIsoDate(metadata.dataDate)) errors.push("A valid data date is required");
  if (metadata.license.status !== "confirmed") errors.push("Dataset license is not confirmed");
  else if (!metadata.license.identifier.trim() || !metadata.license.attribution.trim()) {
    errors.push("Confirmed license identifier and attribution are required");
  }
  if (!isPositiveFinite(metadata.nominalResolutionMeters)) errors.push("Nominal resolution must be positive");
  if (!isPositiveFinite(metadata.effectiveResolutionMeters)) errors.push("Effective resolution must be positive");
  if (!isFiniteExtent(metadata.extent)) errors.push("Extent must contain finite, increasing bounds");
  if (!metadata.horizontalCrs.code.trim()) errors.push("Horizontal CRS code is required");
  if (metadata.verticalReference.status !== "confirmed") errors.push("Vertical reference is not confirmed");
  else if (!isValidVerticalReference(metadata.verticalReference.reference)) {
    errors.push("Confirmed vertical reference must have a type and name");
  }
  if (metadata.verticalReference.status === "confirmed" && metadata.verticalReference.units !== "metres") {
    errors.push("Vertical units must be metres");
  }
  if (!metadata.format.trim()) errors.push("Raster format is required");
  if (!Number.isSafeInteger(metadata.width) || metadata.width <= 0) errors.push("Raster width must be a positive integer");
  if (!Number.isSafeInteger(metadata.height) || metadata.height <= 0) errors.push("Raster height must be a positive integer");
  if (!isValidTransform(metadata.geotransform)) errors.push("Geotransform must be finite and invertible");
  if (!isValidNoData(metadata.noData)) errors.push("NoData policy is invalid");
  if (
    metadata.blockSize &&
    (!Number.isSafeInteger(metadata.blockSize.width) || metadata.blockSize.width <= 0 ||
      !Number.isSafeInteger(metadata.blockSize.height) || metadata.blockSize.height <= 0)
  ) errors.push("Block dimensions must be positive integers");
  return { valid: errors.length === 0, errors };
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isFiniteExtent(extent: TerrainSpatialExtent): boolean {
  return Number.isFinite(extent.minX) && Number.isFinite(extent.minY) &&
    Number.isFinite(extent.maxX) && Number.isFinite(extent.maxY) &&
    extent.maxX > extent.minX && extent.maxY > extent.minY;
}

function isValidTransform(transform: RasterAffineTransform): boolean {
  const values = Object.values(transform);
  return values.every(Number.isFinite) &&
    Math.abs(transform.pixelX * transform.rowY - transform.rowX * transform.pixelY) > Number.EPSILON;
}

function isValidNoData(policy: NoDataPolicy): boolean {
  return policy.kind === "nan" || policy.kind === "mask" ||
    ((policy.kind === "value" || policy.kind === "value-or-mask") && Number.isFinite(policy.value));
}

function isValidVerticalReference(reference: VerticalReference): boolean {
  return (reference.kind === "ellipsoidal" || reference.kind === "orthometric") &&
    typeof reference.datum === "string" && reference.datum.trim().length > 0;
}
