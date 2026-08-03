import { NextRequest } from 'next/server';import { eventDetail } from '@/features/competition/events/competition-events.handlers'
type C={params:Promise<{clubId:string;seriesId:string;eventId:string}>};export async function GET(r:NextRequest,c:C){return eventDetail(r,await c.params)}export async function PATCH(r:NextRequest,c:C){return eventDetail(r,await c.params)}
