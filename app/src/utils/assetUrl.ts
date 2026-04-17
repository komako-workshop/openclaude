// Resolves a packaged asset shipped in `public/` so it loads correctly in both
// Vite dev (served from `/`) and the packaged Electron build (loaded via
// `file://.../app.asar/dist/index.html`).
//
// We intentionally avoid two patterns that Vite / rollup will statically
// rewrite at build time:
//   - literal `./foo.png` arg to `new URL(..., window.location.href)`
//   - `new URL('./foo.png', import.meta.url)`
// Both get collapsed to an absolute root URL like `/foo.png`, which is fine in
// dev but points at `file:///foo.png` in the packaged app (→ broken image).
//
// Instead we feed the filename through an indirection and resolve against
// `document.baseURI` at runtime, which always matches the loaded index.html.
export function resolveAppAssetUrl(relativePath: string): string {
  const filename = stripLeadingDot(relativePath)
  if (typeof document !== 'undefined' && document.baseURI) {
    return new URL(filename, document.baseURI).href
  }
  if (typeof window !== 'undefined' && window.location?.href) {
    return new URL(filename, window.location.href).href
  }
  return filename
}

function stripLeadingDot(value: string): string {
  if (value.startsWith('./')) return value.slice(2)
  return value
}
