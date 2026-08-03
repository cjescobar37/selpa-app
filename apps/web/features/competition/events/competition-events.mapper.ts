import type { CompetitionEventDetail } from './competition-events.types'
export function toCompetitionEventAdminDto(detail:CompetitionEventDetail,role:string|null,platform=false){
  void role
  void platform
  const canonical=detail.completeness.allowed_actions
  const allowedActions=canonical&&typeof canonical==='object'&&!Array.isArray(canonical)
    ? canonical as Record<string,boolean>
    : {edit:false,schedule:false,reschedule:false,complete:false,cancel:false,archive:false,link_tournament:false,unlink_tournament:false}
  return {...detail,allowed_actions:allowedActions}
}
