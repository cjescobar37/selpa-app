import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
const ts=createRequire(import.meta.url)('typescript')
const root=new URL('../../',import.meta.url)
export async function resolve(specifier,context,nextResolve){
  const target=specifier==='next/server'?'next/server.js':specifier==='next/headers'?'next/headers.js':specifier.startsWith('@/')?new URL(specifier.slice(2),root).href:specifier
  try{return await nextResolve(target,context)}catch(error){
    if(error.code!=='ERR_MODULE_NOT_FOUND'||(!target.startsWith('file:')&&!/^\.{1,2}\//.test(target)))throw error
    for(const extension of ['.ts','.tsx','/index.ts']){try{return await nextResolve(target+extension,context)}catch(candidate){if(candidate.code!=='ERR_MODULE_NOT_FOUND')throw candidate}}
    throw error
  }
}
export async function load(url,context,nextLoad){
  if(/\.tsx?$/.test(url)){const source=await readFile(new URL(url),'utf8');return {format:'module',shortCircuit:true,source:ts.transpileModule(source,{fileName:new URL(url).pathname,compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText}}
  return nextLoad(url,context)
}
