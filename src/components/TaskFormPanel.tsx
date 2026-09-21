import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../hooks/useApp'
import { saveFormAnswer, subscribeFormAnswers } from '../lib/api'
import { demoGetFormAnswers, demoSaveFormAnswer } from '../lib/demoStore'
import type { FormItemResponse, FormYesNo, Task, TaskFormAnswer } from '../types'

export function TaskFormPanel({
  task,
  groupId,
}: {
  task: Task
  groupId: string
}) {
  const { session, demoMode, refreshLocal, isOrgAdmin } = useApp()
  const [answers, setAnswers] = useState<TaskFormAnswer[]>([])
  const [forId, setForId] = useState('')
  const [draft, setDraft] = useState<Record<string, FormItemResponse>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const items = useMemo(
    () => [...(task.formItems || [])].sort((a, b) => a.order - b.order),
    [task.formItems],
  )

  const assignees = useMemo(() => {
    const ids = task.assigneeIds?.length
      ? task.assigneeIds
      : task.assigneeId
        ? [task.assigneeId]
        : []
    const names = task.assigneeNames?.length
      ? task.assigneeNames
      : task.assigneeName
        ? [task.assigneeName]
        : []
    return ids.map((id, i) => ({ id, name: names[i] || id }))
  }, [task])

  useEffect(() => {
    if (!session || items.length === 0) return
    if (demoMode) {
      const all = demoGetFormAnswers(task.id)
      setAnswers(
        isOrgAdmin ? all : all.filter((a) => a.profileId === session.memberId),
      )
      return
    }
    return subscribeFormAnswers(groupId, task.id, setAnswers, undefined, {
      profileId: session.memberId,
      isAdmin: isOrgAdmin,
    })
  }, [groupId, task.id, demoMode, task.updatedAt, session, items.length, isOrgAdmin])

  useEffect(() => {
    if (!session) return
    const defaultFor =
      isOrgAdmin && assignees[0]
        ? assignees.find((a) => a.id === session.memberId)?.id || assignees[0].id
        : session.memberId
    setForId(defaultFor)
  }, [session, isOrgAdmin, assignees])

  useEffect(() => {
    const existing = answers.find((a) => a.profileId === forId)
    setDraft(existing?.responses ? { ...existing.responses } : {})
    setOk('')
    setError('')
  }, [forId, answers])

  if (!session || items.length === 0) return null

  const canEditSelf =
    !task.assigneeIds?.length ||
    Boolean(task.assigneeIds?.includes(session.memberId)) ||
    task.createdById === session.memberId

  const canEdit =
    isOrgAdmin || (forId === session.memberId && canEditSelf)

  const setAnswer = (itemId: string, answer: FormYesNo) => {
    setDraft((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], answer },
    }))
  }

  const setNote = (itemId: string, note: string) => {
    setDraft((prev) => ({
      ...prev,
      [itemId]: {
        answer: prev[itemId]?.answer || 'yes',
        note,
      },
    }))
  }

  const save = async () => {
    if (!canEdit) return
    const missing = items.filter((it) => !draft[it.id]?.answer)
    if (missing.length > 0) {
      setError('Tüm maddelere Evet veya Hayır seçin')
      return
    }
    const target = assignees.find((a) => a.id === forId)
    const forProfileName = target?.name || forId
    const asAdmin = isOrgAdmin && forId !== session.memberId
    setBusy(true)
    setError('')
    setOk('')
    try {
      const payload = {
        groupId,
        taskId: task.id,
        forProfileId: forId,
        forProfileName,
        responses: draft,
        member: session,
        asAdmin,
      }
      if (demoMode) {
        demoSaveFormAnswer(payload)
        refreshLocal?.()
        setAnswers(demoGetFormAnswers(task.id))
      } else {
        await saveFormAnswer(payload)
      }
      setOk('Yanıtlar kaydedildi')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="drawer-section form-answer-panel">
      <h3>{task.formName || 'Kontrol formu'}</h3>
      <p className="muted tiny">
        Her madde için Evet / Hayır işaretleyin; isteğe bağlı açıklama yazın.
      </p>

      {isOrgAdmin && assignees.length > 0 && (
        <label>
          Kimin adına
          <select value={forId} onChange={(e) => setForId(e.target.value)}>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.id === session.memberId ? ' (ben)' : ''}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="form-answer-list">
        {items.map((it) => {
          const r = draft[it.id]
          return (
            <div key={it.id} className="form-answer-item">
              <p className="form-answer-q">{it.text}</p>
              <div className="yesno-row">
                <button
                  type="button"
                  className={`chip ${r?.answer === 'yes' ? 'active' : ''}`}
                  disabled={!canEdit || busy}
                  onClick={() => setAnswer(it.id, 'yes')}
                >
                  Evet
                </button>
                <button
                  type="button"
                  className={`chip ${r?.answer === 'no' ? 'active' : ''}`}
                  disabled={!canEdit || busy}
                  onClick={() => setAnswer(it.id, 'no')}
                >
                  Hayır
                </button>
              </div>
              <input
                value={r?.note || ''}
                disabled={!canEdit || busy}
                onChange={(e) => setNote(it.id, e.target.value)}
                placeholder="Açıklama (isteğe bağlı)"
              />
            </div>
          )
        })}
      </div>

      {canEdit && (
        <button type="button" className="btn primary" disabled={busy} onClick={save}>
          Yanıtları kaydet
        </button>
      )}
      {error && <p className="error">{error}</p>}
      {ok && <p className="banner banner-info">{ok}</p>}

      {answers.length > 0 && (
        <div className="form-answer-summary">
          <p className="eyebrow">Özet</p>
          {answers.map((a) => {
            const yes = Object.values(a.responses || {}).filter((x) => x.answer === 'yes')
              .length
            const no = Object.values(a.responses || {}).filter((x) => x.answer === 'no')
              .length
            return (
              <p key={a.profileId} className="muted tiny">
                {a.profileName}: Evet {yes} · Hayır {no}
                {a.answeredAsAdmin ? ' · yönetici yazdı' : ''}
              </p>
            )
          })}
        </div>
      )}
    </section>
  )
}
