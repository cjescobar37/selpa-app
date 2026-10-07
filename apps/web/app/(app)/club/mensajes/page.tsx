import PampraxInbox from '@/components/messages/PampraxInbox'

export default function ClubMensajesPage() {
  return (
    <>
      <PampraxInbox
        scope="club"
        backHref="/club/admin"
        title="Mensajes del club"
        subtitle="Atendé consultas de jugadores vinculadas a torneos, pagos y solicitudes operativas."
      />
    </>
  )
}
