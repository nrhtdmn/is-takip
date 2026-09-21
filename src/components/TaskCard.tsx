import { useState } from 'react'
import { useApp } from '../hooks/useApp'
import type { Task } from '../types'
import { CATEGORY_META, STATUS_META } from '../types'
import { formatRelative, formatWhen } from '../lib/time'
import { DeadlineBadge } from './DeadlineBadge'
import { TaskNotifPrefsScreen } from './TaskNotifPrefsScreen'

function assigneeLine(task: Task, isAdmin: boolean, myId?: string) {
  if (isAdmin) {
    if (task.assigneeNames && task.assigneeNames.length > 0) {
      return task.assignEveryone
        ? `Herkese: ${task.assigneeNames.join(', ')}`
        : `Atananlar: ${task.assigneeNames.join(', ')}`
    }
    if (task.assigneeName) return `Üzerinde: ${task.assigneeName}`
    return null
  }

  const assignedToMe =
    task.assignEveryone ||
    task.assigneeId === myId ||
    Boolean(myId && task.assigneeIds?.includes(myId))
  if (assignedToMe) return 'Size atandı'
  return null
}

export function TaskCard({
  task,
  onOpen,
  groupId,
}: {
  task: Task & { groupId?: string }
  onOpen: () => void
  groupId?: string
}) {
  const { session, isOrgAdmin } = useApp()
  const [notifOpen, setNotifOpen] = useState(false)
  const status = STATUS_META[task.status]
  const category = CATEGORY_META[task.category]
  const assignees = assigneeLine(task, isOrgAdmin, session?.memberId)
  const gid = groupId || task.groupId || session?.groupId

  return (
    <>
      <article className={`task-card tone-${status.tone}`}>
        <button type="button" className="task-card-main" onClick={onOpen}>
          <div className="task-card-top">
            <span className="tag">{category.label}</span>
            <span className={`badge badge-${status.tone}`}>{status.short}</span>
            {task.status === 'completed' && task.approvalStatus === 'pending' && (
              <span className="badge badge-started">Onay bekliyor</span>
            )}
            {task.status === 'completed' && task.approvalStatus === 'approved' && (
              <span className="badge badge-done">Onaylı</span>
            )}
            {task.status === 'completed' && task.approvalStatus === 'rejected' && (
              <span className="badge badge-blocked">Red</span>
            )}
          </div>
          <h3>{task.title}</h3>
          {task.description && <p className="task-desc">{task.description}</p>}
          {task.dueAt ? (
            <DeadlineBadge dueAt={task.dueAt} />
          ) : (
            <span className="deadline-badge tone-none">Miadsız</span>
          )}
          <div className="task-meta">
            <span>{task.createdByName} yazdı</span>
            <span>{formatRelative(task.updatedAt)}</span>
          </div>
          {assignees && <div className="task-assignee">{assignees}</div>}
          {task.status === 'blocked' && task.failReason && (
            <div className="task-reason">Neden: {task.failReason}</div>
          )}
        </button>
        <div className="task-card-foot">
          <div className="task-times">
            <span>Kayıt: {formatWhen(task.createdAt)}</span>
            {task.completedAt && <span>Bitti: {formatWhen(task.completedAt)}</span>}
          </div>
          <button
            type="button"
            className="task-notif-btn"
            title="Bu görev için bildirim ayarı"
            aria-label="Bildirim ayarı"
            onClick={(e) => {
              e.stopPropagation()
              setNotifOpen(true)
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm8-6V11a8 8 0 1 0-16 0v5l-2 2v1h20v-1l-2-2Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
      </article>
      {notifOpen && (
        <TaskNotifPrefsScreen
          taskId={task.id}
          groupId={gid}
          taskTitle={task.title}
          onClose={() => setNotifOpen(false)}
        />
      )}
    </>
  )
}
