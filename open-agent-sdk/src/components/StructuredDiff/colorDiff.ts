// @ts-nocheck
import { isEnvDefinedFalsy } from '../../utils/envUtils.js'

export type SyntaxTheme = any
export type ColorModuleUnavailableReason = 'env' | 'missing'

let _mod: any = null
let _loaded = false
function loadModule(): any {
  if (!_loaded) {
    _loaded = true
    try { _mod = require('color-diff-napi') } catch { _mod = null }
  }
  return _mod
}

/**
 * Returns a static reason why the color-diff module is unavailable, or null if available.
 * 'env' = disabled via CLAUDE_CODE_SYNTAX_HIGHLIGHT
 * 'missing' = color-diff-napi package not installed
 */
export function getColorModuleUnavailableReason(): ColorModuleUnavailableReason | null {
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_SYNTAX_HIGHLIGHT)) {
    return 'env'
  }
  if (!loadModule()) {
    return 'missing'
  }
  return null
}

export function expectColorDiff(): any | null {
  const mod = loadModule()
  return getColorModuleUnavailableReason() === null ? mod?.ColorDiff : null
}

export function expectColorFile(): any | null {
  const mod = loadModule()
  return getColorModuleUnavailableReason() === null ? mod?.ColorFile : null
}

export function getSyntaxTheme(themeName: string): SyntaxTheme | null {
  const mod = loadModule()
  return getColorModuleUnavailableReason() === null
    ? mod?.getSyntaxTheme?.(themeName)
    : null
}
