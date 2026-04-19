export type AgentSessionSettings = {
  model: string
  baseURL: string
  cwd: string
  permissionMode: 'bypassPermissions' | 'acceptEdits' | 'default'
}

export type AgentFingerprintCompatibility =
  | {
      matches: true
      fingerprintVersion: 1 | 2
      savedModel: string | null
    }
  | {
      matches: false
      reason:
        | 'invalid_format'
        | 'baseURL_mismatch'
        | 'cwd_mismatch'
        | 'permissionMode_mismatch'
      fingerprintVersion: 1 | 2 | null
      savedModel: string | null
    }

export function buildAgentFingerprint(
  settings: AgentSessionSettings,
): string

export function getAgentFingerprintCompatibility(
  fingerprint: string,
  settings: AgentSessionSettings,
): AgentFingerprintCompatibility
