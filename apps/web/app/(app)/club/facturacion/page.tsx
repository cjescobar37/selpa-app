'use client'
import { useSession } from '@/components/session/SessionProvider'
import BillingExperience from '@/features/billing/BillingExperience'
export default function ClubBillingPage(){const {activeClub}=useSession();return <BillingExperience key={activeClub?.id??'none'} clubId={activeClub?.id}/>}
