export default function Footer() {
  return (
    <footer className="px-footer">
      <div className="px-footer-main">
        <div className="px-footer-inner">

          <div className="px-footer-brand">
            <div className="px-footer-logo">PX</div>
            <div className="px-footer-title">PAMPRAX</div>
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
        © 2026 PAMPRAX · Privacidad · Términos · Cookies
      </div>
    </footer>
  )
}
