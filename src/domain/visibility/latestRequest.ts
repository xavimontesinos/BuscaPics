/** Guards async map work against results started for an earlier observer position. */
export function isLatestRequest(requestId: number, latestRequestId: number): boolean {
  return requestId === latestRequestId;
}
