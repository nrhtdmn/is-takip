import type {
  ControlForm,
  ControlFormItem,
  FormItemResponse,
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
  TaskFormAnswer,
  TaskFormItem,
  TaskStatus,
  TaskUpdate,
} from '../types'
import type { Session } from './api'
import { createLocalId } from './api'
import { DEFAULT_VISIBILITY, normalizeProfile, normalizeRecoveryAnswer } from '../types'
import { effectivePlan } from './plans'
import { isValidTc, normalizeTc } from './tc'

const PROFILES_KEY = 'istakip_v4_profiles'
const ORGS_KEY = 'istakip_v4_orgs'
const MEMBERS_KEY = 'istakip_v4_memberships'
const GROUPS_KEY = 'istakip_v4_groups'
const TASKS_KEY = 'istakip_v4_tasks'
const UPDATES_KEY = 'istakip_v4_updates'
const RECOG_KEY = 'istakip_v4_recognitions'
const FORMS_KEY = 'istakip_v4_control_forms'
const FORM_ANSWERS_KEY = 'istakip_v4_form_answers'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
}

type DemoTask = Task & { groupId: string }

export function demoEnsureDefaults() {
  // Boş başla — kullanıcı TC ile kendi hesabını açar
  if (!localStorage.getItem(PROFILES_KEY)) write(PROFILES_KEY, [])
  if (!localStorage.getItem(ORGS_KEY)) write(ORGS_KEY, [])
  if (!localStorage.getItem(MEMBERS_KEY)) write(MEMBERS_KEY, [])
  if (!localStorage.getItem(GROUPS_KEY)) write(GROUPS_KEY, [])
}

export function demoGetProfiles() {
  demoEnsureDefaults()
  return read<Profile[]>(PROFILES_KEY, []).map((p) => normalizeProfile(p))
}

export function demoGetOrganizations(): Organization[] {
  demoEnsureDefaults()
  return read<Organization[]>(ORGS_KEY, []).map((o) => ({
    ...o,
    plan: effectivePlan(o.plan || 'free', o.planExpiresAt),
  }))
}

export function demoGetMembershipsForProfile(profileId: string) {
  demoEnsureDefaults()
  return read<OrgMembership[]>(MEMBERS_KEY, []).filter((m) => m.profileId === profileId)
}

export function demoGetMembershipsForOrg(orgId: string) {
  demoEnsureDefaults()
  return read<OrgMembership[]>(MEMBERS_KEY, []).filter((m) => m.orgId === orgId)
}

export function demoGetGroups(orgId?: string) {
  demoEnsureDefaults()
  const all = read<Group[]>(GROUPS_KEY, [])
  if (!orgId) return all
  return all.filter((g) => g.orgId === orgId)
}

export function demoGetProfileById(profileId: string): Profile | null {
  const id = normalizeTc(profileId) || profileId.trim()
  return demoGetProfiles().find((p) => p.id === id) || null
}

export function demoCreateProfile(
  tc: string,
  name: string,
  color: string,
  pin?: string,
  recoveryQuestion?: string,
  recoveryAnswer?: string,
): Profile {
  const id = normalizeTc(tc)
  if (!isValidTc(id)) {
    throw new Error('Geçerli bir T.C. Kimlik No girin (11 hane)')
  }
  if (demoGetProfileById(id)) {
    throw new Error('Bu T.C. Kimlik No ile kayıt zaten var — giriş yapın')
  }
  const q = (recoveryQuestion || '').trim()
  const ans = normalizeRecoveryAnswer(recoveryAnswer || '')
  if (q.length < 3) throw new Error('Güvenlik sorusu gerekli')
  if (ans.length < 1) throw new Error('Güvenlik yanıtı gerekli')
  const profile = normalizeProfile({
    id,
    name: name.trim(),
    color,
    createdAt: Date.now(),
    ...(pin?.trim() ? { pin: pin.trim() } : {}),
    recoveryQuestion: q,
    visibility: DEFAULT_VISIBILITY,
  })
  const list = demoGetProfiles()
  list.push(profile)
  write(PROFILES_KEY, list)
  // Yanıtı ayrı sakla (normalizeProfile yanıtı atar)
  const stored = read<(Profile & { recoveryAnswerNorm?: string })[]>(PROFILES_KEY, [])
  write(
    PROFILES_KEY,
    stored.map((p) => (p.id === id ? { ...p, recoveryAnswerNorm: ans } : p)),
  )
  return profile
}

export function demoGetRecoveryQuestion(tc: string): string {
  const id = normalizeTc(tc)
  const all = read<(Profile & { recoveryAnswerNorm?: string })[]>(PROFILES_KEY, [])
  const p = all.find((x) => x.id === id)
  if (!p) throw new Error('Bu kimlikle kayıt bulunamadı')
  const q = p.recoveryQuestion?.trim()
  if (!q) throw new Error('Bu hesap için güvenlik sorusu tanımlı değil')
  return q
}

export function demoResetPasswordWithRecovery(input: {
  tc: string
  answer: string
  newPassword: string
}) {
  const id = normalizeTc(input.tc)
  const ans = normalizeRecoveryAnswer(input.answer)
  if (input.newPassword.trim().length < 6) {
    throw new Error('Yeni şifre en az 6 karakter olmalı')
  }
  const all = read<(Profile & { recoveryAnswerNorm?: string })[]>(PROFILES_KEY, [])
  const idx = all.findIndex((x) => x.id === id)
  if (idx < 0) throw new Error('Bu kimlikle kayıt bulunamadı')
  if (!all[idx].recoveryAnswerNorm || all[idx].recoveryAnswerNorm !== ans) {
    throw new Error('Güvenlik yanıtı hatalı')
  }
  all[idx] = { ...all[idx], pin: input.newPassword.trim() }
  write(PROFILES_KEY, all)
}

export function demoUpdateProfile(
  profileId: string,
  patch: {
    name?: string
    color?: string
    pin?: string | null
    email?: string
    phone?: string
    bio?: string
    jobTitle?: string
    visibility?: ProfileVisibility
    recoveryQuestion?: string
    recoveryAnswer?: string
  },
) {
  const list = read<(Profile & { recoveryAnswerNorm?: string })[]>(PROFILES_KEY, []).map(
    (p) => {
      if (p.id !== profileId) return p
      const next = { ...p }
      if (patch.name !== undefined) next.name = patch.name.trim()
      if (patch.color !== undefined) next.color = patch.color
      if (patch.email !== undefined) next.email = patch.email.trim() || undefined
      if (patch.phone !== undefined) next.phone = patch.phone.trim() || undefined
      if (patch.bio !== undefined) next.bio = patch.bio.trim() || undefined
      if (patch.jobTitle !== undefined) next.jobTitle = patch.jobTitle.trim() || undefined
      if (patch.visibility !== undefined) next.visibility = patch.visibility
      if (patch.pin !== undefined) {
        next.pin = patch.pin && patch.pin.trim() ? patch.pin.trim() : undefined
      }
      if (patch.recoveryQuestion !== undefined) {
        next.recoveryQuestion = patch.recoveryQuestion.trim()
      }
      if (patch.recoveryAnswer !== undefined && patch.recoveryAnswer.trim()) {
        next.recoveryAnswerNorm = normalizeRecoveryAnswer(patch.recoveryAnswer)
      }
      const { recoveryAnswerNorm, ...pub } = next
      return { ...normalizeProfile(pub), recoveryAnswerNorm }
    },
  )
  write(PROFILES_KEY, list)
}

export function demoDeleteProfile(id: string) {
  write(
    PROFILES_KEY,
    demoGetProfiles().filter((p) => p.id !== id),
  )
  write(
    MEMBERS_KEY,
    read<OrgMembership[]>(MEMBERS_KEY, []).filter((m) => m.profileId !== id),
  )
  write(
    GROUPS_KEY,
    demoGetGroups().map((g) => ({
      ...g,
      memberIds: g.memberIds.filter((m) => m !== id),
    })),
  )
}

export function demoCreateOrganization(name: string, member: Session): Organization {
  const org: Organization = {
    id: createLocalId(),
    name: name.trim(),
    createdAt: Date.now(),
    createdById: member.memberId,
    createdByName: member.memberName,
    plan: 'free',
  }
  const orgs = demoGetOrganizations()
  orgs.push(org)
  write(ORGS_KEY, orgs)
  const memberships = read<OrgMembership[]>(MEMBERS_KEY, [])
  memberships.push({
    orgId: org.id,
    profileId: member.memberId,
    role: 'admin',
    title: 'Yönetici',
    joinedAt: Date.now(),
  })
  write(MEMBERS_KEY, memberships)
  return org
}

export function demoDeleteOrganization(orgId: string) {
  const groupIds = demoGetGroups(orgId).map((g) => g.id)
  for (const id of [...groupIds]) {
    // kökleri silmek yeterli; demoDeleteGroup altları da siler
    const g = demoGetGroups().find((x) => x.id === id)
    if (!g) continue
    if (!g.parentId || !groupIds.includes(g.parentId)) {
      demoDeleteGroup(id)
    }
  }
  // kalan
  for (const g of demoGetGroups(orgId)) demoDeleteGroup(g.id)

  write(
    ORGS_KEY,
    demoGetOrganizations().filter((o) => o.id !== orgId),
  )
  write(
    MEMBERS_KEY,
    read<OrgMembership[]>(MEMBERS_KEY, []).filter((m) => m.orgId !== orgId),
  )
  write(
    RECOG_KEY,
    read<{ orgId: string }[]>(RECOG_KEY, []).filter((r) => r.orgId !== orgId),
  )
}

export function demoRenameOrganization(orgId: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Alan adı gerekli')
  write(
    ORGS_KEY,
    demoGetOrganizations().map((o) => (o.id === orgId ? { ...o, name: trimmed } : o)),
  )
}

export function demoSetOrgPlan(orgId: string, plan: PlanId, months = 1) {
  write(
    ORGS_KEY,
    demoGetOrganizations().map((o) =>
      o.id === orgId
        ? {
            ...o,
            plan,
            planExpiresAt:
              plan === 'free' ? undefined : Date.now() + months * 30 * 24 * 60 * 60 * 1000,
          }
        : o,
    ),
  )
}

export function demoAddOrgMember(
  orgId: string,
  profileId: string,
  role: OrgRole,
  title?: string,
) {
  const list = read<OrgMembership[]>(MEMBERS_KEY, [])
  const existing = list.findIndex((m) => m.orgId === orgId && m.profileId === profileId)
  const row: OrgMembership = {
    orgId,
    profileId,
    role,
    title: title?.trim() || undefined,
    joinedAt: Date.now(),
  }
  if (existing >= 0) list[existing] = { ...list[existing], ...row, joinedAt: list[existing].joinedAt }
  else list.push(row)
  write(MEMBERS_KEY, list)
}

export function demoUpdateOrgMember(
  orgId: string,
  profileId: string,
  role: OrgRole,
  title?: string,
) {
  demoAddOrgMember(orgId, profileId, role, title)
}

export function demoRemoveOrgMember(orgId: string, profileId: string) {
  write(
    MEMBERS_KEY,
    read<OrgMembership[]>(MEMBERS_KEY, []).filter(
      (m) => !(m.orgId === orgId && m.profileId === profileId),
    ),
  )
  write(
    GROUPS_KEY,
    demoGetGroups().map((g) =>
      g.orgId === orgId
        ? { ...g, memberIds: g.memberIds.filter((id) => id !== profileId) }
        : g,
    ),
  )
}

export function demoCreateGroup(
  orgId: string,
  name: string,
  member: Session,
  memberIds: string[],
  parentId?: string | null,
): Group {
  const group: Group = {
    id: createLocalId(),
    orgId,
    parentId: parentId || null,
    name: name.trim(),
    memberIds: Array.from(new Set([member.memberId, ...memberIds])),
    createdAt: Date.now(),
    createdById: member.memberId,
    createdByName: member.memberName,
  }
  const list = demoGetGroups()
  list.push(group)
  write(GROUPS_KEY, list)
  return group
}

export function demoUpdateGroupMembers(groupId: string, memberIds: string[]) {
  write(
    GROUPS_KEY,
    demoGetGroups().map((g) => (g.id === groupId ? { ...g, memberIds } : g)),
  )
}

export function demoRenameGroup(groupId: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Grup adı gerekli')
  write(
    GROUPS_KEY,
    demoGetGroups().map((g) => (g.id === groupId ? { ...g, name: trimmed } : g)),
  )
}

export function demoDeleteGroup(groupId: string) {
  const children = demoGetGroups().filter((g) => g.parentId === groupId)
  for (const c of children) demoDeleteGroup(c.id)
  write(
    GROUPS_KEY,
    demoGetGroups().filter((g) => g.id !== groupId),
  )
  write(
    TASKS_KEY,
    allDemoTasks().filter((t) => t.groupId !== groupId),
  )
}

function allDemoTasks(): DemoTask[] {
  return read<DemoTask[]>(TASKS_KEY, [])
}

export function demoCreateTask(input: {
  groupId: string
  title: string
  description: string
  category: TaskCategory
  member: Session
  dueAt?: number
  assigneeIds?: string[]
  assigneeNames?: string[]
  assignEveryone?: boolean
  formId?: string
  formName?: string
  formItems?: TaskFormItem[]
}) {
  const now = Date.now()
  const id = createLocalId()
  const assigneeIds = input.assigneeIds || []
  const assigneeNames = input.assigneeNames || []
  const viewerIds = new Set<string>([input.member.memberId, ...assigneeIds])
  if (input.assignEveryone) {
    const g = demoGetGroups().find((x) => x.id === input.groupId)
    for (const mid of g?.memberIds || []) viewerIds.add(mid)
  }
  const task: DemoTask = {
    id,
    groupId: input.groupId,
    title: input.title.trim(),
    description: input.description.trim(),
    category: input.category,
    status: 'open',
    createdById: input.member.memberId,
    createdByName: input.member.memberName,
    createdAt: now,
    updatedAt: now,
    assigneeIds,
    assigneeNames,
    assignEveryone: Boolean(input.assignEveryone),
    viewerIds: [...viewerIds],
    ...(assigneeIds[0]
      ? { assigneeId: assigneeIds[0], assigneeName: assigneeNames[0] }
      : {}),
    ...(input.dueAt ? { dueAt: input.dueAt } : {}),
    ...(input.formItems && input.formItems.length > 0
      ? {
          formId: input.formId,
          formName: input.formName || 'Kontrol formu',
          formItems: input.formItems,
        }
      : {}),
  }
  const tasks = allDemoTasks()
  tasks.unshift(task)
  write(TASKS_KEY, tasks)

  let who = 'Atama yok'
  if (input.assignEveryone) who = 'Herkese atandı'
  else if (assigneeNames.length) who = `Atanan: ${assigneeNames.join(', ')}`
  const formBit =
    input.formItems && input.formItems.length > 0
      ? ` · Form: ${input.formName || 'Kontrol'} (${input.formItems.length} madde)`
      : ''

  const updates = read<TaskUpdate[]>(UPDATES_KEY, [])
  updates.push({
    id: createLocalId(),
    taskId: id,
    memberId: input.member.memberId,
    memberName: input.member.memberName,
    type: 'created',
    status: 'open',
    message: input.dueAt
      ? `Görev oluşturuldu · ${who} · Miad: ${new Date(input.dueAt).toLocaleString('tr-TR')}${formBit}`
      : `Görev oluşturuldu · ${who}${formBit}`,
    createdAt: now,
  })
  write(UPDATES_KEY, updates)
  return id
}

export function demoUpdateTask(input: {
  groupId: string
  taskId: string
  member: Session
  title: string
  description: string
  category: TaskCategory
  dueAt?: number | null
  assigneeIds?: string[]
  assigneeNames?: string[]
  assignEveryone?: boolean
}) {
  const title = input.title.trim()
  if (!title) throw new Error('Görev başlığı gerekli')
  const now = Date.now()
  const tasks = allDemoTasks()
  const idx = tasks.findIndex((t) => t.id === input.taskId)
  if (idx < 0) throw new Error('Görev bulunamadı')
  const prev = tasks[idx]
  const next: DemoTask = {
    ...prev,
    title,
    description: input.description.trim(),
    category: input.category,
    updatedAt: now,
    dueAt: input.dueAt || undefined,
  }
  if (!input.dueAt) delete next.dueAt

  let whoBit = ''
  if (input.assigneeIds) {
    const assigneeIds = input.assigneeIds
    const assigneeNames = input.assigneeNames || []
    const viewerIds = new Set<string>([prev.createdById, input.member.memberId, ...assigneeIds])
    if (input.assignEveryone) {
      const g = demoGetGroups().find((x) => x.id === input.groupId)
      for (const mid of g?.memberIds || []) viewerIds.add(mid)
    }
    next.assigneeIds = assigneeIds
    next.assigneeNames = assigneeNames
    next.assignEveryone = Boolean(input.assignEveryone)
    next.viewerIds = [...viewerIds]
    if (assigneeIds[0]) {
      next.assigneeId = assigneeIds[0]
      next.assigneeName = assigneeNames[0]
    } else {
      delete next.assigneeId
      delete next.assigneeName
    }
    if (input.assignEveryone) whoBit = ' · Atama: Herkese'
    else if (assigneeNames.length) whoBit = ` · Atanan: ${assigneeNames.join(', ')}`
    else whoBit = ' · Atama kaldırıldı'
  }

  tasks[idx] = next
  write(TASKS_KEY, tasks)

  const updates = read<TaskUpdate[]>(UPDATES_KEY, [])
  updates.push({
    id: createLocalId(),
    taskId: input.taskId,
    memberId: input.member.memberId,
    memberName: input.member.memberName,
    type: 'edit',
    message: input.dueAt
      ? `Görev düzenlendi · Miad: ${new Date(input.dueAt).toLocaleString('tr-TR')}${whoBit}`
      : `Görev düzenlendi${whoBit}`,
    createdAt: now,
  })
  write(UPDATES_KEY, updates)
}

export function demoGetUpdates(taskId: string) {
  return read<TaskUpdate[]>(UPDATES_KEY, [])
    .filter((u) => u.taskId === taskId)
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function demoUpdateStatus(input: {
  groupId: string
  taskId: string
  status: TaskStatus
  member: Session
  note?: string
  failReason?: string
}) {
  const now = Date.now()
  const tasks = allDemoTasks()
  const task = tasks.find((t) => t.id === input.taskId)
  if (!task) return
  task.status = input.status
  task.updatedAt = now
  task.assigneeId = input.member.memberId
  task.assigneeName = input.member.memberName
  task.viewerIds = [...new Set([...(task.viewerIds || []), input.member.memberId])]
  if (input.status === 'started' || input.status === 'in_progress') task.startedAt = now
  if (input.status === 'completed') {
    task.completedAt = now
    task.failReason = undefined
    task.approvalStatus = 'pending'
    task.approvedAt = undefined
    task.approvedById = undefined
    task.approvedByName = undefined
    task.approvalNote = undefined
  }
  if (input.status === 'blocked') {
    task.failReason = input.failReason?.trim() || 'Belirtilmedi'
    task.approvalStatus = undefined
  }
  if (input.status !== 'completed' && input.status !== 'blocked') {
    task.approvalStatus = undefined
  }
  write(TASKS_KEY, tasks)

  const labels: Record<TaskStatus, string> = {
    open: 'Bekliyor',
    started: 'İşe başladım',
    in_progress: 'Devam ediyor',
    completed: 'Tamamladım (onay bekliyor)',
    blocked: 'Tamamlayamadım',
  }
  let message = `Durum: ${labels[input.status]}`
  if (input.status === 'blocked' && input.failReason) message += ` — ${input.failReason.trim()}`
  if (input.note?.trim()) message += ` · ${input.note.trim()}`

  const updates = read<TaskUpdate[]>(UPDATES_KEY, [])
  updates.push({
    id: createLocalId(),
    taskId: input.taskId,
    memberId: input.member.memberId,
    memberName: input.member.memberName,
    type: 'status',
    status: input.status,
    message,
    createdAt: now,
  })
  write(UPDATES_KEY, updates)
}

export function demoApproveTask(input: {
  groupId: string
  taskId: string
  member: Session
  decision: 'approved' | 'rejected'
  note?: string
}) {
  const now = Date.now()
  const note = input.note?.trim() || ''
  const tasks = allDemoTasks()
  const task = tasks.find((t) => t.id === input.taskId)
  if (!task) return
  task.approvalStatus = input.decision
  task.approvedAt = now
  task.approvedById = input.member.memberId
  task.approvedByName = input.member.memberName
  task.approvalNote = note || undefined
  task.updatedAt = now
  write(TASKS_KEY, tasks)
  const updates = read<TaskUpdate[]>(UPDATES_KEY, [])
  updates.push({
    id: createLocalId(),
    taskId: input.taskId,
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
  write(UPDATES_KEY, updates)
}

export function demoGetRecognitions(orgId: string): Recognition[] {
  return read<Recognition[]>(RECOG_KEY, [])
    .filter((r) => r.orgId === orgId)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function demoAddRecognition(input: {
  orgId: string
  profileId: string
  badge: string
  title: string
  message?: string
  member: Session
}): Recognition {
  const row: Recognition = {
    id: createLocalId(),
    orgId: input.orgId,
    profileId: input.profileId,
    badge: input.badge,
    title: input.title.trim(),
    message: input.message?.trim(),
    givenById: input.member.memberId,
    givenByName: input.member.memberName,
    createdAt: Date.now(),
  }
  const list = read<Recognition[]>(RECOG_KEY, [])
  list.unshift(row)
  write(RECOG_KEY, list)
  return row
}

export function demoAddNote(input: {
  taskId: string
  member: Session
  message: string
  groupId: string
}) {
  const text = input.message.trim()
  if (!text) return
  const tasks = allDemoTasks()
  const task = tasks.find((t) => t.id === input.taskId)
  if (task) {
    task.updatedAt = Date.now()
    write(TASKS_KEY, tasks)
  }
  const updates = read<TaskUpdate[]>(UPDATES_KEY, [])
  updates.push({
    id: createLocalId(),
    taskId: input.taskId,
    memberId: input.member.memberId,
    memberName: input.member.memberName,
    type: 'note',
    message: text,
    createdAt: Date.now(),
  })
  write(UPDATES_KEY, updates)
}

export function demoDeleteTask(taskId: string) {
  write(
    TASKS_KEY,
    allDemoTasks().filter((t) => t.id !== taskId),
  )
  write(
    UPDATES_KEY,
    read<TaskUpdate[]>(UPDATES_KEY, []).filter((u) => u.taskId !== taskId),
  )
}

export function demoGetTasksForGroup(
  groupId: string,
  opts?: { profileId: string; isAdmin: boolean },
) {
  return allDemoTasks()
    .filter((t) => t.groupId === groupId)
    .filter((t) => demoCanSeeTask(t, opts))
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function demoGetTasksForGroups(
  groupIds: string[],
  opts?: { profileId: string; isAdmin: boolean },
) {
  const set = new Set(groupIds)
  return allDemoTasks()
    .filter((t) => set.has(t.groupId))
    .filter((t) => demoCanSeeTask(t, opts))
    .sort((a, b) => b.createdAt - a.createdAt)
}

function demoCanSeeTask(
  t: DemoTask,
  opts?: { profileId: string; isAdmin: boolean },
) {
  if (!opts || opts.isAdmin) return true
  const id = opts.profileId
  return (
    t.createdById === id ||
    t.assigneeId === id ||
    Boolean(t.assigneeIds?.includes(id)) ||
    Boolean(t.viewerIds?.includes(id)) ||
    t.assignEveryone === true
  )
}

export function demoCountOpenTasksByPerson(orgId: string, profileId: string) {
  const groupIds = demoGetGroups(orgId).map((g) => g.id)
  const set = new Set(groupIds)
  return allDemoTasks().filter(
    (t) =>
      set.has(t.groupId) &&
      t.createdById === profileId &&
      t.status !== 'completed',
  ).length
}

export function demoGetControlForms(orgId: string): ControlForm[] {
  return read<ControlForm[]>(FORMS_KEY, [])
    .filter((f) => f.orgId === orgId)
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
}

export function demoCreateControlForm(input: {
  orgId: string
  name: string
  description?: string
  items: { text: string }[]
  member: Session
}): ControlForm {
  const name = input.name.trim()
  if (!name) throw new Error('Form adı gerekli')
  const items: ControlFormItem[] = input.items
    .map((it, i) => ({ id: createLocalId(), text: it.text.trim(), order: i }))
    .filter((it) => it.text)
  if (items.length === 0) throw new Error('En az bir madde ekleyin')
  const now = Date.now()
  const form: ControlForm = {
    id: createLocalId(),
    orgId: input.orgId,
    name,
    description: input.description?.trim(),
    items,
    createdAt: now,
    updatedAt: now,
    createdById: input.member.memberId,
    createdByName: input.member.memberName,
  }
  const list = read<ControlForm[]>(FORMS_KEY, [])
  list.push(form)
  write(FORMS_KEY, list)
  return form
}

export function demoUpdateControlForm(input: {
  formId: string
  name: string
  description?: string
  items: { id?: string; text: string }[]
}) {
  const name = input.name.trim()
  if (!name) throw new Error('Form adı gerekli')
  const items: ControlFormItem[] = input.items
    .map((it, i) => ({
      id: it.id || createLocalId(),
      text: it.text.trim(),
      order: i,
    }))
    .filter((it) => it.text)
  if (items.length === 0) throw new Error('En az bir madde ekleyin')
  write(
    FORMS_KEY,
    read<ControlForm[]>(FORMS_KEY, []).map((f) =>
      f.id === input.formId
        ? {
            ...f,
            name,
            description: input.description?.trim(),
            items,
            updatedAt: Date.now(),
          }
        : f,
    ),
  )
}

export function demoDeleteControlForm(formId: string) {
  write(
    FORMS_KEY,
    read<ControlForm[]>(FORMS_KEY, []).filter((f) => f.id !== formId),
  )
}

type DemoFormAnswer = TaskFormAnswer & { groupId: string; taskId: string }

export function demoGetFormAnswers(taskId: string): TaskFormAnswer[] {
  return read<DemoFormAnswer[]>(FORM_ANSWERS_KEY, [])
    .filter((a) => a.taskId === taskId)
    .map(({ groupId: _g, taskId: _t, ...rest }) => rest)
}

export function demoSaveFormAnswer(input: {
  groupId: string
  taskId: string
  forProfileId: string
  forProfileName: string
  responses: Record<string, FormItemResponse>
  member: Session
  asAdmin?: boolean
}) {
  const now = Date.now()
  const list = read<DemoFormAnswer[]>(FORM_ANSWERS_KEY, [])
  const row: DemoFormAnswer = {
    groupId: input.groupId,
    taskId: input.taskId,
    profileId: input.forProfileId,
    profileName: input.forProfileName,
    responses: input.responses,
    updatedAt: now,
    updatedById: input.member.memberId,
    updatedByName: input.member.memberName,
    answeredAsAdmin: Boolean(input.asAdmin),
  }
  const idx = list.findIndex(
    (a) => a.taskId === input.taskId && a.profileId === input.forProfileId,
  )
  if (idx >= 0) list[idx] = row
  else list.push(row)
  write(FORM_ANSWERS_KEY, list)

  write(
    TASKS_KEY,
    allDemoTasks().map((t) =>
      t.id === input.taskId ? { ...t, updatedAt: now } : t,
    ),
  )

  const yes = Object.values(input.responses).filter((r) => r.answer === 'yes').length
  const no = Object.values(input.responses).filter((r) => r.answer === 'no').length
  const updates = read<TaskUpdate[]>(UPDATES_KEY, [])
  updates.push({
    id: createLocalId(),
    taskId: input.taskId,
    memberId: input.member.memberId,
    memberName: input.member.memberName,
    type: 'note',
    message: input.asAdmin
      ? `Form yanıtı (yönetici → ${input.forProfileName}): Evet ${yes} · Hayır ${no}`
      : `Form yanıtı: Evet ${yes} · Hayır ${no}`,
    createdAt: now,
  })
  write(UPDATES_KEY, updates)
}
