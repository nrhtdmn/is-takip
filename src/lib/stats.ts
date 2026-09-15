import type { Task } from '../types'

export type TaskWithGroup = Task & { groupId?: string }

export interface PersonStats {
  all: number
  open: number
  started: number
  in_progress: number
  completed: number
  blocked: number
  pendingApproval: number
  approved: number
  successRate: number
}

export function taskTouchesPerson(t: Task, profileId: string): boolean {
  return (
    t.createdById === profileId ||
    t.assigneeId === profileId ||
    Boolean(t.assigneeIds?.includes(profileId))
  )
}

export function computePersonStats(tasks: Task[]): PersonStats {
  const counts = {
    all: tasks.length,
    open: 0,
    started: 0,
    in_progress: 0,
    completed: 0,
    blocked: 0,
    pendingApproval: 0,
    approved: 0,
  }
  for (const t of tasks) {
    if (t.status === 'open') counts.open++
    else if (t.status === 'started') counts.started++
    else if (t.status === 'in_progress') counts.in_progress++
    else if (t.status === 'completed') counts.completed++
    else if (t.status === 'blocked') counts.blocked++

    if (t.status === 'completed') {
      if (t.approvalStatus === 'approved') counts.approved++
      else if (t.approvalStatus !== 'rejected') counts.pendingApproval++
    }
  }
  const successRate =
    counts.all === 0 ? 0 : Math.round((counts.approved / counts.all) * 100)
  return { ...counts, successRate }
}

export function computeGroupStats(tasks: Task[]): PersonStats {
  return computePersonStats(tasks)
}

export function groupPathLabel(
  groupId: string,
  groups: { id: string; name: string; parentId?: string | null }[],
): string {
  const parts: string[] = []
  let cur: string | null | undefined = groupId
  const guard = new Set<string>()
  while (cur && !guard.has(cur)) {
    guard.add(cur)
    const g = groups.find((x) => x.id === cur)
    if (!g) break
    parts.unshift(g.name)
    cur = g.parentId
  }
  return parts.join(' › ')
}
