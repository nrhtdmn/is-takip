/** Bildirim tıklanınca uygulama içi gezinme */

export type NotifOpenTarget = {
  groupId?: string
  taskId: string
  kind?: string
  notifKey?: string
}

const STORAGE_KEY = 'istakip_notif_open'
const EVENT_NAME = 'istakip-notif-open'

export function queueNotifOpen(target: NotifOpenTarget) {
  if (!target.taskId) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(target))
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(target))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: target }))
}

export function peekNotifOpen(): NotifOpenTarget | null {
  try {
    const raw =
      sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as NotifOpenTarget
  } catch {
    return null
  }
}

export function consumeNotifOpen(): NotifOpenTarget | null {
  const target = peekNotifOpen()
  try {
    sessionStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  return target
}

export function onNotifOpen(cb: (target: NotifOpenTarget) => void) {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<NotifOpenTarget>).detail
    if (detail?.taskId) cb(detail)
  }
  window.addEventListener(EVENT_NAME, handler)
  return () => window.removeEventListener(EVENT_NAME, handler)
}

export function parseNotifPayload(data: unknown): NotifOpenTarget | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const taskId = String(d.taskId || '')
  if (!taskId) return null
  const kind = d.kind ? String(d.kind) : d.type ? String(d.type) : undefined
  return {
    taskId,
    groupId: d.groupId ? String(d.groupId) : undefined,
    kind,
    notifKey: d.notifKey
      ? String(d.notifKey)
      : d.tag
        ? String(d.tag)
        : kind
          ? `${kind}:${taskId}`
          : undefined,
  }
}

export function readOpenFromUrl(): NotifOpenTarget | null {
  try {
    const q = new URLSearchParams(window.location.search)
    const taskId = q.get('openTask')
    if (!taskId) return null
    return {
      taskId,
      groupId: q.get('groupId') || undefined,
      kind: q.get('kind') || undefined,
      notifKey: q.get('notifKey') || undefined,
    }
  } catch {
    return null
  }
}

export function clearOpenFromUrl() {
  try {
    const u = new URL(window.location.href)
    if (!u.searchParams.has('openTask')) return
    u.searchParams.delete('openTask')
    u.searchParams.delete('groupId')
    u.searchParams.delete('kind')
    u.searchParams.delete('notifKey')
    window.history.replaceState({}, '', u.pathname + u.search + u.hash)
  } catch {
    /* ignore */
  }
}

/** React mount olmadan önce tıklama / URL hedefini yakala */
export function bootstrapNotifNav() {
  const fromUrl = readOpenFromUrl()
  if (fromUrl) queueNotifOpen(fromUrl)

  if (!('serviceWorker' in navigator)) return

  const onMessage = (event: MessageEvent) => {
    if (event.data?.type !== 'NOTIFICATION_CLICK') return
    const target = parseNotifPayload(event.data)
    if (target) queueNotifOpen(target)
  }

  navigator.serviceWorker.addEventListener('message', onMessage)
  // Kontroller arası mesajlar için
  navigator.serviceWorker.ready.then((reg) => {
    if (reg.active) {
      /* ready */
    }
  })
}
