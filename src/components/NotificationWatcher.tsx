import { useEffect, useState } from 'react'
import { useApp } from '../hooks/useApp'
import { subscribeNotifPrefs } from '../lib/api'
import {
  getPushPref,
  listenForegroundMessages,
  registerPushToken,
  scanAndNotify,
  setPushPref,
} from '../lib/notifications'
import {
  clearOpenFromUrl,
  onNotifOpen,
  peekNotifOpen,
  type NotifOpenTarget,
} from '../lib/notifNav'

export function NotificationWatcher() {
  const {
    session,
    setSession,
    groups,
    orgTasks,
    tasks,
    recognitions,
    isOrgAdmin,
    demoMode,
  } = useApp()
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
    const unsubMsg = listenForegroundMessages(() => {})
    const unsubPrefs = demoMode
      ? () => {}
      : subscribeNotifPrefs(session.memberId, () => {})
    return () => {
      unsubMsg()
      unsubPrefs()
    }
  }, [session?.memberId, demoMode])

  useEffect(() => {
    if (!session?.memberId) return
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'granted') return

    const list = orgTasks.length > 0 ? orgTasks : tasks
    scanAndNotify({
      profileId: session.memberId,
      isOrgAdmin,
      tasks: list,
      recognitions,
    })
  }, [session?.memberId, isOrgAdmin, orgTasks, tasks, recognitions])

  // Bildirimden gelen gruba geç (görev açma HomeScreen'de)
  useEffect(() => {
    if (!session?.memberId || !session.orgId) return

    const applyGroup = (target: NotifOpenTarget) => {
      clearOpenFromUrl()
      const groupId = target.groupId
      if (!groupId || groupId === session.groupId) return
      const g = groups.find((x) => x.id === groupId)
      if (!g) return
      setSession({
        ...session,
        groupId: g.id,
        groupName: g.name,
      })
    }

    const run = () => {
      const pending = peekNotifOpen()
      if (pending) applyGroup(pending)
    }
    run()
    const unsub = onNotifOpen(applyGroup)
    const timers = [400, 1200, 2500].map((ms) => window.setTimeout(run, ms))
    return () => {
      unsub()
      timers.forEach((id) => window.clearTimeout(id))
    }
  }, [session, groups, setSession])

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
