import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const helperPath = join(
  __dirname,
  '..',
  'electron',
  'main',
  'agentSessionFingerprint.js',
)

if (!existsSync(helperPath)) {
  throw new Error(`找不到源码 helper：${helperPath}`)
}

const {
  buildAgentFingerprint,
  getAgentFingerprintCompatibility,
} = await import(pathToFileURL(helperPath).href)

const baseSettings = {
  model: 'anthropic/claude-opus-4.6',
  baseURL: 'https://openrouter.ai/api',
  cwd: '/tmp/open|claude|cwd',
  permissionMode: 'bypassPermissions',
}

const switchedModelSettings = {
  ...baseSettings,
  model: 'anthropic/claude-sonnet-4.6',
}

const legacyFingerprint = [
  '1',
  baseSettings.model,
  baseSettings.baseURL,
  baseSettings.cwd,
  baseSettings.permissionMode,
].join('|')

assert.equal(
  getAgentFingerprintCompatibility(
    buildAgentFingerprint(baseSettings),
    switchedModelSettings,
  ).matches,
  true,
  '新指纹应允许同一 provider 下切模型后恢复上下文',
)

assert.deepEqual(
  getAgentFingerprintCompatibility(legacyFingerprint, switchedModelSettings),
  {
    matches: true,
    fingerprintVersion: 1,
    savedModel: baseSettings.model,
  },
  '旧指纹应兼容同 provider 下切模型恢复上下文',
)

assert.deepEqual(
  getAgentFingerprintCompatibility(legacyFingerprint, {
    ...switchedModelSettings,
    baseURL: 'https://api.anthropic.com',
  }),
  {
    matches: false,
    reason: 'baseURL_mismatch',
    fingerprintVersion: 1,
    savedModel: baseSettings.model,
  },
  '切 provider 时仍应拒绝恢复旧上下文',
)

console.log('[smoke:model-switch] PASS')
