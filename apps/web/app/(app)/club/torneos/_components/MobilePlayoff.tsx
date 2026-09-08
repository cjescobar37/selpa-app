'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, Maximize2, Minus, Plus, RotateCcw, X } from 'lucide-react'
import { useBracketViewport } from './useBracketViewport'
import styles from './MobilePlayoff.module.css'

import { displayBracket, bracketPath, info, schedule, matchState, scoreColumns, type MobilePlayoffMatch, type Slot, type Round, type DisplaySlot, type DisplayRound } from './playoffPresentation'
export type { MobilePlayoffMatch } from './playoffPresentation'
type Props = {
  rounds: Round[]
  exportAction?: ReactNode
  currentPhase?: string
  champion?: string | null
  nextMatch?: MobilePlayoffMatch | null
  teamNames: ReadonlyMap<string, string>
  teamSeeds: ReadonlyMap<string, number>
  canEditResults: boolean
  canSchedule: boolean
  onResult: (match: MobilePlayoffMatch) => void
  onSchedule: (match: MobilePlayoffMatch) => void
  scheduleDisabledReason: (match: MobilePlayoffMatch) => string
}
let openOverlayCount = 0
let pageLockBeforeOverlays: {
  bodyOverflow: string
  bodyPosition: string
  bodyTop: string
  bodyWidth: string
  htmlScrollBehavior: string
  scrollY: number
} | null = null

/** Portals escape the tournament stacking context and the sticky navbar.
 * Native dialog supplies focus trapping, Escape and background inertness. */
function Overlay({ children, title, fullscreen = false, initialScrollY, onClose }: { children: ReactNode; title: string; fullscreen?: boolean; initialScrollY?: number; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const startY = useRef<number | null>(null)
  useEffect(() => {
    const dialog = ref.current
    if (openOverlayCount === 0) {
      const { body, documentElement } = document
      pageLockBeforeOverlays = {
        bodyOverflow: body.style.overflow,
        bodyPosition: body.style.position,
        bodyTop: body.style.top,
        bodyWidth: body.style.width,
        htmlScrollBehavior: documentElement.style.scrollBehavior,
        scrollY: initialScrollY ?? window.scrollY,
      }
      documentElement.style.scrollBehavior = 'auto'
      body.style.overflow = 'hidden'
      body.style.position = 'fixed'
      body.style.top = `-${pageLockBeforeOverlays.scrollY}px`
      body.style.width = '100%'
    }
    openOverlayCount += 1
    dialog?.showModal()
    return () => {
      dialog?.close()
      openOverlayCount -= 1
      if (openOverlayCount === 0 && pageLockBeforeOverlays) {
        const previous = pageLockBeforeOverlays
        const { body, documentElement } = document
        body.style.overflow = previous.bodyOverflow
        body.style.position = previous.bodyPosition
        body.style.top = previous.bodyTop
        body.style.width = previous.bodyWidth
        pageLockBeforeOverlays = null
        const restoreScroll = () => window.scrollTo(0, previous.scrollY)
        restoreScroll()
        requestAnimationFrame(() => requestAnimationFrame(restoreScroll))
        window.setTimeout(restoreScroll, 80)
        window.setTimeout(() => { documentElement.style.scrollBehavior = previous.htmlScrollBehavior }, 120)
      }
    }
  }, [initialScrollY])
  return createPortal(
    <dialog ref={ref} className={fullscreen ? styles.fullscreen : styles.sheet} aria-label={title}
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose() } }}>
      <header className={styles.overlayHead}
        onPointerDown={(event) => { if (!fullscreen && !(event.target as HTMLElement).closest('button')) { startY.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId) } }}
        onPointerUp={(event) => { if (startY.current !== null && event.clientY - startY.current > 60) onClose(); startY.current = null }}
        onPointerCancel={() => { startY.current = null }}>
        {!fullscreen && <span className={styles.handle} aria-hidden="true" />}
        <strong>{title}</strong><button className={styles.iconButton} type="button" aria-label={`Cerrar ${fullscreen ? 'cuadro completo' : 'detalle'}`} onClick={onClose}><X size={20} /></button>
      </header>
      {children}
    </dialog>, document.body,
  )
}

export default function MobilePlayoff(props: Props) {
  const { rounds, teamNames, teamSeeds, canEditResults, canSchedule, onResult, onSchedule } = props
  const [view, setView] = useState<'round' | 'bracket'>('round')
  const [phase, setPhase] = useState(props.currentPhase ?? rounds[0]?.phase)
  const [fullscreen, setFullscreen] = useState(false)
  const [fullscreenOriginY, setFullscreenOriginY] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [followTeam, setFollowTeam] = useState<string | null>(null)
  const [hint, setHint] = useState(true)
  const root = useRef<HTMLDivElement>(null)
  const nav = useRef<HTMLDivElement>(null)
  const bracketApi = useRef<{ go: (index: number) => void; reset: () => void } | null>(null)
  const panelId = useId()
  const activeIndex = Math.max(0, rounds.findIndex((round) => round.phase === phase))

  const displayRounds = useMemo(() => displayBracket(rounds, teamNames, teamSeeds), [rounds, teamNames, teamSeeds])
  const selected = displayRounds.flatMap((round) => round.slots).find((slot) => slot.id === selectedId)
  const followedName = followTeam ? teamNames.get(followTeam) ?? displayRounds.flatMap((round) => round.slots).flatMap((slot) => slot.teams).find((team) => team.id === followTeam)?.name : null
  const journey = useMemo(() => bracketPath(rounds, followTeam), [rounds, followTeam])
  const path = journey.ids

  useEffect(() => {
    const requestedPhase = props.currentPhase
    if (requestedPhase && rounds.some((round) => round.phase === requestedPhase)) queueMicrotask(() => setPhase(requestedPhase))
  }, [props.currentPhase, rounds])
  useEffect(() => {
    const navbar = document.querySelector<HTMLElement>('.px-nav')
    const measure = () => root.current?.style.setProperty('--playoff-nav-offset', `${navbar?.offsetHeight ?? 0}px`)
    const observer = new ResizeObserver(measure)
    if (navbar) observer.observe(navbar)
    measure()
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const active = nav.current?.querySelector<HTMLElement>('[aria-current="step"]')
    const strip = active?.parentElement
    if (active && strip) strip.scrollTo({ left: active.offsetLeft - strip.offsetLeft - (strip.clientWidth - active.clientWidth) / 2 })
  }, [phase])
  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)')
    const close = () => { if (!query.matches) { setFullscreen(false); setSelectedId(null) } }
    query.addEventListener('change', close)
    return () => query.removeEventListener('change', close)
  }, [])

  const dismissHint = () => { setHint(false); try { sessionStorage.setItem('selpa-playoff-swipe-seen', '1') } catch { /* private browsing */ } }
  const showBracket = () => {
    try { if (sessionStorage.getItem('selpa-playoff-swipe-seen')) setHint(false) } catch { /* private browsing */ }
    setView('bracket')
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = nav.current
      const stage = root.current?.querySelector<HTMLElement>(`.${styles.bracketContent}`)
      if (!target || !stage) return
      const navbarHeight = document.querySelector<HTMLElement>('.px-nav')?.offsetHeight ?? 0
      const stageTop = stage.getBoundingClientRect().top + window.scrollY
      window.scrollTo({ top: Math.max(0, stageTop - navbarHeight - target.offsetHeight), behavior: 'auto' })
    }))
  }
  const showFullscreenBracket = () => { setFullscreenOriginY(window.scrollY); setFullscreen(true) }
  const selectRound = (index: number) => {
    setPhase(rounds[index].phase)
    if (view === 'bracket' || fullscreen) { dismissHint(); bracketApi.current?.go(index) }
  }
  const edit = (match: MobilePlayoffMatch, action: 'result' | 'schedule') => {
    setSelectedId(null); setFullscreen(false)
    requestAnimationFrame(() => action === 'result' ? onResult(match) : onSchedule(match))
  }
  const actionable = (slot: Slot) => Boolean(canEditResults && slot.match && ['PENDING', 'PLAYED', 'IN_PROGRESS', 'LIVE'].includes(slot.match.status?.toUpperCase() ?? ''))
  const follow = (id: string) => setFollowTeam((current) => current === id ? null : id)

  const teams = (slot: DisplaySlot, compact = false, detail = false, overview = false) => {
    const columns = scoreColumns(slot.match)
    return <div className={`${styles.teams} ${compact ? styles.compactTeams : ''} ${detail ? styles.detailTeams : ''}`}>
      {slot.kind === 'match' && <div className={styles.scoreLabels}><span />{columns.map((column) => <span key={column.label}>{column.label}</span>)}</div>}
      {slot.teams.map((team, side) => {
        const winner = slot.kind === 'bye' || Boolean(team.id && slot.match?.winner_team_id === team.id)
        const overviewName = team.id ? team.name.split(' / ').map((name) => name.trim().split(/\s+/).at(-1)).join(' / ') : team.name
        const content = <><span className={styles.seed}>{team.seed !== null ? `(${team.seed})` : ''}</span><span className={styles.teamName} title={team.name}>{overview ? overviewName : team.name}</span>{winner && <Check size={12} aria-label="Ganador" className={styles.winnerCheck} />}</>
        return <div className={`${styles.teamRow} ${winner ? styles.winner : ''} ${!team.id ? styles.unknown : ''}`} key={`${slot.id}-${side}`}>
          {compact && team.id ? <button type="button" className={styles.teamButton} aria-pressed={followTeam === team.id} aria-label={`Seguir a ${team.name}`} onClick={() => follow(team.id!)}>{content}</button>
            : <span className={styles.teamIdentity}>{content}</span>}
          {slot.kind === 'match' && columns.map((column) => {
            const value = side === 0 ? column.first : column.second
            const other = side === 0 ? column.second : column.first
            return <span className={`${styles.score} ${value !== null && other !== null && value > other ? styles.wonSet : ''}`} key={column.label}>{value ?? '—'}</span>
          })}
        </div>
      })}
    </div>
  }
  const card = (slot: DisplaySlot, compact = false, overview = false) => {
    const state = matchState(slot)
    const when = schedule(slot.match)
    return <article id={compact ? undefined : `playoff-match-${slot.match?.id ?? slot.id}`}
      className={`${styles.card} ${compact ? styles.bracketCard : ''} ${slot.kind === 'bye' ? styles.bye : slot.kind === 'placeholder' ? styles.future : ''} ${followTeam && compact ? path.has(slot.id) ? styles.following : styles.dimmed : ''}`}
      data-slot={slot.code}>
      <div className={styles.cardHead}>
        <button className={styles.matchLink} type="button" aria-label={`Ver detalle de ${slot.code}`} onClick={() => setSelectedId(slot.id)}>
          {compact ? slot.code : `${info(rounds[slot.roundIndex]).label} · ${slot.code}`}
        </button>
        <span className={styles.state} data-state={state.tone}>{state.label}{slot.kind === 'bye' && ' ✓'}</span>
        {!compact && actionable(slot) && <button type="button" className={styles.action} onClick={() => edit(slot.match!, 'result')}>{slot.match?.status === 'PLAYED' ? 'Editar' : 'Cargar'}</button>}
      </div>
      {!compact && slot.kind === 'match' && <button className={styles.schedule} type="button" onClick={() => setSelectedId(slot.id)}>{when.date} · {when.time} · {when.court}</button>}
      {teams(slot, compact, false, overview)}
      {!compact && slot.kind === 'placeholder' && <span className={styles.waitingNote}>Se define al completar {slot.roundIndex > 0 ? info(rounds[slot.roundIndex - 1]).label : 'la ronda anterior'}.</span>}
      {compact && <button type="button" className={styles.cardSurface} aria-label={`Abrir partido ${slot.code}`} onClick={() => setSelectedId(slot.id)} tabIndex={-1} />}
    </article>
  }
  const roundNav = (mini = false) => <nav className={mini ? styles.minimap : styles.roundNav} aria-label={mini ? 'Mapa del cuadro' : 'Rondas del playoff'}>
    {rounds.map((round, index) => <button type="button" key={round.phase} data-path={round.slots.some((slot) => path.has(slot.id)) || undefined} aria-current={index === activeIndex ? 'step' : undefined} onClick={() => selectRound(index)} aria-label={info(round).label}>{mini ? info(round).short : info(round).label}</button>)}
  </nav>
  const tracking = followTeam && <div className={styles.tracking}><span>Siguiendo a <b>{followedName}</b><small>{journey.eliminatedAt ? `Terminó en ${journey.eliminatedAt}` : 'Camino posible'} · {journey.steps.join(' → ')}</small></span><button type="button" onClick={() => setFollowTeam(null)} aria-label="Quitar seguimiento"><X size={18} /></button></div>
  const nextWhen = schedule(props.nextMatch ?? undefined)
  const nextSlot = displayRounds.flatMap((round) => round.slots).find((slot) => slot.match?.id === props.nextMatch?.id)
  const matches = rounds.flatMap((round) => round.slots).flatMap((slot) => slot.match ? [slot.match] : [])
  const renderBracket = (full: boolean) => <MobileBracket rounds={displayRounds} activeIndex={activeIndex} onRound={(index) => setPhase(rounds[index].phase)}
    onInteract={dismissHint} apiRef={bracketApi} full={full} path={path} following={Boolean(followTeam)} renderCard={(slot, overview) => card(slot, true, overview)} />

  return <div className={styles.host} ref={root} data-playoff-mobile>
    <section className={styles.summary} aria-label="Resumen del playoff">
      <div className={styles.currentRound}><span>Ronda actual</span><strong>{props.champion ? 'Finalizado' : info(rounds.find((round) => round.phase === props.currentPhase) ?? rounds[0]).label}</strong></div>
      <span className={styles.progress}><b>{matches.filter((match) => match.status === 'PLAYED').length}/{matches.length}</b> jugados</span>
      <div className={styles.exportAction}>{props.exportAction}</div>
      <div className={styles.champion}><span>Campeón</span><b>{props.champion || 'Por definirse'}</b></div>
      {props.nextMatch && nextSlot ? <button className={styles.next} type="button" onClick={() => { setPhase(rounds[nextSlot.roundIndex].phase); setSelectedId(nextSlot.id) }}><span>Próximo · {nextSlot.code}</span><b>{nextWhen.date} · {nextWhen.time} · {nextWhen.court}</b></button> : <span className={styles.next}>No hay partidos pendientes.</span>}
    </section>
    <div className={styles.navigation} ref={nav}>
      <div className={styles.switch} role="group" aria-label="Vista del playoff">
        <button type="button" aria-pressed={view === 'round'} aria-controls={panelId} onClick={() => setView('round')}>Ronda</button>
        <button type="button" aria-pressed={view === 'bracket'} aria-controls={panelId} onClick={showBracket}>Cuadro</button>
      </div>
      {roundNav(view === 'bracket')}
    </div>
    <div id={panelId} className={`${styles.content} ${view === 'bracket' ? styles.bracketContent : ''}`}>
      {view === 'round' ? <div className={styles.roundList} aria-label={info(rounds[activeIndex]).label}>{displayRounds[activeIndex].slots.map((slot) => <div key={slot.id}>{card(slot)}</div>)}</div>
        : <>
          <div className={styles.bracketTools}><span>{hint ? '☝ Deslizá para recorrer las llaves' : info(rounds[activeIndex]).label}</span><button type="button" onClick={showFullscreenBracket}><Maximize2 size={15} /> Cuadro completo</button></div>
          {tracking}
          {!fullscreen && renderBracket(false)}
        </>}
    </div>
    {fullscreen && <Overlay title="Cuadro completo" fullscreen initialScrollY={fullscreenOriginY} onClose={() => setFullscreen(false)}>
      {roundNav(true)}{tracking}{renderBracket(true)}
    </Overlay>}
    {selected && <Overlay title={`${info(rounds[selected.roundIndex]).label} · ${selected.code}`} onClose={() => setSelectedId(null)}>
      <div className={styles.sheetBody}>
        <span className={styles.state} data-state={matchState(selected).tone}>{matchState(selected).label}</span>
        {selected.match && <dl className={styles.matchFacts}><div><dt>Fecha</dt><dd>{schedule(selected.match).date}</dd></div><div><dt>Hora</dt><dd>{schedule(selected.match).time}</dd></div><div><dt>Cancha</dt><dd>{schedule(selected.match).court.replace(/^Cancha\s*/i, '')}</dd></div></dl>}
        {teams(selected, false, true)}
        {selected.match?.score?.text && !Array.isArray(selected.match.score.sets) ? <p>{String(selected.match.score.text)}</p> : null}
        {selected.teams.some((team) => team.source) && <div className={styles.sources}><b>De dónde vienen</b>{selected.teams.map((team, index) => team.source && <span key={index}>{team.source}{team.id ? ` · ${team.name}` : ''}</span>)}</div>}
        {selected.kind === 'bye' && <p className={styles.sourceNote}>Esta pareja pasa a la siguiente ronda sin jugar este cruce.</p>}
        {selected.match && (actionable(selected) || canSchedule) && <div className={styles.sheetActions}>
          {actionable(selected) && <button type="button" className={styles.primary} onClick={() => edit(selected.match!, 'result')}>{selected.match.status === 'PLAYED' ? 'Editar resultado' : 'Cargar resultado'}</button>}
          {canSchedule && !props.scheduleDisabledReason(selected.match) && <button type="button" className={styles.secondary} onClick={() => edit(selected.match!, 'schedule')}>Cambiar horario/cancha</button>}
        </div>}
      </div>
    </Overlay>}
  </div>
}

function MobileBracket({ rounds, activeIndex, onRound, onInteract, apiRef, full, path, following, renderCard }: {
  rounds: DisplayRound[]; activeIndex: number; onRound: (index: number) => void; onInteract: () => void
  apiRef: React.RefObject<{ go: (index: number) => void; reset: () => void } | null>
  full: boolean; path: Set<string>; following: boolean; renderCard: (slot: DisplaySlot, overview: boolean) => ReactNode
}) {
  const [width, setWidth] = useState(360)
  const [overview, setOverview] = useState(full)
  const activeRef = useRef(activeIndex)
  const initialRoundPositioned = useRef(false)
  const dataRef = useRef({ rounds, path })
  useEffect(() => { activeRef.current = activeIndex; dataRef.current = { rounds, path } }, [activeIndex, rounds, path])
  const cardWidth = overview ? Math.max(124, Math.min(148, (width / .6 - 24) / rounds.length - 14)) : Math.min(full ? 340 : 380, Math.max(205, width - (width > 600 ? 170 : 100)))
  const gap = overview ? 14 : 32
  const inset = overview ? 12 : 44
  const pitch = cardWidth + gap
  const basePitch = overview ? 102 : 128
  const center = useCallback((ri: number, si: number) => 60 + ((si + .5) * 2 ** ri - .5) * basePitch, [basePitch])
  const height = Math.max(128, rounds[0].slots.length * basePitch)
  const treeWidth = rounds.length * pitch + (overview ? 24 : 76)
  const { viewport, zoom, zoomAt, fit } = useBracketViewport(treeWidth, height, full)
  useEffect(() => {
    const el = viewport.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [viewport])
  useEffect(() => {
    const go = (index: number, behavior: ScrollBehavior = 'smooth') => {
      const el = viewport.current
      if (!el) return
      const focusIndex = Math.max(0, dataRef.current.rounds[index].slots.findIndex((slot) => dataRef.current.path.has(slot.id)))
      const targetY = center(index, focusIndex) * zoom
      el.scrollTo({ left: index * pitch * zoom, top: Math.max(0, targetY - el.clientHeight / 2), behavior })
    }
    apiRef.current = { go, reset: () => { zoomAt(1); go(activeRef.current) } }
    if (!full && !initialRoundPositioned.current && viewport.current?.clientWidth === width) {
      initialRoundPositioned.current = true
      go(activeRef.current, 'instant')
    }
    return () => { apiRef.current = null }
  }, [apiRef, pitch, zoom, zoomAt, viewport, center, full, width])
  return <div className={`${styles.bracketWrap} ${full ? styles.fullBracket : ''} ${overview ? styles.overview : ''}`}>
    <div className={styles.canvas} ref={viewport} aria-label="Cuadro navegable" tabIndex={0}
      onTouchStart={onInteract} onPointerDown={onInteract}
      onScroll={(event) => {
        const el = event.currentTarget
        const index = Math.min(rounds.length - 1, Math.max(0, Math.round(el.scrollLeft / (pitch * zoom))))
        if (index !== activeRef.current) {
          onRound(index)
          const nearest = Math.max(0, rounds[index].slots.findIndex((slot) => center(index, slot.slotOrder - 1) * zoom >= el.scrollTop))
          const y = center(index, nearest) * zoom
          if (y > el.scrollTop + el.clientHeight - 60 || y < el.scrollTop + 40) el.scrollTop = Math.max(0, y - el.clientHeight / 2)
        }
      }}>
      <div style={{ width: treeWidth * zoom, height: height * zoom }}>
        <div className={styles.tree} style={{ width: treeWidth, height, transform: `scale(${zoom})` }}>
          <svg className={styles.connectors} width={treeWidth} height={height} aria-hidden="true">
            {rounds.slice(0, -1).flatMap((round, ri) => round.slots.map((slot, si) => {
              const next = rounds[ri + 1].slots[Math.floor(si / 2)]
              if (!next) return null
              const x = inset + ri * pitch + cardWidth
              const y = center(ri, si)
              const endY = center(ri + 1, Math.floor(si / 2))
              return <path key={slot.id} d={`M${x},${y} H${x + gap / 2} V${endY} H${x + gap}`} className={following ? path.has(slot.id) && path.has(next.id) ? styles.pathLine : styles.dimLine : undefined} />
            }))}
          </svg>
          {rounds.map((round, ri) => <section key={round.phase} className={styles.lane} aria-label={info(round).label} style={{ left: inset + ri * pitch, width: cardWidth, height }}>
            {round.slots.map((slot, si) => <div className={styles.treeSlot} key={slot.id} style={{ top: center(ri, si), width: cardWidth }}>{renderCard(slot, overview)}</div>)}
          </section>)}
        </div>
      </div>
    </div>
    <div className={styles.canvasControls}>
      <button type="button" aria-pressed={overview} onClick={() => { setOverview(!overview); if (!overview) fit(); else zoomAt(1) }}>{overview ? 'Vista detallada' : 'Vista general'}</button>
      <div><button type="button" aria-label="Reducir zoom" disabled={zoom <= .6} onClick={() => zoomAt(zoom - .1)}><Minus size={15} /></button><button type="button" aria-label="Restablecer zoom al 100%" onClick={() => zoomAt(1)}>{Math.round(zoom * 100)}%</button><button type="button" aria-label="Aumentar zoom" disabled={zoom >= 1.6} onClick={() => zoomAt(zoom + .1)}><Plus size={15} /></button></div>
      <button type="button" onClick={fit}><RotateCcw size={14} /> Ajustar</button>
    </div>
  </div>
}
