import { displayBracket, info, matchState, schedule, scoreColumns, type DisplaySlot, type MobilePlayoffMatch, type Round } from './playoffPresentation'
import { groupTiebreakerCriterionOptions, groupTiebreakerFinalOptions } from '@/lib/tournamentTiebreakers'

// Explicit public, printable DTO. No user IDs, emails, payments or administrative fields.
export type PdfTeam = { name: string; seed: number | null; winner: boolean; scores: string[] }
export type PdfMatch = { code: string; state: string; date: string; time: string; court: string; teams: PdfTeam[]; labels: string[]; sources: string[] }
export type PdfRound = { name: string; matches: PdfMatch[] }
export type PdfGroup = { name: string; rows: { name: string; seed: number | null; qualified: boolean; metrics: number[] }[]; matches: PdfMatch[]; tiebreakLabel: string | null }
export type TournamentExportData = { name: string; clubName: string; categoryLabel: string; gender: string; startDate: string; endDate: string; champion: string | null; rounds: PdfRound[]; groups: PdfGroup[] }
type GroupInput = { id: string; name: string; teams: { team_id: string; seed: number }[] }
type StandingsInput = { group: { id: string }; qualifiers: { team_id: string }[]; standings: { team_id: string; played: number; wins: number; losses: number; match_points: number; set_difference: number; game_difference: number }[]; tiebreakers?: { resolvedBy: string }[] }

const tiebreakLabels = new Map<string, string>([...groupTiebreakerCriterionOptions, ...groupTiebreakerFinalOptions].map((option) => [option.value, option.label]))

export function appliedTiebreakLabel(tiebreakers?: { resolvedBy: string }[]) {
  const labels = [...new Set((tiebreakers ?? []).map((decision) => tiebreakLabels.get(decision.resolvedBy)).filter((label): label is string => Boolean(label)))]
  return labels.length ? labels.join(' · ') : null
}

function printableMatch(slot: DisplaySlot): PdfMatch {
  const scores = scoreColumns(slot.match)
  return {
    code: slot.code, state: matchState(slot).label, ...schedule(slot.match), labels: scores.map((s) => s.label),
    sources: slot.teams.flatMap((t) => t.source ? [t.source] : []),
    teams: slot.teams.map((team, side) => ({ name: team.name, seed: team.seed,
      winner: slot.kind === 'bye' || Boolean(team.id && team.id === slot.match?.winner_team_id),
      scores: slot.kind === 'match' ? scores.map((s) => String((side === 0 ? s.first : s.second) ?? '-')) : [],
    })),
  }
}
export function tournamentExportData(metadata: Omit<TournamentExportData, 'rounds' | 'groups'>, rounds: Round[], groups: GroupInput[], standings: StandingsInput[], groupMatches: MobilePlayoffMatch[], names: ReadonlyMap<string, string>, seeds: ReadonlyMap<string, number>): TournamentExportData {
  return { ...metadata,
    rounds: displayBracket(rounds, names, seeds).map((r) => ({ name: info(r).label, matches: r.slots.map(printableMatch) })),
    groups: groups.map((group) => {
      const block = standings.find((s) => s.group.id === group.id)
      const matches = groupMatches.filter((m) => m.group_id === group.id).sort((a, b) => a.round - b.round || a.match_order - b.match_order)
      const display = displayBracket([{ phase: 'GROUP', label: 'Grupos', slots: matches.map((match, i) => ({ id: match.id, slotOrder: i + 1, kind: 'match', match })) }], names, seeds)
      return { name: `Grupo ${group.name}`,
        rows: (block?.standings ?? []).map((r) => ({ name: names.get(r.team_id) ?? 'Pareja por confirmar', seed: seeds.get(r.team_id) ?? null,
          qualified: Boolean(block?.qualifiers.some((q) => q.team_id === r.team_id)),
          metrics: [r.match_points, r.played, r.wins, r.losses, r.set_difference, r.game_difference],
        })),
        matches: display[0].slots.map(printableMatch),
        tiebreakLabel: appliedTiebreakLabel(block?.tiebreakers),
      }
    }),
  }
}
