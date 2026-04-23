'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import { TournamentFlyerConfigurator, defaultFlyerConfig, readFlyerConfigFromRules, type FlyerConfig } from '../../_components/TournamentFlyerConfigurator'

type TournamentType = 'OPEN' | 'CHALLENGER' | 'MASTER' | 'MASTER_FINAL'
type TournamentGender = 'MALE' | 'FEMALE' | 'MIXED'

type FormState = {
  name: string
  type: TournamentType
  gender: TournamentGender
  categoryId: string
  startDate: string
  endDate: string
  registrationDeadline: string
  pricePerPlayer: string
  minPairs: string
  maxPairs: string
}

type TournamentSummary = {
  tournament: {
    id: string
    name: string
    status: string
    type: string | null
    gender: string | null
    category_id: number | null
    start_date: string | null
    end_date: string | null
    registration_deadline: string | null
    price_per_player: number | null
    min_pairs: number | null
    max_pairs: number | null
  }
}

type TournamentRulesLookup = {
  tournaments?: Array<{
    id: string
    rules_json?: Record<string, unknown> | null
  }>
}

const typeOptions: Array<{ value: TournamentType; label: string }> = [
  { value: 'OPEN', label: 'Open' },
  { value: 'CHALLENGER', label: 'Challenger' },
  { value: 'MASTER', label: 'Master' },
  { value: 'MASTER_FINAL', label: 'Master Final' },
]

const genderOptions: Array<{ value: TournamentGender; label: string }> = [
  { value: 'MALE', label: 'Masculino' },
  { value: 'FEMALE', label: 'Femenino' },
  { value: 'MIXED', label: 'Mixto' },
]

function buildFlyerPayload(config: FlyerConfig) {
  return {
    flyer_mode: config.mode,
    flyer_background: config.backgroundId,
    flyer_title_color: config.titleColor,
    flyer_text_color: config.textColor,
    flyer_accent_color: config.accentColor,
    flyer_font: config.fontFamily,
    flyer_style: config.style,
  }
}

function toNumber(value: string, fallback: number) {
  if (!value.trim()) return fallback
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : NaN
}

function toInteger(value: string, fallback: number) {
  const parsed = toNumber(value, fallback)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : NaN
}

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : ''
}

function toDateTimeInput(value?: string | null) {
  return value ? value.slice(0, 16) : ''
}

function toTournamentType(value?: string | null): TournamentType {
  return typeOptions.some((option) => option.value === value) ? value as TournamentType : 'OPEN'
}

function toTournamentGender(value?: string | null): TournamentGender {
  return genderOptions.some((option) => option.value === value) ? value as TournamentGender : 'MALE'
}

function formFromSummary(summary: TournamentSummary): FormState {
  const tournament = summary.tournament
  return {
    name: tournament.name ?? '',
    type: toTournamentType(tournament.type),
    gender: toTournamentGender(tournament.gender),
    categoryId: String(tournament.category_id ?? 7),
    startDate: toDateInput(tournament.start_date),
    endDate: toDateInput(tournament.end_date),
    registrationDeadline: toDateTimeInput(tournament.registration_deadline),
    pricePerPlayer: String(tournament.price_per_player ?? 0),
    minPairs: String(tournament.min_pairs ?? 6),
    maxPairs: tournament.max_pairs ? String(tournament.max_pairs) : '',
  }
}

export default function EditClubTournamentPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const tournamentId = params?.id
  const { activeClub } = useSession()
  const [form, setForm] = useState<FormState | null>(null)
  const [flyerConfig, setFlyerConfig] = useState<FlyerConfig>(defaultFlyerConfig)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const isDraft = status.toUpperCase() === 'DRAFT'

  const errors = useMemo(() => {
    if (!form) return []

    const next: string[] = []
    const categoryId = toInteger(form.categoryId, 0)
    const minPairs = toInteger(form.minPairs, 6)
    const maxPairs = form.maxPairs.trim() ? toInteger(form.maxPairs, NaN) : null
    const price = toNumber(form.pricePerPlayer, 0)

    if (!activeClub?.id) next.push('Seleccioná un club activo.')
    if (!form.name.trim()) next.push('El nombre es obligatorio.')
    if (!form.startDate) next.push('La fecha de inicio es obligatoria.')
    if (!Number.isInteger(categoryId) || categoryId < 1 || categoryId > 7) next.push('La categoría debe estar entre 1 y 7.')
    if (!Number.isInteger(minPairs) || minPairs < 2) next.push('El mínimo de parejas debe ser al menos 2.')
    if (maxPairs !== null && (!Number.isInteger(maxPairs) || maxPairs < minPairs)) next.push('El máximo debe ser mayor o igual al mínimo.')
    if (!Number.isFinite(price) || price < 0) next.push('El precio debe ser mayor o igual a 0.')
    if (form.endDate && form.startDate && form.endDate < form.startDate) next.push('La fecha fin no puede ser anterior al inicio.')
    if (form.registrationDeadline && form.startDate && form.registrationDeadline.slice(0, 10) > form.startDate) next.push('El cierre de inscripción no puede ser posterior al inicio.')

    return next
  }, [activeClub?.id, form])

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => current ? { ...current, [key]: value } : current)
  }

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token ?? null
  }

  async function loadTournament() {
    if (!activeClub?.id || !tournamentId) {
      setForm(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setLoading(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}/summary`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const json = await res.json().catch(() => ({})) as Partial<TournamentSummary> & { error?: string }

    if (!res.ok || !json.tournament) {
      setMessage(json?.error ?? 'No pude cargar el torneo.')
      setForm(null)
      setLoading(false)
      return
    }

    const summary = json as TournamentSummary
    setStatus(summary.tournament.status)
    setForm(formFromSummary(summary))

    const rulesRes = await fetch(`/api/clubs/${activeClub.id}/tournaments`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const rulesJson = await rulesRes.json().catch(() => ({})) as TournamentRulesLookup
    const currentTournament = (rulesJson.tournaments ?? []).find((item) => item.id === tournamentId)
    setFlyerConfig(readFlyerConfigFromRules(currentTournament?.rules_json))
    setLoading(false)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')

    if (!form || !activeClub?.id || !tournamentId) return
    if (!isDraft) {
      setMessage('Solo se pueden editar torneos en borrador.')
      return
    }
    if (errors.length) {
      setMessage(errors[0] ?? 'Revisá los datos del torneo.')
      return
    }

    setSaving(true)

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setSaving(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: 'update_draft',
        name: form.name,
        type: form.type,
        gender: form.gender,
        category_id: Number(form.categoryId),
        start_date: form.startDate,
        end_date: form.endDate || null,
        registration_deadline: form.registrationDeadline || null,
        price_per_player: form.pricePerPlayer,
        min_pairs: form.minPairs,
        max_pairs: form.maxPairs || null,
        flyer: buildFlyerPayload(flyerConfig),
      }),
    })
    const json = await res.json().catch(() => ({})) as { error?: string; code?: string }

    setSaving(false)

    if (!res.ok) {
      const messages: Record<string, string> = {
        INVALID_STATUS_TRANSITION: 'Solo podés editar torneos en borrador.',
        UNAUTHORIZED: 'No tenés permisos para editar este torneo.',
        TOURNAMENT_NOT_FOUND: 'Torneo no encontrado para este club.',
        VALIDATION_ERROR: json.error ?? 'Revisá los datos del torneo.',
      }
      setMessage(json.code ? messages[json.code] ?? json.error ?? 'No pude guardar los cambios.' : json.error ?? 'No pude guardar los cambios.')
      return
    }

    router.replace(`/club/torneos/${tournamentId}`)
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadTournament())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClub?.id, tournamentId])

  return (
    <div className="px-wrap">
      <div className="club-panel club-editTournament">
        <div className="club-editHead">
          <div>
            <h1 className="club-title">Editar torneo</h1>
            <p className="club-sub">Ajustá los datos antes de publicar. Después de abrir inscripciones, esta edición queda bloqueada.</p>
          </div>
          <Link href={tournamentId ? `/club/torneos/${tournamentId}` : '/club/torneos'} className="club-secondaryBtn">Volver</Link>
        </div>

        {message ? <div className="club-message">{message}</div> : null}

        {loading ? (
          <div className="px-empty">Cargando torneo...</div>
        ) : !activeClub?.id ? (
          <div className="px-empty">Primero seleccioná un club activo.</div>
        ) : !form ? (
          <div className="px-empty">No pude cargar el torneo.</div>
        ) : !isDraft ? (
          <div className="club-blockedCard">
            <span className="club-kicker">Edición bloqueada</span>
            <h2>Este torneo ya no está en borrador.</h2>
            <p>Para proteger inscripciones, seed, grupos y operación deportiva, solo se editan torneos en estado DRAFT.</p>
            <Link href={`/club/torneos/${tournamentId}`} className="club-secondaryBtn">Volver al torneo</Link>
          </div>
        ) : (
          <form className="club-formCard" onSubmit={submit}>
            <label className="club-field club-field--span2">
              <span>Nombre</span>
              <input
                className="px-input"
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="Ej: Open Verano 6ta"
                maxLength={90}
              />
            </label>

            <label className="club-field">
              <span>Tipo</span>
              <select className="px-input" value={form.type} onChange={(event) => updateField('type', event.target.value as TournamentType)}>
                {typeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>

            <label className="club-field">
              <span>Categoría</span>
              <select className="px-input" value={form.categoryId} onChange={(event) => updateField('categoryId', event.target.value)}>
                {[7, 6, 5, 4, 3, 2, 1].map((category) => <option key={category} value={category}>Categoría {category}</option>)}
              </select>
            </label>

            <label className="club-field">
              <span>Género</span>
              <select className="px-input" value={form.gender} onChange={(event) => updateField('gender', event.target.value as TournamentGender)}>
                {genderOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>

            <label className="club-field">
              <span>Inicio</span>
              <input className="px-input" type="date" value={form.startDate} onChange={(event) => updateField('startDate', event.target.value)} />
            </label>

            <label className="club-field">
              <span>Fin</span>
              <input className="px-input" type="date" value={form.endDate} onChange={(event) => updateField('endDate', event.target.value)} />
            </label>

            <label className="club-field club-field--span2">
              <span>Cierre de inscripción</span>
              <input className="px-input" type="datetime-local" value={form.registrationDeadline} onChange={(event) => updateField('registrationDeadline', event.target.value)} />
            </label>

            <label className="club-field">
              <span>Precio por jugador</span>
              <input className="px-input" inputMode="decimal" value={form.pricePerPlayer} onChange={(event) => updateField('pricePerPlayer', event.target.value)} />
            </label>

            <label className="club-field">
              <span>Mín. parejas</span>
              <input className="px-input" inputMode="numeric" value={form.minPairs} onChange={(event) => updateField('minPairs', event.target.value)} />
            </label>

            <label className="club-field">
              <span>Máx. parejas</span>
              <input className="px-input" inputMode="numeric" value={form.maxPairs} onChange={(event) => updateField('maxPairs', event.target.value)} placeholder="Opcional" />
            </label>

            <div className="club-field club-field--wide">
              <TournamentFlyerConfigurator
                value={flyerConfig}
                onChange={setFlyerConfig}
                previewData={{
                  clubName: activeClub?.name ?? '',
                  name: form.name,
                  type: typeOptions.find((option) => option.value === form.type)?.label ?? form.type,
                  gender: genderOptions.find((option) => option.value === form.gender)?.label ?? form.gender,
                  categoryLabel: `Categoria ${form.categoryId || '7'}`,
                  startDate: form.startDate,
                  endDate: form.endDate,
                  registrationDeadline: form.registrationDeadline,
                  pricePerPlayer: form.pricePerPlayer,
                  minPairs: form.minPairs,
                }}
                helperText="Si el torneo ya tenia configuracion visual guardada, la retomamos desde rules_json para seguir afinandola en borrador."
              />
            </div>

            <div className="club-formActions">
              <Link href={`/club/torneos/${tournamentId}`} className="club-secondaryBtn">Cancelar</Link>
              <button type="submit" className="club-primaryBtn" disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        )}
      </div>

      <style>{`
        .club-editTournament { overflow: hidden; }
        .club-editHead { align-items: flex-start; display: flex; gap: 14px; justify-content: space-between; }
        .club-message { background: #fff7df; border: 1px solid rgba(217,119,6,.24); border-radius: 12px; color: #854d0e; font-weight: 800; margin-top: 12px; padding: 10px 12px; }
        .club-formCard, .club-blockedCard { background: rgba(255,255,255,.94); border: 1px solid rgba(15,23,42,.08); border-radius: 16px; margin-top: 14px; min-width: 0; padding: 14px; }
        .club-formCard { display: grid; gap: 10px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .club-field { color: #17253f; display: grid; font-size: 13px; font-weight: 900; gap: 6px; min-width: 0; }
        .club-field--wide { grid-column: 1 / -1; }
        .club-field--span2 { grid-column: span 2; }
        .club-formActions { display: flex; flex-wrap: wrap; gap: 8px; grid-column: 1 / -1; justify-content: flex-end; padding-top: 4px; }
        .club-blockedCard { display: grid; gap: 8px; }
        .club-blockedCard h2 { color: #17253f; font-size: 20px; line-height: 1.15; margin: 0; }
        .club-blockedCard p { color: #64748b; font-size: 13px; font-weight: 800; line-height: 1.35; margin: 0 0 4px; max-width: 680px; }
        .club-kicker { color: #64748b; font-size: 11px; font-weight: 950; letter-spacing: 0; text-transform: uppercase; }
        .club-primaryBtn, .club-secondaryBtn { align-items: center; border-radius: 8px; cursor: pointer; display: inline-flex; font-weight: 950; justify-content: center; min-height: 36px; padding: 8px 12px; text-decoration: none; transition: background .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease; white-space: nowrap; }
        .club-primaryBtn { background: #69dfe3; border: 1px solid rgba(15,23,42,.10); color: #102538; }
        .club-primaryBtn:hover:not(:disabled) { background: #7be8eb; border-color: rgba(15,23,42,.18); box-shadow: 0 8px 18px rgba(15,142,160,.14); transform: translateY(-1px); }
        .club-secondaryBtn { background: #fff; border: 1px solid rgba(83,199,217,.36); color: #0f8ea0; }
        .club-secondaryBtn:hover { background: #f0fcff; border-color: rgba(15,142,160,.45); box-shadow: 0 8px 18px rgba(15,142,160,.10); transform: translateY(-1px); }
        .club-primaryBtn:disabled { cursor: not-allowed; opacity: .65; }
        .flyerCard { background: linear-gradient(180deg, rgba(248,250,252,.98) 0%, rgba(241,245,249,.94) 100%); border: 1px solid rgba(83,199,217,.18); border-radius: 16px; display: grid; gap: 14px; padding: 14px; }
        .flyerBlockHead { align-items: start; display: flex; gap: 16px; justify-content: space-between; }
        .flyerBlockHead h2 { color: #17253f; font-size: 22px; line-height: 1.1; margin: 4px 0 0; }
        .flyerBlockHead p { color: #5b6b84; font-size: 12px; font-weight: 800; line-height: 1.45; margin: 0; max-width: 360px; }
        .flyerKicker, .flyerControlTitle, .flyerPreviewLabel { color: #64748b; font-size: 11px; font-weight: 950; letter-spacing: .04em; text-transform: uppercase; }
        .flyerModeSwitch { display: flex; flex-wrap: wrap; gap: 8px; }
        .flyerModeChip { background: #fff; border: 1px solid rgba(148,163,184,.26); border-radius: 999px; color: #274159; cursor: pointer; font-size: 13px; font-weight: 900; min-height: 38px; padding: 0 14px; transition: background .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease; }
        .flyerModeChip:hover { border-color: rgba(15,142,160,.38); color: #0f8ea0; }
        .flyerModeChip.is-active { background: #e6fbff; border-color: rgba(83,199,217,.52); box-shadow: inset 0 0 0 1px rgba(83,199,217,.14); color: #0f8ea0; }
        .flyerLayout { display: grid; gap: 14px; grid-template-columns: minmax(0, 1.2fr) minmax(300px, .8fr); }
        .flyerControls { display: grid; gap: 14px; min-width: 0; }
        .flyerControlSection, .flyerPlaceholder { background: rgba(255,255,255,.82); border: 1px solid rgba(148,163,184,.16); border-radius: 14px; padding: 14px; }
        .flyerPlaceholder strong { color: #17253f; display: block; font-size: 15px; margin-bottom: 6px; }
        .flyerPlaceholder p { color: #64748b; font-size: 13px; font-weight: 700; line-height: 1.45; margin: 0; }
        .flyerBackgroundGrid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); margin-top: 10px; }
        .flyerBackgroundOption { background: rgba(255,255,255,.92); border: 1px solid rgba(148,163,184,.18); border-radius: 12px; cursor: pointer; display: grid; gap: 8px; padding: 8px; text-align: left; transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease; }
        .flyerBackgroundOption:hover { border-color: rgba(83,199,217,.5); box-shadow: 0 8px 18px rgba(15,23,42,.08); transform: translateY(-1px); }
        .flyerBackgroundOption.is-selected { border-color: rgba(83,199,217,.8); box-shadow: 0 0 0 2px rgba(83,199,217,.12); }
        .flyerBackgroundOption span:last-child { color: #30455f; font-size: 11px; font-weight: 900; }
        .flyerBackgroundSwatch { aspect-ratio: 1.12; border-radius: 10px; display: block; min-width: 0; }
        .flyerControlRow { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .flyerControlRow--selects { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .flyerColorField, .flyerSelectField { background: rgba(255,255,255,.82); border: 1px solid rgba(148,163,184,.16); border-radius: 14px; color: #30455f; display: grid; font-size: 12px; font-weight: 900; gap: 8px; padding: 12px; }
        .flyerColorField input { appearance: none; background: transparent; border: none; cursor: pointer; height: 42px; padding: 0; width: 100%; }
        .flyerColorField input::-webkit-color-swatch-wrapper { padding: 0; }
        .flyerColorField input::-webkit-color-swatch { border: 1px solid rgba(15,23,42,.14); border-radius: 10px; }
        .flyerPreviewShell { display: grid; gap: 8px; }
        .flyerPreview { border-radius: 22px; box-shadow: 0 28px 60px rgba(15,23,42,.18); min-height: 100%; overflow: hidden; padding: 18px; position: relative; }
        .flyerPreview--editor { min-height: 360px; }
        .flyerPreview::after { background: linear-gradient(180deg, rgba(255,255,255,.06) 0%, rgba(2,6,23,.24) 100%); content: ''; inset: 0; pointer-events: none; position: absolute; }
        .flyerPreview > * { position: relative; z-index: 1; }
        .flyerPreviewTop { align-items: center; display: flex; gap: 10px; justify-content: space-between; }
        .flyerPreviewClub { color: rgba(255,255,255,.86); font-size: 12px; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; }
        .flyerPreviewType { backdrop-filter: blur(10px); background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.22); border-radius: 999px; font-size: 11px; font-weight: 950; padding: 6px 10px; text-transform: uppercase; }
        .flyerPreviewBody { display: grid; gap: 16px; margin-top: 34px; }
        .flyerPreviewEyebrow { font-size: 12px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
        .flyerPreviewMain h3 { font-size: clamp(28px, 4vw, 42px); line-height: .98; margin: 8px 0 10px; max-width: 9ch; }
        .flyerPreviewMain p { color: inherit; font-size: 16px; font-weight: 800; line-height: 1.2; margin: 0; opacity: .94; }
        .flyerPreviewDate { background: rgba(15,23,42,.22); backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,.22); border-radius: 16px; display: inline-grid; gap: 6px; justify-self: start; min-width: 0; padding: 12px 14px; }
        .flyerPreviewDate span, .flyerPreviewMeta span { color: rgba(226,232,240,.82); font-size: 11px; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; }
        .flyerPreviewDate strong, .flyerPreviewMeta strong { color: #f8fafc; font-size: 16px; line-height: 1.15; }
        .flyerPreviewMeta { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 26px; }
        .flyerPreviewMeta > div { backdrop-filter: blur(12px); background: rgba(15,23,42,.2); border: 1px solid rgba(255,255,255,.14); border-radius: 16px; display: grid; gap: 6px; padding: 12px 14px; }
        .flyerManualOverlay, .flyerNoneOverlay { backdrop-filter: blur(14px); background: rgba(15,23,42,.48); border: 1px solid rgba(255,255,255,.14); border-radius: 16px; bottom: 20px; display: grid; gap: 6px; left: 20px; padding: 14px; position: absolute; right: 20px; z-index: 2; }
        .flyerManualOverlay strong, .flyerNoneOverlay strong { color: #f8fafc; font-size: 15px; }
        .flyerManualOverlay span, .flyerNoneOverlay span { color: rgba(226,232,240,.88); font-size: 12px; font-weight: 700; line-height: 1.4; }
        @media (max-width: 720px) {
          .club-editHead { display: grid; }
          .club-formCard { grid-template-columns: 1fr; }
          .club-field--span2 { grid-column: auto; }
          .club-formActions { justify-content: stretch; }
          .club-formActions > * { width: 100%; }
          .flyerBlockHead, .flyerLayout, .flyerControlRow, .flyerControlRow--selects, .flyerPreviewMeta { grid-template-columns: 1fr; }
          .flyerBlockHead { display: grid; }
          .flyerPreview { min-height: 420px; }
        }
      `}</style>
    </div>
  )
}
