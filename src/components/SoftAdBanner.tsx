import { useEffect, useState } from 'react'
import { useApp } from '../hooks/useApp'
import { planOf } from '../lib/plans'

const DISMISS_KEY = 'istakip_ad_dismiss_day'

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

/** Rahatsız etmeyen, günde bir kapatılabilir alt sponsor bandı */
export function SoftAdBanner() {
  const { currentOrg } = useApp()
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    const plan = planOf(currentOrg?.plan)
    if (!plan.showAds) {
      setHidden(true)
      return
    }
    try {
      setHidden(localStorage.getItem(DISMISS_KEY) === todayKey())
    } catch {
      setHidden(false)
    }
  }, [currentOrg?.plan])

  if (hidden) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, todayKey())
    } catch {
      /* ignore */
    }
    setHidden(true)
  }

  return (
    <aside className="soft-ad" aria-label="Sponsor">
      <div>
        <p className="eyebrow">Sponsor</p>
        <p>İş Takip ücretsiz sürüm — Premium ile reklamsız ve sınırsız çalışın.</p>
      </div>
      <button type="button" className="icon-btn" onClick={dismiss} aria-label="Bugün kapat">
        ✕
      </button>
    </aside>
  )
}
