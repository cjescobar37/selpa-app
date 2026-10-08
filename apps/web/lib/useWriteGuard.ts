'use client'

import { useState } from 'react'

// A disabled button is feedback, not a synchronous double-submit lock.
export function createWriteGuard() {
  let pending = false
  return async function guardedWrite<T>(write: () => Promise<T>) {
    if (pending) return
    pending = true
    try { return await write() } finally { pending = false }
  }
}

export function useWriteGuard() {
  const [guard] = useState(createWriteGuard)
  return guard
}
