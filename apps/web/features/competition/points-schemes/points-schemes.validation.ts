import { POINT_RESULT_CODES, type PointResultCode } from './points-schemes.types'
export function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('BODY_INVALID'); return value as Record<string,unknown> }
export function text(value: unknown, required=false) { const result=typeof value==='string' ? value.trim() : ''; if(required&&!result) throw new Error('NAME_REQUIRED'); if(result.length>240) throw new Error('VALUE_TOO_LONG'); return result }
export function integer(value: unknown, name:string) { if(!Number.isInteger(value)||Number(value)<0) throw new Error(`${name}_INVALID`); return Number(value) }
export function revision(value: unknown) { const result=Number(value); if(!Number.isInteger(result)||result<1) throw new Error('REVISION_REQUIRED'); return result }
export function ruleCode(value:unknown): PointResultCode { const result=String(value??'').toUpperCase(); if(!POINT_RESULT_CODES.includes(result as PointResultCode)) throw new Error('RULE_KEY_INVALID'); return result as PointResultCode }
