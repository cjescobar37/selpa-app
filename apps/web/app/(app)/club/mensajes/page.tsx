import PampraxInbox from '@/components/messages/PampraxInbox'
import ClubBackLink from '@/components/club/ClubBackLink'

export default function ClubMensajesPage() {
  return (
    <>
      <ClubBackLink />
      <PampraxInbox
        scope="club"
        title="Mensajes del club"
        subtitle="Atendé consultas de jugadores vinculadas a torneos, pagos y solicitudes operativas."
      />
    </>
  )
}
