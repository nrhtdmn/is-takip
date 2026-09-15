import type { Task } from '../types'
import { CATEGORY_META, STATUS_META } from '../types'
import { formatRelative, formatWhen } from '../lib/time'
import { DeadlineBadge } from './DeadlineBadge'

export function TaskCard({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const status = STATUS_META[task.status]
  const category = CATEGORY_META[task.category]

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
      {task.assigneeNames && task.assigneeNames.length > 0 ? (
        <div className="task-assignee">
          {task.assignEveryone ? 'Herkese' : 'Atananlar'}: {task.assigneeNames.join(', ')}
        </div>
      ) : task.assigneeName ? (
        <div className="task-assignee">Üzerinde: {task.assigneeName}</div>
      ) : null}
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
