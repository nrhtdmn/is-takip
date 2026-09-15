import { useMemo, useState, type FormEvent } from 'react'
import { useApp } from '../hooks/useApp'
import { addRecognition } from '../lib/api'
import { demoAddRecognition } from '../lib/demoStore'
import { computePersonStats, taskTouchesPerson } from '../lib/stats'
import { BADGE_OPTIONS, STATUS_META, publicProfileFields, type Task } from '../types'
import { DrawerShell } from './DrawerShell'
import { TaskDetail } from './TaskDetail'

const PAGE_SIZE = 8

export function MemberStatsScreen({
  profileId,
  onClose,
}: {
  profileId: string
  onClose: () => void
}) {
  const {
    session,
    profiles,
    orgMemberships,
    orgTasks,
    recognitions,
    isOrgAdmin,
    demoMode,
    refreshLocal,
  } = useApp()
  const [badge, setBadge] = useState<string>(BADGE_OPTIONS[0].id)
  const [title, setTitle] = useState('Takdir')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [selectedTask, setSelectedTask] = useState<(Task & { groupId: string }) | null>(
    null,
  )

  const profile = profiles.find((p) => p.id === profileId)
  const mem = orgMemberships.find((m) => m.profileId === profileId)
  const myRecogs = useMemo(
    () => recognitions.filter((r) => r.profileId === profileId),
    [recognitions, profileId],
  )

  const personTasks = useMemo(
    () =>
      [...orgTasks.filter((t) => taskTouchesPerson(t, profileId))].sort(
        (a, b) => b.updatedAt - a.updatedAt,
      ),
    [orgTasks, profileId],
  )
  const stats = useMemo(() => computePersonStats(personTasks), [personTasks])
  const shown = personTasks.slice(0, visibleCount)
  const hasMore = visibleCount < personTasks.length

  if (!session || !profile) return null
  const pub = publicProfileFields(profile, session.memberId)

  const giveBadge = async (e: FormEvent) => {
    e.preventDefault()
    if (!session.orgId || !isOrgAdmin) return
    if (!title.trim()) {
      setError('Başlık gerekli')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (demoMode) {
        demoAddRecognition({
          orgId: session.orgId,
          profileId,
          badge,
          title,
          message,
          member: session,
        })
      } else {
        await addRecognition({
          orgId: session.orgId,
          profileId,
          badge,
          title,
          message,
          member: session,
        })
      }
      refreshLocal?.()
      setMessage('')
      setTitle('Takdir')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verilemedi')
    } finally {
      setBusy(false)
    }
  }

  const badgeLabel = (id: string) =>
    BADGE_OPTIONS.find((b) => b.id === id)?.label || id

  const liveSelected = selectedTask
    ? orgTasks.find(
        (t) => t.id === selectedTask.id && t.groupId === selectedTask.groupId,
      ) || selectedTask
    : null

  return (
    <>
      <DrawerShell onClose={onClose} eyebrow={pub.name} title="Üye panosu" wide>
        <div className="stack">
          <div className="member-detail-head">
            <span className="avatar sm" style={{ background: profile.color }}>
              {profile.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{pub.name}</strong>
              <p className="muted">
                {mem?.role === 'admin' ? 'Yönetici' : 'Üye'}
                {mem?.title ? ` · ${mem.title}` : ''}
                {pub.jobTitle ? ` · ${pub.jobTitle}` : ''}
              </p>
            </div>
          </div>

          <div className="stats-head compact-stats">
            <div>
              <p className="eyebrow">Başarı oranı</p>
              <h2>%{stats.successRate}</h2>
              <p className="muted tiny">
                Onaylı {stats.approved} / Toplam {stats.all}
              </p>
            </div>
          </div>

          <div className="stat-chips member-stat-grid">
            {(
              [
                ['all', 'Toplam', stats.all],
                ['open', 'Bekleyen', stats.open],
                ['started', 'Başladı', stats.started],
                ['in_progress', 'Devam', stats.in_progress],
                ['completed', 'Bitti', stats.completed],
                ['blocked', 'Engel', stats.blocked],
              ] as const
            ).map(([key, label, n]) => (
              <div key={key} className={`stat-chip tone-${key}`}>
                <strong>{n}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>

          <section>
            <p className="eyebrow">Rozetler / takdirler</p>
            {myRecogs.length === 0 ? (
              <p className="muted tiny">Henüz rozet yok</p>
            ) : (
              <ul className="recog-list">
                {myRecogs.map((r) => (
                  <li key={r.id}>
                    <strong>{badgeLabel(r.badge)}</strong> — {r.title}
                    {r.message ? <span className="muted"> · {r.message}</span> : null}
                    <div className="muted tiny">
                      {r.givenByName} · {new Date(r.createdAt).toLocaleDateString('tr-TR')}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {isOrgAdmin && (
            <form onSubmit={giveBadge} className="stack">
              <p className="eyebrow">Rozet / takdir ver</p>
              <label>
                Rozet
                <select value={badge} onChange={(e) => setBadge(e.target.value)}>
                  {BADGE_OPTIONS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Başlık
                <input value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label>
                Yorum (isteğe bağlı)
                <textarea
                  rows={2}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Kısa takdir notu…"
                />
              </label>
              {error && <p className="error">{error}</p>}
              <button type="submit" className="btn primary" disabled={busy}>
                Ver
              </button>
            </form>
          )}

          <section>
            <p className="eyebrow">
              Görevler ({personTasks.length})
              {personTasks.length > PAGE_SIZE
                ? ` · ${Math.min(visibleCount, personTasks.length)} gösteriliyor`
                : ''}
            </p>
            <div className="member-task-scroll">
              <ul className="member-task-ul">
                {shown.map((t) => (
                  <li key={`${t.groupId}:${t.id}`}>
                    <span className={`badge badge-${STATUS_META[t.status].tone}`}>
                      {STATUS_META[t.status].short}
                    </span>
                    {t.status === 'completed' && t.approvalStatus === 'pending' && (
                      <span className="badge badge-started">Onay bekliyor</span>
                    )}
                    {t.status === 'completed' && t.approvalStatus === 'approved' && (
                      <span className="badge badge-done">Onaylı</span>
                    )}{' '}
                    <button
                      type="button"
                      className="linkish task-title-link"
                      onClick={() => setSelectedTask(t)}
                    >
                      {t.title}
                    </button>
                  </li>
                ))}
                {personTasks.length === 0 && <li className="muted">Görev yok</li>}
              </ul>
            </div>
            {hasMore && (
              <button
                type="button"
                className="btn ghost compact"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              >
                Daha fazla göster ({personTasks.length - visibleCount} kaldı)
              </button>
            )}
            {!hasMore && personTasks.length > PAGE_SIZE && (
              <button
                type="button"
                className="btn ghost compact"
                onClick={() => setVisibleCount(PAGE_SIZE)}
              >
                Daralt
              </button>
            )}
          </section>
        </div>
      </DrawerShell>
      {liveSelected && (
        <TaskDetail
          task={liveSelected}
          groupIdOverride={liveSelected.groupId}
          onClose={() => setSelectedTask(null)}
          onDeleted={() => setSelectedTask(null)}
        />
      )}
    </>
  )
}
