import { Suspense } from 'react'
import SelpaLoader from '@/components/SelpaLoader'
import LoginPageClient from './LoginPageClient'

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="px-auth px-authModern px-loginAuth">
        <div className="px-authCard">
          <div className="px-authBody">
            <SelpaLoader title="Ingresando..." subtitle="Preparando tu espacio" />
          </div>
        </div>
      </div>
    }>
      <LoginPageClient />
    </Suspense>
  )
}
