/**
 * device.ts — Device capability detection utilities.
 */

/**
 * Detect whether the current device is a touch/coarse-pointer device.
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || window.matchMedia('(pointer:coarse)').matches;
}
