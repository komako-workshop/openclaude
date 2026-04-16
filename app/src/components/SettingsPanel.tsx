import { useEffect, useState, useMemo, type ReactNode } from 'react'
import { X, FolderOpen } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'
import type { Settings } from '../types/bridge'

type ProviderPreset = {
  id: string
  name: string
  baseURL: string
  keyPlaceholder: string
  keyHint: string
  models: { value: string; label: string }[]
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'anthropic',
    name: 'Anthropic (Official)',
    baseURL: 'https://api.anthropic.com',
    keyPlaceholder: 'sk-ant-...',
    keyHint: 'Get your key at console.anthropic.com',
    models: [
      { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
      { value: 'claude-opus-4-6-20260204', label: 'Claude Opus 4.6' },
      { value: 'claude-sonnet-4-6-20260217', label: 'Claude Sonnet 4.6' },
      { value: 'claude-opus-4-5-20251124', label: 'Claude Opus 4.5' },
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api',
    keyPlaceholder: 'sk-or-v1-...',
    keyHint: 'Get your key at openrouter.ai/keys',
    models: [
      { value: 'anthropic/claude-opus-4.7', label: 'Claude Opus 4.7' },
      { value: 'anthropic/claude-opus-4.6', label: 'Claude Opus 4.6' },
      { value: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
      { value: 'anthropic/claude-opus-4.5', label: 'Claude Opus 4.5' },
      { value: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5' },
    ],
  },
  {
    id: 'custom',
    name: 'Custom (Anthropic-compatible)',
    baseURL: '',
    keyPlaceholder: 'your-api-key',
    keyHint: 'Any Anthropic Messages API compatible endpoint (LiteLLM, etc.)',
    models: [
      { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
      { value: 'claude-opus-4-6-20260204', label: 'Claude Opus 4.6' },
      { value: 'claude-sonnet-4-6-20260217', label: 'Claude Sonnet 4.6' },
      { value: 'claude-opus-4-5-20251124', label: 'Claude Opus 4.5' },
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    ],
  },
]

function detectProvider(baseURL: string): string {
  if (!baseURL) return 'custom'
  if (baseURL.includes('openrouter.ai')) return 'openrouter'
  if (baseURL.includes('api.anthropic.com')) return 'anthropic'
  return 'custom'
}

export function SettingsPanel() {
  const { settings, save, togglePanel } = useSettingsStore()
  const [local, setLocal] = useState(settings)
  const [providerId, setProviderId] = useState(() => detectProvider(settings.baseURL))

  useEffect(() => {
    setLocal(settings)
    setProviderId(detectProvider(settings.baseURL))
  }, [settings])

  const preset = useMemo(
    () => PROVIDER_PRESETS.find((p) => p.id === providerId) ?? PROVIDER_PRESETS[2],
    [providerId],
  )

  const patch = (k: keyof typeof local, v: string) => setLocal({ ...local, [k]: v })

  const handleProviderChange = (nextId: string) => {
    const nextPreset = PROVIDER_PRESETS.find((p) => p.id === nextId)
    if (!nextPreset) return

    setProviderId(nextId)

    const updates: Partial<typeof local> = {}
    if (nextId !== 'custom') {
      updates.baseURL = nextPreset.baseURL
    }
    const currentModelInNewList = nextPreset.models.some((m) => m.value === local.model)
    if (!currentModelInNewList && nextPreset.models.length > 0) {
      updates.model = nextPreset.models[0].value
    }
    setLocal({ ...local, ...updates })
  }

  const handleSave = () => { save(local); togglePanel() }

  const pickDir = async () => {
    const dir = await window.openclaude.invoke('dialog:selectDirectory')
    if (dir) patch('cwd', dir)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="border rounded-2xl w-[480px] max-h-[80vh] overflow-y-auto shadow-2xl"
        style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--card-fg)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-semibold">Settings</h2>
          <button onClick={togglePanel} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <Field label="API Provider">
            <select value={providerId} onChange={(e) => handleProviderChange(e.target.value)} className="input-field">
              {PROVIDER_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>

          <Field label="API Key">
            <input type="password" value={local.apiKey} onChange={(e) => patch('apiKey', e.target.value)}
              placeholder={preset.keyPlaceholder} className="input-field" />
            <p className="text-[11px] mt-1" style={{ color: 'var(--muted-fg)' }}>{preset.keyHint}</p>
          </Field>

          {providerId === 'custom' && (
            <Field label="Base URL">
              <input value={local.baseURL} onChange={(e) => patch('baseURL', e.target.value)}
                placeholder="https://your-proxy.example.com" className="input-field" />
            </Field>
          )}

          {providerId !== 'custom' && (
            <Field label="Base URL">
              <input value={local.baseURL} readOnly className="input-field opacity-60 cursor-not-allowed" />
            </Field>
          )}

          <Field label="Model">
            <select value={local.model} onChange={(e) => patch('model', e.target.value)} className="input-field">
              {preset.models.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>

          <Field label="Working Directory">
            <div className="flex gap-2">
              <input value={local.cwd} onChange={(e) => patch('cwd', e.target.value)} className="input-field flex-1" />
              <button onClick={pickDir} className="shrink-0 px-3 py-2 border rounded-lg transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--muted-fg)', background: 'var(--muted)' }}>
                <FolderOpen size={16} />
              </button>
            </div>
          </Field>

          <Field label="Permission Mode">
            <select value={local.permissionMode} onChange={(e) => patch('permissionMode', e.target.value as Settings['permissionMode'])} className="input-field">
              <option value="bypassPermissions">Bypass (auto-approve all)</option>
              <option value="acceptEdits">Accept Edits (auto-approve file ops)</option>
              <option value="default">Default (ask for approval)</option>
            </select>
          </Field>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={togglePanel} className="px-4 py-2 text-sm transition-colors" style={{ color: 'var(--muted-fg)' }}>Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm rounded-lg font-medium transition-opacity hover:opacity-90"
            style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>Save</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-fg)' }}>{label}</label>
      {children}
    </div>
  )
}
