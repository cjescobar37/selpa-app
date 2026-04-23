import { Suspense } from 'react'
import RegisterSuccessPageClient from './RegisterSuccessPageClient'

export default function RegisterSuccessPage() {
  return (
    <Suspense fallback={<div className="px-auth">Cargando...</div>}>
      <RegisterSuccessPageClient />
    </Suspense>
  )
}