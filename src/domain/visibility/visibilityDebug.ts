/** Opt-in, bounded browser diagnostics for tracing one visibility update. */
export function visibilityDebug(stage: string, details: unknown): void {
  if (import.meta.env.DEV && typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("visibilityDebug") === "1") {
    console.info(`[visibility-debug] ${stage}`, details);
  }
}
