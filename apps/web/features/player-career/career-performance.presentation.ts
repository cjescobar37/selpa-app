import type { CareerStats } from './player-career.types'

/** Presentation only. Never reconstruct official points, positions or win rate. */
export function careerPerformance(stats: CareerStats | null | undefined, available: boolean) {
  if (!available || !stats) return null
  const counts = [stats.matches_played, stats.wins, stats.losses, stats.tournaments_played]
  if (counts.some(value => !Number.isSafeInteger(value) || value < 0)) return null
  const rate = stats.effectiveness
  return {
    played: stats.matches_played, wins: stats.wins, losses: stats.losses,
    effectiveness: rate !== null && Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : null,
    winShare: stats.matches_played > 0 && stats.wins + stats.losses === stats.matches_played
      ? stats.wins / stats.matches_played * 100 : null,
  }
}
