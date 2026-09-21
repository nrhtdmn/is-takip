import { useState, type FormEvent } from 'react'
import { useApp } from '../hooks/useApp'
import {
  createControlForm,
  deleteControlForm,
  updateControlForm,
} from '../lib/api'
import {
  demoCreateControlForm,
  demoDeleteControlForm,
  demoUpdateControlForm,
} from '../lib/demoStore'
import type { ControlForm } from '../types'
import { DrawerShell } from './DrawerShell'

export function ControlFormsScreen({ onClose }: { onClose: () => void }) {
  const { session, controlForms, demoMode, refreshLocal, isOrgAdmin } = useApp()
  const [editing, setEditing] = useState<ControlForm | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [items, setItems] = useState<{ id?: string; text: string }[]>([{ text: '' }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!session?.orgId) return null

  const openCreate = () => {
    setCreating(true)
    setEditing(null)
    setName('')
    setDescription('')
    setItems([{ text: '' }])
    setError('')
  }

  const openEdit = (form: ControlForm) => {
    setEditing(form)
    setCreating(false)
    setName(form.name)
    setDescription(form.description || '')
    setItems(
      [...form.items]
        .sort((a, b) => a.order - b.order)
        .map((it) => ({ id: it.id, text: it.text })),
    )
    setError('')
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!isOrgAdmin) {
      setError('Sadece yönetici form kaydedebilir')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (editing) {
        if (demoMode) {
          demoUpdateControlForm({
            formId: editing.id,
            name,
            description,
            items,
          })
        } else {
          await updateControlForm({
            formId: editing.id,
            name,
            description,
            items,
          })
        }
      } else {
        if (demoMode) {
          demoCreateControlForm({
            orgId: session.orgId!,
            name,
            description,
            items,
            member: session,
          })
        } else {
          await createControlForm({
            orgId: session.orgId!,
            name,
            description,
            items,
            member: session,
          })
        }
      }
      refreshLocal?.()
      setCreating(false)
      setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (form: ControlForm) => {
    if (!confirm(`“${form.name}” silinsin mi?`)) return
    setBusy(true)
    try {
      if (demoMode) demoDeleteControlForm(form.id)
      else await deleteControlForm(form.id)
      refreshLocal?.()
      if (editing?.id === form.id) setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Silinemedi')
    } finally {
      setBusy(false)
    }
  }

  const showEditor = creating || editing

  return (
    <DrawerShell onClose={onClose} eyebrow={session.orgName} title="Kontrol formları" wide>
      <div className="stack">
        <p className="muted tiny">
          Kayıtlı şablonlar (ör. otomobil bakım). Göreve bağlayınca atananlar madde
          madde Evet / Hayır işaretler, açıklama yazabilir.
        </p>

        {!showEditor && (
          <>
            {isOrgAdmin && (
              <button type="button" className="btn primary" onClick={openCreate}>
                + Yeni form
              </button>
            )}
            <div className="form-template-list">
              {controlForms.map((f) => (
                <div key={f.id} className="form-template-card">
                  <div>
                    <strong>{f.name}</strong>
                    <p className="muted tiny">
                      {f.items.length} madde
                      {f.description ? ` · ${f.description}` : ''}
                    </p>
                  </div>
                  {isOrgAdmin && (
                    <div className="admin-row-actions">
                      <button
                        type="button"
                        className="btn ghost compact"
                        onClick={() => openEdit(f)}
                      >
                        Düzenle
                      </button>
                      <button
                        type="button"
                        className="btn danger compact"
                        disabled={busy}
                        onClick={() => remove(f)}
                      >
                        Sil
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {controlForms.length === 0 && (
                <p className="muted">Henüz kayıtlı form yok.</p>
              )}
            </div>
          </>
        )}

        {showEditor && (
          <form onSubmit={save} className="stack">
            <p className="eyebrow">{editing ? 'Formu düzenle' : 'Yeni form'}</p>
            <label>
              Form adı
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Örn. Otomobil bakım formu"
                required
              />
            </label>
            <label>
              Açıklama (isteğe bağlı)
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <p className="eyebrow">Maddeler / sorular</p>
            {items.map((it, idx) => (
              <div key={idx} className="form-item-row">
                <input
                  value={it.text}
                  onChange={(e) => {
                    const next = [...items]
                    next[idx] = { ...next[idx], text: e.target.value }
                    setItems(next)
                  }}
                  placeholder={`Madde ${idx + 1} — Örn. Yağ seviyesi kontrol edildi mi?`}
                />
                <button
                  type="button"
                  className="btn ghost compact"
                  disabled={items.length <= 1}
                  onClick={() => setItems(items.filter((_, i) => i !== idx))}
                >
                  Sil
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn ghost compact"
              onClick={() => setItems([...items, { text: '' }])}
            >
              + Madde ekle
            </button>
            {error && <p className="error">{error}</p>}
            <div className="admin-row-actions">
              <button type="submit" className="btn primary" disabled={busy}>
                Kaydet
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setCreating(false)
                  setEditing(null)
                }}
              >
                Vazgeç
              </button>
            </div>
          </form>
        )}
      </div>
    </DrawerShell>
  )
}
