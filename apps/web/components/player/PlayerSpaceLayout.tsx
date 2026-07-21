import type { ReactNode } from 'react'

export default function PlayerSpaceLayout({ children }: { children: ReactNode }) {
  return <div className="px-page px-publicFrame px-playerSpaceFrame">{children}</div>
}
