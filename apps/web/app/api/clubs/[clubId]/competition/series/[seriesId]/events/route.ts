import { NextRequest } from 'next/server';import { eventsCollection } from '@/features/competition/events/competition-events.handlers'
type C={params:Promise<{clubId:string;seriesId:string}>};export async function GET(r:NextRequest,c:C){return eventsCollection(r,await c.params)}export async function POST(r:NextRequest,c:C){return eventsCollection(r,await c.params)}
