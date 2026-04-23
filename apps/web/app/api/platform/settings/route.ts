import { NextRequest, NextResponse } from 'next/server'
import { assertPlatformAdmin } from '@/lib/platformApiAuth'
import { logPlatformAction } from '@/lib/platformAudit'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type PlatformSettings = {
  default_commission_bps: number
  default_currency: string
  platform_public_name: string
  contact_email: string
}

const DEFAULT_SETTINGS: PlatformSettings = {
  default_commission_bps: 1000,
  default_currency: 'ARS',
  platform_public_name: 'PAMPrax',
  contact_email: '',
}

const DESCRIPTIONS: Record<keyof PlatformSettings, string> = {
  default_commission_bps: 'Comisión default de plataforma en basis points. 1000 = 10%.',
  default_currency: 'Moneda operativa default.',
  platform_public_name: 'Nombre público visible de la plataforma.',
  contact_email: 'Email público de contacto institucional.',
}

function isMissingSettingsTable(error?: { message?: string } | null) {
  const msg = String(error?.message || '').toLowerCase()
  return (
    msg.includes('public.platform_settings') ||
    msg.includes('could not find the table') ||
    (msg.includes('relation') && msg.includes('platform_settings') && msg.includes('does not exist'))
  )
}

function normalizeSettings(input: any): PlatformSettings {
  const defaultCommissionBps = Number(input?.default_commission_bps)
  if (!Number.isInteger(defaultCommissionBps) || defaultCommissionBps < 0 || defaultCommissionBps > 10000) {
    throw new Error('La comisión default debe estar entre 0 y 10000 bps.')
  }

  const defaultCurrency = String(input?.default_currency ?? '').trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(defaultCurrency)) {
    throw new Error('La moneda default debe ser un código ISO de 3 letras.')
  }

  const platformPublicName = String(input?.platform_public_name ?? '').trim()
  if (platformPublicName.length < 2 || platformPublicName.length > 80) {
    throw new Error('El nombre público debe tener entre 2 y 80 caracteres.')
  }

  const contactEmail = String(input?.contact_email ?? '').trim()
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    throw new Error('El email de contacto no tiene un formato válido.')
  }

  return {
    default_commission_bps: defaultCommissionBps,
    default_currency: defaultCurrency,
    platform_public_name: platformPublicName,
    contact_email: contactEmail,
  }
}

function rowsToSettings(rows: Array<{ key: string; value: any }>) {
  return rows.reduce<PlatformSettings>((acc, row) => {
    if (row.key in acc) {
      return { ...acc, [row.key]: row.value }
    }
    return acc
  }, DEFAULT_SETTINGS)
}

export async function GET(req: NextRequest) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error

  const { data, error } = await supabaseAdmin
    .from('platform_settings')
    .select('key,value,description,updated_at,updated_by')
    .order('key', { ascending: true })

  if (isMissingSettingsTable(error)) {
    return NextResponse.json(
      { code: 'SETTINGS_NOT_INITIALIZED', error: 'Configuración aún no inicializada.', settings: DEFAULT_SETTINGS },
      { status: 503 },
    )
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ settings: rowsToSettings(data ?? []), rows: data ?? [] })
}

export async function PATCH(req: NextRequest) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error

  try {
    const body = await req.json()
    const nextSettings = normalizeSettings(body?.settings ?? body)

    const { data: previousRows, error: previousError } = await supabaseAdmin
      .from('platform_settings')
      .select('key,value')

    if (isMissingSettingsTable(previousError)) {
      return NextResponse.json(
        { code: 'SETTINGS_NOT_INITIALIZED', error: 'Configuración aún no inicializada.' },
        { status: 503 },
      )
    }
    if (previousError) return NextResponse.json({ error: previousError.message }, { status: 500 })

    const previousSettings = rowsToSettings(previousRows ?? [])
    const payload = Object.entries(nextSettings).map(([key, value]) => ({
      key,
      value,
      description: DESCRIPTIONS[key as keyof PlatformSettings],
      updated_by: auth.user!.id,
    }))

    const { data, error } = await supabaseAdmin
      .from('platform_settings')
      .upsert(payload, { onConflict: 'key' })
      .select('key,value,description,updated_at,updated_by')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logPlatformAction({
      actorUserId: auth.user!.id,
      action: 'platform_settings.update',
      entityType: 'platform_settings',
      entityLabel: 'Configuración global',
      metadata: {
        previous: previousSettings,
        next: nextSettings,
        changed_keys: Object.keys(nextSettings).filter(
          (key) => previousSettings[key as keyof PlatformSettings] !== nextSettings[key as keyof PlatformSettings],
        ),
      },
      req,
    })

    return NextResponse.json({ ok: true, settings: rowsToSettings(data ?? []) })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'No pude actualizar configuración.' }, { status: 400 })
  }
}
