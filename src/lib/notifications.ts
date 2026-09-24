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
      if (data.notifKey) markSeen(data.notifKey)
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
/** Uygulama açıkken yeni olay sayılacak pencere (Cloud Functions yoksa kritik) */
const RECENT_MS = 15 * 60 * 1000
const FP_KEY = 'istakip_task_fp'
const SEED_KEY_PREFIX = 'istakip_notif_member_seed:'

type TaskFpMap = Record<string, string>

function readTaskFp(): TaskFpMap {
  try {
    return JSON.parse(localStorage.getItem(FP_KEY) || '{}') as TaskFpMap
  } catch {
    return {}
  }
}

function writeTaskFp(map: TaskFpMap) {
  const ids = Object.keys(map)
  if (ids.length > 400) {
    for (const id of ids.slice(0, ids.length - 300)) delete map[id]
  }
  localStorage.setItem(FP_KEY, JSON.stringify(map))
}

function taskFingerprint(t: Task) {
  return [
    t.status,
    t.title,
    t.description || '',
    t.dueAt || '',
    t.approvalStatus || '',
    (t.assigneeIds || []).slice().sort().join(','),
    t.assigneeId || '',
  ].join('|')
}

function isAssignedToMe(t: Task, profileId: string) {
  return (
    t.assigneeId === profileId ||
    Boolean(t.assigneeIds?.includes(profileId)) ||
    Boolean(t.assignEveryone)
  )
}

function isRecentTask(t: Task, now: number) {
  const created = t.createdAt || 0
  const updated = t.updatedAt || 0
  const approved = t.approvedAt || 0
  return (
    now - created <= RECENT_MS ||
    now - updated <= RECENT_MS ||
    now - approved <= RECENT_MS
  )
}

function seedMemberNotifs(
  profileId: string,
  tasks: (Task & { groupId?: string })[],
  recognitionIds: string[],
): boolean {
  const key = SEED_KEY_PREFIX + profileId
  if (localStorage.getItem(key)) return false
  // İlk yüklemede liste henüz boşsa seed'i ertele; yoksa tüm eski görevler "yeni" sanılır
  if (tasks.length === 0) return false

  const fp = readTaskFp()
  for (const t of tasks) {
    markSeen(`assigned:${t.id}`)
    if (t.approvalStatus === 'approved' || t.approvalStatus === 'rejected') {
      markSeen(`decision:${t.id}:${t.approvalStatus}`)
    }
    markSeen(`approval:${t.id}`)
    markSeen(`due-soon:${t.id}`)
    markSeen(`overdue:${t.id}`)
    markSeen(`change:${t.id}`)
    fp[t.id] = taskFingerprint(t)
  }
  for (const id of recognitionIds) markSeen(`recognition:${id}`)
  writeTaskFp(fp)
  localStorage.setItem(key, '1')
  return true
}

export function scanAndNotify(input: {
  profileId: string
  isOrgAdmin: boolean
  tasks: (Task & { groupId?: string })[]
  recognitions?: { id: string; profileId: string; title: string; badge?: string; createdAt: number }[]
}) {
  const now = Date.now()
  const { profileId, isOrgAdmin, tasks } = input
  const recognitions = input.recognitions || []

  if (
    seedMemberNotifs(
      profileId,
      tasks,
      recognitions.filter((r) => r.profileId === profileId).map((r) => r.id),
    )
  ) {
    return
  }

  // —— Görev ataması (üyeler; oluşturan hariç) ——
  for (const t of tasks) {
    if (!isAssignedToMe(t, profileId)) continue
    if (t.createdById === profileId) {
      markSeen(`assigned:${t.id}`)
      continue
    }
    const key = `assigned:${t.id}`
    if (wasSeen(key)) continue
    if (!isRecentTask(t, now)) {
      markSeen(key)
      continue
    }
    if (!wantsLocal(profileId, 'taskAssigned', t.id)) {
      markSeen(key)
      continue
    }
    markSeen(key)
    void showLocalNotification('Yeni görev atandı', {
      body: t.title,
      tag: key,
      data: strData({
        groupId: t.groupId || '',
        taskId: t.id,
        kind: 'assigned',
        notifKey: key,
      }),
    })
  }

  // —— Onay / red sonucu (atanan üye) ——
  for (const t of tasks) {
    if (t.approvalStatus !== 'approved' && t.approvalStatus !== 'rejected') continue
    if (!isAssignedToMe(t, profileId) && t.createdById !== profileId) continue
    const key = `decision:${t.id}:${t.approvalStatus}`
    if (wasSeen(key)) continue
    if (!isRecentTask(t, now)) {
      markSeen(key)
      continue
    }
    if (!wantsLocal(profileId, 'approvalDecision', t.id)) {
      markSeen(key)
      continue
    }
    markSeen(key)
    void showLocalNotification(
      t.approvalStatus === 'approved' ? 'Görev onaylandı' : 'Görev reddedildi',
      {
        body: t.title,
        tag: key,
        data: strData({
          groupId: t.groupId || '',
          taskId: t.id,
          kind: 'approval-decision',
          notifKey: key,
        }),
      },
    )
  }

  // —— Onay bekleyen (yönetici) ——
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

  // —— Görev değişiklikleri (atanan / oluşturan / yönetici) ——
  const fp = readTaskFp()
  let fpDirty = false
  for (const t of tasks) {
    const mine =
      isAssignedToMe(t, profileId) ||
      t.createdById === profileId ||
      isOrgAdmin
    if (!mine) continue

    const next = taskFingerprint(t)
    const prev = fp[t.id]
    if (prev == null) {
      fp[t.id] = next
      fpDirty = true
      continue
    }
    if (prev === next) continue

    fp[t.id] = next
    fpDirty = true

    const assignKey = `assigned:${t.id}`
    if (!wasSeen(assignKey) && isAssignedToMe(t, profileId) && t.createdById !== profileId) {
      // Atama bildirimi aynı turda gidecek; değişiklik spam'ı atla
      continue
    }

    const key = `change:${t.id}:${next}`
    if (wasSeen(key)) continue
    if (!isRecentTask(t, now)) {
      markSeen(key)
      continue
    }
    if (!wantsLocal(profileId, 'taskChanges', t.id)) {
      markSeen(key)
      continue
    }
    markSeen(key)
    void showLocalNotification('Görev güncellendi', {
      body: t.title,
      tag: `change:${t.id}`,
      data: strData({
        groupId: t.groupId || '',
        taskId: t.id,
        kind: 'task-change',
        notifKey: key,
      }),
    })
  }
  if (fpDirty) writeTaskFp(fp)

  // —— Takdir / rozet ——
  for (const r of recognitions) {
    if (r.profileId !== profileId) continue
    const key = `recognition:${r.id}`
    if (wasSeen(key)) continue
    if (now - (r.createdAt || 0) > RECENT_MS) {
      markSeen(key)
      continue
    }
    if (!wantsLocal(profileId, 'recognition')) {
      markSeen(key)
      continue
    }
    markSeen(key)
    void showLocalNotification('Takdir aldınız', {
      body: r.title || r.badge || 'Yeni takdir',
      tag: key,
      data: strData({
        kind: 'recognition',
        notifKey: key,
      }),
    })
  }

  // —— Miad ——
  for (const t of tasks) {
    if (!t.dueAt) continue
    if (t.status === 'completed' || t.status === 'blocked') continue
    const mine =
      isAssignedToMe(t, profileId) || t.createdById === profileId
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
