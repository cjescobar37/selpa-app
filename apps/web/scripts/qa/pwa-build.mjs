/** Production build in its own ignored output, with synthetic connection env. */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
process.env.NODE_ENV = 'production'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:45432'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'qa-local-only'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'qa-service-local-only'
process.env.PAYMENTS_MERCADO_PAGO_ENABLED = 'false'
const dir = fileURLToPath(new URL('../../', import.meta.url))
const config = await require('next/dist/server/config').default('phase-production-build', dir)
config.distDir = '.next/pwa-phase1-build'
process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(config)
await require('next/dist/build').default(dir, false, false, false, false, false, false, require('next/dist/lib/bundler').Bundler.Webpack, 'default')
