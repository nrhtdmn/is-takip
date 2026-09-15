import { useMemo, useState } from 'react'
import { useApp } from '../hooks/useApp'
import { computePersonStats, taskTouchesPerson } from '../lib/stats'
import { publicProfileFields } from '../types'
import { DrawerShell } from './DrawerShell'
import { MemberStatsScreen } from './MemberStatsScreen'
import { normalizeTc } from '../lib/tc'

type SortKey = 'successRate' | 'approved' | 'all'

export function MembersScreen({
  scope,
  groupId,
  onClose,
}: {
  scope: 'org' | 'group'
  groupId?: string
  onClose: () => void
}) {
  const { session, profiles, orgMemberships, groups, orgTasks, isOrgAdmin } = useApp()
  const [q, setQ] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('successRate')

  const group = groups.find((g) => g.id === (groupId || session?.groupId))

  const memberIds = useMemo(() => {
    if (scope === 'group') {
      return new Set(group?.memberIds || [])
    }
    return new Set(orgMemberships.map((m) => m.profileId))
  }, [scope, group, orgMemberships])

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    const digits = normalizeTc(q)
    const list = orgMemberships
      .filter((m) => memberIds.has(m.profileId))
      .map((m) => {
        const profile = profiles.find((p) => p.id === m.profileId)
        if (!profile || !session) return null
        if (s) {
          const hay = `${profile.name} ${m.title || ''} ${profile.id}`.toLowerCase()
          if (!hay.includes(s) && !(digits && profile.id.includes(digits))) return null
        }
        const pub = publicProfileFields(profile, session.memberId)
        const personTasks = orgTasks.filter((t) => taskTouchesPerson(t, m.profileId))
        const stats = computePersonStats(personTasks)
        return { mem: m, profile, pub, stats }
      })
      .filter(Boolean)

    list.sort((a, b) => {
      if (!a || !b) return 0
      const primary =
        sortKey === 'successRate'
          ? b.stats.successRate - a.stats.successRate
          : sortKey === 'approved'
            ? b.stats.approved - a.stats.approved
            : b.stats.all - a.stats.all
      if (primary !== 0) return primary
      // eşitlikte onaylı sayı, sonra isim
      const secondary = b.stats.approved - a.stats.approved
      if (secondary !== 0) return secondary
      return a.profile.name.localeCompare(b.profile.name, 'tr')
    })
    return list
  }, [orgMemberships, memberIds, profiles, session, q, orgTasks, sortKey])

  if (!session) return null

  return (
    <>
      <DrawerShell
        onClose={onClose}
        eyebrow={scope === 'org' ? session.orgName : group?.name || 'Grup'}
        title={isOrgAdmin ? 'Başarı sıralaması' : 'Üyeler'}
        wide
      >
        <div className="stack">
          <p className="muted tiny">
            {isOrgAdmin
              ? 'En başarılı personelleri sıralayın. Üyeye tıklayınca panosu açılır.'
              : 'Üyeye tıklayın — başarı oranı, görevler ve rozetler.'}
          </p>
          <label>
            Ara
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="İsim veya T.C."
            />
          </label>
          {isOrgAdmin && (
            <div className="admin-toggle-row">
              <button
                type="button"
                className={`chip ${sortKey === 'successRate' ? 'active' : ''}`}
                onClick={() => setSortKey('successRate')}
              >
                Başarı oranı
              </button>
              <button
                type="button"
                className={`chip ${sortKey === 'approved' ? 'active' : ''}`}
                onClick={() => setSortKey('approved')}
              >
                Onaylı görev
              </button>
              <button
                type="button"
                className={`chip ${sortKey === 'all' ? 'active' : ''}`}
                onClick={() => setSortKey('all')}
              >
                Toplam görev
              </button>
            </div>
          )}
          <div className="member-detail-list">
            {rows.map((row, index) => {
              if (!row) return null
              const { mem, profile, pub, stats } = row
              const rank = index + 1
              return (
                <button
                  key={mem.profileId}
                  type="button"
                  className="member-detail-card clickable"
                  onClick={() => setSelectedId(mem.profileId)}
                >
                  <div className="member-detail-head">
                    <span className={`rank-badge rank-${Math.min(rank, 4)}`}>#{rank}</span>
                    <span className="avatar sm" style={{ background: profile.color }}>
                      {profile.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <strong>{pub.name}</strong>
                      <p className="muted">
                        {mem.role === 'admin' ? 'Yönetici' : 'Üye'}
                        {mem.title ? ` · ${mem.title}` : ''}
                      </p>
                    </div>
                    <div className="member-rate">
                      <strong>%{stats.successRate}</strong>
                      <span>
                        {stats.approved} onaylı · {stats.all} görev
                      </span>
                    </div>
                  </div>
                  <div className="mini-stats">
                    <span>Bekleyen {stats.open}</span>
                    <span>Devam {stats.started + stats.in_progress}</span>
                    <span>Bitti {stats.completed}</span>
                    <span>Onaylı {stats.approved}</span>
                    <span>Engel {stats.blocked}</span>
                  </div>
                </button>
              )
            })}
            {rows.length === 0 && (
              <div className="empty">
                <h3>Üye yok</h3>
              </div>
            )}
          </div>
        </div>
      </DrawerShell>
      {selectedId && (
        <MemberStatsScreen profileId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </>
  )
}
