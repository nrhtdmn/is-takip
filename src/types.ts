export type TaskStatus =
  | 'open'
  | 'started'
  | 'in_progress'
  | 'completed'
  | 'blocked'

export type TaskCategory = 'ev' | 'is' | 'diger'

/** Ücretsiz reklamlı · Başlangıç kısıtlı · Premium sınırsız */
export type PlanId = 'free' | 'starter' | 'premium'

export type OrgRole = 'admin' | 'member'

/** Profil alanlarının başkalarına görünürlüğü (tikli = görünsün) */
export interface ProfileVisibility {
  email: boolean
  phone: boolean
  bio: boolean
  jobTitle: boolean
}

export interface Profile {
  id: string
  name: string
  color: string
  createdAt: number
  /** Giriş şifresi; yoksa şifresiz giriş (sonradan belirlenebilir) */
  pin?: string
  email?: string
  phone?: string
  bio?: string
  /** Kişisel ünvan / meslek (alan unvanından ayrı) */
  jobTitle?: string
  visibility: ProfileVisibility
}

/** Profil belge kimliği = T.C. Kimlik No (11 hane) */

/** @deprecated Member = Profile */
export type Member = Profile

/** Alan — grupların üst katmanı (geniş çalışma alanı) */
export interface Organization {
  id: string
  name: string
  createdAt: number
  createdById: string
  createdByName: string
  plan: PlanId
  /** Abonelik bitiş (starter/premium); free için yok */
  planExpiresAt?: number
}

/** Kişinin bir alandaki üyeliği ve rolü */
export interface OrgMembership {
  orgId: string
  profileId: string
  role: OrgRole
  /** Örn. "Ulaştırma memuru" */
  title?: string
  joinedAt: number
}

export interface Group {
  id: string
  orgId: string
  /** Üst çalışma grubu; yoksa alan kökünde */
  parentId?: string | null
  name: string
  memberIds: string[]
  createdAt: number
  createdById: string
  createdByName: string
}

export interface TaskUpdate {
  id: string
  taskId: string
  memberId: string
  memberName: string
  type: 'created' | 'status' | 'note' | 'edit' | 'approval'
  status?: TaskStatus
  message: string
  createdAt: number
}

export interface Task {
  id: string
  title: string
  description: string
  category: TaskCategory
  status: TaskStatus
  createdById: string
  createdByName: string
  /** İlk / aktif üstlenen (durum güncelleyince) */
  assigneeId?: string
  assigneeName?: string
  /** Atanan kişiler (birden fazla) */
  assigneeIds?: string[]
  assigneeNames?: string[]
  /** Oluşturulurken gruptaki / listedeki herkese verildi */
  assignEveryone?: boolean
  createdAt: number
  updatedAt: number
  startedAt?: number
  completedAt?: number
  failReason?: string
  /** Miad (deadline). Yoksa miadsız görev. */
  dueAt?: number
  /** Tamamlandıktan sonra yönetici onayı */
  approvalStatus?: 'pending' | 'approved' | 'rejected'
  approvedAt?: number
  approvedById?: string
  approvedByName?: string
  approvalNote?: string
}

/** Yönetici takdir / rozet */
export interface Recognition {
  id: string
  orgId: string
  profileId: string
  badge: string
  title: string
  message?: string
  givenById: string
  givenByName: string
  createdAt: number
}

export const BADGE_OPTIONS = [
  { id: 'yildiz', label: 'Yıldız' },
  { id: 'hizli', label: 'Hızlı' },
  { id: 'takim', label: 'Takım oyuncusu' },
  { id: 'kalite', label: 'Kalite' },
  { id: 'takdir', label: 'Takdir' },
  { id: 'lider', label: 'Lider' },
] as const


export const DEFAULT_VISIBILITY: ProfileVisibility = {
  email: false,
  phone: false,
  bio: false,
  jobTitle: true,
}

export const STATUS_META: Record<
  TaskStatus,
  { label: string; short: string; tone: string }
> = {
  open: { label: 'Bekliyor', short: 'Bekliyor', tone: 'open' },
  started: { label: 'İşe başladım', short: 'Başladı', tone: 'started' },
  in_progress: { label: 'Devam ediyor', short: 'Devam', tone: 'progress' },
  completed: { label: 'Tamamlandı', short: 'Bitti', tone: 'done' },
  blocked: { label: 'Tamamlayamadım', short: 'Engel', tone: 'blocked' },
}

export const CATEGORY_META: Record<TaskCategory, { label: string }> = {
  ev: { label: 'Ev' },
  is: { label: 'İş' },
  diger: { label: 'Diğer' },
}

export const PROFILE_COLORS = [
  '#1a5c4a',
  '#0f766e',
  '#b45309',
  '#9f1239',
  '#1d4ed8',
  '#6d28d9',
  '#0e7490',
  '#365314',
]

export const DEFAULT_PROFILES = [
  { id: 'gizem', name: 'Gizem', color: '#9f1239', pin: undefined as string | undefined },
  { id: 'nurhat', name: 'Nurhat', color: '#1a5c4a', pin: '2580' },
] as const

export function profileNeedsPin(profile: Profile): boolean {
  return Boolean(profile.pin && profile.pin.trim())
}

export function normalizeProfile(raw: Partial<Profile> & { id: string; name: string }): Profile {
  return {
    id: raw.id,
    name: raw.name,
    color: raw.color || PROFILE_COLORS[0],
    createdAt: raw.createdAt || Date.now(),
    pin: raw.pin,
    email: raw.email,
    phone: raw.phone,
    bio: raw.bio,
    jobTitle: raw.jobTitle,
    visibility: {
      ...DEFAULT_VISIBILITY,
      ...(raw.visibility || {}),
    },
  }
}

/** Başkasına gösterilecek alanlar (kendi profilinde hepsi) */
export function publicProfileFields(profile: Profile, viewerId: string) {
  const self = profile.id === viewerId
  const v = profile.visibility || DEFAULT_VISIBILITY
  return {
    name: profile.name,
    color: profile.color,
    jobTitle: self || v.jobTitle ? profile.jobTitle : undefined,
    email: self || v.email ? profile.email : undefined,
    phone: self || v.phone ? profile.phone : undefined,
    bio: self || v.bio ? profile.bio : undefined,
  }
}
