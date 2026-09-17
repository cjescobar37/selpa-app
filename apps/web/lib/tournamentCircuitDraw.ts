// A direct-entry circuit draw. This is deliberately separate from the OPEN
// groups-to-playoff engine: group results, not registration seeds, qualify teams.
export type CircuitDrawSlot = { position: number; seed: number | null; teamId: string | null; isBye: boolean }
export type CircuitDrawMatch = { pairOrder: number; team1Id: string; team2Id: string; advancesToMatchOrder: number }

const line8 = [1, 8, 5, 4, 3, 6, 7, 2]
const line16 = [1, 16, 12, 5, 6, 11, 14, 3, 4, 13, 10, 7, 8, 9, 15, 2]

export function circuitSeedLine(bracketSize: 8 | 16 | 32): number[] {
  if (bracketSize === 8) return [...line8]
  if (bracketSize === 16) return [...line16]
  // Preserve protected quarters while expanding each 16-draw slot into one
  // first-round match. Alternating orientation keeps #1/#2 at opposite ends.
  return line16.flatMap((seed, index) => index % 2 ? [33 - seed, seed] : [seed, 33 - seed])
}

export function buildCircuitSeededDraw(teams: Array<{ teamId: string; seed: number }>) {
  const count = teams.length
  if (count < 5 || count > 32) throw new Error('UNSUPPORTED_CIRCUIT_DRAW_SIZE')
  const bracketSize: 8 | 16 | 32 = count <= 8 ? 8 : count <= 16 ? 16 : 32
  const bySeed = new Map(teams.map(team => [team.seed, team.teamId]))
  if (bySeed.size !== count || new Set(teams.map(team => team.teamId)).size !== count ||
    Array.from({ length: count }, (_, index) => index + 1).some(seed => !bySeed.has(seed))) {
    throw new Error('INVALID_CIRCUIT_SEEDS')
  }
  const slots: CircuitDrawSlot[] = circuitSeedLine(bracketSize).map((seed, index) => ({
    position: index + 1, seed: bySeed.has(seed) ? seed : null,
    teamId: bySeed.get(seed) ?? null, isBye: seed > count,
  }))
  const matches: CircuitDrawMatch[] = []
  const byeAdvances: Array<{ seed: number; teamId: string; advancesToMatchOrder: number }> = []
  for (let pairIndex = 0; pairIndex < bracketSize / 2; pairIndex += 1) {
    const left = slots[pairIndex * 2]
    const right = slots[pairIndex * 2 + 1]
    const advancesToMatchOrder = Math.ceil((pairIndex + 1) / 2)
    if (left.teamId && right.teamId) matches.push({ pairOrder: pairIndex + 1, team1Id: left.teamId, team2Id: right.teamId, advancesToMatchOrder })
    else {
      const beneficiary = left.teamId ? left : right
      if (!beneficiary.teamId || beneficiary.seed === null) throw new Error('INVALID_CIRCUIT_BYE')
      byeAdvances.push({ seed: beneficiary.seed, teamId: beneficiary.teamId, advancesToMatchOrder })
    }
  }
  return { bracketSize, slots, matches, byeAdvances }
}

// Same persisted bracket contract consumed by tournamentMatches for winner/BYE
// propagation. Only playable first-round matches become tournament_matches.
export function buildCircuitDirectPlayoffPlan(teams: Array<{ teamId: string; seed: number }>) {
  const draw = buildCircuitSeededDraw(teams)
  const phase: 'ROUND_OF_16' | 'EIGHTHS' | 'QUARTER' = draw.bracketSize === 32
    ? 'ROUND_OF_16' : draw.bracketSize === 16 ? 'EIGHTHS' : 'QUARTER'
  const slots = draw.slots.map((slot) => ({
    position: slot.position,
    pair_order: Math.ceil(slot.position / 2),
    pair_slot: slot.position % 2 === 1 ? 1 : 2,
    advances_to_match_order: Math.ceil(Math.ceil(slot.position / 2) / 2),
    is_bye_slot: slot.isBye,
    team_id: slot.teamId,
    global_seed: slot.seed,
  }))
  const firstRoundMatches = draw.matches.map((match, index) => ({
    phase,
    match_order: index + 1,
    bracket_pair_order: match.pairOrder,
    slot_positions: [match.pairOrder * 2 - 1, match.pairOrder * 2],
    team1_id: match.team1Id,
    team2_id: match.team2Id,
  }))
  return {
    phase,
    draw,
    matchInputs: firstRoundMatches.map((match) => ({
      team1Id: match.team1_id,
      team2Id: match.team2_id,
      matchOrder: match.match_order,
    })),
    // The shared Tournament Engine reads source=general_engine to propagate
    // winners into structural BYE slots; this is not a second match engine.
    persistedPlan: {
      version: 1,
      source: 'general_engine',
      draw_mode: 'CIRCUIT_DIRECT',
      bracket_size: draw.bracketSize,
      byes: draw.byeAdvances.length,
      bracket_slots: slots,
      first_round_matches: firstRoundMatches,
    },
  }
}
