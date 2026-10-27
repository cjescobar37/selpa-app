export type MyRankingState = 'READY' | 'NO_OFFICIAL_RANKING' | 'NO_SPORTS_ENTRY' | 'PRIVATE_SEASON' | 'MODEL_UNAVAILABLE' | 'READ_UNAVAILABLE' | 'NO_MEMBERSHIP' | 'AUTH_REQUIRED'

export function myRankingState(evidence: { hasSeason:boolean; hasEntry:boolean; hasStanding:boolean; isPublic:boolean }): MyRankingState {
  if (!evidence.hasSeason) return 'NO_OFFICIAL_RANKING'
  if (!evidence.hasEntry) return 'NO_SPORTS_ENTRY'
  if (!evidence.isPublic) return 'PRIVATE_SEASON'
  return evidence.hasStanding ? 'READY' : 'NO_OFFICIAL_RANKING'
}

export function myRankingFailure(code: unknown): MyRankingState {
  if (['MODEL_UNAVAILABLE','PGRST202','PGRST205','42P01','42883'].includes(String(code))) return 'MODEL_UNAVAILABLE'
  return 'READ_UNAVAILABLE'
}

export const myRankingMessages: Record<MyRankingState,{title:string;message:string}> = {
  READY:{ title:'Tu ranking oficial', message:'Posición y puntos confirmados en tu división.' },
  NO_OFFICIAL_RANKING:{ title:'Sin ranking oficial disponible', message:'El club todavía no tiene una temporada activa o una posición oficial disponible para tu división.' },
  NO_SPORTS_ENTRY:{ title:'Sin inscripción deportiva en la división', message:'Tu vínculo con el club está aprobado, pero todavía no hay una inscripción deportiva activa en la temporada. Consultá al club.' },
  PRIVATE_SEASON:{ title:'Temporada no pública', message:'Podés consultar tu posición personal cuando esté disponible. Los demás participantes no se muestran hasta que el club publique la temporada.' },
  MODEL_UNAVAILABLE:{ title:'Tu ranking está pendiente de habilitación', message:'Las lecturas deportivas oficiales no están instaladas en este entorno. Conservamos tu club y no mostramos puestos ni puntos sin verificar.' },
  READ_UNAVAILABLE:{ title:'No pudimos actualizar tu ranking', message:'La lectura no se completó. Reintentá en unos segundos; tus puntos no se modificaron.' },
  NO_MEMBERSHIP:{ title:'Sin vínculo deportivo aprobado', message:'Elegí un club donde tengas un vínculo deportivo aprobado para consultar tu progreso.' },
  AUTH_REQUIRED:{ title:'Ingresá para consultar tu progreso', message:'Tu posición personal requiere una sesión vigente.' },
}
