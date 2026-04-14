/**
 * Ein Befehl `npm run dev`: startet die lokale PHP-API (wenn PHP da ist) und Vite.
 * Ohne PHP: Hinweis + optional Fallback auf die Online-API (siehe unten).
 */
import { spawn, execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const REMOTE_API_DEFAULT = 'https://altbaufinder.markusgerke.com/api'

function getPhpExecutable() {
  if (process.platform === 'win32') {
    try {
      const out = execSync('where php', { encoding: 'utf8' }).trim()
      const first = out.split(/\r?\n/)[0]
      return first || null
    } catch {
      return null
    }
  }
  for (const cmd of ['command -v php', 'which php']) {
    try {
      const out = execSync(cmd, { encoding: 'utf8' }).trim()
      if (out) return out.split('\n')[0]
    } catch {
      /* next */
    }
  }
  return null
}

/** Grob: VITE_API_URL aus .env / .env.local lesen (ohne dotenv-Paket). */
function readExplicitViteApiUrl() {
  for (const name of ['.env.local', '.env']) {
    const p = path.join(root, name)
    if (!existsSync(p)) continue
    try {
      const text = readFileSync(p, 'utf8')
      const m = text.match(/^\s*VITE_API_URL\s*=\s*(.+)$/m)
      if (m) {
        let v = m[1].trim()
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1)
        }
        return v
      }
    } catch {
      /* ignore */
    }
  }
  return null
}

const phpPath = getPhpExecutable()
let phpProc = null

if (phpPath) {
  phpProc = spawn(phpPath, ['-S', '127.0.0.1:8787', '-t', 'api'], {
    cwd: root,
    stdio: 'inherit',
  })
  phpProc.on('error', (err) => {
    console.error('[altbaufinder] PHP konnte nicht gestartet werden:', err.message)
  })
} else {
  console.warn(
    '\n\x1b[33m[altbaufinder]\x1b[0m PHP ist nicht installiert — die lokale API wird übersprungen.\n' +
      '  (Optional: \x1b[1mbrew install php\x1b[0m, dann reicht wieder nur \x1b[1mnpm run dev\x1b[0m.)\n'
  )
}

const explicitUrl = readExplicitViteApiUrl()

const env = { ...process.env }
if (!phpPath) {
  if (!explicitUrl && !process.env.VITE_API_URL) {
    env.VITE_API_URL = REMOTE_API_DEFAULT
    console.warn(
      `\x1b[33m[altbaufinder]\x1b[0m Nutze Online-API: ${REMOTE_API_DEFAULT}\n` +
        '  (Eigene URL: in `.env.local` VITE_API_URL=… setzen.)\n'
    )
  }
}

const viteJs = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
if (!existsSync(viteJs)) {
  console.error('[altbaufinder] Vite fehlt — bitte im Projektordner `npm install` ausführen.')
  if (phpProc) phpProc.kill('SIGTERM')
  process.exit(1)
}

const viteProc = spawn(process.execPath, [viteJs], {
  cwd: root,
  stdio: 'inherit',
  env,
})

function shutdown(code) {
  if (phpProc && !phpProc.killed) {
    phpProc.kill('SIGTERM')
  }
  process.exit(code ?? 0)
}

viteProc.on('close', (code) => shutdown(code ?? 0))
viteProc.on('error', (err) => {
  console.error('[altbaufinder] Vite:', err.message)
  shutdown(1)
})

process.on('SIGINT', () => {
  if (viteProc && !viteProc.killed) viteProc.kill('SIGTERM')
  if (phpProc && !phpProc.killed) phpProc.kill('SIGTERM')
  shutdown(130)
})
process.on('SIGTERM', () => {
  if (viteProc && !viteProc.killed) viteProc.kill('SIGTERM')
  if (phpProc && !phpProc.killed) phpProc.kill('SIGTERM')
  shutdown(143)
})
