import { create } from 'zustand'
import type { Settings } from '../types/bridge'

type SettingsState = {
  settings: Settings
  loaded: boolean
  showPanel: boolean
  load: () => Promise<void>
  save: (patch: Partial<Settings>) => Promise<void>
  togglePanel: () => void
}

const DEFAULTS: Settings = {
  apiKey: '',
  baseURL: 'https://openrouter.ai/api',
  model: 'anthropic/claude-sonnet-4-6',
  cwd: '',
  permissionMode: 'bypassPermissions',
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULTS,
  loaded: false,
  showPanel: false,

  load: async () => {
    try {
      const s = await window.openclaude.invoke('settings:load')
      set({ settings: { ...DEFAULTS, ...s }, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  save: async (patch) => {
    const next = { ...get().settings, ...patch }
    set({ settings: next })
    await window.openclaude.invoke('settings:save', next)
  },

  togglePanel: () => set((s) => ({ showPanel: !s.showPanel })),
}))
