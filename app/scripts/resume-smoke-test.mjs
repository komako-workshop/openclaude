import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import os from 'os'
import { join } from 'path'

import { createAgent } from '@shipany/open-agent-sdk'

const AGENT_SESSION_VERSION = 1
const AGENT_PROMPT_FINGERPRINT_VERSION = 1

const DEFAULT_SETTINGS = {
  apiKey: '',
  baseURL: 'https://openrouter.ai/api',
  model: 'anthropic/claude-sonnet-4-6',
  cwd: os.homedir(),
  permissionMode: 'bypassPermissions',
}

const PROMPT_MARKER = 'You are OpenClaude, a versatile AI assistant with powerful coding tools.'
const URL_MARKER = 'You may provide well-known URLs when the user asks'
const SCOPE_MARKER = 'The user may request coding tasks'
const OUTPUT_STYLE_MARKER = 'You are a versatile AI assistant with powerful coding tools.'

const REMEMBER_PHRASE = `lunar-fig-${randomUUID().slice(0, 8)}`
const CONVERSATION_ID = `smoke-resume-${Date.now()}-${randomUUID().slice(0, 8)}`

let tempSessionPath = null

function getAppDataPath() {
  if (process.platform === 'darwin') {
    return join(os.homedir(), 'Library', 'Application Support')
  }

  if (process.platform === 'win32') {
    return process.env.APPDATA ?? join(os.homedir(), 'AppData', 'Roaming')
  }

  return process.env.XDG_CONFIG_HOME ?? join(os.homedir(), '.config')
}

function getUserDataPath() {
  return join(getAppDataPath(), 'OpenClaude')
}

function getConfigPath() {
  return join(getUserDataPath(), 'settings.json')
}

function getAgentStatePath(conversationId) {
  return join(getUserDataPath(), 'agent-sessions', `${conversationId}.json`)
}

function buildAgentFingerprint(settings) {
  return [
    AGENT_PROMPT_FINGERPRINT_VERSION,
    settings.model,
    settings.baseURL,
    settings.cwd,
    settings.permissionMode,
  ].join('|')
}

function loadSettings() {
  const configPath = getConfigPath()
  if (!existsSync(configPath)) {
    throw new Error(`找不到设置文件：${configPath}`)
  }

  const loaded = JSON.parse(readFileSync(configPath, 'utf8'))
  const settings = { ...DEFAULT_SETTINGS, ...loaded }

  if (!settings.apiKey) {
    throw new Error('当前未配置 API key，无法运行 smoke test')
  }

  return settings
}

function readRuntimePromptStatus() {
  const promptsPath = join(
    process.cwd(),
    'node_modules',
    '@shipany',
    'open-agent-sdk',
    'dist',
    'constants',
    'prompts.js',
  )
  const outputStylesPath = join(
    process.cwd(),
    'node_modules',
    '@shipany',
    'open-agent-sdk',
    'dist',
    'constants',
    'outputStyles.js',
  )

  const prompts = readFileSync(promptsPath, 'utf8')
  const outputStyles = readFileSync(outputStylesPath, 'utf8')

  return {
    promptIdentityPatched: prompts.includes(PROMPT_MARKER),
    promptAllowsUrls: prompts.includes(URL_MARKER),
    promptSupportsGeneralTasks: prompts.includes(SCOPE_MARKER),
    outputStylePatched: outputStyles.includes(OUTPUT_STYLE_MARKER),
  }
}

function getTranscriptMessages(agent) {
  if (!agent || typeof agent.getMessages !== 'function') return []

  const messages = agent.getMessages()
  if (!Array.isArray(messages)) return []

  return messages.filter((message) =>
    typeof message === 'object'
    && message !== null
    && 'type' in message
    && ['user', 'assistant', 'system', 'attachment'].includes(String(message.type)),
  )
}

function saveAgentMessages(conversationId, settings, messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('没有可持久化的 transcript 消息')
  }

  const sessionPath = getAgentStatePath(conversationId)
  mkdirSync(join(getUserDataPath(), 'agent-sessions'), { recursive: true })
  writeFileSync(sessionPath, JSON.stringify({
    version: AGENT_SESSION_VERSION,
    conversationId,
    fingerprint: buildAgentFingerprint(settings),
    messages,
    updatedAt: Date.now(),
  }, null, 2))
  tempSessionPath = sessionPath
  return sessionPath
}

function loadAgentMessages(conversationId, settings) {
  const sessionPath = getAgentStatePath(conversationId)
  if (!existsSync(sessionPath)) {
    throw new Error(`找不到会话文件：${sessionPath}`)
  }

  const persisted = JSON.parse(readFileSync(sessionPath, 'utf8'))
  if (persisted.version !== AGENT_SESSION_VERSION) {
    throw new Error(`会话版本不匹配：${persisted.version}`)
  }

  if (persisted.fingerprint !== buildAgentFingerprint(settings)) {
    throw new Error('会话 fingerprint 不匹配')
  }

  if (!Array.isArray(persisted.messages) || persisted.messages.length === 0) {
    throw new Error('恢复到的 transcript 为空')
  }

  return persisted.messages
}

async function runQuery(agent, prompt) {
  let resultEvent = null

  for await (const event of agent.query(prompt)) {
    if (event?.type === 'result') {
      resultEvent = event
    }
  }

  return {
    resultText: typeof resultEvent?.result === 'string' ? resultEvent.result.trim() : '',
    modelUsage: typeof resultEvent?.modelUsage === 'object' && resultEvent?.modelUsage !== null
      ? resultEvent.modelUsage
      : {},
    sessionId: typeof resultEvent?.session_id === 'string' ? resultEvent.session_id : null,
    turnCount: typeof resultEvent?.num_turns === 'number' ? resultEvent.num_turns : null,
    messages: getTranscriptMessages(agent),
  }
}

function normalizeText(value) {
  return value
    .toLowerCase()
    .replace(/[`"'*.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function main() {
  const settings = loadSettings()
  const runtimePromptStatus = readRuntimePromptStatus()
  const runtimePromptOk = Object.values(runtimePromptStatus).every(Boolean)

  assert(runtimePromptOk, '运行时 prompt patch 未完整生效')

  console.log(`[smoke] configured model: ${settings.model}`)
  console.log('[smoke] runtime prompt patch: OK')

  const firstAgent = createAgent({
    model: settings.model,
    apiKey: settings.apiKey,
    baseURL: settings.baseURL,
    cwd: settings.cwd,
    permissionMode: settings.permissionMode,
    includePartialMessages: true,
  })

  const firstRun = await runQuery(
    firstAgent,
    `For a session resume smoke test, remember this exact phrase: ${REMEMBER_PHRASE}. Reply with only READY.`,
  )

  const firstObservedModels = Object.keys(firstRun.modelUsage)
  assert(firstObservedModels.length > 0, '结果事件未返回 modelUsage，无法确认实际模型')
  assert(firstRun.messages.length > 0, '第一轮查询未产出 transcript 消息')

  console.log(`[smoke] first turn result: ${firstRun.resultText || '(empty)'}`)
  console.log(`[smoke] observed models: ${firstObservedModels.join(', ')}`)

  const sessionPath = saveAgentMessages(CONVERSATION_ID, settings, firstRun.messages)
  const restoredMessages = loadAgentMessages(CONVERSATION_ID, settings)

  console.log(`[smoke] persisted transcript messages: ${firstRun.messages.length}`)

  const secondAgent = createAgent({
    model: settings.model,
    apiKey: settings.apiKey,
    baseURL: settings.baseURL,
    cwd: settings.cwd,
    permissionMode: settings.permissionMode,
    includePartialMessages: true,
    initialMessages: restoredMessages,
  })

  const secondRun = await runQuery(
    secondAgent,
    'What exact phrase did I ask you to remember earlier? Reply with only the exact phrase.',
  )

  const recallOk = normalizeText(secondRun.resultText).includes(normalizeText(REMEMBER_PHRASE))
  assert(recallOk, `恢复后的 agent 未正确回忆短语：${REMEMBER_PHRASE}`)

  const observedModels = [...new Set([
    ...firstObservedModels,
    ...Object.keys(secondRun.modelUsage),
  ])]

  console.log(`[smoke] second turn result: ${secondRun.resultText || '(empty)'}`)
  console.log('[smoke] PASS')
  console.log(JSON.stringify({
    configuredModel: settings.model,
    observedModels,
    runtimePromptStatus,
    persistedMessageCount: firstRun.messages.length,
    restoredMessageCount: restoredMessages.length,
    turnCount: {
      first: firstRun.turnCount,
      second: secondRun.turnCount,
    },
    sessionId: secondRun.sessionId ?? firstRun.sessionId,
    tempConversationId: CONVERSATION_ID,
    tempSessionPath: sessionPath,
  }, null, 2))
}

let exitCode = 0

try {
  await main()
} catch (error) {
  exitCode = 1
  console.error('[smoke] FAIL')
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
} finally {
  if (tempSessionPath) {
    rmSync(tempSessionPath, { force: true })
  }
  setTimeout(() => process.exit(exitCode), 0)
}
