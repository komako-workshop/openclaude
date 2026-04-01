import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import * as os from 'os'

let mainWindow: BrowserWindow | null = null
let activeAbortController: AbortController | null = null

const PRELOAD_PATH = join(__dirname, '../preload/index.js')
const isDev = !app.isPackaged
const CONFIG_PATH = join(app.getPath('userData'), 'settings.json')

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

const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  baseURL: 'https://openrouter.ai/api',
  model: 'anthropic/claude-sonnet-4-6',
  cwd: os.homedir(),
  permissionMode: 'bypassPermissions',
}

function loadSettings(): Settings {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) }
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS }
}

function saveSettings(s: Settings) {
  fs.mkdirSync(join(CONFIG_PATH, '..'), { recursive: true })
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(s, null, 2))
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

async function runAgentQuery(prompt: string, settings: Settings) {
  const { createAgent } = await getAgentModule()

  activeAbortController = new AbortController()

  const agent = createAgent({
    model: settings.model,
    apiKey: settings.apiKey,
    baseURL: settings.baseURL,
    cwd: settings.cwd,
    permissionMode: settings.permissionMode,
    abortSignal: activeAbortController.signal,
  })

  for await (const event of agent.query(prompt)) {
    if (activeAbortController?.signal.aborted) break
    mainWindow?.webContents.send('agent:event', event)
  }

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

  ipcMain.handle('dialog:selectDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('agent:query', async (_e, prompt: string) => {
    const settings = loadSettings()
    if (!settings.apiKey) {
      mainWindow?.webContents.send('agent:error', 'API key 未设置，请先在设置中配置。')
      return
    }
    try {
      await runAgentQuery(prompt, settings)
    } catch (err: any) {
      mainWindow?.webContents.send('agent:error', err.message ?? String(err))
    }
  })

  ipcMain.handle('agent:abort', () => {
    activeAbortController?.abort()
    activeAbortController = null
  })

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    shell.openExternal(url)
  })
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    title: 'OpenClaude',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#0f0f14',
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
