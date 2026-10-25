import {
  ICGC_MDT_DEV_PROXY_PATH,
  ICGC_MDT_UPSTREAM_ORIGIN,
  ICGC_MDT_UPSTREAM_PATH,
} from "../src/domain/visibility/icgcMdtConfig";

/** Vite streams byte-range requests to the official COG through a same-origin path. */
export function createIgcMdtProxy(target = ICGC_MDT_UPSTREAM_ORIGIN) {
  return {
    [ICGC_MDT_DEV_PROXY_PATH]: {
      target,
      changeOrigin: true,
      secure: true,
      rewrite: (path: string) => path.replace(ICGC_MDT_DEV_PROXY_PATH, ICGC_MDT_UPSTREAM_PATH),
    },
  };
}
