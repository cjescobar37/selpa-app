import EventOperationsDashboard from '../../../../EventOperationsDashboard'

export default async function CompetitionEventPage({ params }: { params: Promise<{ seriesId: string; eventId: string }> }) {
  const { seriesId, eventId } = await params
  return <EventOperationsDashboard seriesId={seriesId} eventId={eventId} />
}
