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

  const handleSave = () => {
    save(local)
    togglePanel()
  }

  const pickDir = async () => {
    const dir = await window.openclaude.invoke('dialog:selectDirectory')
    if (dir) patch('cwd', dir)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-light border border-border-light rounded-2xl w-[480px] max-h-[80vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-zinc-200">Settings</h2>
          <button onClick={togglePanel} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <Field label="OpenRouter API Key">
            <input
              type="password"
              value={local.apiKey}
              onChange={(e) => patch('apiKey', e.target.value)}
              placeholder="sk-or-v1-..."
              className="input-field"
            />
          </Field>

          <Field label="Base URL">
            <input
              value={local.baseURL}
              onChange={(e) => patch('baseURL', e.target.value)}
              className="input-field"
            />
          </Field>

          <Field label="Model">
            <select
              value={local.model}
              onChange={(e) => patch('model', e.target.value)}
              className="input-field"
            >
              {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>

          <Field label="Working Directory">
            <div className="flex gap-2">
              <input
                value={local.cwd}
                onChange={(e) => patch('cwd', e.target.value)}
                className="input-field flex-1"
              />
              <button
                onClick={pickDir}
                className="shrink-0 px-3 py-2 bg-surface-lighter border border-border rounded-lg text-zinc-400 hover:text-zinc-200 hover:border-border-light transition-colors"
              >
                <FolderOpen size={16} />
              </button>
            </div>
          </Field>

          <Field label="Permission Mode">
            <select
              value={local.permissionMode}
              onChange={(e) => patch('permissionMode', e.target.value as any)}
              className="input-field"
            >
              <option value="bypassPermissions">Bypass (auto-approve all)</option>
              <option value="acceptEdits">Accept Edits (auto-approve file ops)</option>
              <option value="default">Default (ask for approval)</option>
            </select>
          </Field>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={togglePanel}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-accent hover:bg-accent-light text-white rounded-lg transition-colors font-medium"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1.5">{label}</label>
      {children}
    </div>
  )
}
