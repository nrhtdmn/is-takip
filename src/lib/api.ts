import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  type Unsubscribe as AuthUnsubscribe,
  type User,
} from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getDb, getFirebaseAuth, getFirebaseFunctions, isFirebaseConfigured, tcAuthEmail } from './firebase'
import { effectivePlan } from './plans'
import { isValidTc, normalizeTc } from './tc'
import type {
  Group,
  Organization,
  OrgMembership,
  OrgRole,
  PlanId,
  Profile,
  ProfileVisibility,
  Recognition,
  Task,
  TaskCategory,
  TaskStatus,
  TaskUpdate,
} from '../types'
import { normalizeProfile } from '../types'

const SESSION_KEY = 'istakip_session'
const UNLOCK_KEY = 'istakip_unlocked'

export interface Session {
  memberId: string
  memberName: string
  memberColor: string
  unlocked: boolean
  orgId?: string
  orgName?: string
  orgRole?: OrgRole
  groupId?: string
  groupName?: string
}

export function isFamilyUnlocked(): boolean {
  return (
    localStorage.getItem(UNLOCK_KEY) === '1' ||
    localStorage.getItem('gorevtakip_family_unlocked') === '1'
  )
}

export function setFamilyUnlocked(value: boolean) {
  if (value) {
    localStorage.setItem(UNLOCK_KEY, '1')
    localStorage.setItem('gorevtakip_family_unlocked', '1')
  } else {
    localStorage.removeItem(UNLOCK_KEY)
    localStorage.removeItem('gorevtakip_family_unlocked')
  }
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) {
      // Eski anahtar
      const legacy = localStorage.getItem('gorevtakip_session')
      if (!legacy) return null
      const session = JSON.parse(legacy) as Session
      if (!session.unlocked || !session.memberId) return null
      return session
    }
    const session = JSON.parse(raw) as Session
    if (!session.unlocked || !session.memberId) return null
    return session
  } catch {
    return null
  }
}

export function saveSession(session: Session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  setFamilyUnlocked(true)
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem('gorevtakip_session')
}

export function clearProfileOnly() {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem('gorevtakip_session')
}

export function fullLogout() {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem('gorevtakip_session')
  setFamilyUnlocked(false)
  if (isFirebaseConfigured) {
    void signOut(getFirebaseAuth()).catch(() => {})
  }
}

export function createLocalId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function orgsCol() {
  return collection(getDb(), 'organizations')
}

function orgDoc(orgId: string) {
  return doc(getDb(), 'organizations', orgId)
}

function membershipsCol() {
  return collection(getDb(), 'memberships')
}

function membershipId(orgId: string, profileId: string) {
  return `${orgId}__${profileId}`
}

function groupsCol() {
  return collection(getDb(), 'groups')
}

function groupDoc(groupId: string) {
  return doc(getDb(), 'groups', groupId)
}

function tasksCol(groupId: string) {
  return collection(getDb(), 'groups', groupId, 'tasks')
}

function taskDoc(groupId: string, taskId: string) {
  return doc(getDb(), 'groups', groupId, 'tasks', taskId)
}

function updatesCol(groupId: string, taskId: string) {
  return collection(getDb(), 'groups', groupId, 'tasks', taskId, 'updates')
}

/** Eski seed yok — kullanıcı TC ile kendi hesabını açar */
export async function ensureDefaultProfiles() {
  return
}

export async function getProfileById(profileId: string): Promise<Profile | null> {
  const id = normalizeTc(profileId) || profileId.trim()
  if (!id) return null
  const snap = await getDoc(doc(getDb(), 'profiles', id))
  if (!snap.exists()) return null
  const raw = snap.data() as Omit<Profile, 'id'>
  // Şifre asla istemci modeline alınmaz
  const { pin: _pin, ...rest } = raw as Omit<Profile, 'id'> & { pin?: string }
  return normalizeProfile({
    id: snap.id,
    ...rest,
  })
}

/** Org üyelerinin profilleri (tüm profilleri dinlemek güvenlik kurallarına uymaz) */
export function subscribeProfilesForIds(
  ids: string[],
  onData: (profiles: Profile[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) {
    onData([])
    return () => {}
  }
  const map = new Map<string, Profile>()
  const unsubs = unique.map((id) =>
    onSnapshot(
      doc(getDb(), 'profiles', id),
      (snap) => {
        if (snap.exists()) {
          const raw = snap.data() as Omit<Profile, 'id'>
          const { pin: _p, ...rest } = raw as Omit<Profile, 'id'> & { pin?: string }
          map.set(id, normalizeProfile({ id, ...rest }))
        } else {
          map.delete(id)
        }
        onData([...map.values()].sort((a, b) => a.createdAt - b.createdAt))
      },
      (error) => onError?.(error),
    ),
  )
  return () => unsubs.forEach((u) => u())
}

export async function registerWithAuth(input: {
  tc: string
  name: string
  color: string
  password: string
}): Promise<Profile> {
  const id = normalizeTc(input.tc)
  if (!isValidTc(id)) throw new Error('Geçerli bir T.C. Kimlik No girin (11 hane)')
  if (input.password.trim().length < 6) throw new Error('Şifre en az 6 karakter olmalı')

  const password = input.password.trim()
  const auth = getFirebaseAuth()
  const email = tcAuthEmail(id)

  // Önce Cloud Function (UID=T.C.); yoksa istemci Auth + uidMap
  try {
    const fn = httpsCallable(getFirebaseFunctions(), 'registerWithTc')
    await fn({
      tc: id,
      name: input.name.trim(),
      color: input.color,
      password,
    })
    await signInWithEmailAndPassword(auth, email, password)
  } catch {
    const existing = await getDoc(doc(getDb(), 'profiles', id))
    if (existing.exists()) {
      throw new Error('Bu T.C. Kimlik No ile kayıt zaten var — giriş yapın')
    }
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await setDoc(doc(getDb(), 'uidMap', cred.user.uid), { profileId: id })
    await setDoc(doc(getDb(), 'profiles', id), {
      name: input.name.trim(),
      color: input.color,
      createdAt: Date.now(),
      visibility: {
        email: false,
        phone: false,
        bio: false,
        jobTitle: true,
      },
      authUid: cred.user.uid,
    })
  }

  const profile = await getProfileById(id)
  if (!profile) throw new Error('Profil oluşturulamadı')
  return profile
}

export async function loginWithAuth(tc: string, password: string): Promise<Profile> {
  const id = normalizeTc(tc)
  if (!isValidTc(id)) throw new Error('Geçerli bir T.C. Kimlik No girin')
  if (!password.trim()) throw new Error('Şifre gerekli')

  const auth = getFirebaseAuth()
  const email = tcAuthEmail(id)
  const pass = password.trim()

  try {
    await signInWithEmailAndPassword(auth, email, pass)
  } catch (err) {
    const code = (err as { code?: string })?.code || ''
    if (
      code === 'auth/user-not-found' ||
      code === 'auth/invalid-credential' ||
      code === 'auth/wrong-password' ||
      code === 'auth/invalid-login-credentials'
    ) {
      try {
        const migrate = httpsCallable<
          { tc: string; password: string },
          { ok: boolean; paddedPassword?: boolean }
        >(getFirebaseFunctions(), 'migrateLegacyLogin')
        const res = await migrate({ tc: id, password: pass })
        const loginPass =
          res.data.paddedPassword && pass.length < 6
            ? `${pass}000000`.slice(0, 6)
            : pass
        await signInWithEmailAndPassword(auth, email, loginPass)
      } catch {
        throw new Error('Şifre hatalı veya hesap yok — kayıt olun')
      }
    } else {
      throw err instanceof Error ? err : new Error('Giriş yapılamadı')
    }
  }

  const user = auth.currentUser
  if (user) {
    // uidMap yoksa (UID=T.C. senaryosu) oluştur
    const mapRef = doc(getDb(), 'uidMap', user.uid)
    const mapSnap = await getDoc(mapRef)
    if (!mapSnap.exists()) {
      await setDoc(mapRef, { profileId: id })
    }
  }

  const profile = await getProfileById(id)
  if (!profile) throw new Error('Profil bulunamadı')
  return profile
}

export async function resolveProfileIdForUid(uid: string): Promise<string> {
  const mapSnap = await getDoc(doc(getDb(), 'uidMap', uid))
  if (mapSnap.exists()) {
    return String((mapSnap.data() as { profileId: string }).profileId)
  }
  return uid
}

export function watchAuth(callback: (user: User | null) => void): AuthUnsubscribe {
  return onAuthStateChanged(getFirebaseAuth(), callback)
}

export async function changeAuthPassword(input: {
  currentPassword: string
  newPassword: string
}) {
  const user = getFirebaseAuth().currentUser
  if (!user?.email) throw new Error('Oturum yok')
  if (input.newPassword.trim().length < 6) {
    throw new Error('Yeni şifre en az 6 karakter olmalı')
  }
  const cred = EmailAuthProvider.credential(user.email, input.currentPassword)
  await reauthenticateWithCredential(user, cred)
  await updatePassword(user, input.newPassword.trim())
}

/** @deprecated Auth kullanın; demo dışı oluşturma Functions ile */
export async function createProfile(input: {
  tc: string
  name: string
  color: string
  pin?: string
}): Promise<Profile> {
  return registerWithAuth({
    tc: input.tc,
    name: input.name,
    color: input.color,
    password: input.pin?.trim() || '',
  })
}

export async function updateProfile(
  profileId: string,
  patch: {
    name?: string
    color?: string
    email?: string
    phone?: string
    bio?: string
    jobTitle?: string
    visibility?: ProfileVisibility
  },
): Promise<void> {
  const data: Record<string, unknown> = {}
  if (patch.name !== undefined) data.name = patch.name.trim()
  if (patch.color !== undefined) data.color = patch.color
  if (patch.email !== undefined) data.email = patch.email.trim() || null
  if (patch.phone !== undefined) data.phone = patch.phone.trim() || null
  if (patch.bio !== undefined) data.bio = patch.bio.trim() || null
  if (patch.jobTitle !== undefined) data.jobTitle = patch.jobTitle.trim() || null
  if (patch.visibility !== undefined) data.visibility = patch.visibility
  await updateDoc(doc(getDb(), 'profiles', profileId), data)
}

export async function deleteProfile(profileId: string) {
  await deleteDoc(doc(getDb(), 'profiles', profileId))
  const memSnap = await getDocs(
    query(membershipsCol(), where('profileId', '==', profileId)),
  )
  await Promise.all(memSnap.docs.map((d) => deleteDoc(d.ref)))
  const groupsSnap = await getDocs(groupsCol())
  await Promise.all(
    groupsSnap.docs.map(async (g) => {
      const data = g.data() as Omit<Group, 'id'>
      if (!data.memberIds?.includes(profileId)) return
      await updateDoc(g.ref, {
        memberIds: data.memberIds.filter((id) => id !== profileId),
      })
    }),
  )
}

export function subscribeMyOrganizations(
  profileId: string,
  onData: (orgs: Organization[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  let orgUnsubs: Unsubscribe[] = []

  const clearOrgs = () => {
    orgUnsubs.forEach((u) => u())
    orgUnsubs = []
  }

  const memUnsub = subscribeMemberships(
    profileId,
    (mems) => {
      clearOrgs()
      if (mems.length === 0) {
        onData([])
        return
      }
      const map = new Map<string, Organization>()
      const emit = () =>
        onData([...map.values()].sort((a, b) => a.createdAt - b.createdAt))

      for (const m of mems) {
        orgUnsubs.push(
          onSnapshot(
            orgDoc(m.orgId),
            (snap) => {
              if (!snap.exists()) {
                map.delete(m.orgId)
                emit()
                return
              }
              const data = snap.data() as Omit<Organization, 'id'>
              map.set(m.orgId, {
                id: snap.id,
                ...data,
                plan: effectivePlan(data.plan || 'free', data.planExpiresAt),
              })
              emit()
            },
            (error) => onError?.(error),
          ),
        )
      }
    },
    onError,
  )

  return () => {
    clearOrgs()
    memUnsub()
  }
}

/** @deprecated */ 
export function subscribeOrganizations(
  onData: (orgs: Organization[]) => void,
  _onError?: (error: Error) => void,
): Unsubscribe {
  onData([])
  return () => {}
}

export function subscribeMemberships(
  profileId: string,
  onData: (list: OrgMembership[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(membershipsCol(), where('profileId', '==', profileId))
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => d.data() as OrgMembership),
      )
    },
    (error) => onError?.(error),
  )
}

export function subscribeOrgMemberships(
  orgId: string,
  onData: (list: OrgMembership[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(membershipsCol(), where('orgId', '==', orgId))
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as OrgMembership))
    },
    (error) => onError?.(error),
  )
}

export async function createOrganization(input: {
  name: string
  member: Session
}): Promise<Organization> {
  const now = Date.now()
  const ref = await addDoc(orgsCol(), {
    name: input.name.trim(),
    createdAt: now,
    createdById: input.member.memberId,
    createdByName: input.member.memberName,
    plan: 'free' satisfies PlanId,
  })
  await setDoc(doc(getDb(), 'memberships', membershipId(ref.id, input.member.memberId)), {
    orgId: ref.id,
    profileId: input.member.memberId,
    role: 'admin' satisfies OrgRole,
    title: 'Yönetici',
    joinedAt: now,
  })
  return {
    id: ref.id,
    name: input.name.trim(),
    createdAt: now,
    createdById: input.member.memberId,
    createdByName: input.member.memberName,
    plan: 'free',
  }
}

export async function setOrgPlan(input: {
  orgId: string
  plan: PlanId
  months?: number
}) {
  const months = input.months ?? 1
  const patch: Record<string, unknown> = { plan: input.plan }
  if (input.plan === 'free') {
    patch.planExpiresAt = null
  } else {
    patch.planExpiresAt = Date.now() + months * 30 * 24 * 60 * 60 * 1000
  }
  await updateDoc(orgDoc(input.orgId), patch)
}

export async function addOrgMember(input: {
  orgId: string
  profileId: string
  role: OrgRole
  title?: string
}) {
  const now = Date.now()
  await setDoc(doc(getDb(), 'memberships', membershipId(input.orgId, input.profileId)), {
    orgId: input.orgId,
    profileId: input.profileId,
    role: input.role,
    title: input.title?.trim() || undefined,
    joinedAt: now,
  })
}

export async function updateOrgMember(input: {
  orgId: string
  profileId: string
  role: OrgRole
  title?: string
}) {
  await updateDoc(doc(getDb(), 'memberships', membershipId(input.orgId, input.profileId)), {
    role: input.role,
    title: input.title?.trim() || null,
  })
}

export async function removeOrgMember(orgId: string, profileId: string) {
  await deleteDoc(doc(getDb(), 'memberships', membershipId(orgId, profileId)))
  const groupsSnap = await getDocs(query(groupsCol(), where('orgId', '==', orgId)))
  await Promise.all(
    groupsSnap.docs.map(async (g) => {
      const data = g.data() as Omit<Group, 'id'>
      if (!data.memberIds?.includes(profileId)) return
      await updateDoc(g.ref, {
        memberIds: data.memberIds.filter((id) => id !== profileId),
      })
    }),
  )
}

export function subscribeGroups(
  orgId: string | undefined,
  onData: (groups: Group[]) => void,
  onError?: (error: Error) => void,
  opts?: { profileId?: string; isAdmin?: boolean },
): Unsubscribe {
  if (!orgId) {
    onData([])
    return () => {}
  }
  const isAdmin = Boolean(opts?.isAdmin)
  const profileId = opts?.profileId
  const q =
    isAdmin || !profileId
      ? query(groupsCol(), where('orgId', '==', orgId))
      : query(
          groupsCol(),
          where('orgId', '==', orgId),
          where('memberIds', 'array-contains', profileId),
        )
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Group, 'id'>),
        memberIds: (d.data().memberIds as string[]) || [],
      }))
      list.sort((a, b) => a.createdAt - b.createdAt)
      onData(list)
    },
    (error) => onError?.(error),
  )
}

export async function createGroup(input: {
  orgId: string
  name: string
  member: Session
  memberIds: string[]
  parentId?: string | null
}): Promise<Group> {
  const now = Date.now()
  const ids = Array.from(new Set([input.member.memberId, ...input.memberIds]))
  const parentId = input.parentId || null
  const ref = await addDoc(groupsCol(), {
    orgId: input.orgId,
    parentId,
    name: input.name.trim(),
    memberIds: ids,
    createdAt: now,
    createdById: input.member.memberId,
    createdByName: input.member.memberName,
  })
  return {
    id: ref.id,
    orgId: input.orgId,
    parentId,
    name: input.name.trim(),
    memberIds: ids,
    createdAt: now,
    createdById: input.member.memberId,
    createdByName: input.member.memberName,
  }
}

export async function updateGroupMembers(groupId: string, memberIds: string[]) {
  await updateDoc(groupDoc(groupId), { memberIds })
}

export async function renameGroup(groupId: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Grup adı gerekli')
  await updateDoc(groupDoc(groupId), { name: trimmed })
}

export async function deleteGroup(groupId: string) {
  const all = await getDocs(groupsCol())
  const childIds = all.docs
    .filter((d) => (d.data() as Group).parentId === groupId)
    .map((d) => d.id)
  for (const childId of childIds) {
    await deleteGroup(childId)
  }
  const tasks = await getDocs(tasksCol(groupId))
  await Promise.all(tasks.docs.map((t) => deleteDoc(t.ref)))
  await deleteDoc(groupDoc(groupId))
}

export function subscribeTasks(
  groupId: string,
  onData: (tasks: Task[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(tasksCol(groupId), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Task, 'id'>),
        })),
      )
    },
    (error) => onError?.(error),
  )
}

/** Yönetici: alandaki tüm grupların görevlerini topla */
export function subscribeOrgTasks(
  groupIds: string[],
  onData: (tasks: (Task & { groupId: string })[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (groupIds.length === 0) {
    onData([])
    return () => {}
  }
  const map = new Map<string, Task & { groupId: string }>()
  const unsubs = groupIds.map((gid) =>
    subscribeTasks(
      gid,
      (list) => {
        for (const [key] of [...map.entries()]) {
          if (key.startsWith(`${gid}:`)) map.delete(key)
        }
        for (const t of list) map.set(`${gid}:${t.id}`, { ...t, groupId: gid })
        onData(
          [...map.values()].sort((a, b) => b.createdAt - a.createdAt),
        )
      },
      onError,
    ),
  )
  return () => unsubs.forEach((u) => u())
}

export function subscribeUpdates(
  groupId: string,
  taskId: string,
  onData: (updates: TaskUpdate[]) => void,
): Unsubscribe {
  const q = query(updatesCol(groupId, taskId), orderBy('createdAt', 'asc'))
  return onSnapshot(q, (snap) => {
    onData(
      snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<TaskUpdate, 'id'>),
      })),
    )
  })
}

async function addUpdate(
  groupId: string,
  taskId: string,
  data: Omit<TaskUpdate, 'id' | 'taskId' | 'createdAt'> & { createdAt?: number },
) {
  await addDoc(updatesCol(groupId, taskId), {
    taskId,
    ...data,
    createdAt: data.createdAt ?? Date.now(),
    serverCreatedAt: serverTimestamp(),
  })
}

export async function createTask(input: {
  groupId: string
  title: string
  description: string
  category: TaskCategory
  member: Session
  dueAt?: number
  assigneeIds?: string[]
  assigneeNames?: string[]
  assignEveryone?: boolean
}) {
  const now = Date.now()
  const assigneeIds = input.assigneeIds || []
  const assigneeNames = input.assigneeNames || []
  const payload: Record<string, unknown> = {
    title: input.title.trim(),
    description: input.description.trim(),
    category: input.category,
    status: 'open' satisfies TaskStatus,
    createdById: input.member.memberId,
    createdByName: input.member.memberName,
    createdAt: now,
    updatedAt: now,
    assigneeIds,
    assigneeNames,
    assignEveryone: Boolean(input.assignEveryone),
  }
  if (input.dueAt) payload.dueAt = input.dueAt
  if (assigneeIds[0]) {
    payload.assigneeId = assigneeIds[0]
    payload.assigneeName = assigneeNames[0]
  }

  const ref = await addDoc(tasksCol(input.groupId), payload)

  let who = 'Atama yok'
  if (input.assignEveryone) who = 'Herkese atandı'
  else if (assigneeNames.length) who = `Atanan: ${assigneeNames.join(', ')}`

  await addUpdate(input.groupId, ref.id, {
    memberId: input.member.memberId,
    memberName: input.member.memberName,
    type: 'created',
    status: 'open',
    message: input.dueAt
      ? `Görev oluşturuldu · ${who} · Miad: ${new Date(input.dueAt).toLocaleString('tr-TR')}`
      : `Görev oluşturuldu · ${who}`,
    createdAt: now,
  })

  return ref.id
}

export async function updateTask(input: {
  groupId: string
  taskId: string
  member: Session
  title: string
  description: string
  category: TaskCategory
  dueAt?: number | null
}) {
  const now = Date.now()
  const title = input.title.trim()
  if (!title) throw new Error('Görev başlığı gerekli')
  const patch: Record<string, unknown> = {
    title,
    description: input.description.trim(),
    category: input.category,
    updatedAt: now,
  }
  if (input.dueAt) patch.dueAt = input.dueAt
  else patch.dueAt = null

  await updateDoc(taskDoc(input.groupId, input.taskId), patch)
  await addUpdate(input.groupId, input.taskId, {
    memberId: input.member.memberId,
    memberName: input.member.memberName,
    type: 'edit',
    message: input.dueAt
      ? `Görev düzenlendi · Miad: ${new Date(input.dueAt).toLocaleString('tr-TR')}`
      : 'Görev düzenlendi',
    createdAt: now,
  })
}

export async function updateTaskStatus(input: {
  groupId: string
  taskId: string
  status: TaskStatus
  member: Session
  note?: string
  failReason?: string
}) {
  const now = Date.now()
  const patch: Record<string, unknown> = {
    status: input.status,
    updatedAt: now,
    assigneeId: input.member.memberId,
    assigneeName: input.member.memberName,
  }

  if (input.status === 'started' || input.status === 'in_progress') {
    patch.startedAt = now
  }
  if (input.status === 'completed') {
    patch.completedAt = now
    patch.failReason = null
    patch.approvalStatus = 'pending'
    patch.approvedAt = null
    patch.approvedById = null
    patch.approvedByName = null
    patch.approvalNote = null
  }
  if (input.status === 'blocked') {
    patch.failReason = input.failReason?.trim() || 'Belirtilmedi'
    patch.approvalStatus = null
  }
  if (input.status !== 'completed' && input.status !== 'blocked') {
    patch.approvalStatus = null
  }

  await updateDoc(taskDoc(input.groupId, input.taskId), patch)

  const statusLabels: Record<TaskStatus, string> = {
    open: 'Bekliyor',
    started: 'İşe başladım',
    in_progress: 'Devam ediyor',
    completed: 'Tamamladım (onay bekliyor)',
    blocked: 'Tamamlayamadım',
  }

  let message = `Durum: ${statusLabels[input.status]}`
  if (input.status === 'blocked' && input.failReason) {
    message += ` — ${input.failReason.trim()}`
  }
  if (input.note?.trim()) {
    message += ` · ${input.note.trim()}`
  }

  await addUpdate(input.groupId, input.taskId, {
    memberId: input.member.memberId,
    memberName: input.member.memberName,
    type: 'status',
    status: input.status,
    message,
    createdAt: now,
  })
}

export async function approveTask(input: {
  groupId: string
  taskId: string
  member: Session
  decision: 'approved' | 'rejected'
  note?: string
}) {
  const now = Date.now()
  const note = input.note?.trim() || ''
  await updateDoc(taskDoc(input.groupId, input.taskId), {
    approvalStatus: input.decision,
    approvedAt: now,
    approvedById: input.member.memberId,
    approvedByName: input.member.memberName,
    approvalNote: note || null,
    updatedAt: now,
  })
  await addUpdate(input.groupId, input.taskId, {
    memberId: input.member.memberId,
    memberName: input.member.memberName,
    type: 'approval',
    status: 'completed',
    message:
      input.decision === 'approved'
        ? `Yönetici onayladı${note ? ` · ${note}` : ''}`
        : `Yönetici reddetti${note ? ` · ${note}` : ''}`,
    createdAt: now,
  })
}

function recognitionsCol() {
  return collection(getDb(), 'recognitions')
}

export function subscribeOrgRecognitions(
  orgId: string,
  onData: (list: Recognition[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(recognitionsCol(), where('orgId', '==', orgId))
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Recognition, 'id'>),
      }))
      list.sort((a, b) => b.createdAt - a.createdAt)
      onData(list)
    },
    (error) => onError?.(error),
  )
}

export async function addRecognition(input: {
  orgId: string
  profileId: string
  badge: string
  title: string
  message?: string
  member: Session
}): Promise<Recognition> {
  const now = Date.now()
  const ref = await addDoc(recognitionsCol(), {
    orgId: input.orgId,
    profileId: input.profileId,
    badge: input.badge,
    title: input.title.trim(),
    message: input.message?.trim() || null,
    givenById: input.member.memberId,
    givenByName: input.member.memberName,
    createdAt: now,
  })
  return {
    id: ref.id,
    orgId: input.orgId,
    profileId: input.profileId,
    badge: input.badge,
    title: input.title.trim(),
    message: input.message?.trim(),
    givenById: input.member.memberId,
    givenByName: input.member.memberName,
    createdAt: now,
  }
}

export async function addTaskNote(input: {
  groupId: string
  taskId: string
  member: Session
  message: string
}) {
  const text = input.message.trim()
  if (!text) return

  await updateDoc(taskDoc(input.groupId, input.taskId), {
    updatedAt: Date.now(),
  })

  await addUpdate(input.groupId, input.taskId, {
    memberId: input.member.memberId,
    memberName: input.member.memberName,
    type: 'note',
    message: text,
  })
}

export async function deleteTask(groupId: string, taskId: string) {
  const ups = await getDocs(updatesCol(groupId, taskId))
  await Promise.all(ups.docs.map((u) => deleteDoc(u.ref)))
  await deleteDoc(taskDoc(groupId, taskId))
}

/** Stripe Checkout oturumu oluşturur (Cloud Functions). */
export async function startPlanCheckout(input: {
  orgId: string
  plan: Exclude<PlanId, 'free'>
  successUrl: string
  cancelUrl: string
}): Promise<{ url: string }> {
  const fn = httpsCallable<
    typeof input,
    { url: string }
  >(getFirebaseFunctions(), 'createCheckoutSession')
  const res = await fn(input)
  return res.data
}

