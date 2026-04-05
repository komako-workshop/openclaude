import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } from 'electron'
import { dirname, join } from 'path'
import * as fs from 'fs'
import * as os from 'os'

let mainWindow: BrowserWindow | null = null
let activeAbortController: AbortController | null = null

// Persistent agent: reused across queries within the same conversation
let currentAgent: any = null
let currentConversationId: string | null = null
let currentSettingsKey: string = ''
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

function getCurrentAgentMessages(): unknown[] {
  if (!currentAgent || typeof currentAgent.getMessages !== 'function') return []

  try {
    const messages = currentAgent.getMessages()
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
  const key = buildSettingsKey(settings)
  const settingsChanged = currentSettingsKey !== key
  const conversationChanged = conversationId !== currentConversationId
  const creationReason = !currentAgent
    ? 'first_agent'
    : settingsChanged
      ? 'settings_changed'
      : conversationChanged
        ? 'conversation_changed'
        : 'unknown'

  if (currentAgent && !settingsChanged && !conversationChanged) {
    logAgentSession('reused', {
      conversationId: conversationId ?? null,
      settingsChanged,
      conversationChanged,
    })
    return currentAgent
  }

  const restoredMessages = conversationId ? loadAgentMessages(conversationId, settings) : null
  const { createAgent } = await getAgentModule()
  currentAgent = createAgent({
    model: settings.model,
    apiKey: settings.apiKey,
    baseURL: settings.baseURL,
    cwd: settings.cwd,
    permissionMode: settings.permissionMode,
    includePartialMessages: true,
    initialMessages: restoredMessages ?? undefined,
  })
  currentSettingsKey = key
  currentConversationId = conversationId ?? null
  logAgentSession('created', {
    conversationId: conversationId ?? null,
    reason: creationReason,
    restoredMessageCount: restoredMessages?.length ?? 0,
  })
  return currentAgent
}

function resetAgent() {
  logAgentSession('reset', {
    conversationId: currentConversationId,
    hasAgent: Boolean(currentAgent),
  })
  if (currentAgent) {
    try { currentAgent.clear() } catch { /* ignore */ }
  }
  currentAgent = null
  currentConversationId = null
  currentSettingsKey = ''
}

async function runAgentQuery(prompt: string, settings: Settings, conversationId?: string) {
  const agent = await getOrCreateAgent(settings, conversationId)

  activeAbortController = new AbortController()

  let eventCount = 0
  const t0 = Date.now()

  for await (const event of agent.query(prompt, { abortSignal: activeAbortController.signal })) {
    if (activeAbortController?.signal.aborted) break
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

    mainWindow?.webContents.send('agent:event', event)
  }

  const wasAborted = activeAbortController?.signal.aborted === true
  if (!wasAborted && conversationId) {
    saveAgentMessages(conversationId, settings, getCurrentAgentMessages())
  } else if (wasAborted) {
    logAgentSession('save-skipped', {
      conversationId: conversationId ?? null,
      reason: 'aborted',
    })
  }

  console.log(`[agent] done — ${eventCount} events in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  activeAbortController = null
  mainWindow?.webContents.send('agent:done')
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
    return deleteAgentSession(conversationId)
  })

  ipcMain.handle('dialog:selectDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('agent:query', async (_e, prompt: string, conversationId?: string) => {
    const settings = loadSettings()
    if (!settings.apiKey) {
      mainWindow?.webContents.send('agent:error', 'API key 未设置，请先在设置中配置。')
      return
    }
    try {
      await runAgentQuery(prompt, settings, conversationId)
    } catch (err: any) {
      mainWindow?.webContents.send('agent:error', err.message ?? String(err))
    }
  })

  ipcMain.handle('agent:abort', () => {
    activeAbortController?.abort()
    activeAbortController = null
  })

  ipcMain.handle('agent:reset', () => {
    resetAgent()
    return true
  })

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    shell.openExternal(url)
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
