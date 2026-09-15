import { useEffect, useState } from 'react'
import { getDeadlineInfo } from '../lib/time'

export function DeadlineBadge({ dueAt }: { dueAt?: number }) {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!dueAt) return
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [dueAt])

  if (!dueAt) return null

  const info = getDeadlineInfo(dueAt)
  return (
    <span className={`deadline-badge tone-${info.tone}`} title={new Date(dueAt).toLocaleString('tr-TR')}>
      {info.isOverdue ? 'Miad geçti' : 'Miad'} · {info.label}
    </span>
  )
}
