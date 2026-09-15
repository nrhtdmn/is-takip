import { useState } from 'react'
import { useApp } from '../hooks/useApp'
import { setOrgPlan, startPlanCheckout } from '../lib/api'
import { demoSetOrgPlan } from '../lib/demoStore'
import { PLANS, type PlanLimits } from '../lib/plans'
import type { PlanId } from '../types'
import { DrawerShell } from './DrawerShell'

const ORDER: PlanId[] = ['free', 'starter', 'premium']

export function PlanScreen({ onClose }: { onClose: () => void }) {
  const { session, currentOrg, demoMode, refreshLocal, isOrgAdmin } = useApp()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  if (!session?.orgId || !currentOrg) return null

  const params = new URLSearchParams(window.location.search)
  const billing = params.get('billing')

  const activateFree = async () => {
    if (!isOrgAdmin) {
      setError('Sadece yönetici plan değiştirebilir')
      return
    }
    setBusy(true)
    setError('')
    setNote('')
    try {
      if (demoMode) demoSetOrgPlan(session.orgId!, 'free')
      else await setOrgPlan({ orgId: session.orgId!, plan: 'free' })
      refreshLocal?.()
      setNote('Reklamlı ücretsiz plana geçildi.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Plan güncellenemedi')
    } finally {
      setBusy(false)
    }
  }

  const payForPlan = async (plan: Exclude<PlanId, 'free'>) => {
    if (!isOrgAdmin) {
      setError('Sadece yönetici plan değiştirebilir')
      return
    }
    setBusy(true)
    setError('')
    setNote('')
    try {
      if (demoMode) {
        demoSetOrgPlan(session.orgId!, plan)
        refreshLocal?.()
        setNote(
          `${PLANS[plan].label} demo’da anında aktif. Canlıda Stripe Checkout’a yönlendirilir.`,
        )
        return
      }

      const origin = window.location.origin + import.meta.env.BASE_URL
      const successUrl = `${origin}?billing=success&plan=${plan}`
      const cancelUrl = `${origin}?billing=cancel`
      const { url } = await startPlanCheckout({
        orgId: session.orgId!,
        plan,
        successUrl,
        cancelUrl,
      })
      window.location.href = url
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ödeme başlatılamadı'
      setError(
        msg.includes('STRIPE') || msg.includes('failed-precondition')
          ? 'Stripe / Cloud Functions henüz yapılandırılmamış. Firebase Functions + STRIPE_SECRET_KEY gerekir.'
          : msg,
      )
    } finally {
      setBusy(false)
    }
  }

  const onPick = (plan: PlanId) => {
    if (plan === 'free') return activateFree()
    return payForPlan(plan)
  }

  return (
    <DrawerShell onClose={onClose} eyebrow={currentOrg.name} title="Abonelik" wide>
      <p className="lead soft">
        Şu an: <strong>{PLANS[currentOrg.plan].label}</strong>
        {!isOrgAdmin && ' — planı yalnızca yönetici değiştirir.'}
      </p>

      {billing === 'success' && (
        <p className="banner banner-info">
          Ödeme alındı. Stripe webhook planı kısa süre içinde aktif eder — sayfayı yenileyin.
        </p>
      )}
      {billing === 'cancel' && (
        <p className="banner banner-info">Ödeme iptal edildi.</p>
      )}

      <div className="plan-grid">
        {ORDER.map((id) => {
          const p = PLANS[id]
          const active = currentOrg.plan === id
          return (
            <PlanCard
              key={id}
              plan={p}
              active={active}
              disabled={busy || !isOrgAdmin}
              onPick={() => onPick(id)}
            />
          )
        })}
      </div>

      <p className="muted tiny">
        Ücretli planlar Stripe Checkout ile ödenir. Webhook sonrası plan otomatik açılır.
      </p>

      {note && <p className="banner banner-info">{note}</p>}
      {error && <p className="error">{error}</p>}
    </DrawerShell>
  )
}

function PlanCard({
  plan,
  active,
  disabled,
  onPick,
}: {
  plan: PlanLimits
  active: boolean
  disabled: boolean
  onPick: () => void
}) {
  const paid = plan.id !== 'free'
  return (
    <div className={`plan-card ${active ? 'active' : ''}`}>
      <p className="eyebrow">{plan.label}</p>
      <h3>{plan.priceLabel}</h3>
      <p className="muted">{plan.description}</p>
      <ul className="plan-features">
        <li>{plan.showAds ? 'Nazik sponsor bandı' : 'Reklamsız'}</li>
        <li>
          Görev:{' '}
          {plan.maxOpenTasksPerPerson == null
            ? 'sınırsız'
            : `kişi başı ${plan.maxOpenTasksPerPerson} açık`}
        </li>
        <li>Grup: {plan.maxGroups == null ? 'sınırsız' : `en fazla ${plan.maxGroups}`}</li>
        <li>Üye: {plan.maxMembers == null ? 'sınırsız' : `en fazla ${plan.maxMembers}`}</li>
      </ul>
      <button
        type="button"
        className={`btn ${active ? 'ghost' : 'primary'} compact`}
        disabled={disabled || active}
        onClick={onPick}
      >
        {active ? 'Aktif' : paid ? 'Öde ve aç' : 'Seç'}
      </button>
    </div>
  )
}
