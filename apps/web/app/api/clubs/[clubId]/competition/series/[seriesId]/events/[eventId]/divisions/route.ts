import { NextRequest } from 'next/server';import { divisionsCollection } from '@/features/competition/events/competition-events.handlers'
type C={params:Promise<{clubId:string;seriesId:string;eventId:string}>};export async function POST(r:NextRequest,c:C){return divisionsCollection(r,await c.params)}
