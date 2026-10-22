/** Public diagnostic allowlist: never expose SQL messages, actors or tokens. */
export function financeReadError(error:{code?:string}) {
  const code=error.code ?? ''
  if(code==='42501') return {status:403,code:'FORBIDDEN',error:'No tenés autorización para consultar estos movimientos.'}
  if(['22023','22P02'].includes(code)) return {status:400,code:'INVALID_FILTER',error:'Revisá los filtros de la consulta.'}
  if(['PGRST202','PGRST205','42883','42P01'].includes(code)) return {status:503,code:'READ_MODEL_MISSING',error:'La lectura financiera requerida no está instalada en este entorno. Contactá al administrador.'}
  if(['PGRST000','PGRST001','PGRST002','NETWORK'].includes(code)) return {status:503,code:'NETWORK_UNAVAILABLE',error:'No pudimos conectar con tus movimientos. Reintentá.'}
  if(code==='CONFIGURATION_MISSING') return {status:503,code,error:'Falta configurar la conexión financiera de este entorno.'}
  return {status:503,code:'DATABASE_UNAVAILABLE',error:'No pudimos leer los movimientos. Reintentá; no se modificó ningún pago.'}
}
