// app/layout.tsx
import './globals.css'

export const metadata = {
  title: 'Padelix',
  description: 'Club Atlético Padelix',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
