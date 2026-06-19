'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import { getClubTheme } from '@/lib/clubThemes'

type ClubRulesRow = {
  rules_pdf_url: string | null
  theme_key: string | null
}

export default function ClubReglamentoPage() {
  const { activeClub } = useSession()
  const [url, setUrl] = useState<string | null>(null)
  const [themeKey, setThemeKey] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!activeClub?.id) return
      const { data } = await supabase.from('clubs').select('rules_pdf_url, theme_key').eq('id', activeClub.id).maybeSingle()
      if (!alive) return
      const club = data as ClubRulesRow | null
      setUrl(club?.rules_pdf_url ?? null)
      setThemeKey(club?.theme_key ?? null)
    })()
    return () => { alive = false }
  }, [activeClub?.id])

  const theme = getClubTheme(themeKey)
  const themeStyle = {
    '--club-rules-accent': theme.vars.accent,
    '--club-rules-accent-2': theme.vars.accent2,
    '--club-rules-soft': theme.vars.soft,
    '--club-rules-glow': theme.vars.glow,
  } as CSSProperties

  return (
    <div className="club-shell">
      <div className="club-panel club-rulesPage" style={themeStyle}>
        <header className="club-rulesHero">
          <div>
            <span className="club-rulesKicker">Club Admin</span>
            <h1 className="club-title">Reglamento</h1>
            <p className="club-sub">PDF oficial cargado desde Configuración del club.</p>
          </div>
          <span className="club-rulesBadge">{activeClub?.name ?? 'Club activo'}</span>
        </header>

        <section className="club-rulesCard">
          {url ? (
            <>
              <div className="club-rulesDocument">
                <div className="club-rulesIcon">PDF</div>
                <div>
                  <span className="club-rulesKicker">Documento vigente</span>
                  <h2>Reglamento disponible</h2>
                  <p>El reglamento del club está cargado y listo para consultar o descargar.</p>
                </div>
              </div>
              <div className="club-rulesActions">
                <a className="club-rulesPrimary" href={url} target="_blank" rel="noreferrer">Abrir PDF</a>
                <a className="club-rulesSecondary" href={url} download>Descargar PDF</a>
              </div>
            </>
          ) : (
            <>
              <div className="club-rulesEmpty">
                <div className="club-rulesIcon club-rulesIcon--empty">PDF</div>
                <div>
                  <span className="club-rulesKicker">Sin documento</span>
                  <h2>Todavía no cargaste un reglamento PDF</h2>
                  <p>Cuando lo cargues desde Configuración, los jugadores van a poder consultarlo desde sus vistas.</p>
                </div>
              </div>
              <div className="club-rulesActions">
                <Link className="club-rulesPrimary" href="/club/configuracion">Ir a configuración</Link>
              </div>
            </>
          )}
        </section>
      </div>

      <style jsx>{`
        .club-rulesPage {
          background: rgba(255,255,255,.96);
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 22px;
          box-shadow: 0 22px 60px rgba(15,23,42,.08);
          overflow: hidden;
          position: relative;
        }
        .club-rulesPage::before {
          background: linear-gradient(90deg, var(--club-rules-accent), var(--club-rules-accent-2));
          content: "";
          height: 5px;
          inset: 0 0 auto;
          position: absolute;
        }
        .club-rulesHero {
          align-items: flex-start;
          background: linear-gradient(135deg, rgba(248,250,252,.98), var(--club-rules-soft));
          border: 1px solid rgba(15,23,42,.06);
          border-radius: 18px;
          display: flex;
          gap: 14px;
          justify-content: space-between;
          margin-top: 6px;
          padding: 18px;
        }
        .club-rulesKicker {
          color: var(--club-rules-accent);
          font-size: 11px;
          font-weight: 950;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        .club-rulesBadge {
          background: #061b3a;
          border: 1px solid color-mix(in srgb, var(--club-rules-accent) 42%, transparent);
          border-radius: 999px;
          box-shadow: 0 12px 28px var(--club-rules-glow);
          color: #fff;
          flex: 0 0 auto;
          font-size: 12px;
          font-weight: 950;
          max-width: 220px;
          overflow: hidden;
          padding: 9px 12px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .club-rulesCard {
          background: #fff;
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 18px;
          box-shadow: 0 18px 44px rgba(15,23,42,.06);
          display: grid;
          gap: 16px;
          margin-top: 14px;
          min-width: 0;
          padding: 16px;
        }
        .club-rulesDocument,
        .club-rulesEmpty {
          align-items: center;
          display: grid;
          gap: 14px;
          grid-template-columns: auto minmax(0, 1fr);
          min-width: 0;
        }
        .club-rulesIcon {
          align-items: center;
          background: linear-gradient(135deg, var(--club-rules-accent), var(--club-rules-accent-2));
          border-radius: 18px;
          box-shadow: 0 16px 34px var(--club-rules-glow);
          color: #fff;
          display: inline-flex;
          font-size: 13px;
          font-weight: 950;
          height: 64px;
          justify-content: center;
          letter-spacing: .08em;
          width: 64px;
        }
        .club-rulesIcon--empty {
          background: #f1f5f9;
          border: 1px dashed color-mix(in srgb, var(--club-rules-accent) 42%, rgba(100,116,139,.3));
          box-shadow: none;
          color: #64748b;
        }
        .club-rulesCard h2 {
          color: #17253f;
          font-size: 20px;
          font-weight: 950;
          line-height: 1.12;
          margin: 4px 0 0;
        }
        .club-rulesCard p {
          color: #64748b;
          font-size: 13px;
          font-weight: 800;
          line-height: 1.45;
          margin: 8px 0 0;
        }
        .club-rulesActions {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: flex-end;
        }
        .club-rulesPrimary,
        .club-rulesSecondary {
          align-items: center;
          border-radius: 999px;
          display: inline-flex;
          font-size: 13px;
          font-weight: 950;
          justify-content: center;
          min-height: 40px;
          padding: 0 16px;
          text-decoration: none;
          transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
        }
        .club-rulesPrimary {
          background: #061b3a;
          border: 1px solid color-mix(in srgb, var(--club-rules-accent) 54%, transparent);
          box-shadow: 0 14px 30px var(--club-rules-glow);
          color: #fff;
        }
        .club-rulesSecondary {
          background: #fff;
          border: 1px solid color-mix(in srgb, var(--club-rules-accent) 30%, transparent);
          color: #17253f;
        }
        .club-rulesPrimary:hover,
        .club-rulesSecondary:hover {
          border-color: var(--club-rules-accent);
          box-shadow: 0 18px 40px var(--club-rules-glow);
          transform: translateY(-1px);
        }
        @media (max-width: 720px) {
          .club-rulesHero,
          .club-rulesActions {
            align-items: stretch;
            display: grid;
            justify-content: stretch;
          }
          .club-rulesBadge {
            max-width: none;
            width: max-content;
          }
          .club-rulesDocument,
          .club-rulesEmpty {
            align-items: start;
            grid-template-columns: 1fr;
          }
          .club-rulesPrimary,
          .club-rulesSecondary {
            width: 100%;
          }
        }
      `}</style>
    </div>
  )
}
