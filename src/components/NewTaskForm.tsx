import { useMemo, useState, type FormEvent } from 'react'
import { useApp } from '../hooks/useApp'
import { createLocalId, createTask } from '../lib/api'
import { demoCountOpenTasksByPerson, demoCreateTask } from '../lib/demoStore'
import { planOf } from '../lib/plans'
import { fromLocalInputValue } from '../lib/time'
import type { TaskCategory, TaskFormItem } from '../types'
import { CATEGORY_META } from '../types'
import { DrawerShell } from './DrawerShell'
import { MemberSearchList } from './MemberSearchList'

export function NewTaskForm({ onClose }: { onClose: () => void }) {
  const {
    session,
    demoMode,
    refreshLocal,
    currentOrg,
    tasks,
    groups,
    profiles,
    orgMemberships,
    isOrgAdmin,
    controlForms,
  } = useApp()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<TaskCategory>('is')
  const [dueLocal, setDueLocal] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [assignEveryone, setAssignEveryone] = useState(false)
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])
  const [formId, setFormId] = useState('')
  const [inlineItems, setInlineItems] = useState<string[]>([''])

  const plan = planOf(currentOrg?.plan)
  const currentGroup = groups.find((g) => g.id === session?.groupId)
  const selectedForm = controlForms.find((f) => f.id === formId)

  const candidates = useMemo(() => {
    if (!session) return [] as import('../types').Profile[]
    if (isOrgAdmin) {
      return orgMemberships
        .map((m) => profiles.find((p) => p.id === m.profileId))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
    }
    const ids = new Set(currentGroup?.memberIds || [])
    return profiles.filter((p) => ids.has(p.id))
  }, [isOrgAdmin, orgMemberships, profiles, currentGroup, session])

  const myOpenCount = useMemo(() => {
    if (!session) return 0
    if (demoMode && session.orgId) {
      return demoCountOpenTasksByPerson(session.orgId, session.memberId)
    }
    return tasks.filter(
      (t) => t.createdById === session.memberId && t.status !== 'completed',
    ).length
  }, [demoMode, session, tasks])

  if (!session?.groupId) return null
  const groupId = session.groupId

  const toggleAssignee = (id: string) => {
    setAssignEveryone(false)
    setSelectedAssignees((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('Görev başlığı gerekli')
      return
    }
    if (
      plan.maxOpenTasksPerPerson != null &&
      myOpenCount >= plan.maxOpenTasksPerPerson
    ) {
      setError(
        `Başlangıç planında kişi başı en fazla ${plan.maxOpenTasksPerPerson} açık görev.`,
      )
      return
    }

    const ids = assignEveryone
      ? candidates.map((c) => c!.id)
      : selectedAssignees
    const names = ids.map(
      (id) => candidates.find((c) => c!.id === id)?.name || id,
    )

    let formName: string | undefined
    let formItems: TaskFormItem[] | undefined
    let attachedFormId: string | undefined
    if (selectedForm) {
      attachedFormId = selectedForm.id
      formName = selectedForm.name
      formItems = selectedForm.items.map((it) => ({
        id: it.id,
        text: it.text,
        order: it.order,
      }))
    } else {
      const texts = inlineItems.map((t) => t.trim()).filter(Boolean)
      if (texts.length > 0) {
        formName = 'Anket / kontrol'
        formItems = texts.map((text, i) => ({
          id: createLocalId(),
          text,
          order: i,
        }))
      }
    }

    const dueAt = fromLocalInputValue(dueLocal)
    setBusy(true)
    setError('')
    try {
      const payload = {
        groupId,
        title,
        description,
        category,
        member: session,
        dueAt,
        assigneeIds: ids,
        assigneeNames: names,
        assignEveryone,
        formId: attachedFormId,
        formName,
        formItems,
      }
      if (demoMode) {
        demoCreateTask(payload)
        refreshLocal?.()
      } else {
        await createTask(payload)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setBusy(false)
    }
  }

  return (
    <DrawerShell onClose={onClose} eyebrow="Yeni görev" title="Ne yapılacak?">
      <form onSubmit={submit} className="stack">
        <label>
          Başlık
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Örn. Sabah sporuna çıkıldı mı?"
            autoFocus
            maxLength={80}
          />
        </label>

        <label>
          Açıklama
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detay…"
          />
        </label>

        <div>
          <p className="eyebrow">Kime atanacak?</p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={assignEveryone}
              onChange={(e) => {
                setAssignEveryone(e.target.checked)
                if (e.target.checked) setSelectedAssignees([])
              }}
            />
            Herkese ({candidates.length} kişi)
          </label>
          {!assignEveryone && (
            <MemberSearchList
              candidates={candidates}
              selectedIds={selectedAssignees}
              onToggle={toggleAssignee}
              emptyText="Atanacak üye yok"
            />
          )}
          <p className="field-hint">
            Birkaç kişiyi işaretleyin veya herkese verin. Boş = atamasız.
          </p>
        </div>

        <label>
          Kontrol formu / anket (isteğe bağlı)
          <select
            value={formId}
            onChange={(e) => {
              setFormId(e.target.value)
              if (e.target.value) setInlineItems([''])
            }}
          >
            <option value="">Form yok / tek seferlik maddeler</option>
            {controlForms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.items.length} madde)
              </option>
            ))}
          </select>
        </label>

        {!formId && (
          <div className="stack">
            <p className="eyebrow">Tek seferlik sorular (Evet / Hayır)</p>
            {inlineItems.map((text, idx) => (
              <div key={idx} className="form-item-row">
                <input
                  value={text}
                  onChange={(e) => {
                    const next = [...inlineItems]
                    next[idx] = e.target.value
                    setInlineItems(next)
                  }}
                  placeholder={`Örn. Madde ${idx + 1}`}
                />
                <button
                  type="button"
                  className="btn ghost compact"
                  disabled={inlineItems.length <= 1}
                  onClick={() => setInlineItems(inlineItems.filter((_, i) => i !== idx))}
                >
                  Sil
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn ghost compact"
              onClick={() => setInlineItems([...inlineItems, ''])}
            >
              + Soru ekle
            </button>
          </div>
        )}

        {selectedForm && (
          <p className="muted tiny">
            Bağlanacak: {selectedForm.items.map((i) => i.text).join(' · ')}
          </p>
        )}

        <label>
          Miad (isteğe bağlı)
          <input
            type="datetime-local"
            value={dueLocal}
            onChange={(e) => setDueLocal(e.target.value)}
          />
        </label>

        <div className="category-row">
          {(Object.keys(CATEGORY_META) as TaskCategory[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`chip ${category === key ? 'active' : ''}`}
              onClick={() => setCategory(key)}
            >
              {CATEGORY_META[key].label}
            </button>
          ))}
        </div>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Kaydediliyor…' : 'Görevi kaydet'}
        </button>
      </form>
    </DrawerShell>
  )
}
