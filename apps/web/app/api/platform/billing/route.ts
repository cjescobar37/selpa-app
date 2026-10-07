import { NextRequest } from 'next/server'
import { billingGet, billingPost } from '@/lib/platformBillingF2Server'
export const GET = (req:NextRequest) => billingGet(req,true)
export const POST = billingPost
