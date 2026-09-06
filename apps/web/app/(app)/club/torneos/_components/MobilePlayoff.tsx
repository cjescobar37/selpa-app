'use client'

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, Maximize2, Minus, Plus, RotateCcw, X } from 'lucide-react'
import styles from './MobilePlayoff.module.css'

// Presentation contract: the tournament page remains the source of rounds,
// slots, BYEs and winners. This component never creates or advances matches.
export type MobilePlayoffMatch = {
  id: string
  group_id: string | null
  phase: string | null
  status: string | null
  scheduled_at?: string | null
  court_name?: string | null
  team1_id: string
  team2_id: string
  team1_name?: string | null
  team2_name?: string | null
  winner_team_id: string | null
  score: Record<string, unknown> | null
  round: number
  match_order: number
}
type Team = { teamId: string; teamName: string; seed?: number | null }
type Slot = {
  id: string
  kind: 'match' | 'placeholder' | 'bye'
  match?: MobilePlayoffMatch
  slotOrder: number
  placeholderTeams?: [Team | null, Team | null]
  byeTeam?: Team | null
}
type Round = { phase: string; label: string; slots: Slot[] }
type DisplayTeam = { id: string | null; name: string; seed: number | null; source: string | null }
type DisplaySlot = Slot & { code: string; roundIndex: number; teams: DisplayTeam[] }
type Props = {
  rounds: Round[]
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
const phaseInfo: Record<string, { label: string; short: string; prefix: string }> = {
  ROUND_OF_32: { label: '32avos', short: '32', prefix: 'T' },
  ROUND_OF_16: { label: '16avos', short: '16', prefix: 'D' },
  EIGHTHS: { label: 'Octavos', short: '8', prefix: 'O' },
  QUARTER: { label: 'Cuartos', short: '4', prefix: 'C' },
  SEMI: { label: 'Semis', short: 'SF', prefix: 'S' },
  FINAL: { label: 'Final', short: 'F', prefix: 'F' },
}
const info = (round: Round) => phaseInfo[round.phase] ?? { label: round.label, short: round.label, prefix: 'M' }
const code = (round: Round, slot: Slot) => `${info(round).prefix}${slot.slotOrder}`
function schedule(match?: MobilePlayoffMatch) {
  const date = match?.scheduled_at ? new Date(match.scheduled_at) : null
  const valid = date && !Number.isNaN(date.getTime())
  return {
    date: valid ? new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit' }).format(date) : 'Sin fecha',
    time: valid ? new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date) : 'Sin hora',
    court: match?.court_name || 'Cancha sin asignar',
  }
}
function matchState(slot: Slot) {
  const status = slot.match?.status?.toUpperCase()
  if (slot.kind === 'bye') return { label: 'Pasa directo', tone: 'bye' }
  if (slot.kind === 'placeholder') return { label: 'En espera', tone: 'waiting' }
  if (status === 'WALKOVER' || status === 'WO' || slot.match?.score?.walkover === true) return { label: 'Walkover', tone: 'wo' }
  if (status === 'PLAYED') return { label: 'Jugado', tone: 'played' }
  if (status === 'IN_PROGRESS' || status === 'LIVE') return { label: 'En curso', tone: 'live' }
  if (status === 'CANCELLED') return { label: 'Cancelado', tone: 'waiting' }
  return slot.match?.scheduled_at ? { label: 'Programado', tone: 'scheduled' } : { label: 'Pendiente', tone: 'pending' }
}
function scoreColumns(match?: MobilePlayoffMatch) {
  const score = match?.score
  const sets = Array.isArray(score?.sets) ? score.sets.slice(0, 3) : []
  const columns = sets.map((set, index) => ({ label: `S${index + 1}`, value: set }))
  while (columns.length < 2) columns.push({ label: `S${columns.length + 1}`, value: null })
  if (score?.super_tiebreak) columns.push({ label: 'TB', value: score.super_tiebreak })
  else if (columns.length < 3) columns.push({ label: 'TB', value: null })
  return columns.slice(0, 3).map(({ label, value }) => ({
    label,
    first: value && typeof value.team1 === 'number' ? value.team1 as number : null,
    second: value && typeof value.team2 === 'number' ? value.team2 as number : null,
  }))
}

let openOverlayCount = 0
let bodyOverflowBeforeOverlays = ''

/** Portals escape the tournament stacking context and the sticky navbar.
 * Native dialog supplies focus trapping, Escape and background inertness. */
function Overlay({ children, title, fullscreen = false, onClose }: { children: ReactNode; title: string; fullscreen?: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const startY = useRef<number | null>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    if (openOverlayCount === 0) bodyOverflowBeforeOverlays = document.body.style.overflow
    openOverlayCount += 1
    document.body.style.overflow = 'hidden'
    return () => {
      dialog?.close()
      openOverlayCount -= 1
      if (openOverlayCount === 0) document.body.style.overflow = bodyOverflowBeforeOverlays
    }
  }, [])
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [followTeam, setFollowTeam] = useState<string | null>(null)
  const [hint, setHint] = useState(true)
  const root = useRef<HTMLDivElement>(null)
  const nav = useRef<HTMLDivElement>(null)
  const bracketApi = useRef<{ go: (index: number) => void; reset: () => void } | null>(null)
  const panelId = useId()
  const activeIndex = Math.max(0, rounds.findIndex((round) => round.phase === phase))

  const displayRounds = useMemo(() => rounds.map((round, roundIndex) => ({
    ...round,
    slots: round.slots.map((slot): DisplaySlot => ({
      ...slot, code: code(round, slot), roundIndex,
      teams: (slot.kind === 'bye' ? [0] : [0, 1]).map((side) => {
        const id = slot.match ? (side === 0 ? slot.match.team1_id : slot.match.team2_id) : (slot.kind === 'bye' ? slot.byeTeam?.teamId : slot.placeholderTeams?.[side]?.teamId)
        const known = slot.kind === 'bye' ? slot.byeTeam : slot.placeholderTeams?.[side]
        const sourceSlot = roundIndex > 0 ? rounds[roundIndex - 1].slots[(slot.slotOrder - 1) * 2 + side] : null
        const source = sourceSlot ? `${sourceSlot.kind === 'bye' ? 'Pasa de' : 'Ganador'} ${code(rounds[roundIndex - 1], sourceSlot)}` : null
        return {
          id: id || null,
          name: (slot.match ? (side === 0 ? slot.match.team1_name : slot.match.team2_name) : known?.teamName) || (id ? teamNames.get(id) : null) || source || 'Pareja por confirmar',
          seed: id ? teamSeeds.get(id) ?? known?.seed ?? null : null,
          source,
        }
      }),
    })),
  })), [rounds, teamNames, teamSeeds])
  const selected = displayRounds.flatMap((round) => round.slots).find((slot) => slot.id === selectedId)
  const followedName = followTeam ? teamNames.get(followTeam) ?? displayRounds.flatMap((round) => round.slots).flatMap((slot) => slot.teams).find((team) => team.id === followTeam)?.name : null
  const path = useMemo(() => {
    const ids = new Set<string>()
    if (!followTeam) return ids
    displayRounds.forEach((round, ri) => round.slots.forEach((slot) => {
      if (!slot.teams.some((team) => team.id === followTeam)) return
      ids.add(slot.id)
      let current = slot
      for (let nextIndex = ri + 1; nextIndex < displayRounds.length; nextIndex++) {
        if (current.match?.winner_team_id && current.match.winner_team_id !== followTeam) break
        const next = displayRounds[nextIndex].slots[Math.floor((current.slotOrder - 1) / 2)]
        if (!next) break
        ids.add(next.id)
        current = next
      }
    }))
    return ids
  }, [displayRounds, followTeam])

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
  const showBracket = () => { try { if (sessionStorage.getItem('selpa-playoff-swipe-seen')) setHint(false) } catch { /* private browsing */ } setView('bracket') }
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

  const teams = (slot: DisplaySlot, compact = false, detail = false) => {
    const columns = scoreColumns(slot.match)
    return <div className={`${styles.teams} ${compact ? styles.compactTeams : ''} ${detail ? styles.detailTeams : ''}`}>
      {slot.kind !== 'bye' && <div className={styles.scoreLabels}><span />{columns.map((column) => <span key={column.label}>{column.label}</span>)}</div>}
      {slot.teams.map((team, side) => {
        const winner = slot.kind === 'bye' || Boolean(team.id && slot.match?.winner_team_id === team.id)
        const content = <><span className={styles.seed}>{team.seed !== null ? `(${team.seed})` : ''}</span><span className={styles.teamName}>{team.name}</span>{winner && <Check size={12} aria-label="Ganador" className={styles.winnerCheck} />}</>
        return <div className={`${styles.teamRow} ${winner ? styles.winner : ''} ${!team.id ? styles.unknown : ''}`} key={`${slot.id}-${side}`}>
          {compact && team.id ? <button type="button" className={styles.teamButton} aria-pressed={followTeam === team.id} aria-label={`Seguir a ${team.name}`} onClick={() => follow(team.id!)}>{content}</button>
            : <span className={styles.teamIdentity}>{content}</span>}
          {slot.kind !== 'bye' && columns.map((column) => {
            const value = side === 0 ? column.first : column.second
            const other = side === 0 ? column.second : column.first
            return <span className={`${styles.score} ${value !== null && other !== null && value > other ? styles.wonSet : ''}`} key={column.label}>{value ?? '—'}</span>
          })}
        </div>
      })}
    </div>
  }
  const card = (slot: DisplaySlot, compact = false) => {
    const state = matchState(slot)
    const when = schedule(slot.match)
    return <article id={compact ? undefined : `playoff-match-${slot.match?.id ?? slot.id}`}
      className={`${styles.card} ${compact ? styles.bracketCard : ''} ${slot.kind === 'bye' ? styles.bye : ''} ${followTeam && compact ? path.has(slot.id) ? styles.following : styles.dimmed : ''}`}
      data-slot={slot.code}>
      <div className={styles.cardHead}>
        <button className={styles.matchLink} type="button" aria-label={`Ver detalle de ${slot.code}`} onClick={() => setSelectedId(slot.id)}>
          {compact ? slot.code : `${info(rounds[slot.roundIndex]).label} · ${slot.code}`}
        </button>
        <span className={styles.state} data-state={state.tone}>{state.label}{slot.kind === 'bye' && ' ✓'}</span>
        {!compact && actionable(slot) && <button type="button" className={styles.action} onClick={() => edit(slot.match!, 'result')}>{slot.match?.status === 'PLAYED' ? 'Editar' : 'Cargar'}</button>}
      </div>
      {!compact && slot.kind === 'match' && <button className={styles.schedule} type="button" onClick={() => setSelectedId(slot.id)}>{when.date} · {when.time} · {when.court}</button>}
      {teams(slot, compact)}
      {!compact && slot.kind === 'placeholder' && <span className={styles.waitingNote}>Se define al terminar los cruces anteriores.</span>}
      {compact && <button type="button" className={styles.cardSurface} aria-label={`Abrir partido ${slot.code}`} onClick={() => setSelectedId(slot.id)} tabIndex={-1} />}
    </article>
  }
  const roundNav = (mini = false) => <nav className={mini ? styles.minimap : styles.roundNav} aria-label={mini ? 'Mapa del cuadro' : 'Rondas del playoff'}>
    {rounds.map((round, index) => <button type="button" key={round.phase} aria-current={index === activeIndex ? 'step' : undefined} onClick={() => selectRound(index)} aria-label={info(round).label}>{mini ? info(round).short : info(round).label}</button>)}
  </nav>
  const tracking = followTeam && <div className={styles.tracking}><span>Siguiendo a <b>{followedName}</b></span><button type="button" onClick={() => setFollowTeam(null)}>Quitar seguimiento <X size={13} /></button></div>
  const nextWhen = schedule(props.nextMatch ?? undefined)
  const nextSlot = displayRounds.flatMap((round) => round.slots).find((slot) => slot.match?.id === props.nextMatch?.id)
  const matches = rounds.flatMap((round) => round.slots).flatMap((slot) => slot.match ? [slot.match] : [])
  const renderBracket = (full: boolean) => <MobileBracket rounds={displayRounds} activeIndex={activeIndex} onRound={(index) => setPhase(rounds[index].phase)}
    onInteract={dismissHint} apiRef={bracketApi} full={full} path={path} following={Boolean(followTeam)} renderCard={(slot) => card(slot, true)} />

  return <div className={styles.host} ref={root} data-playoff-mobile>
    <section className={styles.summary} aria-label="Resumen del playoff">
      <div><span className={styles.eyebrow}>Playoff</span><strong>{props.champion ? 'Finalizado' : info(rounds.find((round) => round.phase === props.currentPhase) ?? rounds[0]).label}</strong></div>
      <span className={styles.progress}><b>{matches.filter((match) => match.status === 'PLAYED').length}/{matches.length}</b> jugados</span>
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
    <div id={panelId} className={styles.content}>
      {view === 'round' ? <div className={styles.roundList} aria-label={info(rounds[activeIndex]).label}>{displayRounds[activeIndex].slots.map((slot) => <div key={slot.id}>{card(slot)}</div>)}</div>
        : <>
          <div className={styles.bracketTools}><span>{hint ? '☝ Deslizá para recorrer las llaves' : info(rounds[activeIndex]).label}</span><button type="button" onClick={() => setFullscreen(true)}><Maximize2 size={15} /> Cuadro completo</button></div>
          {tracking}
          {!fullscreen && renderBracket(false)}
        </>}
    </div>
    {fullscreen && <Overlay title="Cuadro completo" fullscreen onClose={() => setFullscreen(false)}>
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

type DisplayRound = Omit<Round, 'slots'> & { slots: DisplaySlot[] }
function MobileBracket({ rounds, activeIndex, onRound, onInteract, apiRef, full, path, following, renderCard }: {
  rounds: DisplayRound[]; activeIndex: number; onRound: (index: number) => void; onInteract: () => void
  apiRef: React.RefObject<{ go: (index: number) => void; reset: () => void } | null>
  full: boolean; path: Set<string>; following: boolean; renderCard: (slot: DisplaySlot) => ReactNode
}) {
  const viewport = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(360)
  const [zoom, setZoom] = useState(1)
  const activeRef = useRef(activeIndex)
  const dataRef = useRef({ rounds, path })
  useEffect(() => { activeRef.current = activeIndex; dataRef.current = { rounds, path } }, [activeIndex, rounds, path])
  const cardWidth = Math.min(full ? 340 : 380, Math.max(205, width - (width > 600 ? 170 : 100)))
  const pitch = cardWidth + 32
  const basePitch = 128
  const center = (ri: number, si: number) => 60 + ((si + .5) * 2 ** ri - .5) * basePitch
  const height = Math.max(128, rounds[0].slots.length * basePitch)
  useEffect(() => {
    const el = viewport.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    const go = (index: number, behavior: ScrollBehavior = 'smooth') => {
      const el = viewport.current
      if (!el) return
      const focusIndex = Math.max(0, dataRef.current.rounds[index].slots.findIndex((slot) => dataRef.current.path.has(slot.id)))
      const targetY = center(index, focusIndex) * zoom
      el.scrollTo({ left: index * pitch * zoom, top: Math.max(0, targetY - el.clientHeight / 2), behavior })
    }
    apiRef.current = { go, reset: () => { setZoom(1); go(activeRef.current) } }
    go(activeRef.current, 'instant')
    return () => { apiRef.current = null }
  }, [apiRef, pitch, zoom])
  return <div className={`${styles.bracketWrap} ${full ? styles.fullBracket : ''}`}>
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
      <div style={{ width: (rounds.length * pitch + 76) * zoom, height: height * zoom }}>
        <div className={styles.tree} style={{ width: rounds.length * pitch + 76, height, transform: `scale(${zoom})` }}>
          <svg className={styles.connectors} width={rounds.length * pitch + 76} height={height} aria-hidden="true">
            {rounds.slice(0, -1).flatMap((round, ri) => round.slots.map((slot, si) => {
              const next = rounds[ri + 1].slots[Math.floor(si / 2)]
              if (!next) return null
              const x = 44 + ri * pitch + cardWidth
              const y = center(ri, si)
              const endY = center(ri + 1, Math.floor(si / 2))
              return <path key={slot.id} d={`M${x},${y} H${x + 16} V${endY} H${x + 32}`} className={following ? path.has(slot.id) && path.has(next.id) ? styles.pathLine : styles.dimLine : undefined} />
            }))}
          </svg>
          {rounds.map((round, ri) => <section key={round.phase} className={styles.lane} aria-label={info(round).label} style={{ left: 44 + ri * pitch, width: cardWidth, height }}>
            {round.slots.map((slot, si) => <div className={styles.treeSlot} key={slot.id} style={{ top: center(ri, si), width: cardWidth }}>{renderCard(slot)}</div>)}
          </section>)}
        </div>
      </div>
    </div>
    <div className={styles.canvasControls}>
      <button type="button" onClick={() => apiRef.current?.reset()}><RotateCcw size={14} /> Centrar</button>
      {full && <div><button type="button" aria-label="Reducir zoom" disabled={zoom <= .7} onClick={() => setZoom((z) => Math.max(.7, +(z - .1).toFixed(1)))}><Minus size={15} /></button><span>{Math.round(zoom * 100)}%</span><button type="button" aria-label="Aumentar zoom" disabled={zoom >= 1.4} onClick={() => setZoom((z) => Math.min(1.4, +(z + .1).toFixed(1)))}><Plus size={15} /></button></div>}
    </div>
  </div>
}
