/**
 * Shim for react/compiler-runtime.
 * The React compiler uses this at build time; at runtime we just need
 * the 'c' function (cache slot accessor) to be a no-op.
 */
export function c(size: number): any[] {
  return new Array(size)
}
export default c
