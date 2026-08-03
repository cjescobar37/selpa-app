import { NextRequest } from 'next/server';import { divisionMutation } from '@/features/competition/events/competition-events.handlers'
type C={params:Promise<{clubId:string;seriesId:string;eventId:string;eventDivisionId:string}>};export async function POST(r:NextRequest,c:C){return divisionMutation(r,await c.params,'RESTORE')}
