import { useEffect, useState } from 'react'
import { useApp } from '../hooks/useApp'
import {
  readCachedNotifPrefs,
  readCachedTaskNotifPrefs,
  saveTaskNotifPrefs,
  subscribeNotifPrefs,
  subscribeTaskNotifPrefs,
} from '../lib/api'
import {
  demoGetNotifPrefs,
  demoGetTaskNotifPrefs,
  demoSaveTaskNotifPrefs,
} from '../lib/demoStore'
import {
  defaultNotifPrefs,
  isNotifCategoryEnabled,
  NOTIF_CATEGORY_META,
  perTaskCategoriesForRole,
  type NotifCategory,
  type NotifCategoryOverrideMap,
  type NotifPrefs,
  type TaskNotifPrefs,
} from '../lib/notifPrefs'
import { DrawerShell } from './DrawerShell'

type Tri = 'inherit' | 'on' | 'off'

function triOf(override: boolean | null | undefined): Tri {
  if (override === true) return 'on'
  if (override === false) return 'off'
  return 'inherit'
}

export function TaskNotifPrefsScreen({
  taskId,
  groupId,
  taskTitle,
  onClose,
}: {
  taskId: string
  groupId?: string
  taskTitle: string
  onClose: () => void
}) {
  const { session, isOrgAdmin, demoMode } = useApp()
  const [globalPrefs, setGlobalPrefs] = useState<NotifPrefs>(() =>
    session?.memberId ? readCachedNotifPrefs(session.memberId) : defaultNotifPrefs(),
  )
  const [taskPrefs, setTaskPrefs] = useState<TaskNotifPrefs>(() =>
    session?.memberId
      ? readCachedTaskNotifPrefs(session.memberId, taskId)
      : { profileId: '', taskId, categories: {}, updatedAt: Date.now() },
  )
  const [draft, setDraft] = useState<NotifCategoryOverrideMap>({})
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session?.memberId) return
    if (demoMode) {
      setGlobalPrefs(demoGetNotifPrefs(session.memberId))
      const tp = demoGetTaskNotifPrefs(session.memberId, taskId)
      setTaskPrefs(tp)
      setDraft({ ...tp.categories })
      return
    }
    const u1 = subscribeNotifPrefs(session.memberId, setGlobalPrefs)
    const u2 = subscribeTaskNotifPrefs(session.memberId, taskId, (tp) => {
      setTaskPrefs(tp)
      setDraft({ ...tp.categories })
    })
    return () => {
      u1()
      u2()
    }
  }, [session?.memberId, taskId, demoMode])

  if (!session) return null

  const cats = perTaskCategoriesForRole(isOrgAdmin)

  const setTri = (key: NotifCategory, tri: Tri) => {
    setDraft((d) => {
      const next = { ...d }
      if (tri === 'inherit') delete next[key]
      else next[key] = tri === 'on'
      return next
    })
    setNote('')
  }

  const resetAll = () => {
    setDraft({})
    setNote('')
  }

  const save = async () => {
    setBusy(true)
    setError('')
    setNote('')
    try {
      const payload = {
        profileId: session.memberId,
        taskId,
        groupId,
        categories: draft,
      }
      const next = demoMode
        ? demoSaveTaskNotifPrefs(payload)
        : await saveTaskNotifPrefs(payload)
      setTaskPrefs(next)
      setDraft({ ...next.categories })
      setNote('Bu görev için bildirim ayarı kaydedildi.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kayıt başarısız')
    } finally {
      setBusy(false)
    }
  }

  return (
    <DrawerShell onClose={onClose} eyebrow="Görev bildirimi" title={taskTitle} wide>
      <div className="stack">
        <p className="muted tiny">
          Boş bırakılanlar genel bildirim ayarınızı kullanır. Genel ayarlar şu an{' '}
          {globalPrefs.enabled ? 'açık' : 'kapalı'}.
        </p>

        {cats.map((key) => {
          const meta = NOTIF_CATEGORY_META[key]
          const inherited = isNotifCategoryEnabled(globalPrefs, key, null)
          const tri = triOf(draft[key])
          return (
            <div key={key} className="notif-task-row">
              <div>
                <strong>{meta.label}</strong>
                <span className="muted tiny block">
                  Genel: {inherited ? 'açık' : 'kapalı'} · {meta.hint}
                </span>
              </div>
              <div className="notif-tri">
                <button
                  type="button"
                  className={`chip ${tri === 'inherit' ? 'active' : ''}`}
                  onClick={() => setTri(key, 'inherit')}
                >
                  Genel
                </button>
                <button
                  type="button"
                  className={`chip ${tri === 'on' ? 'active' : ''}`}
                  onClick={() => setTri(key, 'on')}
                >
                  Aç
                </button>
                <button
                  type="button"
                  className={`chip ${tri === 'off' ? 'active' : ''}`}
                  onClick={() => setTri(key, 'off')}
                >
                  Kapalı
                </button>
              </div>
            </div>
          )
        })}

        {Object.keys(taskPrefs.categories).length > 0 && (
          <button type="button" className="btn ghost compact" onClick={resetAll}>
            Tümünü genele döndür
          </button>
        )}

        {error && <p className="banner banner-error">{error}</p>}
        {note && <p className="banner banner-info">{note}</p>}

        <button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </DrawerShell>
  )
}
