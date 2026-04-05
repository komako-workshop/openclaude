import { create } from 'zustand'
import type { Settings } from '../types/bridge'

export type ThemeMode = 'light' | 'dark' | 'system'

type SettingsState = {
  settings: Settings
  loaded: boolean
  showPanel: boolean
  theme: ThemeMode
  load: () => Promise<void>
  save: (patch: Partial<Settings>) => Promise<void>
  togglePanel: () => void
  setTheme: (mode: ThemeMode) => void
}

const DEFAULTS: Settings = {
  apiKey: '',
  baseURL: 'https://openrouter.ai/api',
  model: 'anthropic/claude-sonnet-4-6',
  cwd: '',
  permissionMode: 'bypassPermissions',
}

function getStoredTheme(): ThemeMode {
  try {
    const v = window.localStorage.getItem('openclaude-theme')
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch { /* ignore */ }
  return 'light'
}

function applyThemeToDOM(mode: ThemeMode) {
  const isDark =
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  document.documentElement.classList.toggle('dark', isDark)
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULTS,
  loaded: false,
  showPanel: false,
  theme: 'light',

  load: async () => {
    const theme = getStoredTheme()
    applyThemeToDOM(theme)
    try {
      const s = await window.openclaude.invoke('settings:load')
      set({ settings: { ...DEFAULTS, ...s }, loaded: true, theme })
    } catch {
      set({ loaded: true, theme })
    }
  },

  save: async (patch) => {
    const next = { ...get().settings, ...patch }
    set({ settings: next })
    await window.openclaude.invoke('settings:save', next)
  },

  togglePanel: () => set((s) => ({ showPanel: !s.showPanel })),

  setTheme: (mode) => {
    applyThemeToDOM(mode)
    window.localStorage.setItem('openclaude-theme', mode)
    set({ theme: mode })
  },
}))
