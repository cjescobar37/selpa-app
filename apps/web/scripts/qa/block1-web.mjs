/** Isolated Next server; avoids the user's existing .next/dev lock. */
import next from 'next'
import http from 'node:http'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const dir=fileURLToPath(new URL('../../',import.meta.url))
const config=await require('next/dist/server/config').default('phase-development-server',dir,{customConfig:{distDir:'.next/dev/block1-isolated'}})
process.env.__NEXT_PRIVATE_STANDALONE_CONFIG=JSON.stringify(config)
const app=next({dev:true,dir,
  conf:{distDir:'.next/dev/block1-isolated'},hostname:'127.0.0.1',port:3011})
await app.prepare()
http.createServer(app.getRequestHandler()).listen(3011,'127.0.0.1',()=>console.log('BLOCK1_ISOLATED_WEB http://127.0.0.1:3011'))
