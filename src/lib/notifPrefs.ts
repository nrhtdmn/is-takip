/** Bildirim kategorileri ve tercih çözümleme */

export type NotifCategory =
  | 'dueSoon'
  | 'overdue'
  | 'approvalPending'
  | 'approvalDecision'
  | 'taskAssigned'
  | 'taskChanges'
  | 'recognition'

export type NotifCategoryMap = Record<NotifCategory, boolean>

export type NotifCategoryOverrideMap = Partial<
  Record<NotifCategory, boolean | null>
>

export interface NotifPrefs {
  enabled: boolean
  categories: NotifCategoryMap
  updatedAt: number
}

export interface TaskNotifPrefs {
  profileId: string
  taskId: string
  groupId?: string
  categories: NotifCategoryOverrideMap
  updatedAt: number
}

export const NOTIF_CATEGORIES: NotifCategory[] = [
  'taskAssigned',
  'taskChanges',
  'dueSoon',
  'overdue',
  'approvalPending',
  'approvalDecision',
  'recognition',
]

export const NOTIF_CATEGORY_META: Record<
  NotifCategory,
  {
    label: string
    hint: string
    /** Kimler için ayar satırı gösterilsin */
    forAdmin: boolean
    forMember: boolean
    /** Görev kartında özel ayar olarak sunulsun */
    perTask: boolean
  }
> = {
  taskAssigned: {
    label: 'Görev ataması',
    hint: 'Size yeni görev atandığında',
    forAdmin: true,
    forMember: true,
    perTask: false,
  },
  taskChanges: {
    label: 'Görev değişiklikleri',
    hint: 'Durum, miad veya içerik değişince',
    forAdmin: true,
    forMember: true,
    perTask: true,
  },
  dueSoon: {
    label: 'Miad yaklaşıyor',
    hint: 'Son 24 saat içinde',
    forAdmin: true,
    forMember: true,
    perTask: true,
  },
  overdue: {
    label: 'Miad geçti',
    hint: 'Süre dolduğunda',
    forAdmin: true,
    forMember: true,
    perTask: true,
  },
  approvalPending: {
    label: 'Onay bekleyen görev',
    hint: 'Tamamlanan görev onayınıza düştüğünde',
    forAdmin: true,
    forMember: false,
    perTask: true,
  },
  approvalDecision: {
    label: 'Onay / red sonucu',
    hint: 'Yönetici onayladığında veya reddettiğinde',
    forAdmin: false,
    forMember: true,
    perTask: true,
  },
  recognition: {
    label: 'Takdir ve rozet',
    hint: 'Size takdir veya rozet verildiğinde',
    forAdmin: true,
    forMember: true,
    perTask: false,
  },
}

export function defaultNotifCategories(): NotifCategoryMap {
  return {
    taskAssigned: true,
    taskChanges: true,
    dueSoon: true,
    overdue: true,
    approvalPending: true,
    approvalDecision: true,
    recognition: true,
  }
}

export function defaultNotifPrefs(): NotifPrefs {
  return {
    enabled: true,
    categories: defaultNotifCategories(),
    updatedAt: Date.now(),
  }
}

export function normalizeNotifPrefs(raw: unknown): NotifPrefs {
  const base = defaultNotifPrefs()
  if (!raw || typeof raw !== 'object') return base
  const d = raw as Record<string, unknown>
  const cats = { ...base.categories }
  const incoming = (d.categories || {}) as Record<string, unknown>
  for (const key of NOTIF_CATEGORIES) {
    if (typeof incoming[key] === 'boolean') cats[key] = incoming[key] as boolean
  }
  return {
    enabled: d.enabled === false ? false : true,
    categories: cats,
    updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : Date.now(),
  }
}

export function normalizeTaskNotifPrefs(
  raw: unknown,
  profileId: string,
  taskId: string,
): TaskNotifPrefs {
  const categories: NotifCategoryOverrideMap = {}
  if (raw && typeof raw === 'object') {
    const d = raw as Record<string, unknown>
    const incoming = (d.categories || {}) as Record<string, unknown>
    for (const key of NOTIF_CATEGORIES) {
      const v = incoming[key]
      if (v === true || v === false || v === null) categories[key] = v
    }
    return {
      profileId: String(d.profileId || profileId),
      taskId: String(d.taskId || taskId),
      groupId: d.groupId ? String(d.groupId) : undefined,
      categories,
      updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : Date.now(),
    }
  }
  return {
    profileId,
    taskId,
    categories: {},
    updatedAt: Date.now(),
  }
}

/** Genel + göreve özel → bu kategori açık mı? */
export function isNotifCategoryEnabled(
  prefs: NotifPrefs | null | undefined,
  category: NotifCategory,
  taskOverride?: NotifCategoryOverrideMap | null,
): boolean {
  const p = prefs || defaultNotifPrefs()
  if (!p.enabled) return false
  if (taskOverride && category in taskOverride) {
    const v = taskOverride[category]
    if (v === true || v === false) return v
  }
  return p.categories[category] !== false
}

export function categoriesForRole(isAdmin: boolean): NotifCategory[] {
  return NOTIF_CATEGORIES.filter((c) =>
    isAdmin ? NOTIF_CATEGORY_META[c].forAdmin : NOTIF_CATEGORY_META[c].forMember,
  )
}

export function perTaskCategoriesForRole(isAdmin: boolean): NotifCategory[] {
  return categoriesForRole(isAdmin).filter((c) => NOTIF_CATEGORY_META[c].perTask)
}

export function taskNotifDocId(profileId: string, taskId: string) {
  return `${profileId}__${taskId}`
}
