import { EVENT_SCORING_MODES,EVENT_TYPES } from './competition-events.types'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const isUuid=(v:unknown):v is string=>typeof v==='string'&&UUID.test(v)
export const record=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null
export const text=(v:unknown)=>typeof v==='string'?v.trim():''
export function parseIfMatch(value:string|null){if(!value)return null;const n=Number(value.replace(/^W\//,'').replaceAll('"',''));return Number.isInteger(n)&&n>0?n:null}
export function parseIdempotencyKey(value:string|null){const v=text(value);return v.length>=8&&v.length<=200?v:null}
export function validateEventPatch(input:unknown){const b=record(input);if(!b)return null;if(b.event_type&&!EVENT_TYPES.includes(String(b.event_type).toUpperCase() as never))return null;return b}
export function validateDivisionConfig(input:unknown):Record<string,unknown>|null{const b=record(input);if(!b)return null;const mode=String(b.scoring_mode??'').toUpperCase();if(!EVENT_SCORING_MODES.includes(mode as never))return null;return {...b,scoring_mode:mode}}
