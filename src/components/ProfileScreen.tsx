import { useEffect, useState, type FormEvent } from 'react'
import { useApp } from '../hooks/useApp'
import { changeAuthPassword, updateProfile } from '../lib/api'
import { demoUpdateProfile } from '../lib/demoStore'
import { formatTcDisplay } from '../lib/tc'
import {
  DEFAULT_VISIBILITY,
  PROFILE_COLORS,
  type ProfileVisibility,
} from '../types'
import { DrawerShell } from './DrawerShell'

export function ProfileScreen({ onClose }: { onClose: () => void }) {
  const { session, setSession, profiles, demoMode, refreshLocal } = useApp()
  const me = profiles.find((p) => p.id === session?.memberId)

  const [name, setName] = useState(me?.name || '')
  const [color, setColor] = useState(me?.color || PROFILE_COLORS[0])
  const [email, setEmail] = useState(me?.email || '')
  const [phone, setPhone] = useState(me?.phone || '')
  const [jobTitle, setJobTitle] = useState(me?.jobTitle || '')
  const [bio, setBio] = useState(me?.bio || '')
  const [visibility, setVisibility] = useState<ProfileVisibility>(
    me?.visibility || DEFAULT_VISIBILITY,
  )
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    if (!me) return
    setName(me.name)
    setColor(me.color)
    setEmail(me.email || '')
    setPhone(me.phone || '')
    setJobTitle(me.jobTitle || '')
    setBio(me.bio || '')
    setVisibility(me.visibility || DEFAULT_VISIBILITY)
  }, [me])

  if (!session || !me) return null

  const toggleVis = (key: keyof ProfileVisibility) => {
    setVisibility((v) => ({ ...v, [key]: !v[key] }))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) {
      setError('İsim en az 2 karakter')
      return
    }
    if (newPin) {
      if (newPin !== confirmPin) {
        setError('Yeni şifreler eşleşmiyor')
        return
      }
      if (!demoMode && newPin.trim().length < 6) {
        setError('Yeni şifre en az 6 karakter')
        return
      }
      if (!demoMode && !currentPin.trim()) {
        setError('Şifre değiştirmek için mevcut şifreyi yazın')
        return
      }
    }
    setBusy(true)
    setError('')
    setOk('')
    try {
      const patch = {
        name,
        color,
        email,
        phone,
        jobTitle,
        bio,
        visibility,
      }
      if (demoMode) {
        demoUpdateProfile(me.id, {
          ...patch,
          ...(newPin.trim() ? { pin: newPin.trim() } : {}),
        })
      } else {
        await updateProfile(me.id, patch)
        if (newPin.trim()) {
          await changeAuthPassword({
            currentPassword: currentPin.trim(),
            newPassword: newPin.trim(),
          })
        }
      }
      setSession({
        ...session,
        memberName: name.trim(),
        memberColor: color,
      })
      refreshLocal?.()
      setCurrentPin('')
      setNewPin('')
      setConfirmPin('')
      setOk('Profil kaydedildi')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setBusy(false)
    }
  }

  return (
    <DrawerShell onClose={onClose} eyebrow="Profilim" title="Bilgiler & şifre" wide>
      <form onSubmit={submit} className="stack">
        <label>
          T.C. Kimlik No
          <input value={formatTcDisplay(me.id)} disabled readOnly />
        </label>
        <label>
          Ad
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
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
              />
            ))}
          </div>
        </div>
        <label>
          Ünvan / meslek
          <input
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="Örn. Memur"
          />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={visibility.jobTitle}
            onChange={() => toggleVis('jobTitle')}
          />
          Başkaları ünvanımı görsün
        </label>
        <label>
          E-posta
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="opsiyonel"
          />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={visibility.email} onChange={() => toggleVis('email')} />
          Başkaları e-postamı görsün
        </label>
        <label>
          Telefon
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="opsiyonel" />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={visibility.phone} onChange={() => toggleVis('phone')} />
          Başkaları telefonumu görsün
        </label>

        <label>
          Hakkımda
          <textarea
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Kısa not…"
          />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={visibility.bio} onChange={() => toggleVis('bio')} />
          Başkaları bu metni görsün
        </label>

        <hr className="soft-hr" />
        <p className="eyebrow">Şifre</p>
        <p className="muted tiny">Değiştirmek için mevcut ve yeni şifreyi yazın.</p>
        {!demoMode && (
          <label>
            Mevcut şifre
            <input
              type="password"
              autoComplete="current-password"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value)}
              placeholder="Şifre değiştirecekseniz"
            />
          </label>
        )}
        <label>
          Yeni şifre
          <input
            type="password"
            autoComplete="new-password"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            placeholder="Boş = değiştirme"
          />
        </label>
        <label>
          Yeni şifre (tekrar)
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
            disabled={!newPin}
          />
        </label>

        {error && <p className="error">{error}</p>}
        {ok && <p className="banner banner-info">{ok}</p>}
        <button type="submit" className="btn primary" disabled={busy}>
          Kaydet
        </button>
      </form>
    </DrawerShell>
  )
}
