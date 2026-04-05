import { contextBridge, ipcRenderer } from 'electron'

const INVOKE_CHANNELS = [
  'settings:load',
  'settings:save',
  'chat:load',
  'chat:save',
  'chat:deleteConversationSession',
  'dialog:selectDirectory',
  'agent:query',
  'agent:abort',
  'agent:reset',
  'shell:openExternal',
] as const

const ON_CHANNELS = [
  'agent:event',
  'agent:done',
  'agent:error',
] as const

type InvokeChannel = (typeof INVOKE_CHANNELS)[number]
type OnChannel = (typeof ON_CHANNELS)[number]

contextBridge.exposeInMainWorld('openclaude', {
  invoke: (channel: InvokeChannel, ...args: unknown[]) => {
    if (!(INVOKE_CHANNELS as readonly string[]).includes(channel)) {
      throw new Error(`Invalid invoke channel: ${channel}`)
    }
    return ipcRenderer.invoke(channel, ...args)
  },

  on: (channel: OnChannel, callback: (...args: unknown[]) => void) => {
    if (!(ON_CHANNELS as readonly string[]).includes(channel)) {
      throw new Error(`Invalid on channel: ${channel}`)
    }
    const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },

  platform: process.platform,
})
