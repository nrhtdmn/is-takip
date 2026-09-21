import { useApp } from '../hooks/useApp'
import type { Task } from '../types'
import { CATEGORY_META, STATUS_META } from '../types'
import { formatRelative, formatWhen } from '../lib/time'
import { DeadlineBadge } from './DeadlineBadge'

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

  // Üye: diğer atananları görme — yalnızca kendisi
  const assignedToMe =
    task.assignEveryone ||
    task.assigneeId === myId ||
    Boolean(myId && task.assigneeIds?.includes(myId))
  if (assignedToMe) return 'Size atandı'
  return null
}

export function TaskCard({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const { session, isOrgAdmin } = useApp()
  const status = STATUS_META[task.status]
  const category = CATEGORY_META[task.category]
  const assignees = assigneeLine(task, isOrgAdmin, session?.memberId)

  return (
    <button type="button" className={`task-card tone-${status.tone}`} onClick={onOpen}>
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
      <div className="task-times">
        <span>Kayıt: {formatWhen(task.createdAt)}</span>
        {task.completedAt && <span>Bitti: {formatWhen(task.completedAt)}</span>}
      </div>
    </button>
  )
}
