'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

export default function RegisterSuccessPageClient() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || 'tu casilla de correo'

  return (
    <div className="px-auth px-playerFlow px-playerFlow--success">
      <div className="px-authCard">
        <div className="px-authTop">
          <div className="px-authBrand">
            <div className="px-authLogo"><img src="/brand/selpa-isotipo.png" alt="SELPA" /></div>

            <div className="px-authBrandText">
              <span className="px-playerFlowKicker">Cuenta creada</span>
              <h1 className="px-authTitle">Registro exitoso</h1>
              <p className="px-authSub">Validá tu email para activar el acceso.</p>
            </div>
          </div>
        </div>

        <div className="px-authBody">
          <div className="px-playerFlowPanel">
            <p style={{ margin: 0, color: '#334155', fontSize: 13.5, lineHeight: 1.45 }}>
              Te enviamos un enlace de confirmación a <strong>{email}</strong>.
            </p>
            <ol className="px-playerSuccessSteps">
              <li>Abrí el mail de SELPA.</li>
              <li>Confirmá tu cuenta desde el enlace.</li>
              <li>Volvé al login para ingresar.</li>
            </ol>
          </div>

          <p className="px-help" style={{ margin: 0 }}>
            Si no lo encontrás, revisá spam o promociones.
          </p>

          <Link
            href="/login"
            className="px-btn"
            style={{ textAlign: 'center' }}
          >
            Ir al login
          </Link>
        </div>
      </div>
    </div>
  )
}
