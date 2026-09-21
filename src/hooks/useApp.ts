import { createContext, useContext } from 'react'
import type {
  ControlForm,
  Group,
  Organization,
  OrgMembership,
  Profile,
  Recognition,
  Task,
} from '../types'
import type { Session } from '../lib/api'

export interface AppState {
  session: Session | null
  profiles: Profile[]
  organizations: Organization[]
  myMemberships: OrgMembership[]
  orgMemberships: OrgMembership[]
  groups: Group[]
  tasks: Task[]
  /** Alandaki tüm görevler (istatistik / yönetici) */
  orgTasks: (Task & { groupId: string })[]
  recognitions: Recognition[]
  /** Alanın kayıtlı kontrol formu şablonları */
  controlForms: ControlForm[]
  loading: boolean
  demoMode: boolean
  setSession: (session: Session | null) => void
  switchProfile: () => void
  leaveOrg: () => void
  leaveGroup: () => void
  logout: () => void
  refreshLocal?: () => void
  currentOrg?: Organization
  isOrgAdmin: boolean
}

export const AppContext = createContext<AppState | null>(null)

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp AppProvider içinde kullanılmalı')
  return ctx
}
