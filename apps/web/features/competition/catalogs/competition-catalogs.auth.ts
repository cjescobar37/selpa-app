import { NextRequest, NextResponse } from 'next/server'
import { getApprovedMembership } from '@/lib/clubMembershipServer'
import { hasClubCapability } from '@/lib/clubPermissions'
import { isPlatformAdmin } from '@/lib/clubNewsServer'
import { getTokenUser } from '@/lib/platformApiAuth'

export async function authorizeCompetitionCatalog(
  req: NextRequest,
  clubId: string,
  mode: 'read' | 'write',
) {
  const user = await getTokenUser(req)
  if (!user) return { user: null, error: NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 }) }

  if (await isPlatformAdmin(user.id)) return { user, error: null }

  const membership = await getApprovedMembership(user.id, clubId)
  const allowed = mode === 'write'
    ? membership?.role === 'OWNER' || membership?.role === 'ADMIN'
    : Boolean(membership && hasClubCapability(membership.role, 'ranking:view'))

  if (!allowed) {
    return {
      user: null,
      error: NextResponse.json(
        { error: mode === 'write' ? 'Solo OWNER o ADMIN pueden modificar este catálogo.' : 'No autorizado para ver este catálogo.' },
        { status: 403 },
      ),
    }
  }

  return { user, error: null }
}
