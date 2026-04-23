import { Suspense } from 'react'
import LoginPageClient from './LoginPageClient'

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="px-auth">Cargando login...</div>}>
      <LoginPageClient />
    </Suspense>
  )
}