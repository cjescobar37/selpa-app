/** Isolated test bootstrap. Never load live .env files or permit external fetches. */
process.env.NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:45432'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='qa-local-only'
process.env.SUPABASE_SERVICE_ROLE_KEY='qa-service-local-only'
process.env.PAYMENTS_MERCADO_PAGO_ENABLED='false'
const originalFetch=globalThis.fetch
globalThis.fetch=(input,init)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url)
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('External network is forbidden in isolated contracts')
  return originalFetch(input,init)
}
