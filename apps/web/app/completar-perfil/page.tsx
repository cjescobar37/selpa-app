'use client'

import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, ChevronRight, ImagePlus, MapPin, Search, Upload, UserRound, X } from 'lucide-react'
import { ActionFeedbackNotice } from '@/components/ui/ActionFeedbackNotice'
import SelpaLoader from '@/components/SelpaLoader'
import { useSession } from '@/components/session/SessionProvider'
import { argentinaLocations, countries, findArgentinaLocation } from '@/lib/argentinaLocations'
import { birthMonths, birthYears, toBirthDate } from '@/lib/birthDate'
import { isGlobalProfileComplete } from '@/lib/globalProfile'
import { getClubTheme } from '@/lib/clubThemes'
import { supabase } from '@/lib/supabaseClient'

type Step = 1 | 2 | 3
type PersonalField = 'fullName' | 'phone' | 'birthDate' | 'gender' | 'countryCode' | 'provinceId' | 'cityId'
type SportsField = 'heightCm' | 'dominantHand' | 'preferredPosition' | 'avatar' | 'cover'
type FieldName = PersonalField | SportsField
type FieldErrors = Partial<Record<FieldName, string>>
type AlertState = { variant?: 'error' | 'success'; title: string; message?: string } | null
type SuccessToast = { title: string; message: string } | null

type DiscoverClub = {
  id: string
  name: string
  city: string | null
  province: string | null
  logo_url: string | null
  theme_key: string | null
  membership: { status: string; role: string; approvedAt: string | null } | null
}

function safeNextPath(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/completar-perfil') ? value : '/seleccionar-club'
}

function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.trim().toUpperCase() || 'SP'
}

function splitFullName(value?: string | null) {
  const parts = String(value ?? '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean)
  if (parts.length < 2 || parts.some((part) => part.length < 2)) return null
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) ?? '' }
}

function clubInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word.charAt(0)).join('').toUpperCase() || 'CL'
}

function membershipLabel(club: DiscoverClub) {
  if (!club.membership) return 'Solicitar ingreso'
  if (club.membership.status === 'APPROVED') return 'Miembro'
  if (club.membership.status === 'PENDING') return 'Solicitud enviada'
  if (club.membership.status === 'REJECTED') return 'Rechazada'
  return 'Solicitar ingreso'
}

export default function CompleteProfilePage() {
  return <Suspense fallback={null}><CompleteProfilePageClient /></Suspense>
}

function CompleteProfilePageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const session = useSession()
  const profile = session.globalProfile
  const editSection = searchParams.get('edit')
  const isEditMode = editSection === 'personal' || editSection === 'sports'
  const [step, setStep] = useState<Step>(1)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [fullName, setFullName] = useState('')
  const [needsFullName, setNeedsFullName] = useState(false)
  const [phoneAreaCode, setPhoneAreaCode] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [birthDay, setBirthDay] = useState('')
  const [birthMonth, setBirthMonth] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [gender, setGender] = useState('')
  const [countryCode, setCountryCode] = useState('AR')
  const [provinceId, setProvinceId] = useState('')
  const [cityId, setCityId] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [dominantHand, setDominantHand] = useState('')
  const [preferredPosition, setPreferredPosition] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [removeCover, setRemoveCover] = useState(false)
  const [clubs, setClubs] = useState<DiscoverClub[]>([])
  const [clubsLoading, setClubsLoading] = useState(false)
  const [clubsLoaded, setClubsLoaded] = useState(false)
  const [clubQuery, setClubQuery] = useState('')
  const [savingClubId, setSavingClubId] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [alert, setAlert] = useState<AlertState>(null)
  const [successToast, setSuccessToast] = useState<SuccessToast>(null)
  const [toastClosing, setToastClosing] = useState(false)
  const [saving, setSaving] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const onboardingStartedRef = useRef(false)
  const clubsRequestStartedRef = useRef(false)
  const years = useMemo(() => birthYears(), [])

  useEffect(() => {
    if (editSection === 'sports') setStep(2)
  }, [editSection])

  useEffect(() => {
    const profileName = splitFullName([profile?.first_name, profile?.last_name].filter(Boolean).join(' '))
      ?? splitFullName(profile?.display_name)
      ?? splitFullName(session.user?.name)
    const nameHydrationTimer = window.setTimeout(() => {
      setFirstName((value) => value || profileName?.firstName || '')
      setLastName((value) => value || profileName?.lastName || '')
      setFullName((value) => value || [profileName?.firstName, profileName?.lastName].filter(Boolean).join(' '))
      setNeedsFullName(!profileName)
    }, 0)
    if (!profile) return () => window.clearTimeout(nameHydrationTimer)
    setPhoneAreaCode((value) => value || profile.phone_area_code || '')
    setPhoneNumber((value) => value || profile.phone_number || '')
    if (profile.birth_date) {
      const [year, month, day] = profile.birth_date.split('-')
      setBirthYear((value) => value || year || '')
      setBirthMonth((value) => value || String(Number(month) || ''))
      setBirthDay((value) => value || String(Number(day) || ''))
    }
    setGender((value) => value || profile.gender || '')
    setCountryCode(profile.country_code || 'AR')
    setProvinceId((value) => value || profile.province_id || '')
    setCityId((value) => value || profile.city_id || '')
    setHeightCm((value) => value || (profile.height_cm ? String(profile.height_cm) : ''))
    setDominantHand((value) => value || profile.dominant_hand || '')
    setPreferredPosition((value) => value || profile.preferred_position || '')
    return () => window.clearTimeout(nameHydrationTimer)
  }, [profile, session.user?.name])

  useObjectPreview(avatarFile, setAvatarPreview)
  useObjectPreview(coverFile, setCoverPreview)

  useEffect(() => {
    if (session.status !== 'ready') return
    if (!session.user) {
      router.replace('/login?next=%2Fcompletar-perfil')
    } else if (!isEditMode && !onboardingStartedRef.current && isGlobalProfileComplete(session.globalProfile)) {
      router.replace(safeNextPath(searchParams.get('next')))
    }
  }, [router, searchParams, session.globalProfile, session.status, session.user])

  const selectedProvince = useMemo(() => argentinaLocations.find((province) => province.id === provinceId) ?? null, [provinceId])
  const selectedCity = useMemo(() => selectedProvince?.cities.find((city) => city.id === cityId) ?? null, [cityId, selectedProvince])
  const genderLocked = isEditMode && Boolean(profile?.gender)
  const birthDateLocked = isEditMode && Boolean(profile?.birth_date)
  const visibleAvatar = removeAvatar ? null : avatarPreview || profile?.avatar_url || null
  const visibleCover = removeCover ? null : coverPreview || profile?.cover_url || null
  const filteredClubs = useMemo(() => {
    const query = clubQuery.trim().toLocaleLowerCase('es-AR')
    if (!query) return clubs
    return clubs.filter((club) => [club.name, club.city, club.province].filter(Boolean).join(' ').toLocaleLowerCase('es-AR').includes(query))
  }, [clubQuery, clubs])

  function clearFieldError(field: FieldName) {
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function validatePersonal() {
    const errors: FieldErrors = {}
    const birthDate = toBirthDate(birthYear, birthMonth, birthDay)
    const cleanAreaCode = phoneAreaCode.replace(/\D/g, '')
    const cleanPhoneNumber = phoneNumber.replace(/\D/g, '')
    const phoneDigits = `${cleanAreaCode}${cleanPhoneNumber}`
    const parsedFullName = splitFullName(needsFullName ? fullName : [firstName, lastName].filter(Boolean).join(' '))
    if (!parsedFullName) errors.fullName = 'Ingresá tu nombre y apellido para continuar.'
    if (!/^\d{2,5}$/.test(cleanAreaCode) || !/^\d{6,8}$/.test(cleanPhoneNumber) || phoneDigits.length < 8 || phoneDigits.length > 13) errors.phone = 'Ingresá un celular válido.'
    if (!birthDate) errors.birthDate = 'Seleccioná una fecha de nacimiento válida.'
    if (gender !== 'FEMALE' && gender !== 'MALE') errors.gender = 'Elegí Dama o Caballero.'
    if (!countries.some((country) => country.code === countryCode)) errors.countryCode = 'Elegí un país válido.'
    if (!selectedProvince) errors.provinceId = 'Elegí una provincia.'
    if (!selectedCity || !findArgentinaLocation(provinceId, cityId)) errors.cityId = 'Elegí una localidad.'
    return { errors, birthDate, cleanAreaCode, cleanPhoneNumber, parsedFullName }
  }

  function validateSports() {
    const errors: FieldErrors = {}
    if (heightCm.trim() && (!/^\d+$/.test(heightCm.trim()) || Number(heightCm) < 120 || Number(heightCm) > 230)) errors.heightCm = 'Ingresá una altura entre 120 y 230 cm.'
    if (avatarFile && (!['image/jpeg', 'image/png', 'image/webp'].includes(avatarFile.type) || avatarFile.size > 3 * 1024 * 1024)) errors.avatar = 'Usá JPG, PNG o WEBP de hasta 3 MB.'
    if (coverFile && (!['image/jpeg', 'image/png', 'image/webp'].includes(coverFile.type) || coverFile.size > 5 * 1024 * 1024)) errors.cover = 'Usá JPG, PNG o WEBP de hasta 5 MB.'
    return errors
  }

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }

  function focusFirstPersonalError(errors: FieldErrors) {
    const ids: Record<PersonalField, string> = {
      fullName: 'complete-full-name',
      gender: 'complete-gender',
      phone: 'complete-phone-area',
      birthDate: 'complete-birth-day',
      countryCode: 'complete-country',
      provinceId: 'complete-province',
      cityId: 'complete-city',
    }
    const firstField = (Object.keys(ids) as Array<keyof typeof ids>).find((field) => errors[field])
    if (!firstField) return
    window.requestAnimationFrame(() => document.getElementById(ids[firstField])?.focus({ preventScroll: true }))
    window.setTimeout(() => document.getElementById(ids[firstField])?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0)
  }

  async function savePersonal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAlert(null)
    const personal = validatePersonal()
    setFieldErrors(personal.errors)
    if (Object.keys(personal.errors).length) {
      focusFirstPersonalError(personal.errors)
      return
    }
    const token = await getAccessToken()
    if (!token) return router.replace('/login?next=%2Fcompletar-perfil')

    const form = new FormData()
    form.set('step', 'personal')
    form.set('fullName', [personal.parsedFullName?.firstName, personal.parsedFullName?.lastName].filter(Boolean).join(' '))
    form.set('phoneAreaCode', personal.cleanAreaCode)
    form.set('phoneNumber', personal.cleanPhoneNumber)
    form.set('birthDate', personal.birthDate ?? '')
    form.set('gender', gender)
    form.set('countryCode', countryCode)
    form.set('provinceId', provinceId)
    form.set('cityId', cityId)
    setSaving(true)
    try {
      const response = await fetch('/api/auth/complete-profile', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
      const result = await response.json().catch(() => null) as { code?: string; message?: string } | null
      if (!response.ok) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[complete-profile:personal]', { status: response.status, code: result?.code ?? 'UNKNOWN_ERROR', message: result?.message ?? 'No pudimos guardar tus datos.' })
        }
        setAlert({ title: result?.message ?? 'No pudimos guardar tus datos.', message: 'Revisá la información e intentá nuevamente.' })
        return
      }
      onboardingStartedRef.current = true
      await session.refresh({ silent: true })
      if (isEditMode) router.replace('/mis-datos?updated=personal')
      else setStep(2)
    } catch {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[complete-profile:personal]', { status: 0, code: 'NETWORK_ERROR', message: 'No pudimos conectarnos.' })
      }
      setAlert({ title: 'No pudimos conectarnos.', message: 'Revisá tu conexión e intentá nuevamente.' })
    } finally {
      setSaving(false)
    }
  }

  async function saveSports(nextStep: Step) {
    setAlert(null)
    const errors = validateSports()
    setFieldErrors(errors)
    if (Object.keys(errors).length) return
    const token = await getAccessToken()
    if (!token) return router.replace('/login?next=%2Fcompletar-perfil')
    const form = new FormData()
    form.set('step', 'sports')
    form.set('heightCm', heightCm.trim())
    form.set('dominantHand', dominantHand)
    form.set('preferredPosition', preferredPosition)
    if (avatarFile) form.set('avatar', avatarFile)
    if (coverFile) form.set('cover', coverFile)
    if (removeAvatar) form.set('removeAvatar', 'true')
    if (removeCover) form.set('removeCover', 'true')
    setSaving(true)
    const response = await fetch('/api/auth/complete-profile', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
    const result = await response.json().catch(() => null) as { message?: string } | null
    setSaving(false)
    if (!response.ok) return setAlert({ title: result?.message ?? 'No pudimos guardar tu perfil deportivo.', message: 'Intentá nuevamente.' })
    await session.refresh({ silent: true })
    if (isEditMode) router.replace('/mis-datos?updated=sports')
    else setStep(nextStep)
  }

  useEffect(() => {
    if (step !== 3 || clubsLoaded || clubsLoading || clubsRequestStartedRef.current) return
    async function loadClubs() {
      clubsRequestStartedRef.current = true
      setClubsLoading(true)
      try {
        const token = await getAccessToken()
        if (!token) {
          router.replace('/login?next=%2Fcompletar-perfil')
          return
        }
        const response = await fetch('/api/clubs/discover', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
        const result = await response.json().catch(() => null) as { clubs?: DiscoverClub[]; error?: string } | null
        setClubs(result?.clubs ?? [])
        setClubsLoaded(true)
        if (!response.ok) setAlert({ title: result?.error ?? 'No pudimos cargar los clubes.', message: 'Podés continuar y explorarlos más tarde.' })
      } catch {
        setClubs([])
        setClubsLoaded(true)
        setAlert({ title: 'No pudimos cargar los clubes.', message: 'Revisá tu conexión e intentá nuevamente.' })
      } finally {
        setClubsLoading(false)
      }
    }
    void loadClubs()
  }, [clubsLoaded, clubsLoading, router, step])

  useEffect(() => {
    if (!successToast) return
    const startExit = window.setTimeout(() => setToastClosing(true), 9_700)
    const remove = window.setTimeout(() => {
      setSuccessToast(null)
      setToastClosing(false)
    }, 10_000)
    return () => {
      window.clearTimeout(startExit)
      window.clearTimeout(remove)
    }
  }, [successToast])

  function dismissSuccessToast() {
    setToastClosing(true)
    window.setTimeout(() => {
      setSuccessToast(null)
      setToastClosing(false)
    }, 220)
  }

  async function requestJoin(clubId: string) {
    const token = await getAccessToken()
    if (!token) return router.replace('/login?next=%2Fcompletar-perfil')
    setSavingClubId(clubId)
    setAlert(null)
    const response = await fetch('/api/clubs/request-join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clubId }),
    })
    const result = await response.json().catch(() => null) as { error?: string; status?: string; message?: string } | null
    setSavingClubId(null)
    if (!response.ok) return setAlert({ title: result?.error ?? 'No pudimos enviar la solicitud.', message: 'Intentá nuevamente.' })
    const clubName = clubs.find((club) => club.id === clubId)?.name ?? 'este club'
    setClubs((current) => current.map((club) => club.id === clubId ? { ...club, membership: { status: result?.status ?? 'PENDING', role: 'PLAYER', approvedAt: null } } : club))
    setToastClosing(false)
    setSuccessToast({ title: 'Solicitud enviada', message: `Tu solicitud a ${clubName} quedó pendiente de aprobación.` })
  }

  function finish() {
    if (session.isApprovedMember && session.activeClub) {
      router.replace(session.postLoginDestination)
      return
    }
    router.replace('/player')
  }

  if (session.status === 'loading') return <div className="px-auth px-authModern px-auth--bridge"><SelpaLoader title="Preparando tu perfil..." subtitle="Cargando tus datos" /></div>
  if (!session.user || (!isEditMode && !onboardingStartedRef.current && isGlobalProfileComplete(session.globalProfile))) return null

  return (
    <div className="px-auth px-authModern px-registerAuth px-completeProfileAuth">
      {successToast ? <div className={`px-onboardingToast ${toastClosing ? 'is-leaving' : ''}`} role="status" aria-live="polite">
        <span className="px-onboardingToastIcon" aria-hidden="true"><CheckCircle2 /></span>
        <div><strong>{successToast.title}</strong><p>{successToast.message}</p></div>
        <button type="button" onClick={dismissSuccessToast} aria-label="Cerrar confirmación"><X /></button>
      </div> : null}
      <div className="px-authCard px-onboardingCard">
        <div className="px-authTop">
          <p className="px-onboardingStep">{isEditMode ? 'Mis datos' : `Paso ${step} de 3`}</p>
          <h1 className="px-authTitle">{step === 1 ? 'Datos personales' : step === 2 ? 'Tu perfil deportivo' : 'Encontrá tus clubes'}</h1>
          <p className="px-authSub">{step === 1 ? 'Completá la información básica para personalizar tu experiencia.' : step === 2 ? 'Definí cómo jugás y personalizá tu perfil.' : 'Descubrí comunidades, conocé sus torneos y solicitá unirte.'}</p>
          <div className={`px-onboardingProgress is-step-${step}`} role="progressbar" aria-label={`Paso ${step} de 3`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(step * 100 / 3)}><span /></div>
        </div>

        <div className="px-authBody px-onboardingBody">
          {step === 1 ? <form className="px-onboardingPersonalForm" onSubmit={(event) => void savePersonal(event)}>
            {needsFullName ? <Field label="Nombre completo" error={fieldErrors.fullName}><input id="complete-full-name" className="px-input" type="text" autoComplete="name" value={fullName} onChange={(event) => { setFullName(event.target.value); clearFieldError('fullName') }} placeholder="Ej.: Juan Pérez" aria-invalid={Boolean(fieldErrors.fullName)} /></Field> : null}
            <Field label="Género" error={fieldErrors.gender}><select id="complete-gender" className="px-input" value={gender} disabled={genderLocked} onChange={(event) => { setGender(event.target.value); clearFieldError('gender') }} aria-invalid={Boolean(fieldErrors.gender)}><option value="">Seleccionar...</option><option value="FEMALE">Dama</option><option value="MALE">Caballero</option></select>{genderLocked ? <p className="px-profileLockedHint">Dato verificado. Para corregirlo, contactá a soporte.</p> : null}</Field>
            <Field label="Celular">
              <div className="px-phoneField" role="group" aria-label="Celular">
                <span className="px-phoneFixed" aria-hidden="true">+54</span>
                <div className="px-phoneCompound">
                  <span aria-hidden="true">0</span>
                  <input
                    id="complete-phone-area"
                    className="px-input"
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="tel-area-code"
                    value={phoneAreaCode}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, '')
                      setPhoneAreaCode(digits.startsWith('0') ? digits.slice(1) : digits)
                      clearFieldError('phone')
                    }}
                    placeholder="11"
                    aria-label="Código de área"
                    aria-invalid={Boolean(fieldErrors.phone)}
                    aria-describedby={fieldErrors.phone ? 'complete-phone-error' : undefined}
                  />
                </div>
                <div className="px-phoneCompound">
                  <span aria-hidden="true">15</span>
                  <input
                    className="px-input"
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="tel-local"
                    value={phoneNumber}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, '')
                      setPhoneNumber(digits.startsWith('15') && digits.length > 8 ? digits.slice(2) : digits)
                      clearFieldError('phone')
                    }}
                    placeholder="5555 1234"
                    aria-label="Número de celular"
                    aria-invalid={Boolean(fieldErrors.phone)}
                    aria-describedby={fieldErrors.phone ? 'complete-phone-error' : undefined}
                  />
                </div>
              </div>
              {fieldErrors.phone ? <p id="complete-phone-error" className="px-fieldError">{fieldErrors.phone}</p> : null}
            </Field>
            <Field label="Fecha de nacimiento" error={fieldErrors.birthDate}><div className="px-birthDateRow"><select id="complete-birth-day" className="px-input" value={birthDay} disabled={birthDateLocked} onChange={(event) => { setBirthDay(event.target.value); clearFieldError('birthDate') }} aria-label="Día" aria-invalid={Boolean(fieldErrors.birthDate)}><option value="">Día</option>{Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day}</option>)}</select><select className="px-input" value={birthMonth} disabled={birthDateLocked} onChange={(event) => { setBirthMonth(event.target.value); clearFieldError('birthDate') }} aria-label="Mes" aria-invalid={Boolean(fieldErrors.birthDate)}><option value="">Mes</option>{birthMonths.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select><select className="px-input" value={birthYear} disabled={birthDateLocked} onChange={(event) => { setBirthYear(event.target.value); clearFieldError('birthDate') }} aria-label="Año" aria-invalid={Boolean(fieldErrors.birthDate)}><option value="">Año</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></div>{birthDateLocked ? <p className="px-profileLockedHint">Dato verificado. Para corregirlo, contactá a soporte.</p> : null}</Field>
            <div className="px-registerGeoRow"><Field label="País"><select id="complete-country" className="px-input" value={countryCode} disabled>{countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select></Field><Field label="Provincia" error={fieldErrors.provinceId}><select id="complete-province" className="px-input" value={provinceId} onChange={(event) => { setProvinceId(event.target.value); setCityId(''); clearFieldError('provinceId'); clearFieldError('cityId') }} aria-invalid={Boolean(fieldErrors.provinceId)}><option value="">Seleccionar...</option>{argentinaLocations.map((province) => <option key={province.id} value={province.id}>{province.name}</option>)}</select></Field></div>
            <Field label="Ciudad o localidad" error={fieldErrors.cityId}><select id="complete-city" className="px-input" disabled={!selectedProvince} value={cityId} onChange={(event) => { setCityId(event.target.value); clearFieldError('cityId') }} aria-invalid={Boolean(fieldErrors.cityId)}><option value="">{selectedProvince ? 'Seleccionar...' : 'Elegí una provincia primero'}</option>{selectedProvince?.cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select></Field>
            <button className="px-btn px-onboardingPersonalNext" type="submit" disabled={saving}>{saving ? 'Guardando...' : isEditMode ? 'Guardar cambios' : 'Siguiente →'}</button>
          </form> : null}

          {step === 2 ? <>
            <div className="px-onboardingSportsRow">
              <Field label="Mano hábil"><select className="px-input" value={dominantHand} onChange={(event) => setDominantHand(event.target.value)}><option value="">Elegir...</option><option value="RIGHT">Derecha</option><option value="LEFT">Izquierda</option><option value="AMBIDEXTROUS">Ambidiestro/a</option></select></Field>
              <Field label="Posición preferida"><select className="px-input" value={preferredPosition} onChange={(event) => setPreferredPosition(event.target.value)}><option value="">Elegir...</option><option value="DRIVE">Drive</option><option value="REVES">Revés</option><option value="BOTH">Ambas</option></select></Field>
              <Field label="Altura" error={fieldErrors.heightCm}><div className="px-onboardingHeight"><input className="px-input" inputMode="numeric" type="number" min="120" max="230" value={heightCm} onChange={(event) => { setHeightCm(event.target.value); clearFieldError('heightCm') }} /><span>cm</span></div></Field>
            </div>
            <AssetPicker label="Foto de perfil" preview={visibleAvatar} initials={initials(firstName, lastName)} emptyIcon={<UserRound />} description="JPG, PNG o WEBP de hasta 3 MB." onChoose={() => { setRemoveAvatar(false); avatarInputRef.current?.click() }} onRemove={() => { setAvatarFile(null); setRemoveAvatar(true); clearFieldError('avatar') }} canRemove={Boolean(avatarFile || profile?.avatar_url) && !removeAvatar} error={fieldErrors.avatar}><input ref={avatarInputRef} className="px-visuallyHidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setAvatarFile(event.target.files?.[0] ?? null); setRemoveAvatar(false); clearFieldError('avatar') }} /></AssetPicker>
            <AssetPicker label="Imagen de portada" preview={visibleCover} emptyIcon={<ImagePlus />} description="Panorámica, JPG, PNG o WEBP de hasta 5 MB." onChoose={() => { setRemoveCover(false); coverInputRef.current?.click() }} onRemove={() => { setCoverFile(null); setRemoveCover(true); clearFieldError('cover') }} canRemove={Boolean(coverFile || profile?.cover_url) && !removeCover} error={fieldErrors.cover}><input ref={coverInputRef} className="px-visuallyHidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setCoverFile(event.target.files?.[0] ?? null); setRemoveCover(false); clearFieldError('cover') }} /></AssetPicker>
            <div className="px-onboardingActions"><button className="px-btn px-btn--ghost" type="button" onClick={() => isEditMode ? router.push('/mis-datos') : setStep(1)} disabled={saving}><ArrowLeft /> Atrás</button><button className="px-btn" type="button" onClick={() => void saveSports(3)} disabled={saving}>{saving ? 'Guardando...' : isEditMode ? 'Guardar cambios' : 'Guardar y continuar'} {!isEditMode ? <ArrowRight /> : null}</button></div>
            {!isEditMode ? <button className="px-onboardingSkip" type="button" onClick={() => void saveSports(3)} disabled={saving}>Completar más tarde <ArrowRight /></button> : null}
          </> : null}

          {step === 3 ? <>
            <div className="px-clubDiscoverSearch"><Search /><input value={clubQuery} onChange={(event) => setClubQuery(event.target.value)} placeholder="Buscar por club o ciudad" aria-label="Buscar clubes" /></div>
            <div className="px-clubDiscoverList" aria-busy={clubsLoading}>{clubsLoading ? <p className="px-help">Buscando clubes cercanos…</p> : filteredClubs.length ? filteredClubs.map((club) => <ClubDiscoverCard key={club.id} club={club} saving={savingClubId === club.id} onRequest={() => void requestJoin(club.id)} />) : <div className="px-onboardingEmpty"><Building2 /><strong>No encontramos clubes</strong><span>Probá con otra búsqueda o explorá más tarde.</span></div>}</div>
            <div className="px-onboardingActions"><button className="px-btn px-btn--ghost" type="button" onClick={() => setStep(2)}><ArrowLeft /> Atrás</button><button className="px-btn" type="button" onClick={finish}>Ir a SELPA <ArrowRight /></button></div>
            <button className="px-onboardingSkip" type="button" onClick={finish}>Explorar después</button>
          </> : null}
          {alert ? <ActionFeedbackNotice tone={alert.variant === 'success' ? 'success' : 'error'} title={alert.title} message={alert.message ?? ''} onDismiss={() => setAlert(null)} autoDismissMs={alert.variant === 'success' ? 4000 : undefined} /> : null}
        </div>
      </div>
    </div>
  )
}

function useObjectPreview(file: File | null, setPreview: (value: string | null) => void) {
  useEffect(() => {
    if (!file) return setPreview(null)
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file, setPreview])
}

function Field({ label, optional, error, children }: { label: string; optional?: boolean; error?: string; children: ReactNode }) {
  return <div className="px-field"><label className="px-label">{label}{optional ? <span>Opcional</span> : null}</label>{children}{error ? <p className="px-fieldError">{error}</p> : null}</div>
}

function AssetPicker({ label, optional, preview, initials: fallbackInitials, emptyIcon, description, onChoose, onRemove, canRemove, error, children }: { label: string; optional?: boolean; preview: string | null; initials?: string; emptyIcon: ReactNode; description: string; onChoose: () => void; onRemove: () => void; canRemove: boolean; error?: string; children: ReactNode }) {
  const uploadLabel = preview ? 'Reemplazar' : label === 'Foto de perfil' ? 'Cargar foto' : 'Cargar portada'
  return <div className="px-onboardingAsset"><div className={`px-onboardingAssetPreview ${fallbackInitials ? 'is-avatar' : ''}`}>{preview ? <img src={preview} alt={`Vista previa de ${label.toLowerCase()}`} /> : fallbackInitials ? <span>{fallbackInitials}</span> : emptyIcon}</div><div className="px-onboardingPhotoCopy"><p className="px-label">{label}{optional ? <span>Opcional</span> : null}</p><p>{description}</p><div className="px-onboardingPhotoActions"><button className="px-btn px-btn--ghost" type="button" onClick={onChoose}><Upload /> {uploadLabel}</button>{canRemove ? <button className="px-link" type="button" onClick={onRemove}>Quitar</button> : null}</div>{children}</div>{error ? <p className="px-fieldError">{error}</p> : null}</div>
}

function ClubDiscoverCard({ club, saving, onRequest }: { club: DiscoverClub; saving: boolean; onRequest: () => void }) {
  const theme = getClubTheme(club.theme_key)
  const state = membershipLabel(club)
  const canRequest = !club.membership || club.membership.status === 'REJECTED'
  return <article className="px-clubDiscoverCard" style={{ '--club-discover-accent': theme.vars.accent, '--club-discover-soft': theme.vars.soft } as CSSProperties}><span className="px-clubDiscoverLogo">{club.logo_url ? <img src={club.logo_url} alt="" /> : clubInitials(club.name)}</span><div className="px-clubDiscoverCopy"><strong>{club.name}</strong><span><MapPin /> {[club.city, club.province].filter(Boolean).join(' · ') || 'Argentina'}</span><small>{state}</small></div><div className="px-clubDiscoverActions"><Link href={`/clubs/${club.id}`} aria-label={`Ver ${club.name}`}>Ver club <ChevronRight /></Link>{canRequest ? <button type="button" onClick={onRequest} disabled={saving}>{saving ? 'Enviando...' : 'Solicitar ingreso'}</button> : null}</div></article>
}
