import { useMemo, useState } from 'react'
import type { Profile } from '../types'
import { normalizeTc } from '../lib/tc'

export function MemberSearchList({
  candidates,
  selectedIds,
  onToggle,
  emptyText = 'Kişi yok',
}: {
  candidates: Profile[]
  selectedIds: string[]
  onToggle: (id: string) => void
  emptyText?: string
}) {
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const digits = normalizeTc(q)
    if (!s) return candidates
    return candidates.filter((p) => {
      if (p.name.toLowerCase().includes(s)) return true
      if (digits && p.id.includes(digits)) return true
      if (p.jobTitle?.toLowerCase().includes(s)) return true
      return false
    })
  }, [candidates, q])

  return (
    <div className="member-search">
      <label>
        Üyelerde ara
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="İsim veya T.C."
          autoComplete="off"
        />
      </label>
      <div className="assignee-pick tall">
        {filtered.map((p) => (
          <label key={p.id} className="member-check">
            <input
              type="checkbox"
              checked={selectedIds.includes(p.id)}
              onChange={() => onToggle(p.id)}
            />
            <span className="dot" style={{ background: p.color }} />
            <span className="member-check-text">
              <strong>{p.name}</strong>
              <small>T.C. {p.id}</small>
            </span>
          </label>
        ))}
        {filtered.length === 0 && <p className="muted tiny">{emptyText}</p>}
      </div>
    </div>
  )
}
