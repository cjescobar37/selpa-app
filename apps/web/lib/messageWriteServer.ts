import { supabaseAdmin } from '@/lib/supabaseAdmin'

type MessageWrite = { id: string; thread_id: string; sender_user_id: string; recipient_user_id: string; subject: string; body: string; kind: string; metadata: Record<string, unknown> }

// Primary-key arbitration, not check-then-insert. Authorization precedes this helper.
export async function insertMessageOnce(row: MessageWrite) {
  const inserted = await supabaseAdmin.from('messages').insert(row).select('id').single()
  if (!inserted.error) return { id: inserted.data.id as string, replayed: false }
  if (inserted.error.code !== '23505') throw inserted.error
  const previous = await supabaseAdmin.from('messages').select('id,thread_id,sender_user_id,body').eq('id',row.id).maybeSingle()
  if (previous.error) throw previous.error
  if (!previous.data || previous.data.sender_user_id!==row.sender_user_id || previous.data.thread_id!==row.thread_id || previous.data.body!==row.body) {
    throw { code:'23505',message:'WRITE_INTENT_CONFLICT' }
  }
  return { id: row.id, replayed: true }
}

// Ancillary delivery must not turn a committed message into a false failed write.
export async function afterMessageCommit(deliver: () => Promise<unknown>) {
  try { await deliver() }
  catch { console.error('[message-delivery]', { code:'DELIVERY_PENDING' }) }
}
