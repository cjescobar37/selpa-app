export type MobilePlayoffMatch = {
  id: string
  group_id: string | null
  phase: string | null
  status: string | null
  scheduled_at?: string | null
  court_name?: string | null
  court_id?: string | null
  court_source?: string | null
  team1_id: string
  team2_id: string
  team1_name?: string | null
  team2_name?: string | null
  winner_team_id: string | null
  score: Record<string, unknown> | null
  round: number
  match_order: number
}
export type Team = { teamId: string; teamName: string; seed?: number | null }
export type Slot = {
  id: string
  kind: 'match' | 'placeholder' | 'bye'
  match?: MobilePlayoffMatch
  slotOrder: number
  placeholderTeams?: [Team | null, Team | null]
  byeTeam?: Team | null
}
export type Round = { phase: string; label: string; slots: Slot[] }
export type DisplayTeam = { id: string | null; name: string; seed: number | null; source: string | null }
export type DisplaySlot = Slot & { code: string; roundIndex: number; teams: DisplayTeam[] }

const phaseInfo: Record<string, { label: string; short: string; prefix: string }> = {
  ROUND_OF_32: { label: '32avos', short: '32', prefix: 'T' },
  ROUND_OF_16: { label: '16avos', short: '16', prefix: 'D' },
  EIGHTHS: { label: 'Octavos', short: '8', prefix: 'O' },
  QUARTER: { label: 'Cuartos', short: '4', prefix: 'C' },
  SEMI: { label: 'Semis', short: 'SF', prefix: 'S' },
  FINAL: { label: 'Final', short: 'F', prefix: 'F' },
}
export const info = (round: Round) => phaseInfo[round.phase] ?? { label: round.label, short: round.label, prefix: 'M' }
export const code = (round: Round, slot: Slot) => `${info(round).prefix}${slot.slotOrder}`
export function schedule(match?: MobilePlayoffMatch) {
  const date = match?.scheduled_at ? new Date(match.scheduled_at) : null
  const valid = date && !Number.isNaN(date.getTime())
  return {
    date: valid ? new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit' }).format(date) : 'Sin fecha',
    time: valid ? new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date) : 'Sin hora',
    court: match?.court_name || 'Cancha sin asignar',
  }
}
export function matchState(slot: Slot) {
  const status = slot.match?.status?.toUpperCase()
  if (slot.kind === 'bye') return { label: 'Pasa directo', tone: 'bye' }
  if (slot.kind === 'placeholder') return { label: 'En espera', tone: 'waiting' }
  if (status === 'WALKOVER' || status === 'WO' || slot.match?.score?.walkover === true) return { label: 'Walkover', tone: 'wo' }
  if (status === 'PLAYED') return { label: 'Jugado', tone: 'played' }
  if (status === 'IN_PROGRESS' || status === 'LIVE') return { label: 'En curso', tone: 'live' }
  if (status === 'CANCELLED') return { label: 'Cancelado', tone: 'waiting' }
  return slot.match?.scheduled_at ? { label: 'Programado', tone: 'scheduled' } : { label: 'Pendiente', tone: 'pending' }
}
export function scoreColumns(match?: MobilePlayoffMatch) {
  const score = match?.score
  const sets = Array.isArray(score?.sets) ? score.sets.slice(0, 3) : []
  const columns = sets.map((set, index) => ({ label: `S${index + 1}`, value: set }))
  while (columns.length < 2) columns.push({ label: `S${columns.length + 1}`, value: null })
  if (score?.super_tiebreak) columns.push({ label: 'TB', value: score.super_tiebreak })
  else if (columns.length < 3) columns.push({ label: 'TB', value: null })
  return columns.slice(0, 3).map(({ label, value }) => ({
    label,
    first: value && typeof value.team1 === 'number' ? value.team1 as number : null,
    second: value && typeof value.team2 === 'number' ? value.team2 as number : null,
  }))
}


export type DisplayRound = Omit<Round, 'slots'> & { slots: DisplaySlot[] }
export function displayBracket(rounds: Round[], teamNames: ReadonlyMap<string, string>, teamSeeds: ReadonlyMap<string, number>): DisplayRound[] {
  return rounds.map((round, roundIndex) => ({
    ...round,
    slots: round.slots.map((slot): DisplaySlot => ({
      ...slot, code: code(round, slot), roundIndex,
      teams: (slot.kind === 'bye' ? [0] : [0, 1]).map((side) => {
        const id = slot.match ? (side === 0 ? slot.match.team1_id : slot.match.team2_id) : (slot.kind === 'bye' ? slot.byeTeam?.teamId : slot.placeholderTeams?.[side]?.teamId)
        const known = slot.kind === 'bye' ? slot.byeTeam : slot.placeholderTeams?.[side]
        const sourceSlot = roundIndex > 0 ? rounds[roundIndex - 1].slots[(slot.slotOrder - 1) * 2 + side] : null
        const source = sourceSlot ? `${sourceSlot.kind === 'bye' ? 'Pasa de' : 'Ganador'} ${code(rounds[roundIndex - 1], sourceSlot)}` : null
        return {
          id: id || null,
          name: (slot.match ? (side === 0 ? slot.match.team1_name : slot.match.team2_name) : known?.teamName) || (id ? teamNames.get(id) : null) || source || 'Pareja por confirmar',
          seed: id ? teamSeeds.get(id) ?? known?.seed ?? null : null,
          source,
        }
      }),
    })),
  }))
}

/** Visual ancestry only. Never advances or creates sporting results. */
export function bracketPath(rounds: Round[], teamId: string | null) {
  const ids = new Set<string>()
  const matchIds = new Set<string>()
  let eliminatedAt: string | null = null
  if (!teamId) return { ids, matchIds, steps: [] as string[], eliminatedAt }
  rounds.forEach((round, ri) => round.slots.forEach((slot) => {
    const participants = slot.match ? [slot.match.team1_id, slot.match.team2_id] : slot.kind === 'bye'
      ? [slot.byeTeam?.teamId] : slot.placeholderTeams?.map((team) => team?.teamId) ?? []
    if (!participants.includes(teamId)) return
    let current: Slot | undefined = slot
    for (let nextIndex = ri; nextIndex < rounds.length && current; nextIndex++) {
      ids.add(current.id)
      if (current.match) matchIds.add(current.match.id)
      if (current.match?.winner_team_id && current.match.winner_team_id !== teamId) {
        eliminatedAt = `${info(rounds[nextIndex]).label} ${code(rounds[nextIndex], current)}`
        break
      }
      current = rounds[nextIndex + 1]?.slots[Math.floor((current.slotOrder - 1) / 2)]
    }
  }))
  const steps = rounds.flatMap((round) => round.slots.filter((slot) => ids.has(slot.id)).map((slot) => `${info(round).label} ${code(round, slot)}`))
  return { ids, matchIds, steps, eliminatedAt }
}
