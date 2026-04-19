const AGENT_PROMPT_FINGERPRINT_VERSION = 2

function parsePermissionMode(value) {
  if (
    value === 'bypassPermissions'
    || value === 'acceptEdits'
    || value === 'default'
  ) {
    return value
  }
  return null
}

function parseAgentFingerprint(fingerprint) {
  const firstSep = fingerprint.indexOf('|')
  if (firstSep === -1) return null

  const versionText = fingerprint.slice(0, firstSep)

  if (versionText === '1') {
    const secondSep = fingerprint.indexOf('|', firstSep + 1)
    const thirdSep = fingerprint.indexOf('|', secondSep + 1)
    const lastSep = fingerprint.lastIndexOf('|')

    if (secondSep === -1 || thirdSep === -1 || lastSep <= thirdSep) {
      return null
    }

    const permissionMode = parsePermissionMode(fingerprint.slice(lastSep + 1))
    if (!permissionMode) return null

    return {
      version: 1,
      model: fingerprint.slice(firstSep + 1, secondSep),
      baseURL: fingerprint.slice(secondSep + 1, thirdSep),
      cwd: fingerprint.slice(thirdSep + 1, lastSep),
      permissionMode,
    }
  }

  if (versionText === '2') {
    const secondSep = fingerprint.indexOf('|', firstSep + 1)
    const lastSep = fingerprint.lastIndexOf('|')

    if (secondSep === -1 || lastSep <= secondSep) {
      return null
    }

    const permissionMode = parsePermissionMode(fingerprint.slice(lastSep + 1))
    if (!permissionMode) return null

    return {
      version: 2,
      model: null,
      baseURL: fingerprint.slice(firstSep + 1, secondSep),
      cwd: fingerprint.slice(secondSep + 1, lastSep),
      permissionMode,
    }
  }

  return null
}

export function buildAgentFingerprint(settings) {
  return [
    AGENT_PROMPT_FINGERPRINT_VERSION,
    settings.baseURL,
    settings.cwd,
    settings.permissionMode,
  ].join('|')
}

export function getAgentFingerprintCompatibility(fingerprint, settings) {
  const parsed = parseAgentFingerprint(fingerprint)
  if (!parsed) {
    return {
      matches: false,
      reason: 'invalid_format',
      fingerprintVersion: null,
      savedModel: null,
    }
  }

  if (parsed.baseURL !== settings.baseURL) {
    return {
      matches: false,
      reason: 'baseURL_mismatch',
      fingerprintVersion: parsed.version,
      savedModel: parsed.model,
    }
  }

  if (parsed.cwd !== settings.cwd) {
    return {
      matches: false,
      reason: 'cwd_mismatch',
      fingerprintVersion: parsed.version,
      savedModel: parsed.model,
    }
  }

  if (parsed.permissionMode !== settings.permissionMode) {
    return {
      matches: false,
      reason: 'permissionMode_mismatch',
      fingerprintVersion: parsed.version,
      savedModel: parsed.model,
    }
  }

  return {
    matches: true,
    fingerprintVersion: parsed.version,
    savedModel: parsed.model,
  }
}
