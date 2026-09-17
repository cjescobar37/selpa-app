export type ToastTone = 'success' | 'error' | 'warning' | 'info'
export type ToastOptions = { title?: string; detail?: string; duration?: number | null; onDismiss?: () => void; dedupeKey?: string }
export type ToastMessage = ToastOptions & { id: number; tone: ToastTone; message: string; duration: number | null }
export const toastDurations = { success: 4500, info: 5000, warning: 7000, error: null } as const

export function humanizeToastMessage(message: string) {
  if (message.includes('TOURNAMENT_REGISTRATION_CLOSED')) return 'Las inscripciones ya están cerradas.'
  if (message.includes('PRECONDITION_FAILED')) return 'La información cambió. Revisala antes de volver a intentar.'
  if (/PGRST\d+|RPC failed|stack trace|^\s*\d{5}\b|\b[A-Z]+(?:_[A-Z]+){2,}\b|^\s*\{/.test(message)) return 'No pudimos completar la acción. Volvé a intentar.'
  return message
}

export function createToastStore() {
  let messages: ToastMessage[] = []
  let nextId = 0
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach(listener => listener())
  const add = (tone: ToastTone, message: string, options: ToastOptions = {}) => {
    const existing = options.dedupeKey && messages.find(item => item.tone === tone && item.dedupeKey === options.dedupeKey && item.message === humanizeToastMessage(message) && item.title === options.title)
    if (existing) return existing.id
    const id = ++nextId
    messages = [...messages, { ...options, id, tone, message: humanizeToastMessage(message), title: options.title ? humanizeToastMessage(options.title) : undefined, detail: options.detail ? humanizeToastMessage(options.detail) : undefined, duration: options.duration === undefined ? toastDurations[tone] : options.duration }]
    emit()
    return id
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot: () => messages,
    dismiss(id: number) { const item = messages.find(message => message.id === id); messages = messages.filter(message => message.id !== id); emit(); item?.onDismiss?.() },
    success: (message: string, options?: ToastOptions) => add('success', message, options),
    error: (message: string, options?: ToastOptions) => add('error', message, options),
    warning: (message: string, options?: ToastOptions) => add('warning', message, options),
    info: (message: string, options?: ToastOptions) => add('info', message, options),
  }
}

export const toast = createToastStore()
export const visibleToasts = (messages: ToastMessage[]) => [...messages.filter(item => item.tone === 'error'), ...messages.filter(item => item.tone !== 'error')].slice(0, 3)
