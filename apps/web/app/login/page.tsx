import { Suspense } from 'react'
import LoginPageClient from './LoginPageClient'

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="px-auth px-authModern px-loginAuth">
        <div className="px-authCard">
          <div className="px-authBody">
            <div className="px-loginLoading" role="status" aria-live="polite">
              <span className="px-loginLoading__mark" aria-hidden="true">
                <span className="px-spinner" />
              </span>
              <div>
                <strong>Ingresando...</strong>
                <p>Preparando tu espacio</p>
              </div>
              <span className="px-loginLoading__line" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
    }>
      <LoginPageClient />
    </Suspense>
  )
}
