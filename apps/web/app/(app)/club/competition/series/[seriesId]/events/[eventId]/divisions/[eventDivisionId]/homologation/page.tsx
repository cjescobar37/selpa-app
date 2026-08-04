import EventHomologationAdmin from '../../../../../../../EventHomologationAdmin'

export default async function HomologationPage({ params }: { params: Promise<{ seriesId: string; eventId: string; eventDivisionId: string }> }) {
  const value = await params
  return <EventHomologationAdmin {...value} />
}
