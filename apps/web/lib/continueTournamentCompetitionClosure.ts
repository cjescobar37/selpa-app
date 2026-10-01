import { closeCompetitionEvent, CompetitionEventClosureBlocked, type ClosureEventDetail, type ClosureHomologation, type ClosureHomologationDetail } from './competitionEventClosure'

type ClosureContext = {
  clubId: string
  seriesId: string
  eventId: string
  eventDivisionId: string
  tournamentId: string
  token: string
}

const fallbackKeys = new Map<string, string>()
function stableKey(scope: string) {
  const storageKey = `selpa:competition-closure:${scope}`
  try {
    const saved = sessionStorage.getItem(storageKey)
    if (saved) return saved
    const key = crypto.randomUUID()
    sessionStorage.setItem(storageKey, key)
    return key
  } catch {
    const saved = fallbackKeys.get(storageKey)
    if (saved) return saved
    const key = crypto.randomUUID()
    fallbackKeys.set(storageKey, key)
    return key
  }
}

export async function continueTournamentCompetitionClosure(context: ClosureContext) {
  const { clubId, seriesId, eventId, eventDivisionId, tournamentId, token } = context
  const base = `/api/clubs/${clubId}/competition/series/${seriesId}/events/${eventId}`
  async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...init,
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers },
    })
    const body = await response.json().catch(() => ({})) as T & { error?: string; code?: string }
    if (!response.ok) throw Object.assign(new Error(body.error || 'No pudimos continuar el cierre competitivo.'), { status: response.status, code: body.code })
    return body
  }
  const getEvent = async () => {
    const detail = await request<ClosureEventDetail>(base)
    const division = detail.divisions.find((item) => String(item.id) === eventDivisionId)
    const link = division?.active_tournament_link as { tournament_id?: unknown } | null | undefined
    if (!division || division.is_active === false || String(link?.tournament_id ?? '') !== tournamentId) {
      throw new CompetitionEventClosureBlocked([{ code: 'TOURNAMENT_LINK_CHANGED', message: 'El torneo ya no está vinculado a esta división. Actualizá la fecha antes de continuar.' }])
    }
    if (!['FINISHED', 'COMPLETED'].includes(String(division.tournament_status ?? '').toUpperCase())) {
      throw new CompetitionEventClosureBlocked([{ code: 'TOURNAMENT_NOT_FINISHED', message: 'Primero finalizá el torneo para revisar los resultados.' }])
    }
    return detail
  }
  const result = await closeCompetitionEvent({
    getEvent,
    activateSeries: async revision => { await request(`/api/clubs/${clubId}/competition/series/${seriesId}/lifecycle`, { method: 'POST', body: JSON.stringify({ action: 'ACTIVATE', revision, confirm: true }) }) },
    scheduleEvent: async revision => { await request(`${base}/schedule`, { method: 'POST', headers: { 'If-Match': String(revision), 'Idempotency-Key': stableKey(`${eventId}:schedule:${revision}`) }, body: '{}' }) },
    getDivisionPreflight: divisionId => request<{ ready: boolean; blockers: Array<{ code: string; message: string }> }>(`${base}/divisions/${divisionId}/complete`),
    completeDivision: async (divisionId, revision) => { await request(`${base}/divisions/${divisionId}/complete`, { method: 'POST', headers: { 'If-Match': String(revision), 'Idempotency-Key': stableKey(`${eventId}:${divisionId}:complete:${revision}`) }, body: '{}' }) },
    completeEvent: async revision => { await request(`${base}/complete`, { method: 'POST', headers: { 'If-Match': String(revision), 'Idempotency-Key': stableKey(`${eventId}:complete:${revision}`) }, body: '{}' }) },
    listHomologations: async divisionId => (await request<{ homologations: ClosureHomologation[] }>(`${base}/divisions/${divisionId}/homologations`)).homologations,
    createHomologation: async divisionId => (await request<{ homologation: ClosureHomologation }>(`${base}/divisions/${divisionId}/homologations`, { method: 'POST', body: JSON.stringify({ notes: 'Preparada para revisar los resultados del torneo.' }) })).homologation,
    getHomologation: (divisionId, homologationId) => request<ClosureHomologationDetail>(`${base}/divisions/${divisionId}/homologations/${homologationId}`),
    extractHomologation: async (divisionId, homologationId, revision) => { await request(`${base}/divisions/${divisionId}/homologations/${homologationId}/extract`, { method: 'POST', headers: { 'If-Match': String(revision), 'Idempotency-Key': stableKey(`${eventId}:${homologationId}:extract:${revision}`) }, body: '{}' }) },
  }, eventDivisionId)
  return {
    ...result,
    href: `/club/competition/series/${seriesId}/events/${eventId}/divisions/${result.eventDivisionId}/homologation`,
  }
}
