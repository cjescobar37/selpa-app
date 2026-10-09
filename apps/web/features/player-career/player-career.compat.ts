import 'server-only'
import type { CareerIdentity,CareerSummary } from './player-career.types'
/** Transitional editor DTO. Sports algorithms live in the shared repository. */
export function editorCareerDto(identity:CareerIdentity,summary:CareerSummary) {
  const context=identity.contexts.find(c=>c.clubPlayerId===identity.selectedClubPlayerId)!
  return {
    visibility:'public',club:{id:context.clubId,name:context.clubName,city:null,logo_url:null},
    player:{id:context.clubPlayerId,user_id:identity.userId,full_name:identity.name,
      category:summary.standing?.category ?? context.category,gender:summary.standing?.gender ?? context.gender,
      ranking_points:summary.standing?.ranking_points ?? null,ranking_position:summary.standing?.position ?? null,preferred_position:null},
    profile:{user_id:identity.userId,display_name:identity.name,avatar_url:identity.avatarUrl,cover_url:identity.coverUrl},
    stats:summary.stats,statsAvailable:summary.statsAvailable,summary,frequent_partner:null,
    tournament_history:[],recent_matches:[],activity:[],
  }
}
