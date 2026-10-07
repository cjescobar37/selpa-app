import { NextRequest, NextResponse } from 'next/server'
import { billingAccess, billingFailure } from '@/lib/platformBillingF2Server'
import { billingCsv, billingExportTable, billingXlsx } from '@/lib/platformBillingF2Export'
import type { BillingCursor, BillingPage, BillingRow } from '@/lib/platformBillingF2'
export const runtime='nodejs'
export const maxDuration=60
export async function GET(req:NextRequest) {
  const access=await billingAccess(req,true); if(access.error || !access.client) return access.error
  const q=req.nextUrl.searchParams; const kind=q.get('kind')??'invoices'; const format=q.get('format')??'csv'
  if(!['invoices','payments','subscriptions','balances'].includes(kind)||!['csv','xlsx'].includes(format)) return NextResponse.json({error:'Exportación inválida.'},{status:400})
  const rows:BillingRow[]=[]; let cursor:BillingCursor|null=null
  try {
    do {
      if(req.signal.aborted) throw new Error('ABORTED')
      const result=await access.client.rpc('list_platform_billing_f2',{p_kind:kind,p_club_id:access.clubId,p_limit:100,p_cursor_at:cursor?.at??null,p_cursor_id:cursor?.id??null})
      if(result.error) return billingFailure(result.error)
      const page=result.data as BillingPage; rows.push(...page.items)
      if(rows.length>20000) throw new Error('EXPORT_TOO_LARGE')
      const previousId=(cursor as BillingCursor|null)?.id
      if(previousId && page.nextCursor?.id===previousId) throw new Error('EXPORT_CURSOR')
      cursor=page.nextCursor
    } while(cursor)
    const table=billingExportTable(kind,rows)
    const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`attachment; filename="selpa-billing-${kind}.${format}"`,
      'Content-Type':format==='csv'?'text/csv; charset=utf-8':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}
    return new Response(format==='csv'?billingCsv(table):new Uint8Array(await billingXlsx([table])),{headers})
  } catch(cause) {
    return NextResponse.json({error:cause instanceof Error && cause.message==='EXPORT_TOO_LARGE'?'El archivo supera 20.000 filas. Seleccioná un club para acotar el export.':'No pudimos generar el archivo.'},{status:422})
  }
}
