import {
  differenceInDays,
  format,
  formatDistanceToNow,
  isToday,
} from 'date-fns'
import { tr } from 'date-fns/locale'

export function formatWhen(ts?: number) {
  if (!ts) return '—'
  return format(ts, 'd MMM yyyy · HH:mm', { locale: tr })
}

export function formatRelative(ts?: number) {
  if (!ts) return '—'
  return formatDistanceToNow(ts, { addSuffix: true, locale: tr })
}

export function formatDue(ts?: number) {
  if (!ts) return null
  return format(ts, 'd MMM yyyy · HH:mm', { locale: tr })
}

/** datetime-local input değeri */
export function toLocalInputValue(ts?: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInputValue(value: string): number | undefined {
  const v = value.trim()
  if (!v) return undefined
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : undefined
}

export type DeadlineInfo = {
  label: string
  tone: 'ok' | 'soon' | 'today' | 'overdue'
  isOverdue: boolean
  isToday: boolean
}

/** Miad kalan süre / geri sayım metni */
export function getDeadlineInfo(dueAt: number, now = Date.now()): DeadlineInfo {
  const due = new Date(dueAt)
  // Aynı gün geçmiş saat de “bugün” geri sayımı / gecikme
  if (dueAt < now) {
    const overdueToday = isToday(due)
    const abs = now - dueAt
    const hours = Math.floor(abs / 3_600_000)
    const mins = Math.floor((abs % 3_600_000) / 60_000)
    if (overdueToday) {
      return {
        label: hours > 0 ? `${hours} sa ${mins} dk geçti` : `${mins} dk geçti`,
        tone: 'overdue',
        isOverdue: true,
        isToday: true,
      }
    }
    const days = differenceInDays(new Date(now), due)
    return {
      label: days <= 1 ? '1 gün gecikti' : `${days} gün gecikti`,
      tone: 'overdue',
      isOverdue: true,
      isToday: false,
    }
  }

  if (isToday(due)) {
    const rem = dueAt - now
    const hours = Math.floor(rem / 3_600_000)
    const mins = Math.floor((rem % 3_600_000) / 60_000)
    const secs = Math.floor((rem % 60_000) / 1000)
    const label =
      hours > 0
        ? `Bugün · ${hours} sa ${mins} dk`
        : mins > 0
          ? `Bugün · ${mins} dk ${secs} sn`
          : `Bugün · ${secs} sn`
    return { label, tone: 'today', isOverdue: false, isToday: true }
  }

  const days = differenceInDays(due, new Date(now))
  if (days <= 1) {
    const rem = dueAt - now
    const hours = Math.floor(rem / 3_600_000)
    const mins = Math.floor((rem % 3_600_000) / 60_000)
    return {
      label: `${hours} sa ${mins} dk kaldı`,
      tone: 'soon',
      isOverdue: false,
      isToday: false,
    }
  }

  return {
    label: `${days} gün kaldı`,
    tone: days <= 3 ? 'soon' : 'ok',
    isOverdue: false,
    isToday: false,
  }
}
