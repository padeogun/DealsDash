// Firestore document size guard.
// Firestore's hard limit is 1 MiB (1,048,576 bytes) per document.
// We warn early and block before the limit to prevent silent write failures.

export const WARN_BYTES  = 700_000;   // warn at ~700 KB
export const BLOCK_BYTES = 950_000;   // block at ~950 KB — leaves 100 KB headroom

/**
 * Estimate UTF-8 byte length of a Firestore document.
 * Uses TextEncoder (browsers + Node 11+) falling back to Buffer in Node
 * or a conservative char-count estimate.
 */
export function estimateDocSize(obj) {
  const str = JSON.stringify(obj);
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str).length;
  if (typeof Buffer !== "undefined") return Buffer.byteLength(str, "utf8");
  return Math.ceil(str.length * 1.1);  // ASCII-dominant content: chars ≈ bytes
}

/**
 * Check a document against the size thresholds.
 * @returns {{ bytes:number, ok:boolean, warn:boolean, block:boolean }}
 */
export function checkDocSize(obj) {
  const bytes = estimateDocSize(obj);
  return {
    bytes,
    ok:    bytes < WARN_BYTES,
    warn:  bytes >= WARN_BYTES  && bytes < BLOCK_BYTES,
    block: bytes >= BLOCK_BYTES,
  };
}
