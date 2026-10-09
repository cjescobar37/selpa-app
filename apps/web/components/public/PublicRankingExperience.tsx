import Link from 'next/link'
import PageHeader from '@/components/navigation/PageHeader'
import RankingBoard from '@/components/ranking/RankingBoard'
import PairRankingBoard,{type PairRankingRow} from '@/components/ranking/PairRankingBoard'
import { formatRankingGender } from '@/lib/ranking'
import type { RankingContext,RankingPage } from '@/features/player-career/player-career.types'
import type { RankingSearch } from '@/app/ranking/page'
import styles from './PublicRankingExperience.module.css'
export default function PublicRankingExperience({clubs,clubsCount,contexts,ranking,pairs,total,params,error}:{
  clubs:Array<{id:string;name:string;logo_url:string|null;theme_key:string|null}>;clubsCount:number;contexts:RankingContext[];
  ranking:RankingPage;pairs:PairRankingRow[];total:number;params:RankingSearch;error:boolean
}) {
  const clubId=params.clubId ?? params.club
  const context=ranking.context
  const href=(page:number)=>'/ranking?'+new URLSearchParams({...Object.fromEntries(Object.entries(params).filter(([,v])=>v!==undefined)) as Record<string,string>,clubId:clubId ?? '',page:String(page)})
  const selectedClub=clubs.find(c=>c.id===clubId)
  return <main className={styles.shell}>
    <PageHeader title="Ranking" eyebrow="Resultados publicados" backHref={clubId?'/ranking':'/'}
      description={context?[(selectedClub?.name ?? 'Club seleccionado'),context.seasonName].join(' · '):'Elegí un club y un ámbito deportivo. Los puntos no se suman entre clubes.'}/>
    {!clubId ? <>
      <div className={styles.clubs}>{clubs.map(club=><Link key={club.id} href={'/ranking?clubId='+club.id}><strong>{club.name}</strong><span>Ver ranking del club</span></Link>)}</div>
      <nav className={styles.pager} aria-label="Páginas de clubes">{Number(params.clubsPage ?? 1)>1 ? <Link href={'/ranking?clubsPage='+(Number(params.clubsPage)-1)}>Anterior</Link>:null}{Number(params.clubsPage ?? 1)*40<clubsCount ? <Link href={'/ranking?clubsPage='+(Number(params.clubsPage ?? 1)+1)}>Más clubes</Link>:null}</nav>
      {!clubs.length?<p>No hay clubes públicos disponibles.</p>:null}
    </>:<>
      <form className={styles.filters} action="/ranking" method="get">
        <input type="hidden" name="clubId" value={clubId}/>
        {context?<input type="hidden" name="season" value={context.seasonId}/>:null}
        <label>División y categoría<select name="division" defaultValue={context?.divisionId ?? ''} key={context?.divisionId}>
          {!context?<option value="">Elegir ámbito</option>:null}{contexts.filter(c=>c.modality===(params.modality ?? 'INDIVIDUAL')).map(c=><option key={c.divisionId} value={c.divisionId}>{c.categoryName} · {formatRankingGender(c.gender)}</option>)}
        </select></label>
        <label>Modalidad<select name="modality" defaultValue={params.modality ?? 'INDIVIDUAL'}><option value="INDIVIDUAL">Individual</option><option value="PAIRS">Puntos logrados juntos</option></select></label>
        <label className={styles.search}>Buscar jugador<input name="q" defaultValue={params.q ?? ''} maxLength={80} placeholder="Nombre" type="search"/></label>
        <button type="submit">Aplicar</button>
      </form>
      {context?<p className={styles.context}>{context.categoryName} · {formatRankingGender(context.gender)} · {context.seasonName} · Ranking anual · {params.modality==='PAIRS'?'Puntos obtenidos juntos':'Individual'}</p>:null}
      {error?<div role="alert" className={styles.state}><strong>Ranking pendiente de lectura</strong><p>No mostramos puntos legacy ni reemplazamos una lectura fallida por ceros. Reintentá más tarde.</p></div>:
        !context?<div className={styles.state}>Este club no tiene un ámbito activo compatible con los filtros. Elegí una división disponible.</div>:
        params.modality==='PAIRS'?pairs.length?<PairRankingBoard rows={pairs}/>:<p>No hay parejas publicadas para esta búsqueda y ámbito.</p>:
        ranking.rows.length?<RankingBoard showMetadata={false} showColumnHeader={false} columns={[{gender:context.gender==='F'?'F':'M',rows:ranking.rows.map(row=>({id:row.club_player_id,name:row.full_name,avatarUrl:row.avatar_url,category:row.category,gender:row.gender,points:row.ranking_points,position:row.position,isTied:row.is_tied,href:'/jugadores/'+row.user_id+'?clubId='+row.club_id}))}]}/>:<p>No hay jugadores para esta búsqueda y ámbito.</p>}
      <nav className={styles.pager} aria-label="Páginas de ranking">{ranking.page>1?<Link href={href(ranking.page-1)}>Anterior</Link>:<span/>}<span>{total} resultados · Página {ranking.page}</span>{ranking.page*ranking.pageSize<total?<Link href={href(ranking.page+1)}>Siguiente</Link>:<span/>}</nav>
      <p className={styles.context}>La búsqueda y la paginación conservan la posición del universo completo de esta división. Los empates de puntos comparten posición.</p>
    </>}
  </main>
}
