import { doc, setDoc } from 'firebase/firestore'
import { getToken, onMessage } from 'firebase/messaging'
import {
  getDb,
  getFirebaseMessaging,
  isFirebaseConfigured,
  VAPID_KEY,
} from './firebase'
import {
  readCachedNotifPrefs,
  readCachedTaskNotifPrefs,
} from './api'
import { isNotifCategoryEnabled, type NotifCategory } from './notifPrefs'
import type { Task } from '../types'
import { parseNotifPayload, queueNotifOpen } from './notifNav'

const PREF_KEY = 'istakip_push_pref'
const SEEN_KEY = 'istakip_notif_seen'

type SeenMap = Record<string, number>

function readSeen(): SeenMap {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') as SeenMap
  } catch {
    return {}
  }
}

function writeSeen(map: SeenMap) {
  localStorage.setItem(SEEN_KEY, JSON.stringify(map))
}

function markSeen(key: string) {
  const map = readSeen()
  map[key] = Date.now()
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000
  for (const [k, t] of Object.entries(map)) {
    if (t < cutoff) delete map[k]
  }
  writeSeen(map)
}

function wasSeen(key: string) {
  return Boolean(readSeen()[key])
}

function strData(data: Record<string, string | undefined>) {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(data)) {
    if (v != null && v !== '') out[k] = String(v)
  }
  return out
}

function wantsLocal(
  profileId: string,
  category: NotifCategory,
  taskId?: string,
): boolean {
  const prefs = readCachedNotifPrefs(profileId)
  const override = taskId
    ? readCachedTaskNotifPrefs(profileId, taskId).categories
    : null
  return isNotifCategoryEnabled(prefs, category, override)
}

export function getPushPref(): 'unknown' | 'on' | 'off' {
  const v = localStorage.getItem(PREF_KEY)
  if (v === 'on' || v === 'off') return v
  return 'unknown'
}

export function setPushPref(v: 'on' | 'off') {
  localStorage.setItem(PREF_KEY, v)
}

export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  return Notification.requestPermission()
}

export async function showLocalNotification(
  title: string,
  options?: NotificationOptions & { data?: Record<string, string> },
) {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return

  const data = strData({
    ...(options?.data || {}),
    notifKey: options?.data?.notifKey || (options?.tag ? String(options.tag) : undefined),
  })

  const payload: NotificationOptions = {
    icon: `${import.meta.env.BASE_URL}pwa-192.png`,
    badge: `${import.meta.env.BASE_URL}pwa-192.png`,
    ...options,
    data,
  }

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready
      await reg.showNotification(title, payload)
      return
    } catch {
      /* fallback */
    }
  }

  const n = new Notification(title, payload)
  n.onclick = () => {
    n.close()
    window.focus()
    const target = parseNotifPayload({ ...data, tag: options?.tag })
    if (target) queueNotifOpen(target)
  }
}

export async function registerPushToken(profileId: string): Promise<string | null> {
  if (!isFirebaseConfigured || !VAPID_KEY) {
    const permission = await ensureNotificationPermission()
    if (permission === 'granted') {
      setPushPref('on')
      return 'local'
    }
    return null
  }
  const permission = await ensureNotificationPermission()
  if (permission !== 'granted') return null

  const messaging = await getFirebaseMessaging()
  if (!messaging) {
    setPushPref('on')
    return 'local'
  }

  const reg = await navigator.serviceWorker.ready

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: reg,
  })
  if (!token) {
    setPushPref('on')
    return 'local'
  }

  await setDoc(
    doc(getDb(), 'pushTokens', profileId),
    {
      profileId,
      token,
      updatedAt: Date.now(),
      userAgent: navigator.userAgent.slice(0, 180),
    },
    { merge: true },
  )
  setPushPref('on')
  return token
}

export function listenForegroundMessages(onPayload: (title: string, body: string) => void) {
  let unsub = () => {}
  void (async () => {
    const messaging = await getFirebaseMessaging()
    if (!messaging) return
    unsub = onMessage(messaging, (payload) => {
      const data = payload.data || {}
      const title = data.title || payload.notification?.title || 'İş Takip'
      const body = data.body || payload.notification?.body || ''
      onPayload(title, body)
      void showLocalNotification(title, {
        body,
        tag: data.notifKey,
        data: strData({
          groupId: data.groupId,
          taskId: data.taskId,
          kind: data.kind || data.type,
          notifKey: data.notifKey,
          type: data.kind || data.type,
        }),
      })
    })
  })()
  return () => unsub()
}

const DAY_MS = 24 * 60 * 60 * 1000

export function scanAndNotify(input: {
  profileId: string
  isOrgAdmin: boolean
  tasks: (Task & { groupId?: string })[]
}) {
  const now = Date.now()
  const { profileId, isOrgAdmin, tasks } = input

  if (isOrgAdmin) {
    const pending = tasks.filter(
      (t) =>
        t.status === 'completed' &&
        (!t.approvalStatus || t.approvalStatus === 'pending'),
    )
    for (const t of pending) {
      const key = `approval:${t.id}`
      if (wasSeen(key)) continue
      if (!wantsLocal(profileId, 'approvalPending', t.id)) {
        markSeen(key)
        continue
      }
      markSeen(key)
      void showLocalNotification('Onay bekleyen görev', {
        body: t.title,
        tag: key,
        data: strData({
          groupId: t.groupId || '',
          taskId: t.id,
          kind: 'approval',
          notifKey: key,
        }),
      })
    }
  }

  for (const t of tasks) {
    if (!t.dueAt) continue
    if (t.status === 'completed' || t.status === 'blocked') continue
    const mine =
      t.assigneeId === profileId ||
      t.assigneeIds?.includes(profileId) ||
      t.createdById === profileId
    if (!mine && !isOrgAdmin) continue

    const remain = t.dueAt - now
    if (remain < 0) {
      const key = `overdue:${t.id}`
      if (wasSeen(key)) continue
      if (!wantsLocal(profileId, 'overdue', t.id)) {
        markSeen(key)
        continue
      }
      markSeen(key)
      void showLocalNotification('Miad geçti', {
        body: t.title,
        tag: key,
        data: strData({
          groupId: t.groupId || '',
          taskId: t.id,
          kind: 'overdue',
          notifKey: key,
        }),
      })
    } else if (remain <= DAY_MS) {
      const key = `due-soon:${t.id}`
      if (wasSeen(key)) continue
      if (!wantsLocal(profileId, 'dueSoon', t.id)) {
        markSeen(key)
        continue
      }
      markSeen(key)
      void showLocalNotification('Miad yaklaşıyor', {
        body: t.title,
        tag: key,
        data: strData({
          groupId: t.groupId || '',
          taskId: t.id,
          kind: 'due-soon',
          notifKey: key,
        }),
      })
    }
  }
}
