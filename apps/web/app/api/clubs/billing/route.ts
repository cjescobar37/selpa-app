import { NextRequest } from 'next/server'
import { billingGet } from '@/lib/platformBillingF2Server'
export const GET = (req:NextRequest) => billingGet(req,false)
