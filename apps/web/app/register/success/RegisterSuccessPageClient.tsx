'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowRight, Check, Mail } from 'lucide-react'

export default function RegisterSuccessPageClient() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || 'tu casilla de correo'

  return (
    <div className="px-auth px-playerFlow px-playerFlow--success px-registerSuccess">
      <div className="px-authCard">
        <div className="px-authTop">
          <div className="px-registerSuccessMark" aria-hidden="true">
            <div className="px-authLogo"><img src="/brand/selpa-isotipo.png" alt="" /></div>
            <span><Check /></span>
          </div>
          <span className="px-playerFlowKicker">Cuenta creada</span>
          <h1 className="px-authTitle">Ya casi está</h1>
          <p className="px-authSub">Confirmá tu email para activar tu cuenta SELPA.</p>
        </div>

        <div className="px-authBody">
          <div className="px-registerSuccessEmail">
            <Mail aria-hidden="true" />
            <p>Enviamos un enlace de confirmación a <strong>{email}</strong></p>
          </div>
          <ol className="px-registerSuccessSteps">
            <li><span>1</span>Abrí el correo de SELPA.</li>
            <li><span>2</span>Confirmá tu cuenta desde el enlace.</li>
            <li><span>3</span>Volvé para ingresar a la plataforma.</li>
          </ol>
          <p className="px-registerSuccessHelp">¿No lo encontrás? Revisá spam o promociones.</p>

          <Link href="/login" className="px-btn px-registerSuccessCta">Ir al login <ArrowRight /></Link>
        </div>
      </div>
    </div>
  )
}
