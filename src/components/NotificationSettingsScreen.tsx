import { useEffect, useState } from 'react'
import { useApp } from '../hooks/useApp'
import {
  readCachedNotifPrefs,
  saveNotifPrefs,
  subscribeNotifPrefs,
} from '../lib/api'
import {
  demoGetNotifPrefs,
  demoSaveNotifPrefs,
} from '../lib/demoStore'
import {
  categoriesForRole,
  defaultNotifPrefs,
  NOTIF_CATEGORY_META,
  type NotifCategory,
  type NotifPrefs,
} from '../lib/notifPrefs'
import {
  ensureNotificationPermission,
  getPushPref,
  registerPushToken,
  setPushPref,
} from '../lib/notifications'
import { DrawerShell } from './DrawerShell'

export function NotificationSettingsScreen({ onClose }: { onClose: () => void }) {
  const { session, isOrgAdmin, demoMode } = useApp()
  const [prefs, setPrefs] = useState<NotifPrefs>(() =>
    session?.memberId ? readCachedNotifPrefs(session.memberId) : defaultNotifPrefs(),
  )
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [pushOn, setPushOn] = useState(() => getPushPref() === 'on')

  useEffect(() => {
    if (!session?.memberId) return
    if (demoMode) {
      setPrefs(demoGetNotifPrefs(session.memberId))
      return
    }
    return subscribeNotifPrefs(session.memberId, setPrefs, (e) =>
      setError(e.message || 'Tercihler yüklenemedi'),
    )
  }, [session?.memberId, demoMode])

  if (!session) return null

  const cats = categoriesForRole(isOrgAdmin)

  const toggleCat = (key: NotifCategory) => {
    setPrefs((p) => ({
      ...p,
      categories: { ...p.categories, [key]: !p.categories[key] },
    }))
    setNote('')
  }

  const save = async () => {
    setBusy(true)
    setError('')
    setNote('')
    try {
      const next = { ...prefs, updatedAt: Date.now() }
      if (demoMode) demoSaveNotifPrefs(session.memberId, next)
      else await saveNotifPrefs(session.memberId, next)
      setPrefs(next)
      setNote('Bildirim ayarları kaydedildi.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kayıt başarısız')
    } finally {
      setBusy(false)
    }
  }

  return (
    <DrawerShell
      onClose={onClose}
      eyebrow={isOrgAdmin ? 'Yönetici' : 'Üye'}
      title="Bildirim ayarları"
      wide
    >
      <div className="stack">
        <p className="muted tiny">
          Genel tercihleriniz. Bir görevde özel ayar vermezseniz bunlar geçerli olur.
        </p>

        <label className="check-row">
          <input
            type="checkbox"
            checked={prefs.enabled}
            onChange={(e) => {
              setPrefs((p) => ({ ...p, enabled: e.target.checked }))
              setNote('')
            }}
          />
          <span>
            <strong>Bildirimleri aç</strong>
            <span className="muted tiny block">Kapalıysa hiçbir kategori gelmez</span>
          </span>
        </label>

        <label className="check-row">
          <input
            type="checkbox"
            checked={pushOn}
            onChange={async (e) => {
              const on = e.target.checked
              if (on) {
                const perm = await ensureNotificationPermission()
                if (perm !== 'granted') {
                  setError('Tarayıcı bildirim izni verilmedi')
                  return
                }
                await registerPushToken(session.memberId)
                setPushPref('on')
                setPushOn(true)
              } else {
                setPushPref('off')
                setPushOn(false)
              }
            }}
          />
          <span>
            <strong>Cihaz bildirimi (push)</strong>
            <span className="muted tiny block">Uygulama kapalıyken de gösterebilmek için</span>
          </span>
        </label>

        <h3 className="section-title">Kategoriler</h3>
        {cats.map((key) => {
          const meta = NOTIF_CATEGORY_META[key]
          return (
            <label key={key} className={`check-row ${!prefs.enabled ? 'is-disabled' : ''}`}>
              <input
                type="checkbox"
                disabled={!prefs.enabled}
                checked={prefs.categories[key]}
                onChange={() => toggleCat(key)}
              />
              <span>
                <strong>{meta.label}</strong>
                <span className="muted tiny block">{meta.hint}</span>
              </span>
            </label>
          )
        })}

        {error && <p className="banner banner-error">{error}</p>}
        {note && <p className="banner banner-info">{note}</p>}

        <button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </DrawerShell>
  )
}
