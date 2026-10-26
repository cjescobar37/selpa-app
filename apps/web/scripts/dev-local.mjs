import { spawn, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nextEnv from '@next/env'

// Resolve from this script, never from the terminal's current directory.
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = path.resolve(app, '../..')
process.chdir(app)
// Share local credentials without copying files or printing their contents.
// The worktree's own environment takes precedence when present.
if (!existsSync(path.join(app, '.env.local'))) {
  const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, encoding: 'utf8' }).trim()
  nextEnv.loadEnvConfig(path.join(path.dirname(path.resolve(root, common)), 'apps/web'), true)
}
nextEnv.loadEnvConfig(app, true)

const free = await new Promise(resolve => {
  const probe = createServer()
  probe.once('error', () => resolve(false))
  probe.listen(3000, '0.0.0.0', () => probe.close(() => resolve(true)))
})
if (!free) {
  console.error('El puerto 3000 está ocupado. No se usará otro puerto. Revisá la instancia antes de iniciarlo nuevamente.')
  process.exit(1)
}
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
console.log(`SELPA local: ${app}\nRama: ${git('branch', '--show-current')}\nHEAD: ${git('rev-parse', 'HEAD')}\nhttp://localhost:3000/ · http://10.4.21.30:3000/`)
const server = spawn(process.execPath, [path.join(app, 'node_modules/next/dist/bin/next'), 'dev', app, '--webpack', '--hostname', '0.0.0.0', '--port', '3000'], {
  cwd: app, stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, windowsHide: true,
})
server.on('exit', code => { process.exitCode = code ?? 1 })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal))
