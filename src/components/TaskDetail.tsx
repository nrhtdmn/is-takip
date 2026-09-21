import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useApp } from '../hooks/useApp'
import {
  addTaskNote,
  approveTask,
  deleteTask,
  subscribeUpdates,
  updateTask,
  updateTaskStatus,
} from '../lib/api'
import {
  demoAddNote,
  demoApproveTask,
  demoDeleteTask,
  demoGetUpdates,
  demoUpdateStatus,
  demoUpdateTask,
} from '../lib/demoStore'
import { formatDue, formatWhen, toLocalInputValue, fromLocalInputValue } from '../lib/time'
import type { Profile, Task, TaskCategory, TaskStatus, TaskUpdate } from '../types'
import { CATEGORY_META, STATUS_META } from '../types'
import { DeadlineBadge } from './DeadlineBadge'
import { DrawerPortal } from './DrawerShell'
import { MemberSearchList } from './MemberSearchList'
import { TaskFormPanel } from './TaskFormPanel'

const ACTIONS: { status: TaskStatus; label: string }[] = [
  { status: 'started', label: 'İşe başladım' },
  { status: 'in_progress', label: 'Devam ediyor' },
  { status: 'completed', label: 'Tamamladım' },
  { status: 'blocked', label: 'Tamamlayamadım' },
  { status: 'open', label: 'Beklemeye al' },
]

export function TaskDetail({
  task,
  onClose,
  onDeleted,
  groupIdOverride,
}: {
  task: Task
  onClose: () => void
  onDeleted?: () => void
  groupIdOverride?: string
}) {
  const { session, demoMode, refreshLocal, isOrgAdmin, myMemberships, profiles, groups, orgMemberships } =
    useApp()
  const [updates, setUpdates] = useState<TaskUpdate[]>([])
  const [note, setNote] = useState('')
  const [failReason, setFailReason] = useState('')
  const [approvalNote, setApprovalNote] = useState('')
  const [pendingStatus, setPendingStatus] = useState<TaskStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)
  const [editDesc, setEditDesc] = useState(task.description)
  const [editCategory, setEditCategory] = useState<TaskCategory>(task.category)
  const [editDue, setEditDue] = useState(toLocalInputValue(task.dueAt))
  const [editAssignees, setEditAssignees] = useState<string[]>(
    () => task.assigneeIds?.slice() || (task.assigneeId ? [task.assigneeId] : []),
  )
  const [editAssignEveryone, setEditAssignEveryone] = useState(
    () => Boolean(task.assignEveryone),
  )
  /** Anlık durum — abonelik gecikse bile etiket güncellenir */
  const [localStatus, setLocalStatus] = useState<TaskStatus>(task.status)
  const [localApproval, setLocalApproval] = useState(task.approvalStatus)
  const [localFailReason, setLocalFailReason] = useState(task.failReason)

  const groupId = groupIdOverride || session?.groupId
  const taskGroup = groups.find((g) => g.id === groupId)

  const assigneeCandidates = useMemo(() => {
    if (!session) return [] as Profile[]
    if (isOrgAdmin) {
      return orgMemberships
        .map((m) => profiles.find((p) => p.id === m.profileId))
        .filter((p): p is Profile => Boolean(p))
    }
    const ids = new Set(taskGroup?.memberIds || [])
    return profiles.filter((p) => ids.has(p.id))
  }, [session, isOrgAdmin, orgMemberships, profiles, taskGroup])

  useEffect(() => {
    setLocalStatus(task.status)
    setLocalApproval(task.approvalStatus)
    setLocalFailReason(task.failReason)
    setEditTitle(task.title)
    setEditDesc(task.description)
    setEditCategory(task.category)
    setEditDue(toLocalInputValue(task.dueAt))
    if (!editing) {
      setEditAssignees(
        task.assigneeIds?.slice() || (task.assigneeId ? [task.assigneeId] : []),
      )
      setEditAssignEveryone(Boolean(task.assignEveryone))
    }
  }, [
    task.id,
    task.status,
    task.approvalStatus,
    task.failReason,
    task.title,
    task.description,
    task.category,
    task.dueAt,
    task.assigneeIds,
    task.assigneeId,
    task.assignEveryone,
    editing,
  ])

  const startEditing = () => {
    setEditAssignees(
      task.assigneeIds?.slice() || (task.assigneeId ? [task.assigneeId] : []),
    )
    setEditAssignEveryone(Boolean(task.assignEveryone))
    setEditing(true)
  }

  const toggleEditAssignee = (id: string) => {
    setEditAssignEveryone(false)
    setEditAssignees((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  useEffect(() => {
    if (!groupId) return
    if (demoMode) {
      setUpdates(demoGetUpdates(task.id))
      return
    }
    return subscribeUpdates(groupId, task.id, setUpdates)
  }, [task.id, demoMode, task.updatedAt, groupId])

  if (!session || !groupId) return null

  const applyStatus = async (next: TaskStatus) => {
    if (next === 'blocked' && !failReason.trim()) {
      setPendingStatus('blocked')
      setError('Tamamlayamadım için kısa bir neden yazın')
      return
    }

    setBusy(true)
    setError('')
    try {
      if (demoMode) {
        demoUpdateStatus({
          groupId,
          taskId: task.id,
          status: next,
          member: session,
          note: note.trim() || undefined,
          failReason: failReason.trim() || undefined,
        })
        refreshLocal?.()
        setUpdates(demoGetUpdates(task.id))
      } else {
        await updateTaskStatus({
          groupId,
          taskId: task.id,
          status: next,
          member: session,
          note: note.trim() || undefined,
          failReason: failReason.trim() || undefined,
        })
      }
      setLocalStatus(next)
      if (next === 'completed') setLocalApproval('pending')
      else if (next === 'blocked') {
        setLocalApproval(undefined)
        setLocalFailReason(failReason.trim() || 'Belirtilmedi')
      } else {
        setLocalApproval(undefined)
      }
      setNote('')
      setFailReason('')
      setPendingStatus(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Güncellenemedi')
    } finally {
      setBusy(false)
    }
  }

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const dueAt = fromLocalInputValue(editDue) ?? null
      const ids = editAssignEveryone
        ? assigneeCandidates.map((c) => c.id)
        : editAssignees
      const names = ids.map(
        (id) => assigneeCandidates.find((c) => c.id === id)?.name || id,
      )
      const payload = {
        groupId,
        taskId: task.id,
        member: session,
        title: editTitle,
        description: editDesc,
        category: editCategory,
        dueAt,
        assigneeIds: ids,
        assigneeNames: names,
        assignEveryone: editAssignEveryone,
      }
      if (demoMode) {
        demoUpdateTask(payload)
        refreshLocal?.()
        setUpdates(demoGetUpdates(task.id))
      } else {
        await updateTask(payload)
      }
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setBusy(false)
    }
  }

  const sendNote = async (e: FormEvent) => {
    e.preventDefault()
    if (!note.trim()) return
    setBusy(true)
    setError('')
    try {
      if (demoMode) {
        demoAddNote({ groupId, taskId: task.id, member: session, message: note })
        refreshLocal?.()
        setUpdates(demoGetUpdates(task.id))
      } else {
        await addTaskNote({
          groupId,
          taskId: task.id,
          member: session,
          message: note,
        })
      }
      setNote('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Not eklenemedi')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    const role = myMemberships.find((m) => m.orgId === session?.orgId)?.role
    if (role !== 'admin') {
      setError('Görevi yalnızca yönetici silebilir')
      return
    }
    if (!confirm('Bu görevi silmek istiyor musun?')) return
    setBusy(true)
    setError('')
    try {
      if (demoMode) {
        demoDeleteTask(task.id)
        refreshLocal?.()
      } else {
        await deleteTask(groupId, task.id)
      }
      onDeleted?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Silinemedi')
    } finally {
      setBusy(false)
    }
  }

  const decide = async (decision: 'approved' | 'rejected') => {
    if (!groupId) return
    setBusy(true)
    setError('')
    try {
      if (demoMode) {
        demoApproveTask({
          groupId,
          taskId: task.id,
          member: session,
          decision,
          note: approvalNote,
        })
        refreshLocal?.()
        setUpdates(demoGetUpdates(task.id))
      } else {
        await approveTask({
          groupId,
          taskId: task.id,
          member: session,
          decision,
          note: approvalNote,
        })
      }
      setApprovalNote('')
      setLocalApproval(decision)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onaylanamadı')
    } finally {
      setBusy(false)
    }
  }

  const status = STATUS_META[localStatus]
  const membershipRole = myMemberships.find((m) => m.orgId === session.orgId)?.role
  const canEdit = membershipRole === 'admin'
  const canDelete = membershipRole === 'admin'

  return (
    <DrawerPortal>
      <div className="drawer-backdrop" onClick={onClose}>
        <aside
          className={`drawer tone-${status.tone}`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <header className="drawer-head">
            <div>
              <span className="tag">{CATEGORY_META[task.category].label}</span>
              <h2>{task.title}</h2>
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Kapat">
              ✕
            </button>
          </header>

          <div className="drawer-body">
            <div className={`status-banner tone-${status.tone}`}>
              <strong>{status.label}</strong>
              {localStatus === 'completed' &&
                (!localApproval || localApproval === 'pending') && (
                  <span> · Onay bekliyor</span>
                )}
              {localApproval === 'approved' && <span> · Yönetici onayladı</span>}
              {localApproval === 'rejected' && <span> · Reddedildi</span>}
              {isOrgAdmin &&
                (task.assigneeNames?.length
                  ? ` · ${task.assignEveryone ? 'Herkese' : task.assigneeNames.join(', ')}`
                  : task.assigneeName
                    ? ` · ${task.assigneeName}`
                    : null)}
              {!isOrgAdmin &&
                (task.assignEveryone ||
                  task.assigneeId === session.memberId ||
                  Boolean(task.assigneeIds?.includes(session.memberId))) && (
                  <span> · Size atandı</span>
                )}
            </div>

            {task.approvalNote && (
              <p className="banner banner-info">Yönetici notu: {task.approvalNote}</p>
            )}

            {isOrgAdmin &&
              localStatus === 'completed' &&
              localApproval !== 'approved' && (
                <section className="drawer-section">
                  <h3>Yönetici onayı</h3>
                  <p className="muted tiny">
                    Görev bitti olarak görünür; onaylayın veya yorumla reddedin.
                  </p>
                  <label>
                    Yorum (isteğe bağlı)
                    <textarea
                      rows={2}
                      value={approvalNote}
                      onChange={(e) => setApprovalNote(e.target.value)}
                      placeholder="Takdir veya düzeltme notu…"
                    />
                  </label>
                  <div className="action-grid">
                    <button
                      type="button"
                      className="action-btn tone-done"
                      disabled={busy}
                      onClick={() => decide('approved')}
                    >
                      Onayla
                    </button>
                    <button
                      type="button"
                      className="action-btn tone-blocked"
                      disabled={busy}
                      onClick={() => decide('rejected')}
                    >
                      Reddet
                    </button>
                  </div>
                </section>
              )}

            {task.dueAt ? (
              <div className="deadline-block">
                <DeadlineBadge dueAt={task.dueAt} />
                <p className="muted">Son: {formatDue(task.dueAt)}</p>
              </div>
            ) : (
              <p className="muted">Miadsız görev</p>
            )}

            {task.description && !editing && (
              <p className="drawer-desc">{task.description}</p>
            )}

            {task.formItems && task.formItems.length > 0 && groupId && (
              <TaskFormPanel task={task} groupId={groupId} />
            )}

            {canEdit && (
              <section className="drawer-section">
                <div className="section-head tight">
                  <h3>Görevi düzenle</h3>
                  {!editing && (
                    <button
                      type="button"
                      className="btn ghost compact"
                      onClick={startEditing}
                    >
                      Düzenle
                    </button>
                  )}
                </div>
                {editing && (
                  <form onSubmit={saveEdit} className="stack">
                    <label>
                      Başlık
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Açıklama
                      <textarea
                        rows={3}
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                      />
                    </label>
                    <div>
                      <p className="eyebrow">Kime atanacak?</p>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={editAssignEveryone}
                          onChange={(e) => {
                            setEditAssignEveryone(e.target.checked)
                            if (e.target.checked) setEditAssignees([])
                          }}
                        />
                        Herkese ({assigneeCandidates.length} kişi)
                      </label>
                      {!editAssignEveryone && (
                        <MemberSearchList
                          candidates={assigneeCandidates}
                          selectedIds={editAssignees}
                          onToggle={toggleEditAssignee}
                          emptyText="Atanacak üye yok"
                        />
                      )}
                    </div>
                    <label>
                      Kategori
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value as TaskCategory)}
                      >
                        {(Object.keys(CATEGORY_META) as TaskCategory[]).map((c) => (
                          <option key={c} value={c}>
                            {CATEGORY_META[c].label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Miad
                      <input
                        type="datetime-local"
                        value={editDue}
                        onChange={(e) => setEditDue(e.target.value)}
                      />
                    </label>
                    <div className="admin-row-actions">
                      <button type="submit" className="btn primary compact" disabled={busy}>
                        Kaydet
                      </button>
                      <button
                        type="button"
                        className="btn ghost compact"
                        disabled={busy}
                        onClick={() => setEditing(false)}
                      >
                        Vazgeç
                      </button>
                    </div>
                  </form>
                )}
              </section>
            )}

            <dl className="meta-grid">
              <div>
                <dt>Yazan</dt>
                <dd>{task.createdByName}</dd>
              </div>
              <div>
                <dt>Kayıt</dt>
                <dd>{formatWhen(task.createdAt)}</dd>
              </div>
              <div>
                <dt>Son güncelleme</dt>
                <dd>{formatWhen(task.updatedAt)}</dd>
              </div>
              <div>
                <dt>Başlama</dt>
                <dd>{formatWhen(task.startedAt)}</dd>
              </div>
              <div>
                <dt>Tamamlanma</dt>
                <dd>{formatWhen(task.completedAt)}</dd>
              </div>
              {localFailReason && (
                <div className="span-2">
                  <dt>Neden tamamlanamadı</dt>
                  <dd>{localFailReason}</dd>
                </div>
              )}
            </dl>

            <section className="drawer-section">
              <h3>Durumu güncelle</h3>
              <div className="action-grid">
                {ACTIONS.map((a) => (
                  <button
                    key={a.status}
                    type="button"
                    className={`action-btn tone-${STATUS_META[a.status].tone} ${
                      localStatus === a.status ? 'current' : ''
                    }`}
                    disabled={busy}
                    onClick={() => applyStatus(a.status)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>

              {(pendingStatus === 'blocked' || localStatus === 'blocked') && (
                <label className="block-reason">
                  Neden
                  <input
                    value={failReason}
                    onChange={(e) => setFailReason(e.target.value)}
                    placeholder="Örn. Belge eksik"
                  />
                </label>
              )}
            </section>

            <section className="drawer-section">
              <h3>Açıklama / not</h3>
              <form onSubmit={sendNote} className="note-form">
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Herkesin göreceği bir not yaz…"
                />
                <button type="submit" className="btn primary" disabled={busy || !note.trim()}>
                  Not ekle
                </button>
              </form>
              {error && <p className="error">{error}</p>}
            </section>

            <section className="drawer-section">
              <h3>Aktivite</h3>
              <ul className="timeline">
                {updates.length === 0 && <li className="muted">Henüz güncelleme yok</li>}
                {[...updates].reverse().map((u) => (
                  <li key={u.id}>
                    <div className="timeline-dot" />
                    <div>
                      <strong>{u.memberName}</strong>
                      <p>{u.message}</p>
                      <time>{formatWhen(u.createdAt)}</time>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {canDelete && (
              <section className="drawer-section">
                <button type="button" className="btn danger" disabled={busy} onClick={remove}>
                  Görevi sil
                </button>
              </section>
            )}
          </div>
        </aside>
      </div>
    </DrawerPortal>
  )
}
