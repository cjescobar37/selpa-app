// app/layout.tsx
import './globals.css'

export const metadata = {
  title: 'Padelix',
  description: 'Club Atlético Padelix',
}

// ✅ esto es lo importante para mobile
export const viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
