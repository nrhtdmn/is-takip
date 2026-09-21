import { useMemo, useState, type FormEvent } from 'react'
import { useApp } from '../hooks/useApp'
import {
  addOrgMember,
  createGroup,
  deleteGroup,
  deleteOrganization,
  getProfileById,
  removeOrgMember,
  renameGroup,
  updateGroupMembers,
  updateOrgMember,
} from '../lib/api'
import {
  demoAddOrgMember,
  demoCreateGroup,
  demoDeleteGroup,
  demoDeleteOrganization,
  demoGetProfileById,
  demoRemoveOrgMember,
  demoRenameGroup,
  demoUpdateGroupMembers,
  demoUpdateOrgMember,
} from '../lib/demoStore'
import { planOf } from '../lib/plans'
import { isValidTc, normalizeTc } from '../lib/tc'
import { computeGroupStats, groupPathLabel } from '../lib/stats'
import { PlanScreen } from './PlanScreen'
import { SoftAdBanner } from './SoftAdBanner'
import { MembersScreen } from './MembersScreen'
import { ProfileScreen } from './ProfileScreen'
import { ControlFormsScreen } from './ControlFormsScreen'
import { DrawerShell } from './DrawerShell'
import { MemberSearchList } from './MemberSearchList'
import { TopNav, KebabMenu } from './TopNav'
import {
  PendingApprovalsList,
  RejectedApprovalsList,
  usePendingApprovals,
  useRejectedApprovals,
} from './PendingApprovals'
import { TaskDetail } from './TaskDetail'
import type { OrgRole, Task } from '../types'

export function GroupScreen() {
  const {
    session,
    setSession,
    groups,
    profiles,
    orgMemberships,
    orgTasks,
    currentOrg,
    isOrgAdmin,
    demoMode,
    refreshLocal,
    leaveOrg,
    switchProfile,
    logout,
  } = useApp()
  const [browseId, setBrowseId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [managingId, setManagingId] = useState<string | null>(null)
  const [adminOpen, setAdminOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const [formsOpen, setFormsOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [addTc, setAddTc] = useState('')
  const [removeTc, setRemoveTc] = useState('')
  const [groupAddTc, setGroupAddTc] = useState('')
  const [groupRemoveTc, setGroupRemoveTc] = useState('')
  const [draftMembers, setDraftMembers] = useState<string[]>([])
  const [createMembers, setCreateMembers] = useState<string[]>([])
  const [addRole, setAddRole] = useState<OrgRole>('member')
  const [addTitle, setAddTitle] = useState('')
  const [groupSearch, setGroupSearch] = useState('')
  const [approvalTask, setApprovalTask] = useState<(Task & { groupId: string }) | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const pendingApprovals = usePendingApprovals()
  const rejectedApprovals = useRejectedApprovals()

  const plan = planOf(currentOrg?.plan)
  const browseGroup = browseId ? groups.find((g) => g.id === browseId) : null

  const orgProfiles = useMemo(() => {
    const ids = new Set(orgMemberships.map((m) => m.profileId))
    return profiles.filter((p) => ids.has(p.id))
  }, [profiles, orgMemberships])

  const accessible = useMemo(() => {
    if (!session) return []
    if (isOrgAdmin) return groups
    return groups.filter((g) => g.memberIds.includes(session.memberId))
  }, [groups, session, isOrgAdmin])

  const visibleGroups = useMemo(() => {
    return accessible.filter((g) => (g.parentId || null) === browseId)
  }, [accessible, browseId])

  const searchHits = useMemo(() => {
    if (!isOrgAdmin) return []
    const s = groupSearch.trim().toLowerCase()
    if (s.length < 1) return []
    return accessible
      .map((g) => ({
        group: g,
        path: groupPathLabel(g.id, groups),
        stats: computeGroupStats(orgTasks.filter((t) => t.groupId === g.id)),
      }))
      .filter(
        (x) =>
          x.path.toLowerCase().includes(s) ||
          x.group.name.toLowerCase().includes(s),
      )
      .slice(0, 30)
  }, [isOrgAdmin, groupSearch, accessible, groups, orgTasks])

  const childCount = (id: string) =>
    accessible.filter((g) => (g.parentId || null) === id).length

  const groupStats = (id: string) =>
    computeGroupStats(orgTasks.filter((t) => t.groupId === id))

  const breadcrumb = useMemo(() => {
    const path: { id: string; name: string }[] = []
    let cur = browseId
    while (cur) {
      const g = groups.find((x) => x.id === cur)
      if (!g) break
      path.unshift({ id: g.id, name: g.name })
      cur = g.parentId || null
    }
    return path
  }, [browseId, groups])

  if (!session?.orgId) return null

  const openTasks = (groupId: string, groupName: string) => {
    setSession({ ...session, groupId, groupName })
  }

  const submitCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Grup adı gerekli')
      return
    }
    if (plan.maxGroups != null && groups.length >= plan.maxGroups) {
      setError(`Başlangıç planında en fazla ${plan.maxGroups} grup. Premium’a geçin.`)
      return
    }
    const seedMembers = Array.from(
      new Set([
        session.memberId,
        ...(createMembers.length > 0 ? createMembers : browseGroup?.memberIds || []),
      ]),
    )
    setBusy(true)
    setError('')
    try {
      const group = demoMode
        ? demoCreateGroup(session.orgId!, name, session, seedMembers, browseId)
        : await createGroup({
            orgId: session.orgId!,
            name,
            member: session,
            memberIds: seedMembers,
            parentId: browseId,
          })
      refreshLocal?.()
      setCreating(false)
      setName('')
      setCreateMembers([])
      setBrowseId(group.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Grup oluşturulamadı')
    } finally {
      setBusy(false)
    }
  }

  const managing = groups.find((g) => g.id === managingId)

  const openManage = (groupId: string) => {
    const g = groups.find((x) => x.id === groupId)
    setManagingId(groupId)
    setDraftMembers([...(g?.memberIds || [])])
    setRenameValue(g?.name || '')
    setGroupAddTc('')
    setGroupRemoveTc('')
    setError('')
  }

  const saveRename = async () => {
    if (!managing) return
    const next = renameValue.trim()
    if (!next) {
      setError('Grup adı gerekli')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (demoMode) demoRenameGroup(managing.id, next)
      else await renameGroup(managing.id, next)
      if (session.groupId === managing.id) {
        setSession({ ...session, groupName: next })
      }
      refreshLocal?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ad değiştirilemedi')
    } finally {
      setBusy(false)
    }
  }

  const toggleDraft = (id: string) => {
    setDraftMembers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const saveDraftMembers = async () => {
    if (!managing) return
    if (plan.maxMembers != null && draftMembers.length > plan.maxMembers) {
      setError(`Bu planda grup en fazla ${plan.maxMembers} üye.`)
      return
    }
    setBusy(true)
    setError('')
    try {
      if (demoMode) demoUpdateGroupMembers(managing.id, draftMembers)
      else await updateGroupMembers(managing.id, draftMembers)
      refreshLocal?.()
      setManagingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setBusy(false)
    }
  }

  const addToGroupByTc = async (e: FormEvent) => {
    e.preventDefault()
    if (!managing) return
    const id = normalizeTc(groupAddTc)
    if (!isValidTc(id)) {
      setError('Geçerli bir T.C. Kimlik No girin')
      return
    }
    if (!orgMemberships.some((m) => m.profileId === id)) {
      setError('Önce kişiyi alana ekleyin (Yönetim)')
      return
    }
    if (draftMembers.includes(id)) {
      setError('Zaten bu grupta')
      return
    }
    if (plan.maxMembers != null && draftMembers.length >= plan.maxMembers) {
      setError(`Bu planda grup en fazla ${plan.maxMembers} üye.`)
      return
    }
      setBusy(true)
    setError('')
    try {
      const ids = Array.from(new Set([...draftMembers, id]))
      setDraftMembers(ids)
      if (demoMode) demoUpdateGroupMembers(managing.id, ids)
      else await updateGroupMembers(managing.id, ids)
      refreshLocal?.()
      setGroupAddTc('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eklenemedi')
    } finally {
      setBusy(false)
    }
  }

  const removeFromGroupByTc = async (e: FormEvent) => {
    e.preventDefault()
    if (!managing) return
    const id = normalizeTc(groupRemoveTc)
    if (!isValidTc(id)) {
      setError('Geçerli bir T.C. Kimlik No girin')
      return
    }
    if (!draftMembers.includes(id)) {
      setError('Bu kimlik grupta değil')
      return
    }
    const p = profiles.find((x) => x.id === id)
    if (!confirm(`${p?.name || id} gruptan çıkarılsın mı?`)) return
      setBusy(true)
    setError('')
    try {
      const ids = draftMembers.filter((x) => x !== id)
      setDraftMembers(ids)
      if (demoMode) demoUpdateGroupMembers(managing.id, ids)
      else await updateGroupMembers(managing.id, ids)
      refreshLocal?.()
      setGroupRemoveTc('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Çıkarılamadı')
    } finally {
      setBusy(false)
    }
  }

  const removeGroup = async (groupId: string, groupName: string) => {
    if (!confirm(`“${groupName}” grubunu, alt gruplarını ve görevlerini sil?`)) return
    setBusy(true)
    try {
      if (demoMode) demoDeleteGroup(groupId)
      else await deleteGroup(groupId)
      refreshLocal?.()
      setManagingId(null)
      if (browseId === groupId) setBrowseId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Silinemedi')
    } finally {
      setBusy(false)
    }
  }

  const addMemberToOrg = async (e: FormEvent) => {
    e.preventDefault()
    const id = normalizeTc(addTc)
    if (!isValidTc(id)) {
      setError('Geçerli bir T.C. Kimlik No girin')
      return
    }
    if (orgMemberships.some((m) => m.profileId === id)) {
      setError('Bu kişi zaten alanda')
      return
    }
    if (plan.maxMembers != null && orgMemberships.length >= plan.maxMembers) {
      setError(`Bu planda alan en fazla ${plan.maxMembers} üye.`)
      return
    }
    setBusy(true)
    setError('')
    try {
      const profile = demoMode ? demoGetProfileById(id) : await getProfileById(id)
      if (!profile) {
        setError('Bu T.C. ile kayıtlı kullanıcı yok. Önce hesap oluşturmalı.')
        return
      }
      if (demoMode) demoAddOrgMember(session.orgId!, id, addRole, addTitle)
      else
        await addOrgMember({
          orgId: session.orgId!,
          profileId: id,
          role: addRole,
          title: addTitle,
        })
      refreshLocal?.()
      setAddTc('')
      setAddTitle('')
      setAddRole('member')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eklenemedi')
    } finally {
      setBusy(false)
    }
  }

  const removeMemberByTc = async (e: FormEvent) => {
    e.preventDefault()
    const id = normalizeTc(removeTc)
    if (!isValidTc(id)) {
      setError('Geçerli bir T.C. Kimlik No girin')
      return
    }
    if (id === session.memberId) {
      setError('Kendinizi bu yolla çıkaramazsınız')
      return
    }
    if (!orgMemberships.some((m) => m.profileId === id)) {
      setError('Bu kimlik alanda değil')
      return
    }
    const p = profiles.find((x) => x.id === id)
    if (!confirm(`${p?.name || id} alandan çıkarılsın mı?`)) return
    setBusy(true)
    setError('')
    try {
      if (demoMode) demoRemoveOrgMember(session.orgId!, id)
      else await removeOrgMember(session.orgId!, id)
      refreshLocal?.()
      setRemoveTc('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Çıkarılamadı')
    } finally {
      setBusy(false)
    }
  }

  const goUp = () => {
    if (!browseGroup) {
      leaveOrg()
      return
    }
    setBrowseId(browseGroup.parentId || null)
  }

  return (
    <div className="app-shell has-soft-ad">
      <header className="topbar">
        <div className="brand-block brand-lockup">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="brand-logo sm" />
          <div>
            <button type="button" className="eyebrow linkish" onClick={goUp}>
              ← {browseGroup ? browseGroup.name : `Alanlar · ${session.orgName}`}
            </button>
            <h1>{browseGroup ? 'Alt çalışma grupları' : 'Gruplar'}</h1>
          </div>
        </div>
        <TopNav>
          <button type="button" className="btn ghost compact" onClick={() => setMembersOpen(true)}>
            Üyeler
          </button>
          {isOrgAdmin && (
            <button type="button" className="btn ghost compact" onClick={() => setFormsOpen(true)}>
              Kontrol formları
            </button>
          )}
          <button type="button" className="btn ghost compact" onClick={() => setPlanOpen(true)}>
            {plan.label}
          </button>
          {isOrgAdmin && (
            <button type="button" className="btn ghost compact" onClick={() => setAdminOpen(true)}>
              Yönetim
              {pendingApprovals.length > 0 ? ` (${pendingApprovals.length})` : ''}
            </button>
          )}
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

      {breadcrumb.length > 0 && (
        <div className="breadcrumb-row">
          <button type="button" className="linkish" onClick={() => setBrowseId(null)}>
            Kök
          </button>
          {breadcrumb.map((b) => (
            <span key={b.id}>
              /{' '}
              <button type="button" className="linkish" onClick={() => setBrowseId(b.id)}>
                {b.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {browseGroup && (
        <div className="browse-toolbar">
          <button
            type="button"
            className="btn primary compact"
            onClick={() => openTasks(browseGroup.id, browseGroup.name)}
          >
            Görevler →
          </button>
          {(isOrgAdmin || browseGroup.createdById === session.memberId) && (
            <KebabMenu
              items={[
                {
                  label: 'Üye düzenle',
                  onClick: () => openManage(browseGroup.id),
                },
              ]}
            />
          )}
        </div>
      )}

      <p className="lead soft">
        Alt gruplara da üye ekleyebilirsiniz. Listeden seçin veya T.C. yazın; arama ile bulun.
      </p>

      {isOrgAdmin && (
        <label className="group-search-field">
          Gruplarda ara (alt gruplara tek tek inmeden)
          <input
            value={groupSearch}
            onChange={(e) => setGroupSearch(e.target.value)}
            placeholder="Örn. Sevkiyat, Ulaştırma…"
          />
        </label>
      )}

      {isOrgAdmin && searchHits.length > 0 && (
        <div className="group-list search-hits">
          {searchHits.map(({ group: g, path, stats }) => (
            <div key={g.id} className="group-card">
              <button
                type="button"
                className="group-main"
                onClick={() => {
                  setBrowseId(g.parentId || null)
                  setGroupSearch('')
                }}
              >
                <strong>{g.name}</strong>
                <span className="group-meta">
                  <span className="group-meta-path">{path}</span>
                  <span className="group-meta-stats">
                    %{stats.successRate} · {stats.all} görev · {stats.approved} onaylı
                  </span>
                </span>
              </button>
              <div className="group-card-actions card-menu-slot">
                <KebabMenu
                  items={[
                    {
                      label: 'Görevler',
                      onClick: () => openTasks(g.id, g.name),
                    },
                    {
                      label: 'Üye düzenle',
                      onClick: () => openManage(g.id),
                    },
                    {
                      label: 'Gruba git',
                      onClick: () => {
                        setBrowseId(g.id)
                        setGroupSearch('')
                      },
                    },
                  ]}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="group-list">
        {visibleGroups.map((g) => {
          const stats = isOrgAdmin ? groupStats(g.id) : null
          const canManage = isOrgAdmin || g.createdById === session.memberId
          const memberNames = g.memberIds
            .map((id) => profiles.find((p) => p.id === id)?.name || '?')
            .slice(0, 3)
            .join(', ')
          const kebabItems = [
            {
              label: 'Görevler',
              onClick: () => openTasks(g.id, g.name),
            },
            ...(canManage
              ? [
                  {
                    label: 'Üye düzenle',
                    onClick: () => openManage(g.id),
                  },
                ]
              : []),
            {
              label: 'Alt gruplar',
              onClick: () => setBrowseId(g.id),
            },
          ]
          return (
            <div key={g.id} className="group-card">
              <button type="button" className="group-main" onClick={() => setBrowseId(g.id)}>
                <strong>{g.name}</strong>
                <span className="group-meta">
                  <span className="group-meta-stats">
                    {g.memberIds.length} üye · {childCount(g.id)} alt grup
                    {stats
                      ? ` · ${stats.all} görev · %${stats.successRate} · ${stats.approved} onaylı`
                      : ''}
                  </span>
                  {memberNames ? (
                    <span className="group-meta-people">{memberNames}</span>
                  ) : null}
                </span>
              </button>
              <div className="group-card-actions card-menu-slot">
                <KebabMenu items={kebabItems} />
              </div>
            </div>
          )
        })}
        {visibleGroups.length === 0 && !groupSearch && (
          <div className="empty">
            <h3>{browseGroup ? 'Alt grup yok' : 'Henüz grup yok'}</h3>
            <p>Örn. “Ulaştırma” veya altına “Sevkiyat”.</p>
          </div>
        )}
      </div>

      <button
        type="button"
        className="btn primary"
        onClick={() => {
          setCreating(true)
          setCreateMembers(
            browseGroup?.memberIds?.length
              ? [...browseGroup.memberIds]
              : [session.memberId],
          )
          setError('')
        }}
      >
        + {browseGroup ? 'Alt grup' : 'Yeni grup'}
      </button>

      {creating && (
        <DrawerShell
          onClose={() => setCreating(false)}
          eyebrow={browseGroup ? browseGroup.name : 'Yeni'}
          title={browseGroup ? 'Alt grup oluştur' : 'Grup oluştur'}
        >
          <form onSubmit={submitCreate} className="stack">
            <label>
              Grup adı
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Örn. Sevkiyat"
                autoFocus
              />
            </label>
            <p className="eyebrow">Üyeler (liste veya arama)</p>
            <MemberSearchList
              candidates={orgProfiles}
              selectedIds={createMembers}
              onToggle={(id) =>
                setCreateMembers((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                )
              }
              emptyText="Alanda üye yok — önce Yönetim’den ekleyin"
            />
            {error && <p className="error">{error}</p>}
            <button type="submit" className="btn primary" disabled={busy}>
              Oluştur
            </button>
          </form>
        </DrawerShell>
      )}

      {managing && (
        <DrawerShell
          onClose={() => setManagingId(null)}
          eyebrow={managing.name}
          title="Grup / alt grup üyeleri"
          wide
        >
          <div className="stack">
            <p className="muted tiny">
              Alan üyelerinden seçin (arama yapabilirsiniz) veya T.C. yazın. Alt gruplar için de
              aynı.
            </p>
            <label>
              Grup adı
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Grup adı"
              />
            </label>
            <button type="button" className="btn ghost" disabled={busy} onClick={saveRename}>
              Adı kaydet
            </button>
            <hr className="soft-hr" />
            <MemberSearchList
              candidates={orgProfiles}
              selectedIds={draftMembers}
              onToggle={toggleDraft}
              emptyText="Alanda üye yok"
            />
            <button type="button" className="btn primary" disabled={busy} onClick={saveDraftMembers}>
              Üyeleri kaydet ({draftMembers.length})
            </button>

            <hr className="soft-hr" />
            <p className="eyebrow">T.C. ile hızlı ekle / çıkar</p>
            <form onSubmit={addToGroupByTc} className="stack">
              <label>
                T.C. ile ekle
                <input
                  inputMode="numeric"
                  value={groupAddTc}
                  onChange={(e) => setGroupAddTc(normalizeTc(e.target.value))}
                  maxLength={11}
                  placeholder="11 hane"
                />
              </label>
              <button type="submit" className="btn ghost" disabled={busy}>
                Gruba ekle
              </button>
            </form>
            <form onSubmit={removeFromGroupByTc} className="stack">
              <label>
                T.C. ile çıkar
                <input
                  inputMode="numeric"
                  value={groupRemoveTc}
                  onChange={(e) => setGroupRemoveTc(normalizeTc(e.target.value))}
                  maxLength={11}
                  placeholder="11 hane"
                />
              </label>
              <button type="submit" className="btn danger" disabled={busy}>
                Gruptan çıkar
              </button>
            </form>
            {error && <p className="error">{error}</p>}
            <button
              type="button"
              className="btn danger"
              disabled={busy}
              onClick={() => removeGroup(managing.id, managing.name)}
            >
              Grubu sil (alt gruplarla)
            </button>
          </div>
        </DrawerShell>
      )}

      {adminOpen && isOrgAdmin && (
        <DrawerShell
          onClose={() => setAdminOpen(false)}
          eyebrow={session.orgName}
          title="Yönetim"
          wide
        >
          <div className="stack">
            <section className="drawer-section" style={{ margin: 0 }}>
              <h3>Onay bekleyen görevler ({pendingApprovals.length})</h3>
              <p className="muted tiny">
                Tüm gruplardan tamamlanıp onay bekleyenler. Tıklayınca onaylayın veya
                yorum yazın.
              </p>
              <PendingApprovalsList onOpenTask={setApprovalTask} />
            </section>
            <section className="drawer-section">
              <h3>Reddedilen görevler ({rejectedApprovals.length})</h3>
              <p className="muted tiny">
                Reddedilenler burada listelenir; yorumla birlikte görünür, yeniden
                değerlendirilebilir.
              </p>
              <RejectedApprovalsList onOpenTask={setApprovalTask} />
            </section>
            <hr className="soft-hr" />
            <p className="muted">Alana T.C. ile ekle / çıkar.</p>
            <form onSubmit={addMemberToOrg} className="stack">
              <label>
                T.C. ile alana ekle
                <input
                  inputMode="numeric"
                  value={addTc}
                  onChange={(e) => setAddTc(normalizeTc(e.target.value))}
                  placeholder="11 haneli T.C. Kimlik No"
                  maxLength={11}
                />
              </label>
              <label>
                Rol
                <select value={addRole} onChange={(e) => setAddRole(e.target.value as OrgRole)}>
                  <option value="member">Üye / memur</option>
                  <option value="admin">Yönetici</option>
                </select>
              </label>
              <label>
                Unvan (isteğe bağlı)
                <input
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  placeholder="Örn. Ulaştırma memuru"
                />
              </label>
              <button type="submit" className="btn primary" disabled={busy}>
                Alana ekle
              </button>
            </form>
            <form onSubmit={removeMemberByTc} className="stack">
              <label>
                T.C. ile alandan çıkar
                <input
                  inputMode="numeric"
                  value={removeTc}
                  onChange={(e) => setRemoveTc(normalizeTc(e.target.value))}
                  placeholder="11 haneli T.C. Kimlik No"
                  maxLength={11}
                />
              </label>
              <button type="submit" className="btn danger" disabled={busy}>
                Alandan çıkar
              </button>
            </form>
            <div className="member-check-list">
              {orgMemberships.map((m) => {
                const p = profiles.find((x) => x.id === m.profileId)
                if (!p) return null
                return (
                  <div key={`${m.orgId}-${m.profileId}`} className="admin-row">
                    <span className="dot" style={{ background: p.color }} />
                    <div className="admin-row-text">
                      <strong>{p.name}</strong>
                      <span>
                        T.C. {m.profileId} · {m.role === 'admin' ? 'Yönetici' : 'Üye'}
                        {m.title ? ` · ${m.title}` : ''}
                      </span>
                    </div>
                    {m.profileId !== session.memberId && (
                      <button
                        type="button"
                        className="btn ghost compact"
                        disabled={busy}
                        onClick={async () => {
                          const next: OrgRole = m.role === 'admin' ? 'member' : 'admin'
                          if (demoMode)
                            demoUpdateOrgMember(session.orgId!, m.profileId, next, m.title)
                          else
                            await updateOrgMember({
                              orgId: session.orgId!,
                              profileId: m.profileId,
                              role: next,
                              title: m.title,
                            })
                          refreshLocal?.()
                        }}
                      >
                        Rol değiştir
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            <hr className="soft-hr" />
            <details className="danger-details">
              <summary className="muted tiny">Tehlikeli işlemler</summary>
              <p className="muted tiny">
                Alanı silmek tüm grupları ve görevleri kalıcı olarak kaldırır.
              </p>
              <button
                type="button"
                className="btn ghost compact danger-text"
                disabled={busy}
                onClick={async () => {
                  const orgName = session.orgName || 'bu alan'
                  if (
                    !confirm(
                      `“${orgName}” silinsin mi?\n\nTüm gruplar, görevler ve üyeler kalıcı silinir.`,
                    )
                  ) {
                    return
                  }
                  const typed = prompt(`Onay için alan adını yazın: ${orgName}`)
                  if (typed?.trim() !== orgName.trim()) {
                    setError('Alan adı eşleşmedi — silinmedi')
                    return
                  }
                  setBusy(true)
                  setError('')
                  try {
                    if (demoMode) demoDeleteOrganization(session.orgId!)
                    else await deleteOrganization(session.orgId!)
                    setAdminOpen(false)
                    leaveOrg()
                    refreshLocal?.()
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Alan silinemedi')
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Bu alanı tamamen sil…
              </button>
            </details>
            {error && <p className="error">{error}</p>}
          </div>
        </DrawerShell>
      )}

      {planOpen && <PlanScreen onClose={() => setPlanOpen(false)} />}
      {formsOpen && <ControlFormsScreen onClose={() => setFormsOpen(false)} />}
      {membersOpen && <MembersScreen scope="org" onClose={() => setMembersOpen(false)} />}
      {profileOpen && <ProfileScreen onClose={() => setProfileOpen(false)} />}
      {approvalTask && (
        <TaskDetail
          task={
            orgTasks.find(
              (t) => t.id === approvalTask.id && t.groupId === approvalTask.groupId,
            ) || approvalTask
          }
          groupIdOverride={approvalTask.groupId}
          onClose={() => setApprovalTask(null)}
          onDeleted={() => setApprovalTask(null)}
        />
      )}
      <SoftAdBanner />
    </div>
  )
}
