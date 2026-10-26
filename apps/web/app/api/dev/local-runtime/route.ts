import { execFileSync } from 'node:child_process'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export function GET() {
  if (process.env.NODE_ENV !== 'development') return new NextResponse(null, { status: 404 })
  const git = (...args: string[]) => execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8' }).trim()
  return NextResponse.json({ app: process.cwd(), branch: git('branch', '--show-current'), sha: git('rev-parse', 'HEAD'), mode: 'development' },
    { headers: { 'Cache-Control': 'no-store' } })
}
