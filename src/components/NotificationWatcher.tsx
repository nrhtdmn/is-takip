import { useEffect, useState } from 'react'
import { useApp } from '../hooks/useApp'
import {
  getPushPref,
  listenForegroundMessages,
  registerPushToken,
  scanAndNotify,
  setPushPref,
} from '../lib/notifications'

export function NotificationWatcher() {
  const { session, orgTasks, tasks, isOrgAdmin } = useApp()
  const [banner, setBanner] = useState(false)

  useEffect(() => {
    if (!session?.memberId) return
    if (typeof Notification === 'undefined') return
    const pref = getPushPref()
    if (pref === 'unknown' && Notification.permission !== 'granted') {
      setBanner(true)
    }
    if (pref === 'on' || Notification.permission === 'granted') {
      void registerPushToken(session.memberId)
    }
    return listenForegroundMessages(() => {})
  }, [session?.memberId])

  useEffect(() => {
    if (!session?.memberId) return
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'granted') return

    const list = orgTasks.length > 0 ? orgTasks : tasks
    scanAndNotify({
      profileId: session.memberId,
      isOrgAdmin,
      tasks: list,
    })
  }, [session?.memberId, isOrgAdmin, orgTasks, tasks])

  if (!banner || !session) return null

  return (
    <div className="banner banner-info sticky-banner notif-banner">
      <span>Görev ve miad bildirimleri için izin verin.</span>
      <span className="notif-banner-actions">
        <button
          type="button"
          className="btn primary compact"
          onClick={async () => {
            const token = await registerPushToken(session.memberId)
            if (!token && Notification.permission !== 'granted') {
              setPushPref('off')
            }
            setBanner(false)
          }}
        >
          Aç
        </button>
        <button
          type="button"
          className="btn ghost compact"
          onClick={() => {
            setPushPref('off')
            setBanner(false)
          }}
        >
          Sonra
        </button>
      </span>
    </div>
  )
}
