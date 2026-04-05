import { useEffect, useState, type ReactNode } from 'react'
import { X, FolderOpen } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'

const MODELS = [
  'anthropic/claude-sonnet-4-6',
  'anthropic/claude-opus-4-6',
  'anthropic/claude-haiku-3.5',
  'google/gemini-2.5-pro-preview',
  'openai/gpt-4.1',
]

export function SettingsPanel() {
  const { settings, save, togglePanel } = useSettingsStore()
  const [local, setLocal] = useState(settings)

  useEffect(() => { setLocal(settings) }, [settings])

  const patch = (k: keyof typeof local, v: string) => setLocal({ ...local, [k]: v })

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
          <Field label="OpenRouter API Key">
            <input type="password" value={local.apiKey} onChange={(e) => patch('apiKey', e.target.value)}
              placeholder="sk-or-v1-..." className="input-field" />
          </Field>

          <Field label="Base URL">
            <input value={local.baseURL} onChange={(e) => patch('baseURL', e.target.value)} className="input-field" />
          </Field>

          <Field label="Model">
            <select value={local.model} onChange={(e) => patch('model', e.target.value)} className="input-field">
              {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
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
            <select value={local.permissionMode} onChange={(e) => patch('permissionMode', e.target.value as any)} className="input-field">
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
