/** Isolated, loopback-only QA. Never inherit the linked production Supabase env. */
import next from 'next'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:45432'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'qa-local-only'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'qa-service-local-only'
process.env.PAYMENTS_MERCADO_PAGO_ENABLED = 'false'
const require = createRequire(import.meta.url)
const dir = fileURLToPath(new URL('../../', import.meta.url))
const production = process.argv.includes('--production')
process.env.NODE_ENV = production ? 'production' : 'development'
const port = 3000
const distDir = production ? '.next/pwa-phase1-build' : '.next/pwa-phase1-dev'
const config = await require('next/dist/server/config').default(production ? 'phase-production-server' : 'phase-development-server', dir)
config.distDir = distDir
process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(config)
const app = next({ dev: !production, ...(!production ? { webpack: true } : {}), dir, conf: config, hostname: '127.0.0.1', port })
await app.prepare()
http.createServer(app.getRequestHandler()).listen(port, '127.0.0.1', () => console.log(`PWA_PHASE1_LOCAL http://127.0.0.1:${port}`))
