/** Before/after visual QA on loopback, retaining every non-PWA local change. */
import next from 'next'
import http from 'node:http'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:45432'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'qa-local-only'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'qa-service-local-only'
process.env.PAYMENTS_MERCADO_PAGO_ENABLED = 'false'
process.env.NODE_ENV = 'development'
const require = createRequire(import.meta.url)
const before = process.argv.includes('--before')
const dir = before ? process.env.SELPA_PWA_VISUAL_BEFORE_DIR : fileURLToPath(new URL('../../', import.meta.url))
if (!dir || (before && !existsSync(new URL('pwa-reconstruction.json', 'file:///' + dir.replaceAll('\\', '/') + '/')))) throw Error('Verified reconstructed before copy required')
const port = before ? 3013 : 3014
const config = await require('next/dist/server/config').default('phase-development-server', dir)
config.distDir = `.next/pwa-visual-${before ? 'before' : 'after'}`
config.devIndicators = false
process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(config)
const app = next({ dev: true, webpack: true, dir, conf: config, hostname: '127.0.0.1', port })
await app.prepare()
http.createServer(app.getRequestHandler()).listen(port, '127.0.0.1', () => console.log(`PWA_VISUAL_${before ? 'BEFORE_RECONSTRUCTED' : 'AFTER'} http://127.0.0.1:${port}`))
