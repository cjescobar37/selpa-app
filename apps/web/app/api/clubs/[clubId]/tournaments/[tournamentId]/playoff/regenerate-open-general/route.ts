import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { regenerateOpenPlayoffWithGeneralEngine, OpenPlayoffGenerationError } from '@/lib/tournamentOpenPlayoff'

async function getTokenUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ clubId: string; tournamentId: string }> }
) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Acción temporal de QA no disponible en producción.' },
        { status: 404 }
      )
    }

    const user = await getTokenUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
    }

    const { clubId, tournamentId } = await context.params
    const result = await regenerateOpenPlayoffWithGeneralEngine({
      userId: user.id,
      clubId,
      tournamentId,
    })

    return NextResponse.json({ ok: true, ...result }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof OpenPlayoffGenerationError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          ...(error.details ?? {}),
        },
        { status: error.status }
      )
    }

    return NextResponse.json({ error: getErrorMessage(error, 'Error regenerando playoff OPEN.') }, { status: 500 })
  }
}
