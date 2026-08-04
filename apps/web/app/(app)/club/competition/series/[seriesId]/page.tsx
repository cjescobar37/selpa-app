import CompetitionAdmin from '../../CompetitionAdmin'

export default async function CompetitionSeriesPage({ params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params
  return <CompetitionAdmin screen={{ kind: 'detail', seriesId }} />
}
