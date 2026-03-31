/**
 * Shim for bun:bundle imports.
 * In the original Claude Code, these are Bun build-time macros
 * that get replaced at compile time. In Node.js runtime,
 * feature() always returns false (all features disabled by default).
 */

export function feature(_name: string): boolean {
  // All feature gates default to false in non-Bun environments.
  // This means optional/gated features won't be active unless
  // explicitly enabled.
  return false
}

export function embed(_path: string): any {
  return null
}

export const MACRO: any = {
  VERSION: '2.1.88',
  VERSION_CHANGELOG: '',
  ISSUES_EXPLAINER: 'report the issue at https://github.com/shipany-ai/open-agent-sdk/issues',
  BUILD_TIME: new Date().toISOString(),
  COMMIT_HASH: 'dev',
}
