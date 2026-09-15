import type { PlanId } from '../types'

export interface PlanLimits {
  id: PlanId
  label: string
  priceLabel: string
  priceMonthlyTry: number
  showAds: boolean
  /** Kişi başı açık (tamamlanmamış) görev üst sınırı; null = sınırsız */
  maxOpenTasksPerPerson: number | null
  /** Alan başına grup üst sınırı */
  maxGroups: number | null
  /** Alan başına üye üst sınırı */
  maxMembers: number | null
  description: string
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    id: 'free',
    label: 'Reklamlı',
    priceLabel: 'Ücretsiz',
    priceMonthlyTry: 0,
    showAds: true,
    maxOpenTasksPerPerson: null,
    maxGroups: null,
    maxMembers: null,
    description: 'Tüm özellikler açık. Altta nazik, kapatılabilir bir sponsor bandı gösterilir.',
  },
  starter: {
    id: 'starter',
    label: 'Başlangıç',
    priceLabel: '₺49 / ay',
    priceMonthlyTry: 49,
    showAds: false,
    maxOpenTasksPerPerson: 10,
    maxGroups: 1,
    maxMembers: 5,
    description: 'Reklamsız. Kişi başı 10 açık görev, en fazla 1 grup, 5 üye.',
  },
  premium: {
    id: 'premium',
    label: 'Premium',
    priceLabel: '₺149 / ay',
    priceMonthlyTry: 149,
    showAds: false,
    maxOpenTasksPerPerson: null,
    maxGroups: null,
    maxMembers: null,
    description: 'Reklamsız, sınırsız grup / üye / görev. Alanlar arası izolasyon korunur.',
  },
}

export function planOf(id: PlanId | undefined): PlanLimits {
  return PLANS[id || 'free'] || PLANS.free
}

export function isPlanActive(
  plan: PlanId,
  expiresAt?: number,
  now = Date.now(),
): boolean {
  if (plan === 'free') return true
  if (!expiresAt) return true
  return expiresAt > now
}

/** Süresi bitmiş abonelik free’ye düşer */
export function effectivePlan(
  plan: PlanId,
  expiresAt?: number,
  now = Date.now(),
): PlanId {
  if (plan === 'free') return 'free'
  if (isPlanActive(plan, expiresAt, now)) return plan
  return 'free'
}
