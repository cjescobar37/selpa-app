import { NextRequest,NextResponse } from 'next/server'
import { authorizeCompetitionSeries } from '@/features/competition/series/competition-series.auth'
import { readSeriesJson,seriesErrorResponse } from '@/features/competition/series/competition-series.http'
import { rpc } from '@/features/competition/series/competition-series.repository'
import { isUuid,validateLifecycle } from '@/features/competition/series/competition-series.validation'
type Context={params:Promise<{clubId:string;seriesId:string}>}
export async function POST(req:NextRequest,context:Context){
  const {clubId,seriesId}=await context.params
  if(!isUuid(clubId)||!isUuid(seriesId))return NextResponse.json({error:'Identificador inválido.'},{status:400})
  const auth=await authorizeCompetitionSeries(req,clubId,'write');if(auth.error||!auth.client)return auth.error
  const body=await readSeriesJson(req);if('error'in body)return body.error
  const validation=validateLifecycle(body.value);if('error'in validation)return NextResponse.json({error:validation.error},{status:400})
  const v=validation.value;const base={p_club_id:clubId,p_series_id:seriesId,p_revision:v.revision}
  const operation={SCHEDULE:['schedule_competition_series',base],RETURN_TO_DRAFT:['return_competition_series_to_draft',base],ACTIVATE:['activate_competition_series',{...base,p_confirm:v.confirm}],CLOSE:['finalize_competition_series_atomic',base],CANCEL:['cancel_competition_series',{...base,p_reason:v.reason}],ARCHIVE:['archive_competition_series',base]}[v.action] as [string,Record<string,unknown>]
  try{return NextResponse.json({ok:true,series:await rpc(auth.client,operation[0],operation[1])})}catch(error){return seriesErrorResponse(error)}
}
