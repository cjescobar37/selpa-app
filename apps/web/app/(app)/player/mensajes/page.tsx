import PampraxInbox from '@/components/messages/PampraxInbox'

export default function PlayerMensajesPage() {
  return (
    <PampraxInbox
      scope="player"
      title="Mis mensajes"
      subtitle="Conversaciones con clubes por inscripciones, pagos, bajas y consultas deportivas."
    />
  )
}
