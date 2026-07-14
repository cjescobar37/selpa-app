import { BRAND } from '@/lib/branding'

export default function Footer({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={`px-footer${compact ? ' px-footer--compact' : ''}`}>
      <div className="px-footer-main">
        <div className="px-footer-inner">

          <div className="px-footer-brand">
            <img className="px-footer-logoImage" src="/brand/selpa-logo-horizontal.png" alt={BRAND.name.toUpperCase()} />
          </div>

          <p className="px-footer-text">
            Plataforma de gestión de ranking, torneos y actividad deportiva de pádel.
          </p>

          <div className="px-footer-socials">
            <a href="#" aria-label="Instagram">IG</a>
            <a href="#" aria-label="X">X</a>
            <a href="#" aria-label="YouTube">YT</a>
            <a href="#" aria-label="LinkedIn">IN</a>
          </div>

        </div>
      </div>

      <div className="px-footer-legal">
        <span className="px-footer-legalText">© 2026 {BRAND.name.toUpperCase()}</span>
        <span className="px-footer-legalLine" aria-hidden="true" />
      </div>
    </footer>
  )
}
