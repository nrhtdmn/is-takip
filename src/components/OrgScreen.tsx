import { useMemo, useState, type FormEvent } from 'react'
import { useApp } from '../hooks/useApp'
import {
  createOrganization,
  deleteOrganization,
  renameOrganization,
} from '../lib/api'
import {
  demoCreateOrganization,
  demoDeleteOrganization,
  demoRenameOrganization,
} from '../lib/demoStore'
import type { OrgRole } from '../types'
import { NotificationSettingsScreen } from './NotificationSettingsScreen'
import { ProfileScreen } from './ProfileScreen'
import { DrawerShell } from './DrawerShell'
import { KebabMenu, TopNav } from './TopNav'

export function OrgScreen() {
  const {
    session,
    setSession,
    organizations,
    myMemberships,
    demoMode,
    refreshLocal,
    switchProfile,
    logout,
  } = useApp()
  const [creating, setCreating] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [notifSettingsOpen, setNotifSettingsOpen] = useState(false)
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [editName, setEditName] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const myOrgs = useMemo(() => {
    if (!session) return []
    const ids = new Set(myMemberships.map((m) => m.orgId))
    return organizations
      .filter((o) => ids.has(o.id))
      .map((o) => {
        const mem = myMemberships.find((m) => m.orgId === o.id)
        return { org: o, role: mem?.role as OrgRole, title: mem?.title }
      })
  }, [organizations, myMemberships, session])

  if (!session) return null

  const openOrg = (orgId: string, orgName: string, role: OrgRole) => {
    setSession({
      ...session,
      orgId,
      orgName,
      orgRole: role,
      groupId: undefined,
      groupName: undefined,
    })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Alan adı gerekli')
      return
    }
    setBusy(true)
    setError('')
    try {
      const org = demoMode
        ? demoCreateOrganization(name, session)
        : await createOrganization({ name, member: session })
      refreshLocal?.()
      setCreating(false)
      setName('')
      openOrg(org.id, org.name, 'admin')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Oluşturulamadı')
    } finally {
      setBusy(false)
    }
  }

  const saveRename = async (e: FormEvent) => {
    e.preventDefault()
    if (!editing) return
    const next = editName.trim()
    if (!next) {
      setError('Alan adı gerekli')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (demoMode) demoRenameOrganization(editing.id, next)
      else await renameOrganization(editing.id, next)
      if (session.orgId === editing.id) {
        setSession({ ...session, orgName: next })
      }
      refreshLocal?.()
      setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ad değiştirilemedi')
    } finally {
      setBusy(false)
    }
  }

  const removeOrg = async (orgId: string, orgName: string) => {
    if (
      !confirm(
        `“${orgName}” alanı silinsin mi?\n\nTüm gruplar, görevler ve üyelikler kalıcı olarak silinir. Bu işlem geri alınamaz.`,
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
      if (demoMode) demoDeleteOrganization(orgId)
      else await deleteOrganization(orgId)
      if (session.orgId === orgId) {
        setSession({
          ...session,
          orgId: undefined,
          orgName: undefined,
          orgRole: undefined,
          groupId: undefined,
          groupName: undefined,
        })
      }
      refreshLocal?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Alan silinemedi')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block brand-lockup">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="brand-logo sm" />
          <div>
            <p className="eyebrow">Merhaba, {session.memberName}</p>
            <h1>Alanlarınız</h1>
          </div>
        </div>
        <TopNav>
          <button type="button" className="btn ghost compact" onClick={() => setNotifSettingsOpen(true)}>
            Bildirimler
          </button>
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

      <p className="lead soft">
        Alan seçin. Her alan birbirinden ayrıdır — bir alandakiler diğerini görmez.
      </p>

      {error && <p className="error">{error}</p>}

      <div className="group-list">
        {myOrgs.map(({ org, role, title }) => (
          <div key={org.id} className="group-card">
            <button
              type="button"
              className="group-main"
              onClick={() => openOrg(org.id, org.name, role)}
            >
              <strong>{org.name}</strong>
              <span>
                {role === 'admin' ? 'Yönetici' : title || 'Üye'}
              </span>
            </button>
            {role === 'admin' && (
              <div className="group-card-actions card-menu-slot">
                <KebabMenu
                  disabled={busy}
                  items={[
                    {
                      label: 'Düzenle',
                      onClick: () => {
                        setEditing({ id: org.id, name: org.name })
                        setEditName(org.name)
                        setError('')
                      },
                    },
                    {
                      label: 'Alanı sil',
                      danger: true,
                      onClick: () => removeOrg(org.id, org.name),
                    },
                  ]}
                />
              </div>
            )}
          </div>
        ))}
        {myOrgs.length === 0 && (
          <div className="empty">
            <h3>Henüz alan yok</h3>
            <p>Örn. “Merkez Alan” oluştur — sen yönetici olursun.</p>
          </div>
        )}
      </div>

      <button type="button" className="btn primary" onClick={() => setCreating(true)}>
        + Yeni alan
      </button>

      {creating && (
        <DrawerShell onClose={() => setCreating(false)} eyebrow="Yeni alan" title="Alan oluştur">
          <form onSubmit={submit} className="stack">
            <label>
              Alan adı
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Örn. Merkez Alan"
                autoFocus
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" className="btn primary" disabled={busy}>
              Oluştur (sen yönetici)
            </button>
          </form>
        </DrawerShell>
      )}

      {editing && (
        <DrawerShell
          onClose={() => setEditing(null)}
          eyebrow="Alan"
          title="Alanı düzenle"
        >
          <form onSubmit={saveRename} className="stack">
            <label>
              Alan adı
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                autoFocus
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" className="btn primary" disabled={busy}>
              Kaydet
            </button>
          </form>
        </DrawerShell>
      )}

      {profileOpen && <ProfileScreen onClose={() => setProfileOpen(false)} />}
      {notifSettingsOpen && (
        <NotificationSettingsScreen onClose={() => setNotifSettingsOpen(false)} />
      )}
    </div>
  )
}
