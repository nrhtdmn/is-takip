import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../hooks/useApp'
import type { Task, TaskStatus } from '../types'
import { MembersScreen } from './MembersScreen'
import { NewTaskForm } from './NewTaskForm'
import { ProfileScreen } from './ProfileScreen'
import { StatsBar } from './StatsBar'
import { TaskCard } from './TaskCard'
import { TaskDetail } from './TaskDetail'
import {
  PendingApprovalsScreen,
  usePendingApprovals,
  useRejectedApprovals,
} from './PendingApprovals'
import { TopNav } from './TopNav'

export function HomeScreen() {
  const {
    session,
    tasks,
    orgTasks,
    groups,
    loading,
    isOrgAdmin,
    switchProfile,
    leaveGroup,
    logout,
  } = useApp()
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all')
  const [selected, setSelected] = useState<(Task & { groupId?: string }) | null>(null)
  const [creating, setCreating] = useState(false)
  const [adminAll, setAdminAll] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [approvalsOpen, setApprovalsOpen] = useState(false)
  const [rejectedOpen, setRejectedOpen] = useState(false)
  const pendingApprovals = usePendingApprovals()
  const rejectedApprovals = useRejectedApprovals()

  const canCreateTasks = isOrgAdmin && Boolean(session?.groupId)

  const listSource = useMemo(() => {
    if (isOrgAdmin && adminAll) {
      return orgTasks.map((t) => ({
        ...t,
        title:
          groups.find((g) => g.id === t.groupId)?.name && t.groupId !== session?.groupId
            ? `[${groups.find((g) => g.id === t.groupId)?.name}] ${t.title}`
            : t.title,
      }))
    }
    return tasks
  }, [isOrgAdmin, adminAll, orgTasks, tasks, groups, session?.groupId])

  const filtered = useMemo(() => {
    if (filter === 'all') return listSource
    return listSource.filter((t) => t.status === filter)
  }, [listSource, filter])

  // Açık görev detayını güncel listeyle senkron tut
  useEffect(() => {
    if (!selected) return
    const source = isOrgAdmin && adminAll ? orgTasks : tasks
    const fresh = source.find((t) => t.id === selected.id)
    if (fresh && fresh.updatedAt !== selected.updatedAt) {
      setSelected(fresh)
    }
  }, [tasks, orgTasks, adminAll, isOrgAdmin, selected])

  const liveSelected = selected
    ? (adminAll
        ? orgTasks.find((t) => t.id === selected.id)
        : tasks.find((t) => t.id === selected.id)) || selected
    : null

  if (!session?.groupId) return null

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block brand-lockup">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="brand-logo sm" />
          <div>
            <button type="button" className="eyebrow linkish" onClick={leaveGroup}>
              ← {session.orgName} · {session.groupName || 'Grup'}
            </button>
            <h1>Merhaba, {session.memberName}</h1>
          </div>
        </div>
        <TopNav>
          <button type="button" className="btn ghost compact" onClick={() => setMembersOpen(true)}>
            Üyeler
          </button>
          <div
            className="avatar"
            style={{ background: session.memberColor }}
            title={session.memberName}
          >
            {session.memberName.slice(0, 1).toUpperCase()}
          </div>
          <button type="button" className="btn ghost compact" onClick={() => setProfileOpen(true)}>
            Profilim
          </button>
          <button type="button" className="btn ghost compact" onClick={switchProfile}>
            Hesap
          </button>
          <button type="button" className="btn ghost compact" onClick={logout}>
            Çıkış
          </button>
        </TopNav>
      </header>

      {isOrgAdmin && (
        <div className="admin-toggle-row">
          <button
            type="button"
            className={`chip ${!adminAll ? 'active' : ''}`}
            onClick={() => setAdminAll(false)}
          >
            Bu grup
          </button>
          <button
            type="button"
            className={`chip ${adminAll ? 'active' : ''}`}
            onClick={() => setAdminAll(true)}
          >
            Tüm alan görevleri
          </button>
          <button
            type="button"
            className={`chip ${pendingApprovals.length > 0 ? 'active' : ''}`}
            onClick={() => setApprovalsOpen(true)}
          >
            Onay bekleyenler ({pendingApprovals.length})
          </button>
          <button
            type="button"
            className={`chip ${rejectedApprovals.length > 0 ? 'active' : ''}`}
            onClick={() => setRejectedOpen(true)}
          >
            Reddedilenler ({rejectedApprovals.length})
          </button>
        </div>
      )}

      <StatsBar filter={filter} onFilter={setFilter} />

      <section className="task-list">
        <div className="section-head">
          <h2>Görevler</h2>
          {canCreateTasks && (
            <button type="button" className="btn primary compact" onClick={() => setCreating(true)}>
              + Yeni
            </button>
          )}
        </div>

        {loading && <p className="muted">Yükleniyor…</p>}
        {!loading && filtered.length === 0 && (
          <div className="empty">
            <h3>Henüz görev yok</h3>
            <p>
              {canCreateTasks
                ? 'İlk görevi ekleyin — miad isterseniz tarih/saat yazın.'
                : 'Yönetici size görev atadığında burada görünecek.'}
            </p>
          </div>
        )}

        <div className="cards">
          {filtered.map((task) => (
            <TaskCard key={task.id} task={task} onOpen={() => setSelected(task)} />
          ))}
        </div>
      </section>

      {canCreateTasks && (
        <button type="button" className="fab" onClick={() => setCreating(true)} aria-label="Yeni görev">
          +
        </button>
      )}

      {creating && canCreateTasks && <NewTaskForm onClose={() => setCreating(false)} />}
      {liveSelected && (
        <TaskDetail
          task={liveSelected}
          groupIdOverride={
            'groupId' in liveSelected && typeof liveSelected.groupId === 'string'
              ? liveSelected.groupId
              : undefined
          }
          onClose={() => setSelected(null)}
          onDeleted={() => setSelected(null)}
        />
      )}
      {membersOpen && (
        <MembersScreen
          scope="group"
          groupId={session.groupId}
          onClose={() => setMembersOpen(false)}
        />
      )}
      {profileOpen && <ProfileScreen onClose={() => setProfileOpen(false)} />}
      {approvalsOpen && isOrgAdmin && (
        <PendingApprovalsScreen onClose={() => setApprovalsOpen(false)} mode="pending" />
      )}
      {rejectedOpen && isOrgAdmin && (
        <PendingApprovalsScreen onClose={() => setRejectedOpen(false)} mode="rejected" />
      )}
    </div>
  )
}
