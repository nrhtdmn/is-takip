import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AppContext } from '../hooks/useApp'
import {
  clearProfileOnly,
  clearSession,
  fullLogout,
  loadSession,
  saveSession,
  subscribeGroups,
  subscribeMemberships,
  subscribeMyOrganizations,
  subscribeOrgMemberships,
  subscribeOrgRecognitions,
  subscribeOrgTasks,
  subscribeProfilesForIds,
  subscribeTasks,
  subscribeControlForms,
  watchAuth,
  getProfileById,
  resolveProfileIdForUid,
  ensureFirestoreProfile,
  type Session,
} from '../lib/api'
import { isFirebaseConfigured } from '../lib/firebase'
import {
  demoEnsureDefaults,
  demoGetControlForms,
  demoGetGroups,
  demoGetMembershipsForOrg,
  demoGetMembershipsForProfile,
  demoGetOrganizations,
  demoGetProfiles,
  demoGetRecognitions,
  demoGetTasksForGroup,
  demoGetTasksForGroups,
} from '../lib/demoStore'
import type {
  ControlForm,
  Group,
  Organization,
  OrgMembership,
  Profile,
  Recognition,
  Task,
} from '../types'
import { isValidTc, normalizeTc } from '../lib/tc'

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(() =>
    isFirebaseConfigured ? null : loadSession(),
  )
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [myMemberships, setMyMemberships] = useState<OrgMembership[]>([])
  const [orgMemberships, setOrgMemberships] = useState<OrgMembership[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [orgTasks, setOrgTasks] = useState<(Task & { groupId: string })[]>([])
  const [recognitions, setRecognitions] = useState<Recognition[]>([])
  const [controlForms, setControlForms] = useState<ControlForm[]>([])
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const demoMode = !isFirebaseConfigured

  const setSession = (next: Session | null) => {
    if (next) saveSession(next)
    else clearSession()
    setSessionState(next)
  }

  const switchProfile = () => {
    clearProfileOnly()
    if (!demoMode) fullLogout()
    setSessionState(null)
    setTasks([])
    setOrgTasks([])
  }

  const leaveOrg = () => {
    if (!session) return
    const next: Session = {
      ...session,
      orgId: undefined,
      orgName: undefined,
      orgRole: undefined,
      groupId: undefined,
      groupName: undefined,
    }
    saveSession(next)
    setSessionState(next)
    setTasks([])
    setOrgTasks([])
    setGroups([])
    setOrgMemberships([])
  }

  const leaveGroup = () => {
    if (!session) return
    const next = { ...session, groupId: undefined, groupName: undefined }
    saveSession(next)
    setSessionState(next)
    setTasks([])
  }

  const logout = () => {
    fullLogout()
    setSessionState(null)
    setTasks([])
    setOrgTasks([])
  }

  const refreshLocal = () => setTick((t) => t + 1)

  const currentOrg = organizations.find((o) => o.id === session?.orgId)
  const membershipRole = myMemberships.find((m) => m.orgId === session?.orgId)?.role
  // Yalnızca üyelik kaydı admin ise; oturumda kalan eski rol ile yetki verme
  const isOrgAdmin = membershipRole === 'admin'

  // Firebase Auth oturumu
  useEffect(() => {
    if (demoMode) {
      setAuthReady(true)
      return
    }
    return watchAuth(async (user) => {
      if (!user) {
        clearSession()
        setSessionState(null)
        setAuthReady(true)
        return
      }
      try {
        let profileId = await resolveProfileIdForUid(user.uid)
        let profile = await getProfileById(profileId)
        // Firestore silinmişse Auth e-postasından T.C. ile profili onar
        if (!profile) {
          const emailTc = normalizeTc((user.email || '').split('@')[0] || '')
          if (isValidTc(emailTc)) {
            profile = await ensureFirestoreProfile({
              tc: emailTc,
              uid: user.uid,
              name: user.displayName || undefined,
            })
            profileId = profile.id
          }
        }
        if (!profile) {
          fullLogout()
          setSessionState(null)
          setAuthReady(true)
          return
        }
        const saved = loadSession()
        if (saved?.memberId === profile.id) {
          setSessionState({
            ...saved,
            memberName: profile.name,
            memberColor: profile.color,
            unlocked: true,
          })
        } else {
          setSessionState({
            memberId: profile.id,
            memberName: profile.name,
            memberColor: profile.color,
            unlocked: true,
          })
        }
      } catch (e) {
        console.error(e)
      } finally {
        setAuthReady(true)
      }
    })
  }, [demoMode])

  useEffect(() => {
    if (!authReady) return

    if (demoMode) {
      demoEnsureDefaults()
      setProfiles(demoGetProfiles())
      setOrganizations(demoGetOrganizations())
      if (session?.memberId) {
        setMyMemberships(demoGetMembershipsForProfile(session.memberId))
      } else {
        setMyMemberships([])
      }
      if (session?.orgId) {
        setOrgMemberships(demoGetMembershipsForOrg(session.orgId))
        setGroups(demoGetGroups(session.orgId))
      } else {
        setOrgMemberships([])
        setGroups([])
      }
      setLoading(false)
      return
    }

    if (!session?.memberId) {
      setProfiles([])
      setOrganizations([])
      setMyMemberships([])
      setLoading(false)
      return
    }

    const onError = (error: Error) => {
      console.error('Firestore hatası:', error)
      setLoading(false)
    }

    const unsubOrgs = subscribeMyOrganizations(
      session.memberId,
      setOrganizations,
      onError,
    )
    const unsubMine = subscribeMemberships(
      session.memberId,
      setMyMemberships,
      onError,
    )

    return () => {
      unsubOrgs()
      unsubMine()
    }
  }, [demoMode, session?.memberId, authReady, tick])

  // Org üyelerinin profilleri
  useEffect(() => {
    if (demoMode || !session?.memberId) return
    const ids = new Set<string>([session.memberId])
    for (const m of orgMemberships) ids.add(m.profileId)
    for (const m of myMemberships) ids.add(m.profileId)
    return subscribeProfilesForIds([...ids], setProfiles, (e) => console.error(e))
  }, [
    demoMode,
    session?.memberId,
    orgMemberships,
    myMemberships,
    tick,
  ])

  useEffect(() => {
    if (!session?.orgId) {
      setGroups([])
      setOrgMemberships([])
      return
    }

    if (demoMode) {
      setOrgMemberships(demoGetMembershipsForOrg(session.orgId))
      setGroups(demoGetGroups(session.orgId))
      return
    }

    const onError = (error: Error) => console.error(error)
    const u1 = subscribeOrgMemberships(session.orgId, setOrgMemberships, onError)
    const u2 = subscribeGroups(session.orgId, setGroups, onError, {
      profileId: session.memberId,
      isAdmin: isOrgAdmin,
    })
    return () => {
      u1()
      u2()
    }
  }, [session?.orgId, session?.memberId, isOrgAdmin, demoMode, tick])

  useEffect(() => {
    if (!session?.groupId) {
      setTasks([])
      if (!isOrgAdmin) setLoading(false)
      return
    }

    if (demoMode) {
      const vis = {
        profileId: session.memberId,
        isAdmin: isOrgAdmin,
      }
      setTasks(demoGetTasksForGroup(session.groupId, vis))
      setLoading(false)
      return
    }

    setLoading(true)
    return subscribeTasks(
      session.groupId,
      (list) => {
        setTasks(list)
        setLoading(false)
      },
      (error) => {
        console.error(error)
        setLoading(false)
      },
      {
        profileId: session.memberId,
        isAdmin: isOrgAdmin,
      },
    )
  }, [session?.groupId, session?.memberId, demoMode, tick, isOrgAdmin])

  useEffect(() => {
    if (!session?.orgId) {
      setOrgTasks([])
      return
    }
    const ids = groups.map((g) => g.id)
    if (ids.length === 0) {
      setOrgTasks([])
      return
    }
    const vis = session.memberId
      ? { profileId: session.memberId, isAdmin: isOrgAdmin }
      : undefined
    if (demoMode) {
      setOrgTasks(demoGetTasksForGroups(ids, vis))
      return
    }
    return subscribeOrgTasks(ids, setOrgTasks, (e) => console.error(e), vis)
  }, [session?.orgId, session?.memberId, groups, demoMode, tick, isOrgAdmin])

  useEffect(() => {
    if (!session?.orgId) {
      setRecognitions([])
      return
    }
    if (demoMode) {
      setRecognitions(demoGetRecognitions(session.orgId))
      return
    }
    return subscribeOrgRecognitions(session.orgId, setRecognitions, (e) => console.error(e))
  }, [session?.orgId, demoMode, tick])

  useEffect(() => {
    if (!session?.orgId || !isOrgAdmin) {
      setControlForms([])
      return
    }
    if (demoMode) {
      setControlForms(demoGetControlForms(session.orgId))
      return
    }
    return subscribeControlForms(session.orgId, setControlForms, (e) => console.error(e))
  }, [session?.orgId, demoMode, tick, isOrgAdmin])

  const value = useMemo(
    () => ({
      session,
      profiles,
      organizations,
      myMemberships,
      orgMemberships,
      groups,
      tasks,
      orgTasks,
      recognitions,
      controlForms,
      loading: loading || !authReady,
      demoMode,
      setSession,
      switchProfile,
      leaveOrg,
      leaveGroup,
      logout,
      refreshLocal,
      currentOrg,
      isOrgAdmin,
    }),
    [
      session,
      profiles,
      organizations,
      myMemberships,
      orgMemberships,
      groups,
      tasks,
      orgTasks,
      recognitions,
      controlForms,
      loading,
      authReady,
      demoMode,
      currentOrg,
      isOrgAdmin,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
