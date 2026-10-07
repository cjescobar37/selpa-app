import PageBackAction from '@/components/navigation/PageBackAction'

export default function ClubBackLink({ href = '/club/admin', label = 'Volver', className }: { href?: string; label?: string; className?: string }) {
  return <PageBackAction href={href} label={label} className={className} />
}
