/** Registration and payment have independent authorities. A provider return,
 * payment approval or requested cash method alone never confirms a place. */
export function registrationPresentation(registration?:string|null,payment?:string|null) {
  const status=String(registration ?? '').toUpperCase(),paid=['PAID','APPROVED'].includes(String(payment ?? '').toUpperCase())
  if(status==='CONFIRMED') return {confirmed:true,title:'INSCRIPCIÓN CONFIRMADA',description:'El club confirmó tu inscripción.',withdrawal:'Solicitar baja del torneo'}
  if(status==='CANCELLED') return {confirmed:false,title:'INSCRIPCIÓN CANCELADA',description:'Esta inscripción ya no está activa.',withdrawal:'Inscripción cancelada'}
  return {confirmed:false,title:'SOLICITUD REGISTRADA',description:paid?'El pago está validado. Falta la confirmación de la inscripción por el club.':'Tu solicitud está registrada. El club debe confirmarla para asegurar tu lugar.',withdrawal:'Solicitar cancelación de la solicitud'}
}
