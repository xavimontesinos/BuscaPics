export const ICGC_MDT_UPSTREAM_ORIGIN = "https://datacloud.icgc.cat";
export const ICGC_MDT_UPSTREAM_PATH =
  "/datacloud/model-elevacions-terreny/tif_unzip/model-elevacions-terreny-lidar-catalunya-5m-2021-2023.tif";
export const ICGC_MDT_SOURCE_URL = ICGC_MDT_UPSTREAM_ORIGIN + ICGC_MDT_UPSTREAM_PATH;
export const ICGC_MDT_DEV_PROXY_PATH = "/__icgc_mdt__";

/** Use Vite locally and the fixed-resource CORS Worker on production static hosting. */
export function getIgcMdtUrl(isDevelopment: boolean, productionWorkerUrl?: string): string {
  if (isDevelopment) return ICGC_MDT_DEV_PROXY_PATH;
  const configuredUrl = productionWorkerUrl?.trim();
  return configuredUrl ? configuredUrl : ICGC_MDT_SOURCE_URL;
}
