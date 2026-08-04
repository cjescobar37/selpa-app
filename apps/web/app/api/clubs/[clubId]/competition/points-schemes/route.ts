import {NextRequest,NextResponse} from 'next/server'
import {authorizeCompetitionSeries} from '@/features/competition/series/competition-series.auth'
import {listSchemes,rpc} from '@/features/competition/points-schemes/points-schemes.repository'
import {object,text} from '@/features/competition/points-schemes/points-schemes.validation'
import {pointsError} from '@/features/competition/points-schemes/points-schemes.http'
type C={params:Promise<{clubId:string}>}; async function body(req:NextRequest){if(Number(req.headers.get('content-length')||0)>32768)throw new Error('BODY_TOO_LARGE');return object(await req.json())}
export async function GET(req:NextRequest,c:C){const {clubId}=await c.params;const auth=await authorizeCompetitionSeries(req,clubId,'read');if(auth.error||!auth.client)return auth.error;try{return NextResponse.json({schemes:await listSchemes(auth.client,clubId)})}catch(e){return pointsError(e)}}
export async function POST(req:NextRequest,c:C){const {clubId}=await c.params;const auth=await authorizeCompetitionSeries(req,clubId,'write');if(auth.error||!auth.client)return auth.error;try{const v=await body(req);const scheme=await rpc(auth.client,'create_points_scheme',{p_club_id:clubId,p_name:text(v.name,true),p_description:text(v.description)});return NextResponse.json({scheme},{status:201})}catch(e){return pointsError(e)}}
