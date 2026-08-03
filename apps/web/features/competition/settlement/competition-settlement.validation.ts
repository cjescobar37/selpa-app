export const isUuid=(value:string|undefined):value is string=>!!value&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
export function parseRevision(value:string|null){const normalized=value?.replace(/^W\//,'').replaceAll('"','');const revision=Number(normalized);return Number.isInteger(revision)&&revision>0?revision:null}
export function parseKey(value:string|null){const key=value?.trim();return key&&key.length>=8&&key.length<=200?key:null}
export const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
export const text=(value:unknown)=>typeof value==='string'?value.trim():''
