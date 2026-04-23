import RoleGate from './RoleGate'
import type { ReactNode } from 'react'

export default function AppLayout({ children }: { children: ReactNode }) {
  // Layout lógico: acá solo protegemos rutas del Route Group (app).
  // El layout visual (Navbar/Footer) vive en app/layout.tsx → AppShellClient.
  return <RoleGate>{children}</RoleGate>
}
