import {readdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {spawn} from 'node:child_process'
const app=new URL('../../',import.meta.url),files=[]
async function collect(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const url=new URL(entry.name+(entry.isDirectory()?'/':''),directory);if(entry.isDirectory())await collect(url);else if(/\.test\.(ts|mjs)$/.test(entry.name))files.push(fileURLToPath(url))}}
for(const directory of ['app/','features/','lib/'])await collect(new URL(directory,app))
const child=spawn(process.execPath,['--import',new URL('./setup-tests.mjs',import.meta.url).href,'--experimental-loader',new URL('./resolve-typescript.mjs',import.meta.url).href,'--test','--test-concurrency=2','--test-reporter=tap',...files.sort()],{cwd:fileURLToPath(app),env:{...process.env,SELPA_QA_MODULES:fileURLToPath(app)},stdio:'inherit',windowsHide:true})
child.on('error',error=>{console.error(error.name);process.exitCode=1})
child.on('exit',code=>{process.exitCode=code??1})
