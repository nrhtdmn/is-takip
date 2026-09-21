import { useState, type FormEvent } from 'react'
import { useApp } from '../hooks/useApp'
import {
  fetchRecoveryQuestion,
  loginWithAuth,
  registerWithAuth,
  resetPasswordWithRecovery,
} from '../lib/api'
import {
  demoCreateProfile,
  demoGetProfileById,
  demoGetRecoveryQuestion,
  demoResetPasswordWithRecovery,
} from '../lib/demoStore'
import { isValidTc, normalizeTc } from '../lib/tc'
import {
  PROFILE_COLORS,
  RECOVERY_QUESTION_PRESETS,
  profileNeedsPin,
} from '../types'

function friendlyAuthError(raw: string) {
  const m = raw.toLowerCase()
  if (m.includes('user-not-found') || m.includes('bulunamad')) {
    return 'Bu kimlikle kayıt bulunamadı. Hesap oluşturun.'
  }
  if (
    m.includes('wrong-password') ||
    m.includes('invalid-credential') ||
    m.includes('invalid-login')
  ) {
    return 'T.C. Kimlik No veya şifre hatalı.'
  }
  if (m.includes('email-already') || m.includes('already-in-use')) {
    return 'Bu kimlik zaten kayıtlı. Giriş yapın.'
  }
  if (m.includes('weak-password')) {
    return 'Şifre en az 6 karakter olmalı.'
  }
  if (m.includes('yanıtı hatalı') || m.includes('güvenlik yanıtı')) {
    return 'Güvenlik yanıtı hatalı.'
  }
  if (
    m.includes('firebase') ||
    m.includes('firestore') ||
    m.includes('permission') ||
    m.includes('auth') ||
    m.includes('functions')
  ) {
    return 'İşlem şu an tamamlanamadı. Lütfen tekrar deneyin.'
  }
  return raw
}

type Mode = 'login' | 'register' | 'forgot'

export function AuthScreen() {
  const { setSession, demoMode, refreshLocal } = useApp()
  const [mode, setMode] = useState<Mode>('login')
  const [tc, setTc] = useState('')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [color, setColor] = useState(PROFILE_COLORS[0])
  const [recoveryPreset, setRecoveryPreset] = useState<string>(RECOVERY_QUESTION_PRESETS[0])
  const [recoveryCustom, setRecoveryCustom] = useState('')
  const [recoveryAnswer, setRecoveryAnswer] = useState('')
  const [forgotStep, setForgotStep] = useState<'tc' | 'answer'>('tc')
  const [forgotQuestion, setForgotQuestion] = useState('')
  const [forgotAnswer, setForgotAnswer] = useState('')
  const [forgotPass, setForgotPass] = useState('')
  const [forgotPass2, setForgotPass2] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  const recoveryQuestion =
    recoveryPreset === '__custom__' ? recoveryCustom.trim() : recoveryPreset

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

  const goMode = (next: Mode) => {
    setMode(next)
    setError('')
    setOk('')
    setPin('')
    setForgotStep('tc')
    setForgotQuestion('')
    setForgotAnswer('')
    setForgotPass('')
    setForgotPass2('')
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
      setError(
        friendlyAuthError(err instanceof Error ? err.message : 'Giriş yapılamadı'),
      )
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
      setError('Şifre en az 6 karakter olmalı')
      return
    }
    if (recoveryQuestion.length < 3) {
      setError('Güvenlik sorusu seçin veya yazın')
      return
    }
    if (!recoveryAnswer.trim()) {
      setError('Güvenlik yanıtı gerekli')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (demoMode) {
        const profile = demoCreateProfile(
          id,
          name,
          color,
          pin.trim() || undefined,
          recoveryQuestion,
          recoveryAnswer,
        )
        refreshLocal?.()
        completeEnter(profile)
      } else {
        const profile = await registerWithAuth({
          tc: id,
          name,
          color,
          password: pin.trim(),
          recoveryQuestion,
          recoveryAnswer,
        })
        completeEnter(profile)
      }
    } catch (err) {
      setError(
        friendlyAuthError(err instanceof Error ? err.message : 'Kayıt olunamadı'),
      )
    } finally {
      setBusy(false)
    }
  }

  const loadForgotQuestion = async (e: FormEvent) => {
    e.preventDefault()
    const id = normalizeTc(tc)
    if (!isValidTc(id)) {
      setError('Geçerli bir T.C. Kimlik No girin')
      return
    }
    setBusy(true)
    setError('')
    setOk('')
    try {
      const q = demoMode
        ? demoGetRecoveryQuestion(id)
        : await fetchRecoveryQuestion(id)
      setForgotQuestion(q)
      setForgotStep('answer')
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : 'Soru alınamadı'))
    } finally {
      setBusy(false)
    }
  }

  const submitForgotReset = async (e: FormEvent) => {
    e.preventDefault()
    const id = normalizeTc(tc)
    if (!forgotAnswer.trim()) {
      setError('Güvenlik yanıtını yazın')
      return
    }
    if (forgotPass.trim().length < 6) {
      setError('Yeni şifre en az 6 karakter olmalı')
      return
    }
    if (forgotPass !== forgotPass2) {
      setError('Yeni şifreler eşleşmiyor')
      return
    }
    setBusy(true)
    setError('')
    setOk('')
    try {
      if (demoMode) {
        demoResetPasswordWithRecovery({
          tc: id,
          answer: forgotAnswer,
          newPassword: forgotPass.trim(),
        })
      } else {
        await resetPasswordWithRecovery({
          tc: id,
          answer: forgotAnswer,
          newPassword: forgotPass.trim(),
        })
      }
      setMode('login')
      setForgotStep('tc')
      setForgotQuestion('')
      setForgotAnswer('')
      setForgotPass('')
      setForgotPass2('')
      setPin(forgotPass.trim())
      setOk('Şifreniz güncellendi. Yeni şifrenizle giriş yapın.')
      setError('')
    } catch (err) {
      setError(
        friendlyAuthError(err instanceof Error ? err.message : 'Şifre yenilenemedi'),
      )
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
            <h1>
              {mode === 'login'
                ? 'Giriş'
                : mode === 'register'
                  ? 'Hesap oluştur'
                  : 'Şifremi unuttum'}
            </h1>
          </div>
        </div>
        <p className="lead">
          {mode === 'login'
            ? 'T.C. Kimlik No ve şifrenizle giriş yapın.'
            : mode === 'register'
              ? 'Hesap oluştururken güvenlik sorusu belirleyin; şifrenizi unutursanız kullanılır.'
              : 'Güvenlik sorusunu doğru yanıtlarsanız yeni şifre belirleyebilirsiniz.'}
        </p>

        {ok && <p className="banner banner-info">{ok}</p>}

        {mode === 'login' && (
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
                placeholder="En az 6 karakter"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required={!demoMode}
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" className="btn primary" disabled={busy}>
              Giriş yap
            </button>
            <button type="button" className="btn ghost" onClick={() => goMode('forgot')}>
              Şifremi unuttum
            </button>
            <button type="button" className="btn ghost" onClick={() => goMode('register')}>
              Hesap oluştur
            </button>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={register} className="stack">
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
              Kullanıcı adı
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Örn. Ahmet Yılmaz"
                maxLength={40}
              />
            </label>
            <label>
              Şifre
              <input
                type="password"
                autoComplete="new-password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="En az 6 karakter"
                required={!demoMode}
              />
            </label>
            <label>
              Güvenlik sorusu
              <select
                value={recoveryPreset}
                onChange={(e) => setRecoveryPreset(e.target.value)}
              >
                {RECOVERY_QUESTION_PRESETS.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
                <option value="__custom__">Kendi sorumu yazacağım</option>
              </select>
            </label>
            {recoveryPreset === '__custom__' && (
              <label>
                Sorunuz
                <input
                  value={recoveryCustom}
                  onChange={(e) => setRecoveryCustom(e.target.value)}
                  placeholder="Örn. İlk arabamın markası?"
                  maxLength={120}
                />
              </label>
            )}
            <label>
              Güvenlik yanıtı
              <input
                value={recoveryAnswer}
                onChange={(e) => setRecoveryAnswer(e.target.value)}
                placeholder="Yanıtınız (büyük/küçük harf önemli değil)"
                autoComplete="off"
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
            <button type="button" className="btn ghost" onClick={() => goMode('login')}>
              Girişe dön
            </button>
          </form>
        )}

        {mode === 'forgot' && forgotStep === 'tc' && (
          <form onSubmit={loadForgotQuestion} className="stack">
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
            {error && <p className="error">{error}</p>}
            <button type="submit" className="btn primary" disabled={busy}>
              Devam
            </button>
            <button type="button" className="btn ghost" onClick={() => goMode('login')}>
              Girişe dön
            </button>
          </form>
        )}

        {mode === 'forgot' && forgotStep === 'answer' && (
          <form onSubmit={submitForgotReset} className="stack">
            <p className="muted tiny">Güvenlik sorunuz</p>
            <p className="drawer-desc">{forgotQuestion}</p>
            <label>
              Yanıtınız
              <input
                value={forgotAnswer}
                onChange={(e) => setForgotAnswer(e.target.value)}
                placeholder="Büyük/küçük harf fark etmez"
                autoComplete="off"
                autoFocus
              />
            </label>
            <label>
              Yeni şifre
              <input
                type="password"
                autoComplete="new-password"
                value={forgotPass}
                onChange={(e) => setForgotPass(e.target.value)}
                placeholder="En az 6 karakter"
              />
            </label>
            <label>
              Yeni şifre (tekrar)
              <input
                type="password"
                autoComplete="new-password"
                value={forgotPass2}
                onChange={(e) => setForgotPass2(e.target.value)}
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" className="btn primary" disabled={busy}>
              Şifreyi yenile
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setForgotStep('tc')
                setError('')
              }}
            >
              Geri
            </button>
            <button type="button" className="btn ghost" onClick={() => goMode('login')}>
              Girişe dön
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
