import { useState, type FormEvent } from 'react'
import { useApp } from '../hooks/useApp'
import { loginWithAuth, registerWithAuth } from '../lib/api'
import { demoCreateProfile, demoGetProfileById } from '../lib/demoStore'
import { isValidTc, normalizeTc } from '../lib/tc'
import { PROFILE_COLORS, profileNeedsPin } from '../types'

export function AuthScreen() {
  const { setSession, demoMode, refreshLocal } = useApp()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [tc, setTc] = useState('')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [color, setColor] = useState(PROFILE_COLORS[0])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const completeEnter = (profile: {
    id: string
    name: string
    color: string
  }) => {
    setSession({
      memberId: profile.id,
      memberName: profile.name,
      memberColor: profile.color,
      unlocked: true,
    })
  }

  const login = async (e: FormEvent) => {
    e.preventDefault()
    const id = normalizeTc(tc)
    if (!isValidTc(id)) {
      setError('Geçerli bir T.C. Kimlik No girin')
      return
    }
    if (!demoMode && pin.trim().length < 6) {
      setError('Şifre en az 6 karakter')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (demoMode) {
        const profile = demoGetProfileById(id)
        if (!profile) {
          setError('Bu kimlikle kayıt yok. Hesap oluşturun.')
          return
        }
        if (profileNeedsPin(profile) && pin.trim() !== profile.pin?.trim()) {
          setError('Şifre hatalı')
          return
        }
        completeEnter(profile)
      } else {
        const profile = await loginWithAuth(id, pin)
        completeEnter(profile)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş yapılamadı')
    } finally {
      setBusy(false)
    }
  }

  const register = async (e: FormEvent) => {
    e.preventDefault()
    const id = normalizeTc(tc)
    if (!isValidTc(id)) {
      setError('Geçerli bir T.C. Kimlik No girin (11 hane)')
      return
    }
    if (name.trim().length < 2) {
      setError('Kullanıcı adı en az 2 karakter olmalı')
      return
    }
    if (!demoMode && pin.trim().length < 6) {
      setError('Şifre en az 6 karakter olmalı (Firebase Auth)')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (demoMode) {
        const profile = demoCreateProfile(id, name, color, pin.trim() || undefined)
        refreshLocal?.()
        completeEnter(profile)
      } else {
        const profile = await registerWithAuth({
          tc: id,
          name,
          color,
          password: pin.trim(),
        })
        completeEnter(profile)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kayıt olunamadı')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-glow" aria-hidden />
      <div className="auth-card">
        <div className="brand-lockup">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="brand-logo" />
          <div>
            <p className="eyebrow">İş Takip</p>
            <h1>{mode === 'login' ? 'Giriş' : 'Hesap oluştur'}</h1>
          </div>
        </div>
        <p className="lead">
          {mode === 'login'
            ? 'T.C. Kimlik No ve şifrenizle güvenli giriş (Firebase Auth).'
            : 'Kimliğiniz T.C. No’dur. Şifre Auth’ta saklanır; Firestore’da düz metin tutulmaz.'}
        </p>

        {demoMode && (
          <div className="banner banner-info">
            Demo / Firebase yapılandırması eksik — `.env` ve Firestore kurallarını kontrol edin.
          </div>
        )}

        {mode === 'login' ? (
          <form onSubmit={login} className="stack">
            <label>
              T.C. Kimlik No
              <input
                inputMode="numeric"
                autoComplete="username"
                placeholder="11 haneli"
                value={tc}
                onChange={(e) => setTc(normalizeTc(e.target.value))}
                maxLength={11}
                autoFocus
              />
            </label>
            <label>
              Şifre
              <input
                type="password"
                autoComplete="current-password"
                placeholder={demoMode ? 'Yoksa boş' : 'En az 6 karakter'}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required={!demoMode}
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" className="btn primary" disabled={busy}>
              Giriş yap
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setMode('register')
                setError('')
                setPin('')
              }}
            >
              Hesap oluştur
            </button>
          </form>
        ) : (
          <form onSubmit={register} className="stack">
            <label>
              T.C. Kimlik No
              <input
                inputMode="numeric"
                autoComplete="username"
                placeholder="11 haneli (benzersiz kimlik)"
                value={tc}
                onChange={(e) => setTc(normalizeTc(e.target.value))}
                maxLength={11}
                autoFocus
              />
            </label>
            <label>
              Kullanıcı adı
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Örn. Ahmet Yılmaz"
                maxLength={40}
              />
            </label>
            <label>
              Şifre {!demoMode && '(zorunlu, min. 6)'}
              <input
                type="password"
                autoComplete="new-password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="En az 6 karakter"
                required={!demoMode}
              />
            </label>
            <div className="color-picker">
              <span>Renk</span>
              <div className="swatches">
                {PROFILE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`swatch ${color === c ? 'active' : ''}`}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                    aria-label={`Renk ${c}`}
                  />
                ))}
              </div>
            </div>
            {error && <p className="error">{error}</p>}
            <button type="submit" className="btn primary" disabled={busy}>
              Kaydet ve gir
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setMode('login')
                setError('')
              }}
            >
              Girişe dön
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
