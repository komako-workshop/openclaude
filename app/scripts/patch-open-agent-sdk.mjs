import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const root = join(process.cwd(), 'node_modules', '@shipany', 'open-agent-sdk', 'dist')
const targets = [
  join(root, 'ink', 'components', 'Box.js'),
  join(root, 'ink', 'components', 'ScrollBox.js'),
]

let patched = 0

for (const file of targets) {
  if (!existsSync(file)) continue

  const before = readFileSync(file, 'utf8')
  const after = before.replaceAll("import '../global.d.ts';", "import '../global.js';")

  if (after !== before) {
    writeFileSync(file, after)
    patched += 1
  }
}

if (patched > 0) {
  console.log(`[patch-open-agent-sdk] patched ${patched} files`)
} else {
  console.log('[patch-open-agent-sdk] no changes needed')
}
