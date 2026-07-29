import { NextResponse } from 'next/server'

type CodedError = Error & { code?: string }

export function competitionCatalogErrorResponse(error: unknown) {
  const coded = error instanceof Error ? error as CodedError : null
  const message = coded?.message ?? 'Error gestionando el catálogo competitivo.'

  if (coded?.code === '23505' || message.toLowerCase().includes('duplicate key')) {
    return NextResponse.json({ error: 'Ya existe un registro con ese código en el club.' }, { status: 409 })
  }
  if (coded?.code === '23503' || coded?.code === '23514') {
    return NextResponse.json(
      { error: coded.code === '23503' ? 'El esquema relacionado no existe.' : 'Los datos no cumplen las reglas del catálogo.' },
      { status: 400 },
    )
  }
  if (coded?.code === 'PGRST116') {
    return NextResponse.json({ error: message }, { status: 404 })
  }
  if (message.toLowerCase().includes('could not find the table') || message.toLowerCase().includes('does not exist')) {
    return NextResponse.json(
      { error: 'Falta aplicar la migración de catálogos competitivos Stage 5A.1.', setupRequired: true },
      { status: 412 },
    )
  }
  return NextResponse.json({ error: 'No se pudo gestionar el catálogo competitivo.' }, { status: 500 })
}
