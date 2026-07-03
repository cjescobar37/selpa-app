'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

export default function RegisterSuccessPageClient() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || 'tu casilla de correo'

  return (
    <div className="px-auth">
      <div className="px-authCard">
        <div className="px-authTop">
          <div className="px-authBrand">
            <div className="px-authLogo"><img src="/brand/selpa-isotipo.png" alt="SELPA" /></div>

            <div className="px-authBrandText">
              <h1 className="px-authTitle">¡Felicitaciones!</h1>
              <p className="px-authSub">
                Tu cuenta fue creada con éxito.
              </p>
            </div>
          </div>
        </div>

        <div className="px-authBody" style={{ gap: 18 }}>
          <div className="px-card px-card--flat">
            <p style={{ margin: 0, lineHeight: 1.6 }}>
              Ahora recibirás un mail en <strong>{email}</strong> para validar tu cuenta.
              Revisá también spam o promociones.
            </p>
          </div>

          <div className="px-card px-card--flat">
            <p style={{ margin: 0, lineHeight: 1.6 }}>
              Cuando hagas clic en el enlace de activación,
              volverás al login para ingresar.
            </p>
          </div>

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
