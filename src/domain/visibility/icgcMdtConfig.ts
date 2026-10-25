export const ICGC_MDT_UPSTREAM_ORIGIN = "https://datacloud.icgc.cat";
export const ICGC_MDT_UPSTREAM_PATH =
  "/datacloud/model-elevacions-terreny/tif_unzip/model-elevacions-terreny-lidar-catalunya-5m-2021-2023.tif";
export const ICGC_MDT_SOURCE_URL = ICGC_MDT_UPSTREAM_ORIGIN + ICGC_MDT_UPSTREAM_PATH;
export const ICGC_MDT_DEV_PROXY_PATH = "/__icgc_mdt__";

/** Use Vite's same-origin proxy only during development; production keeps the official URL. */
export function getIgcMdtUrl(isDevelopment: boolean): string {
  return isDevelopment ? ICGC_MDT_DEV_PROXY_PATH : ICGC_MDT_SOURCE_URL;
}
