import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } from 'electron'
import { dirname, join } from 'path'
import * as fs from 'fs'
import * as os from 'os'

let mainWindow: BrowserWindow | null = null

const APP_DATA_OVERRIDE = process.env.OPENCLAUDE_APPDATA_DIR?.trim()
if (APP_DATA_OVERRIDE) {
  fs.mkdirSync(APP_DATA_OVERRIDE, { recursive: true })
  app.setPath('appData', APP_DATA_OVERRIDE)
  app.setPath('userData', join(APP_DATA_OVERRIDE, 'openclaude'))
}

type AgentRuntime = {
  agent: any
  settingsKey: string
  conversationId: string | null
}

const agentRuntimes = new Map<string, AgentRuntime>()
const activeAbortControllers = new Map<string, AbortController>()
const deletedConversationIds = new Set<string>()
const AGENT_SESSION_VERSION = 1
const AGENT_PROMPT_FINGERPRINT_VERSION = 1

function buildSettingsKey(s: Settings): string {
  return `${s.model}|${s.apiKey}|${s.baseURL}|${s.cwd}|${s.permissionMode}`
}

function logAgentSession(event: string, details: Record<string, unknown>) {
  console.log(`[agent-session] ${event} ${JSON.stringify(details)}`)
}

const PRELOAD_PATH = join(__dirname, '../preload/index.js')
const isDev = !app.isPackaged
const USER_DATA_PATH = join(app.getPath('appData'), 'OpenClaude')
const LEGACY_USER_DATA_PATHS = [
  app.getPath('userData'),
  join(app.getPath('appData'), 'Electron'),
  join(app.getPath('appData'), 'openclaude'),
]
  .filter((path, index, paths) => path !== USER_DATA_PATH && paths.indexOf(path) === index)
const CONFIG_PATH = join(USER_DATA_PATH, 'settings.json')
const CHAT_STATE_PATH = join(USER_DATA_PATH, 'chat-state.json')
const AGENT_STATE_DIR = join(USER_DATA_PATH, 'agent-sessions')
const LEGACY_CONFIG_PATHS = LEGACY_USER_DATA_PATHS.map((path) => join(path, 'settings.json'))
const LEGACY_CHAT_STATE_PATHS = LEGACY_USER_DATA_PATHS.map((path) => join(path, 'chat-state.json'))

// ---------------------------------------------------------------------------
// Settings persistence
// ---------------------------------------------------------------------------

type Settings = {
  apiKey: string
  baseURL: string
  model: string
  cwd: string
  permissionMode: 'bypassPermissions' | 'acceptEdits' | 'default'
}

type PersistedChatState = {
  conversations: unknown[]
  activeId: string | null
}

type PersistedAgentSession = {
  version: number
  conversationId: string
  fingerprint: string
  messages: unknown[]
  updatedAt: number
}

const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  baseURL: 'https://openrouter.ai/api',
  model: 'anthropic/claude-sonnet-4.6',
  cwd: os.homedir(),
  permissionMode: 'bypassPermissions',
}

function readJSONFile<T>(paths: string[]): T | null {
  for (const filePath of paths) {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T
      }
    } catch { /* ignore */ }
  }
  return null
}

function writeJSONFile(filePath: string, value: unknown) {
  fs.mkdirSync(dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2))
}

function hasMeaningfulChatState(state: PersistedChatState | null): state is PersistedChatState {
  return Boolean(
    state && (
      state.conversations.length > 1 ||
      state.conversations.some((conversation) =>
        typeof conversation === 'object' &&
        conversation !== null &&
        Array.isArray((conversation as { messages?: unknown[] }).messages) &&
        ((conversation as { messages?: unknown[] }).messages?.length ?? 0) > 0,
      )
    ),
  )
}

function loadSettings(): Settings {
  const loaded = readJSONFile<Partial<Settings>>([CONFIG_PATH, ...LEGACY_CONFIG_PATHS])
  return loaded ? { ...DEFAULT_SETTINGS, ...loaded } : { ...DEFAULT_SETTINGS }
}

function saveSettings(s: Settings) {
  writeJSONFile(CONFIG_PATH, s)
}

function loadChatState(): PersistedChatState | null {
  const primary = readJSONFile<PersistedChatState>([CHAT_STATE_PATH])
  if (hasMeaningfulChatState(primary)) return primary

  const legacy = readJSONFile<PersistedChatState>(LEGACY_CHAT_STATE_PATHS)
  if (hasMeaningfulChatState(legacy)) return legacy

  return primary ?? legacy
}

function saveChatState(state: PersistedChatState) {
  writeJSONFile(CHAT_STATE_PATH, state)
}

function buildAgentFingerprint(settings: Settings): string {
  return [
    AGENT_PROMPT_FINGERPRINT_VERSION,
    settings.model,
    settings.baseURL,
    settings.cwd,
    settings.permissionMode,
  ].join('|')
}

function getAgentStatePath(conversationId: string): string {
  return join(AGENT_STATE_DIR, `${conversationId}.json`)
}

function loadAgentMessages(conversationId: string, settings: Settings): unknown[] | null {
  const statePath = getAgentStatePath(conversationId)
  const persisted = readJSONFile<PersistedAgentSession>([statePath])
  if (!persisted) {
    logAgentSession('restore-skipped', {
      conversationId,
      reason: 'missing_session_file',
    })
    return null
  }

  if (persisted.version !== AGENT_SESSION_VERSION) {
    logAgentSession('restore-skipped', {
      conversationId,
      reason: 'unsupported_version',
      persistedVersion: persisted.version,
    })
    return null
  }

  const fingerprint = buildAgentFingerprint(settings)
  if (persisted.fingerprint !== fingerprint) {
    logAgentSession('restore-skipped', {
      conversationId,
      reason: 'fingerprint_mismatch',
      updatedAt: persisted.updatedAt,
    })
    return null
  }

  if (!Array.isArray(persisted.messages) || persisted.messages.length === 0) {
    logAgentSession('restore-skipped', {
      conversationId,
      reason: 'empty_messages',
      updatedAt: persisted.updatedAt,
    })
    return null
  }

  logAgentSession('restored', {
    conversationId,
    messageCount: persisted.messages.length,
    updatedAt: persisted.updatedAt,
    sessionFile: statePath,
  })
  return persisted.messages
}

function saveAgentMessages(conversationId: string, settings: Settings, messages: unknown[]) {
  if (!conversationId || !Array.isArray(messages) || messages.length === 0) return
  if (deletedConversationIds.has(conversationId)) {
    logAgentSession('save-skipped', {
      conversationId,
      reason: 'conversation_deleted',
    })
    return
  }

  const statePath = getAgentStatePath(conversationId)
  writeJSONFile(statePath, {
    version: AGENT_SESSION_VERSION,
    conversationId,
    fingerprint: buildAgentFingerprint(settings),
    messages,
    updatedAt: Date.now(),
  } satisfies PersistedAgentSession)

  logAgentSession('saved', {
    conversationId,
    messageCount: messages.length,
    sessionFile: statePath,
  })
}

function deleteAgentSession(conversationId: string): boolean {
  if (!conversationId) return false

  deletedConversationIds.add(conversationId)

  const statePath = getAgentStatePath(conversationId)
  if (!fs.existsSync(statePath)) {
    logAgentSession('delete-skipped', {
      conversationId,
      reason: 'missing_session_file',
    })
    return false
  }

  try {
    fs.unlinkSync(statePath)
    logAgentSession('deleted', {
      conversationId,
      sessionFile: statePath,
    })
    return true
  } catch (error) {
    logAgentSession('delete-failed', {
      conversationId,
      sessionFile: statePath,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

function getAgentKey(conversationId?: string): string {
  return conversationId ?? '__default__'
}

function getAgentMessages(agent: any): unknown[] {
  if (!agent || typeof agent.getMessages !== 'function') return []

  try {
    const messages = agent.getMessages()
    return Array.isArray(messages)
      ? messages.filter((message) =>
          typeof message === 'object'
          && message !== null
          && 'type' in message
          && ['user', 'assistant', 'system', 'attachment'].includes(String(message.type)),
        )
      : []
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// MCP server config (read from ~/.claude.json)
// ---------------------------------------------------------------------------

function loadMcpServers(): Record<string, unknown> | undefined {
  try {
    const claudeJsonPath = join(os.homedir(), '.claude.json')
    if (!fs.existsSync(claudeJsonPath)) return undefined
    const data = JSON.parse(fs.readFileSync(claudeJsonPath, 'utf-8'))
    const servers = data?.mcpServers
    if (servers && typeof servers === 'object' && Object.keys(servers).length > 0) {
      console.log(`[mcp] Loaded ${Object.keys(servers).length} MCP server(s): ${Object.keys(servers).join(', ')}`)
      return servers
    }
  } catch (err) {
    console.error(`[mcp] Failed to load MCP config: ${err}`)
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Agent bridge (lazy-loaded to avoid startup penalty)
// ---------------------------------------------------------------------------

let agentModule: any = null

async function getAgentModule() {
  if (!agentModule) {
    agentModule = await import('@shipany/open-agent-sdk')
  }
  return agentModule
}

async function getOrCreateAgent(settings: Settings, conversationId?: string): Promise<any> {
  const settingsKey = buildSettingsKey(settings)
  const agentKey = getAgentKey(conversationId)
  const existing = agentRuntimes.get(agentKey)
  if (existing && existing.settingsKey === settingsKey) {
    logAgentSession('reused', {
      conversationId: conversationId ?? null,
      settingsChanged: false,
      conversationChanged: false,
    })
    return existing.agent
  }

  const creationReason = !existing ? 'first_agent' : 'settings_changed'
  if (existing?.agent) {
    try { existing.agent.clear() } catch { /* ignore */ }
  }
  const restoredMessages = conversationId ? loadAgentMessages(conversationId, settings) : null
  const mcpServers = loadMcpServers()
  const { createAgent } = await getAgentModule()
  const agent = createAgent({
    model: settings.model,
    apiKey: settings.apiKey,
    baseURL: settings.baseURL,
    cwd: settings.cwd,
    permissionMode: settings.permissionMode,
    includePartialMessages: true,
    initialMessages: restoredMessages ?? undefined,
    ...(mcpServers && { mcpServers }),
  })
  agentRuntimes.set(agentKey, {
    agent,
    settingsKey,
    conversationId: conversationId ?? null,
  })
  logAgentSession('created', {
    conversationId: conversationId ?? null,
    reason: creationReason,
    restoredMessageCount: restoredMessages?.length ?? 0,
  })
  return agent
}

function disposeConversationRuntime(conversationId?: string) {
  const agentKey = getAgentKey(conversationId)
  const runtime = agentRuntimes.get(agentKey)
  if (runtime?.agent) {
    try { runtime.agent.clear() } catch { /* ignore */ }
  }
  activeAbortControllers.get(agentKey)?.abort()
  activeAbortControllers.delete(agentKey)
  agentRuntimes.delete(agentKey)
}

function resetAgent() {
  logAgentSession('reset', {
    conversationId: null,
    hasAgent: agentRuntimes.size > 0,
  })
  for (const runtime of agentRuntimes.values()) {
    try { runtime.agent.clear() } catch { /* ignore */ }
  }
  for (const abortController of activeAbortControllers.values()) {
    abortController.abort()
  }
  activeAbortControllers.clear()
  agentRuntimes.clear()
}

type ImageAttachment = { base64: string; mediaType: string; name: string }

function buildPromptWithImages(
  text: string,
  images: ImageAttachment[],
): string | Array<{ type: string; [k: string]: unknown }> {
  if (!images || images.length === 0) return text

  const blocks: Array<{ type: string; [k: string]: unknown }> = []
  for (const img of images) {
    blocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img.mediaType,
        data: img.base64,
      },
    })
  }
  blocks.push({ type: 'text', text: text || 'What do you see in this image?' })
  return blocks
}

async function runAgentQuery(
  prompt: string,
  settings: Settings,
  conversationId?: string,
  images?: ImageAttachment[],
) {
  const agentKey = getAgentKey(conversationId)
  const agent = await getOrCreateAgent(settings, conversationId)
  activeAbortControllers.get(agentKey)?.abort()
  const abortController = new AbortController()
  activeAbortControllers.set(agentKey, abortController)

  const queryPrompt = buildPromptWithImages(prompt, images ?? [])

  let eventCount = 0
  const t0 = Date.now()

  try {
    for await (const event of agent.query(queryPrompt as any, { abortSignal: abortController.signal })) {
      if (abortController.signal.aborted) break
      eventCount++
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
      const evt = event as Record<string, unknown>

      if (evt.type === 'stream_event') {
        const se = (evt as any).event
        const subtype = se?.type ?? '?'
        const detail =
          subtype === 'content_block_start' ? se?.content_block?.type :
          subtype === 'content_block_delta' ? se?.delta?.type :
          ''
        console.log(`[agent] #${eventCount} +${elapsed}s stream_event/${subtype} ${detail}`)
      } else {
        console.log(`[agent] #${eventCount} +${elapsed}s ${evt.type}${evt.subtype ? '/' + evt.subtype : ''}`)
      }

      mainWindow?.webContents.send('agent:event', {
        conversationId: conversationId ?? null,
        event,
      })
    }

    const wasAborted = abortController.signal.aborted === true
    if (!wasAborted && conversationId) {
      saveAgentMessages(conversationId, settings, getAgentMessages(agent))
    } else if (wasAborted) {
      logAgentSession('save-skipped', {
        conversationId: conversationId ?? null,
        reason: 'aborted',
      })
    }

    console.log(`[agent] done — ${eventCount} events in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    mainWindow?.webContents.send('agent:done', {
      conversationId: conversationId ?? null,
    })
  } finally {
    if (activeAbortControllers.get(agentKey) === abortController) {
      activeAbortControllers.delete(agentKey)
    }
  }
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

function registerIPC() {
  ipcMain.handle('settings:load', () => loadSettings())

  ipcMain.handle('settings:save', (_e, settings: Settings) => {
    saveSettings(settings)
    return true
  })

  ipcMain.handle('chat:load', () => loadChatState())

  ipcMain.handle('chat:save', (_e, state: PersistedChatState) => {
    saveChatState(state)
    return true
  })

  ipcMain.handle('chat:deleteConversationSession', (_e, conversationId: string) => {
    if (typeof conversationId !== 'string' || !conversationId) return false
    disposeConversationRuntime(conversationId)
    return deleteAgentSession(conversationId)
  })

  ipcMain.handle('dialog:selectDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('agent:query', async (_e, prompt: string, conversationId?: string, images?: ImageAttachment[]) => {
    const settings = loadSettings()
    if (!settings.apiKey) {
      mainWindow?.webContents.send('agent:error', {
        conversationId: conversationId ?? null,
        error: 'API key 未设置，请先在设置中配置。',
      })
      return
    }
    try {
      await runAgentQuery(prompt, settings, conversationId, images)
    } catch (err: any) {
      mainWindow?.webContents.send('agent:error', {
        conversationId: conversationId ?? null,
        error: err.message ?? String(err),
      })
    }
  })

  ipcMain.handle('agent:abort', (_e, conversationId?: string) => {
    if (conversationId) {
      const agentKey = getAgentKey(conversationId)
      activeAbortControllers.get(agentKey)?.abort()
      activeAbortControllers.delete(agentKey)
      return
    }
    for (const abortController of activeAbortControllers.values()) {
      abortController.abort()
    }
    activeAbortControllers.clear()
  })

  ipcMain.handle('agent:reset', () => {
    resetAgent()
    return true
  })

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    shell.openExternal(url)
  })

  ipcMain.handle('image:preview', async (_e, base64: string, mediaType: string) => {
    try {
      const ext = (mediaType.split('/')[1] || 'png').replace('jpeg', 'jpg')
      const tmpDir = join(os.tmpdir(), 'openclaude-previews')
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
      const filePath = join(tmpDir, `preview-${Date.now()}.${ext}`)
      fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
      await shell.openPath(filePath)
      return true
    } catch (err) {
      console.error('[image:preview]', err)
      return false
    }
  })
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------

function createWindow() {
  const iconPath = isDev
    ? join(__dirname, '../../public/icon.png')
    : join(__dirname, '../../dist/icon.png')

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    title: 'OpenClaude',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#ffffff',
    icon: fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error(`[did-fail-load] ${code} ${desc}`)
  })

  const devURL = process.env.VITE_DEV_SERVER_URL
  if (devURL) {
    mainWindow.loadURL(devURL)
  } else {
    mainWindow.loadFile(join(__dirname, '../../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  registerIPC()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
