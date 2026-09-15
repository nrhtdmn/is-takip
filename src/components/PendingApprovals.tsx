import { useMemo, useState } from 'react'
import { useApp } from '../hooks/useApp'
import { formatRelative } from '../lib/time'
import type { Task } from '../types'
import { DrawerShell } from './DrawerShell'
import { TaskDetail } from './TaskDetail'

export function isPendingApproval(task: Task) {
  return (
    task.status === 'completed' &&
    (!task.approvalStatus || task.approvalStatus === 'pending')
  )
}

export function isRejectedApproval(task: Task) {
  return task.status === 'completed' && task.approvalStatus === 'rejected'
}

export function usePendingApprovals() {
  const { orgTasks, isOrgAdmin } = useApp()
  return useMemo(() => {
    if (!isOrgAdmin) return []
    return [...orgTasks]
      .filter(isPendingApproval)
      .sort((a, b) => (b.completedAt || b.updatedAt) - (a.completedAt || a.updatedAt))
  }, [orgTasks, isOrgAdmin])
}

export function useRejectedApprovals() {
  const { orgTasks, isOrgAdmin } = useApp()
  return useMemo(() => {
    if (!isOrgAdmin) return []
    return [...orgTasks]
      .filter(isRejectedApproval)
      .sort((a, b) => (b.approvedAt || b.updatedAt) - (a.approvedAt || a.updatedAt))
  }, [orgTasks, isOrgAdmin])
}

function TaskListRows({
  tasks,
  badgeClass,
  badgeLabel,
  emptyText,
  onOpenTask,
}: {
  tasks: (Task & { groupId: string })[]
  badgeClass: string
  badgeLabel: string
  emptyText: string
  onOpenTask: (task: Task & { groupId: string }) => void
}) {
  const { groups } = useApp()

  if (tasks.length === 0) {
    return (
      <p className="muted tiny" style={{ margin: 0 }}>
        {emptyText}
      </p>
    )
  }

  return (
    <div className="pending-approval-list">
      {tasks.map((t) => {
        const gName = groups.find((g) => g.id === t.groupId)?.name
        return (
          <button
            key={`${t.groupId}:${t.id}`}
            type="button"
            className="pending-approval-row"
            onClick={() => onOpenTask(t)}
          >
            <div className="admin-row-text">
              <strong>{t.title}</strong>
              <span>
                {gName ? `${gName} · ` : ''}
                {t.assigneeName || t.assigneeNames?.join(', ') || t.createdByName}
                {t.approvalNote ? ` · “${t.approvalNote}”` : ''}
                {t.approvedAt
                  ? ` · ${formatRelative(t.approvedAt)}`
                  : t.completedAt
                    ? ` · ${formatRelative(t.completedAt)}`
                    : ''}
              </span>
            </div>
            <span className={`badge ${badgeClass}`}>{badgeLabel}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Yönetim paneli içinde gömülü liste */
export function PendingApprovalsList({
  onOpenTask,
}: {
  onOpenTask: (task: Task & { groupId: string }) => void
}) {
  const pending = usePendingApprovals()
  return (
    <TaskListRows
      tasks={pending}
      badgeClass="badge-started"
      badgeLabel="Onay"
      emptyText="Onay bekleyen görev yok."
      onOpenTask={onOpenTask}
    />
  )
}

export function RejectedApprovalsList({
  onOpenTask,
}: {
  onOpenTask: (task: Task & { groupId: string }) => void
}) {
  const rejected = useRejectedApprovals()
  return (
    <TaskListRows
      tasks={rejected}
      badgeClass="badge-blocked"
      badgeLabel="Red"
      emptyText="Reddedilen görev yok."
      onOpenTask={onOpenTask}
    />
  )
}

/** Ayrı çekmece: onay bekleyenler veya reddedilenler */
export function PendingApprovalsScreen({
  onClose,
  mode = 'pending',
}: {
  onClose: () => void
  mode?: 'pending' | 'rejected'
}) {
  const pending = usePendingApprovals()
  const rejected = useRejectedApprovals()
  const [selected, setSelected] = useState<(Task & { groupId: string }) | null>(null)
  const list = mode === 'rejected' ? rejected : pending

  const live =
    selected &&
    (list.find((t) => t.id === selected.id && t.groupId === selected.groupId) || selected)

  return (
    <>
      <DrawerShell
        onClose={onClose}
        eyebrow="Yönetici"
        title={
          mode === 'rejected'
            ? `Reddedilenler (${rejected.length})`
            : `Onay bekleyenler (${pending.length})`
        }
        wide
      >
        {mode === 'rejected' ? (
          <RejectedApprovalsList onOpenTask={setSelected} />
        ) : (
          <PendingApprovalsList onOpenTask={setSelected} />
        )}
      </DrawerShell>
      {live && (
        <TaskDetail
          task={live}
          groupIdOverride={live.groupId}
          onClose={() => setSelected(null)}
          onDeleted={() => setSelected(null)}
        />
      )}
    </>
  )
}
