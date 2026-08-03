const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const isUuid=(value:unknown):value is string=>typeof value==='string'&&UUID.test(value)
export const text=(value:unknown)=>typeof value==='string'?value.trim():''
export const record=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
export function parseRevision(value:string|null){if(!value)return null;const parsed=Number(value.replace(/^W\//,'').replaceAll('"',''));return Number.isInteger(parsed)&&parsed>0?parsed:null}
export function parseKey(value:string|null){const key=text(value);return key.length>=8&&key.length<=200?key:null}
