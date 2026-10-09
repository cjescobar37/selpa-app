import Link from 'next/link'
import PageHeader from '@/components/navigation/PageHeader'
import type { PairRankingRow } from '@/components/ranking/PairRankingBoard'
import RankingPlayerAvatar from '@/components/ranking/RankingPlayerAvatar'
import RankingRetryButton from '@/components/ranking/RankingRetryButton'
import { ArrowRight, Crown, Trophy, Users, WifiOff, Search } from 'lucide-react'
import { formatRankingGender } from '@/lib/ranking'
import type { RankingContext,RankingPage } from '@/features/player-career/player-career.types'
import { individualRankingEntries, pairRankingEntries, rankingHref, rankingTiers, type RankingEntry, type RankingReadIssue, type RankingSearch } from '@/features/player-career/public-ranking.presentation'
import styles from './PublicRankingExperience.module.css'
export default function PublicRankingExperience({clubs,clubsCount,contexts,ranking,pairs,total,params,error,presentation}:{
  clubs:Array<{id:string;name:string;logo_url:string|null;theme_key:string|null;categoryCount?:number|null}>;clubsCount:number;contexts:RankingContext[];
  ranking:RankingPage;pairs:PairRankingRow[];total:number;params:RankingSearch;error:RankingReadIssue|null;
  presentation:{counts:{M:number|null;F:number|null};leaderPoints:number|null}
}) {
  const clubId=params.clubId ?? params.club
  const context=ranking.context
  const href=(page:number)=>rankingHref(params,{clubId:clubId ?? '',page:String(page)})
  const selectedClub=clubs.find(c=>c.id===clubId)
  const gender=context?.gender ?? params.gender ?? 'M',modality=params.modality ?? 'INDIVIDUAL'
  const entries=modality==='PAIRS'?pairRankingEntries(pairs):individualRankingEntries(ranking.rows)
  const tiers=rankingTiers(entries),search=Boolean(params.q?.trim())
  const filters=contexts.filter(c=>c.modality===modality && c.gender===gender)
  return <main className={styles.shell} data-public-ranking data-gender={gender}>
    {!clubId ? <>
      <header className={styles.indexHero}>
        <div><span className={styles.eyebrow}>El juego deja huella</span><h1>Ranking SELPA</h1><p>Los líderes de hoy. Tu próximo objetivo.</p></div>
        <Trophy className={styles.heroTrophy} size={44} aria-hidden="true"/>
        <span className={styles.heroFoot}>Cada club. Su competencia. Su historia.</span>
      </header>
      <div className={styles.sectionHeading}><h2>Elegí tu club</h2>{!error?<span>{clubsCount} {clubsCount===1?'club':'clubes'}</span>:null}</div>
      {error?<ReadError issue={error} clubName="los clubes"/>:<>
        <div className={styles.clubs}>{clubs.map(club=><Link className={styles.clubCard} key={club.id} href={rankingHref({clubId:club.id,gender:params.gender})}>
          <RankingPlayerAvatar className={styles.clubLogo} name={club.name} src={club.logo_url} sizes="52px"/>
          <div className={styles.clubIdentity}><span className={styles.official}>Ranking oficial</span><h3>{club.name}</h3>
            {club.categoryCount!==null && club.categoryCount!==undefined?<span className={styles.clubDetail}>{club.categoryCount} {club.categoryCount===1?'categoría activa':'categorías activas'}</span>:<span className={styles.clubDetail}>Competencia del club</span>}
          </div><span className={styles.clubCta}>Ver ranking <ArrowRight size={17} aria-hidden="true"/></span>
        </Link>)}</div>
        {!clubs.length?<EmptyState title="La competencia empieza acá" detail="Los clubes aparecerán aquí cuando estén disponibles en SELPA."/>:null}
        {clubsCount>40?<nav className={styles.pager} aria-label="Páginas de clubes">{Number(params.clubsPage ?? 1)>1 ? <Link href={rankingHref({clubsPage:String(Number(params.clubsPage)-1),gender:params.gender})}>Anterior</Link>:<span/>}{Number(params.clubsPage ?? 1)*40<clubsCount ? <Link href={rankingHref({clubsPage:String(Number(params.clubsPage ?? 1)+1),gender:params.gender})}>Más clubes</Link>:null}</nav>:null}
      </>}
    </>:<>
      <PageHeader title="Ranking" eyebrow="Resultados publicados" backHref="/ranking"
        description={[selectedClub?.name ?? 'Club seleccionado',context?.seasonName].filter(Boolean).join(' · ')}/>
      <form className={styles.filters} action="/ranking" method="get">
        <input type="hidden" name="clubId" value={clubId}/>
        <input type="hidden" name="gender" value={gender}/>
        {context?<input type="hidden" name="season" value={context.seasonId}/>:null}
        <label>División y categoría<select name="division" defaultValue={context?.divisionId ?? ''} key={context?.divisionId}>
          {!context?<option value="">Elegir categoría</option>:null}{filters.map(c=><option key={c.divisionId} value={c.divisionId}>{c.categoryName}</option>)}
        </select></label>
        <label>Modalidad<select name="modality" defaultValue={modality}><option value="INDIVIDUAL">Individual</option><option value="PAIRS">Parejas</option></select></label>
        <label className={styles.search}>Buscar {modality==='PAIRS'?'pareja':'jugador'}<input name="q" defaultValue={params.q ?? ''} maxLength={80} placeholder="Nombre del jugador" type="search"/></label>
        <button type="submit"><Search size={17} aria-hidden="true"/><span>Buscar</span></button>
      </form>
      <nav className={styles.genderTabs} aria-label="Ranking por rama">{(['M','F'] as const).map(branch=>
        <Link key={branch} aria-current={gender===branch?'page':undefined} href={rankingHref(params,{gender:branch,division:undefined,page:undefined})}>
          {formatRankingGender(branch)}<span aria-label={`${presentation.counts[branch] ?? 'No disponible'} ${modality==='PAIRS'?'parejas':'jugadores'} rankeados`}>{error?'—':presentation.counts[branch] ?? '—'}</span>
        </Link>)}</nav>
      {context?<p className={styles.context}><span className={styles.scopeDot}/>{context.categoryName} · Ranking anual {modality==='PAIRS'?'de parejas':'individual'}</p>:null}
      {error?<ReadError issue={error} clubName={selectedClub?.name ?? 'este club'} clubId={selectedClub?.id}/>:!context?
        <EmptyState title="Esta categoría todavía no tiene ranking" detail="Probá otra categoría o rama para explorar la competencia del club."/>:
        !entries.length?<EmptyState title={search?'No encontramos ese nombre':ranking.page>1?'No hay resultados en esta página':'El próximo nombre puede ser el tuyo'}
          detail={search?'Probá otro nombre. La búsqueda conserva los puestos oficiales.':ranking.page>1?'Volvé a la primera página para ver la clasificación.':'Todavía no hay jugadores rankeados en esta categoría. Los resultados aparecerán cuando estén disponibles.'}
          href={search?rankingHref(params,{q:undefined,page:undefined}):ranking.page>1?href(1):undefined} action={search?'Ver ranking completo':'Primera página'}/>:
        <>
          {search?<div className={styles.sectionHeading}><h2>Resultados de búsqueda</h2><Link href={rankingHref(params,{q:undefined,page:undefined})}>Quitar búsqueda</Link></div>:null}
          {tiers.leaders.length?<section className={styles.leaders} aria-label="Liderazgo actual">{tiers.leaders.map(entry=><EntryCard key={entry.id} entry={entry} tier="leader" leaderPoints={presentation.leaderPoints}/>)}</section>:null}
          {tiers.challengers.length?<section aria-label="Perseguidores" className={styles.challengers}>
            {!search?<div className={styles.sectionHeading}><h2>Los perseguidores</h2><span>Puestos 2–5</span></div>:null}
            <div className={styles.challengerGrid}>{tiers.challengers.map(entry=><EntryCard key={entry.id} entry={entry} tier="challenger" leaderPoints={presentation.leaderPoints}/>)}</div>
          </section>:null}
          {tiers.rest.length?<section className={styles.classification} aria-label="Clasificación">{!search?<div className={styles.sectionHeading}><h2>La competencia sigue</h2><span>{modality==='PAIRS'?'Parejas':'Jugadores'} rankeados</span></div>:null}
            <div className={styles.rows}>{tiers.rest.map(entry=><EntryCard key={entry.id} entry={entry} tier="row" leaderPoints={null}/>)}</div></section>:null}
        </>}
      {!error && context && (total>0 || ranking.page>1)?<nav className={styles.pager} aria-label="Páginas de ranking">{ranking.page>1?<Link href={href(ranking.page-1)}>Anterior</Link>:<span/>}<span>{total} resultados · Página {ranking.page}</span>{ranking.page*ranking.pageSize<total?<Link href={href(ranking.page+1)}>Siguiente</Link>:<span/>}</nav>:null}
      {!error && entries.length?<p className={styles.footnote}>Puestos oficiales, también al buscar. Los empates comparten posición.</p>:null}
    </>}
  </main>
}

function EntryCard({entry,tier,leaderPoints}:{entry:RankingEntry;tier:'leader'|'challenger'|'row';leaderPoints:number|null}) {
  const delta=leaderPoints===null?null:leaderPoints-entry.points
  const content=<>
    <span className={styles.position}>#{entry.position}</span>
    <div className={styles.avatars}>{entry.avatars.map((avatar,index)=><RankingPlayerAvatar key={index} className={styles.avatar} name={avatar.name} src={avatar.url} sizes={tier==='leader'?'76px':'44px'}/>)}</div>
    <div className={styles.entryIdentity}>
      {tier==='leader'?<span className={styles.leaderLabel}><Crown size={15} aria-hidden="true"/>{entry.isTied?'N°1 · Liderazgo compartido':'N°1 actual'}</span>:null}
      <h3>{entry.name}</h3>
      <span className={styles.entryDetail}>{tier==='leader'?'El rival a vencer':tier==='challenger' && delta!==null && delta>=0?`${delta.toLocaleString('es-AR')} pts del liderazgo`:entry.subtitle}{entry.isTied && tier!=='leader'?' · Empate':''}</span>
    </div>
    <div className={styles.points}><strong>{entry.points.toLocaleString('es-AR')}</strong><span>PTS</span></div>
  </>
  const props={className:[styles.entry,styles[tier],entry.avatars.length>1?styles.pair:''].join(' '),'data-rank-position':entry.position,'data-rank-tier':tier}
  return entry.href?<Link {...props} href={entry.href} aria-label={`${entry.name} · puesto ${entry.position} · ${entry.points} puntos`}>{content}</Link>:<article {...props} aria-label={`${entry.name} · puesto ${entry.position} · ${entry.points} puntos`}>{content}</article>
}
function EmptyState({title,detail,href,action}:{title:string;detail:string;href?:string;action?:string}) {
  return <section className={styles.empty} data-ranking-state="empty"><Users size={26} aria-hidden="true"/><h2>{title}</h2><p>{detail}</p>{href?<Link className={styles.secondaryAction} href={href}>{action}</Link>:null}</section>
}
function ReadError({issue,clubName,clubId}:{issue:RankingReadIssue;clubName:string;clubId?:string}) {
  return <section className={styles.readError} role="alert" data-ranking-state="error" data-read-issue={issue}>
    <WifiOff size={27} aria-hidden="true"/><span className={styles.eyebrow}>Resultados oficiales · {clubName}</span><h2>El ranking no está disponible por el momento</h2>
    <p>{issue==='MODEL_UNAVAILABLE'?'La lectura de sus resultados oficiales todavía no está habilitada en este entorno.':'No pudimos conectar con sus resultados. Podés volver a intentarlo sin perder los filtros.'}</p>
    <div className={styles.errorActions}><RankingRetryButton className={styles.primaryAction}/><Link className={styles.secondaryAction} href={clubId?'/clubs/'+clubId:'/ranking'}>{clubId?'Ver el club':'Volver a clubes'}</Link></div>
    <small>La clasificación se mostrará cuando la lectura esté disponible.</small>
  </section>
}
