/** Disposable web QA on the single development port. All backend data is synthetic. */
import next from 'next'
import http from 'node:http'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
process.env.NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:45432'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='qa-local-only'
process.env.SUPABASE_SERVICE_ROLE_KEY='qa-service-local-only'
process.env.PAYMENTS_MERCADO_PAGO_ENABLED='false'
const require=createRequire(import.meta.url),dir=fileURLToPath(new URL('../../',import.meta.url))
const config=await require('next/dist/server/config').default('phase-development-server',dir,{customConfig:{distDir:'.next/dev/integration'}})
process.env.__NEXT_PRIVATE_STANDALONE_CONFIG=JSON.stringify(config)
const app=next({dev:true,dir,conf:{distDir:'.next/dev/integration'},hostname:'127.0.0.1',port:3000})
await app.prepare()
const server=http.createServer(app.getRequestHandler())
server.listen(3000,'127.0.0.1',()=>console.log('INTEGRATION_QA_WEB http://127.0.0.1:3000'))
process.on('SIGINT',()=>server.close(()=>{void app.close()}))
