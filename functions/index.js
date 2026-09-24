const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { onRequest } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { setGlobalOptions } = require('firebase-functions/v2')
const admin = require('firebase-admin')
const Stripe = require('stripe')

setGlobalOptions({ region: 'europe-west1' })
admin.initializeApp()
const db = admin.firestore()

/** GitHub Pages uygulaması — bildirim tıklanınca bu link açılır */
const APP_ORIGIN = process.env.APP_ORIGIN || 'https://nrhtdmn.github.io/is-takip'

function openTaskLink({ groupId, taskId, kind, notifKey }) {
  const q = new URLSearchParams()
  q.set('openTask', String(taskId))
  if (groupId) q.set('groupId', String(groupId))
  if (kind) q.set('kind', String(kind))
  if (notifKey) q.set('notifKey', String(notifKey))
  return `${APP_ORIGIN}/?${q.toString()}`
}

async function claimReceipt(key) {
  const id = String(key).replace(/[/#]/g, '_')
  const ref = db.collection('notificationReceipts').doc(id)
  try {
    const created = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (snap.exists) return false
      tx.set(ref, { key, sentAt: Date.now() })
      return true
    })
    return created
  } catch {
    return false
  }
}

async function wantsNotif(profileId, category, taskId) {
  const prefsSnap = await db.collection('notifPrefs').doc(profileId).get()
  const prefs = prefsSnap.data() || {}
  if (prefs.enabled === false) return false

  if (taskId) {
    const tid = `${profileId}__${taskId}`
    const taskSnap = await db.collection('taskNotifPrefs').doc(tid).get()
    const override = taskSnap.data()?.categories?.[category]
    if (override === true || override === false) return override
  }

  const cat = prefs.categories?.[category]
  if (cat === false) return false
  return true
}

async function filterProfilesByPref(profileIds, category, taskId) {
  const out = []
  for (const id of [...new Set((profileIds || []).filter(Boolean))]) {
    if (await wantsNotif(id, category, taskId)) out.push(id)
  }
  return out
}

async function tokensForProfiles(profileIds) {
  const tokens = []
  for (const id of [...new Set((profileIds || []).filter(Boolean))]) {
    const tok = await db.collection('pushTokens').doc(id).get()
    const t = tok.data()?.token
    if (t && t !== 'local') tokens.push(t)
  }
  return tokens
}

async function sendDataPush(tokens, { title, body, groupId, taskId, kind, notifKey }) {
  if (!tokens.length) return
  const link = openTaskLink({ groupId, taskId, kind, notifKey })
  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500)
    await admin.messaging().sendEachForMulticast({
      tokens: chunk,
      data: {
        title: String(title || 'İş Takip'),
        body: String(body || ''),
        groupId: String(groupId || ''),
        taskId: String(taskId || ''),
        kind: String(kind || ''),
        type: String(kind || ''),
        notifKey: String(notifKey || ''),
      },
      webpush: {
        fcmOptions: { link },
        headers: { Urgency: 'high' },
      },
    })
  }
}

async function notifyProfiles(profileIds, category, payload) {
  const allowed = await filterProfilesByPref(
    profileIds,
    category,
    payload.taskId,
  )
  const tokens = await tokensForProfiles(allowed)
  await sendDataPush(tokens, payload)
}

function taskPeople(t) {
  const set = new Set()
  if (t.assigneeId) set.add(t.assigneeId)
  for (const id of t.assigneeIds || []) set.add(id)
  if (t.createdById) set.add(t.createdById)
  return [...set]
}

/** Yalnızca atananlar (oluşturan dahil değil — atama bildirimi için) */
function taskAssignees(t) {
  const set = new Set()
  if (t.assigneeId) set.add(t.assigneeId)
  for (const id of t.assigneeIds || []) set.add(id)
  return [...set]
}

function listDiff(before = [], after = []) {
  const b = new Set(before)
  return after.filter((id) => id && !b.has(id))
}

function isValidTc(raw) {
  const tc = String(raw || '').replace(/\D/g, '')
  if (!/^[1-9][0-9]{10}$/.test(tc)) return false
  const d = tc.split('').map(Number)
  const odd = d[0] + d[2] + d[4] + d[6] + d[8]
  const even = d[1] + d[3] + d[5] + d[7]
  if ((odd * 7 - even) % 10 !== d[9]) return false
  if ((d.slice(0, 10).reduce((a, b) => a + b, 0) % 10) !== d[10]) return false
  return true
}

function normalizeRecoveryAnswer(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('tr-TR')
}

const DEFAULT_VISIBILITY = {
  email: false,
  phone: false,
  bio: false,
  jobTitle: true,
}

/** Kayıt: Auth UID = T.C., şifre Auth’ta; profilde pin yok */
exports.registerWithTc = onCall(async (request) => {
  const tc = String(request.data?.tc || '').replace(/\D/g, '')
  const name = String(request.data?.name || '').trim()
  const color = String(request.data?.color || '#1a5c4a')
  const password = String(request.data?.password || '')
  const recoveryQuestion = String(request.data?.recoveryQuestion || '').trim()
  const recoveryAnswerNorm = normalizeRecoveryAnswer(request.data?.recoveryAnswer || '')

  if (!isValidTc(tc)) throw new HttpsError('invalid-argument', 'Geçersiz T.C. Kimlik No')
  if (name.length < 2) throw new HttpsError('invalid-argument', 'İsim en az 2 karakter')
  if (password.length < 6) {
    throw new HttpsError('invalid-argument', 'Şifre en az 6 karakter olmalı')
  }
  if (recoveryQuestion.length < 3) {
    throw new HttpsError('invalid-argument', 'Güvenlik sorusu gerekli')
  }
  if (recoveryAnswerNorm.length < 1) {
    throw new HttpsError('invalid-argument', 'Güvenlik yanıtı gerekli')
  }

  const existing = await db.collection('profiles').doc(tc).get()
  if (existing.exists) {
    throw new HttpsError('already-exists', 'Bu T.C. ile kayıt var — giriş yapın')
  }

  try {
    await admin.auth().createUser({
      uid: tc,
      email: `${tc}@istakip.app`,
      password,
      displayName: name,
    })
  } catch (err) {
    if (err.code === 'auth/uid-already-exists' || err.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'Bu T.C. ile kayıt var — giriş yapın')
    }
    throw new HttpsError('internal', err.message || 'Auth oluşturulamadı')
  }

  await db.collection('profiles').doc(tc).set({
    name,
    color,
    createdAt: Date.now(),
    visibility: DEFAULT_VISIBILITY,
    authUid: tc,
    recoveryQuestion,
    recoveryAnswerNorm,
  })
  await db.collection('uidMap').doc(tc).set({ profileId: tc })

  return { ok: true, profileId: tc }
})

/** Giriş yapmadan güvenlik sorusunu getir */
exports.getRecoveryQuestion = onCall(async (request) => {
  const tc = String(request.data?.tc || '').replace(/\D/g, '')
  if (!isValidTc(tc)) throw new HttpsError('invalid-argument', 'Geçersiz T.C. Kimlik No')

  const snap = await db.collection('profiles').doc(tc).get()
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Bu kimlikle kayıt bulunamadı')
  }
  const q = String(snap.data()?.recoveryQuestion || '').trim()
  if (!q) {
    throw new HttpsError(
      'failed-precondition',
      'Bu hesap için güvenlik sorusu tanımlı değil. Yöneticiye başvurun.',
    )
  }
  return { question: q }
})

/** Güvenlik yanıtı doğruysa Auth şifresini yenile */
exports.resetPasswordWithRecovery = onCall(async (request) => {
  const tc = String(request.data?.tc || '').replace(/\D/g, '')
  const answer = normalizeRecoveryAnswer(request.data?.answer || '')
  const newPassword = String(request.data?.newPassword || '')

  if (!isValidTc(tc)) throw new HttpsError('invalid-argument', 'Geçersiz T.C. Kimlik No')
  if (answer.length < 1) throw new HttpsError('invalid-argument', 'Yanıt gerekli')
  if (newPassword.length < 6) {
    throw new HttpsError('invalid-argument', 'Yeni şifre en az 6 karakter olmalı')
  }

  const snap = await db.collection('profiles').doc(tc).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Bu kimlikle kayıt bulunamadı')
  const data = snap.data() || {}
  const stored = String(data.recoveryAnswerNorm || '')
  if (!stored || stored !== answer) {
    throw new HttpsError('permission-denied', 'Güvenlik yanıtı hatalı')
  }

  try {
    await admin.auth().updateUser(tc, { password: newPassword })
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      // Auth yoksa oluştur
      await admin.auth().createUser({
        uid: tc,
        email: `${tc}@istakip.app`,
        password: newPassword,
        displayName: data.name || tc,
      })
      await db.collection('uidMap').doc(tc).set({ profileId: tc }, { merge: true })
      await db.collection('profiles').doc(tc).set({ authUid: tc }, { merge: true })
    } else {
      throw new HttpsError('internal', err.message || 'Şifre güncellenemedi')
    }
  }

  return { ok: true }
})

/** Eski düz metin pin → Auth’a taşı, pin alanını sil */
exports.migrateLegacyLogin = onCall(async (request) => {
  const tc = String(request.data?.tc || '').replace(/\D/g, '')
  const password = String(request.data?.password || '')
  if (!isValidTc(tc)) throw new HttpsError('invalid-argument', 'Geçersiz T.C.')
  if (password.length < 1) throw new HttpsError('invalid-argument', 'Şifre gerekli')

  const snap = await db.collection('profiles').doc(tc).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Kayıt yok')
  const data = snap.data() || {}

  try {
    await admin.auth().getUser(tc)
    return { ok: true, migrated: false }
  } catch (_) {
    // yoksa oluştur
  }

  const legacyPin = data.pin != null ? String(data.pin) : ''
  if (!legacyPin || legacyPin !== password) {
    throw new HttpsError('permission-denied', 'Şifre hatalı veya hesap Auth’a geçmemiş')
  }

  const pass = password.length >= 6 ? password : `${password}000000`.slice(0, 6)
  await admin.auth().createUser({
    uid: tc,
    email: `${tc}@istakip.app`,
    password: pass,
    displayName: data.name || tc,
  })
  await db.collection('profiles').doc(tc).set(
    { authUid: tc, pin: admin.firestore.FieldValue.delete() },
    { merge: true },
  )
  await db.collection('uidMap').doc(tc).set({ profileId: tc })
  return { ok: true, migrated: true, paddedPassword: pass !== password }
})

const PRICE_ENV = {
  starter: 'STRIPE_PRICE_STARTER',
  premium: 'STRIPE_PRICE_PREMIUM',
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new HttpsError('failed-precondition', 'STRIPE_SECRET_KEY tanımlı değil')
  return new Stripe(key)
}

exports.createCheckoutSession = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Giriş gerekli')
  }
  const data = request.data || {}
  const orgId = String(data.orgId || '')
  const plan = String(data.plan || '')
  const successUrl = String(data.successUrl || '')
  const cancelUrl = String(data.cancelUrl || '')

  if (!orgId || !['starter', 'premium'].includes(plan)) {
    throw new HttpsError('invalid-argument', 'orgId ve plan (starter|premium) gerekli')
  }
  if (!successUrl || !cancelUrl) {
    throw new HttpsError('invalid-argument', 'successUrl / cancelUrl gerekli')
  }

  const mem = await db
    .collection('memberships')
    .doc(`${orgId}__${request.auth.uid}`)
    .get()
  if (!mem.exists || mem.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Sadece yönetici ödeme yapabilir')
  }

  const priceId = process.env[PRICE_ENV[plan]]
  if (!priceId) {
    throw new HttpsError('failed-precondition', `${PRICE_ENV[plan]} tanımlı değil`)
  }

  const orgSnap = await db.collection('organizations').doc(orgId).get()
  if (!orgSnap.exists) throw new HttpsError('not-found', 'Alan bulunamadı')

  const stripe = getStripe()
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: orgId,
    metadata: { orgId, plan },
    subscription_data: { metadata: { orgId, plan } },
  })

  await db.collection('payments').add({
    orgId,
    plan,
    status: 'pending',
    stripeSessionId: session.id,
    createdAt: Date.now(),
    createdById: request.auth.uid,
  })

  return { url: session.url }
})

exports.stripeWebhook = onRequest({ cors: false }, async (req, res) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')
  const sig = req.headers['stripe-signature']
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET

  let event
  try {
    if (endpointSecret) {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret)
    } else {
      event = req.body
    }
  } catch (err) {
    console.error(err)
    res.status(400).send(`Webhook Error: ${err.message}`)
    return
  }

  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'invoice.paid'
  ) {
    const obj = event.data.object
    const orgId = obj.metadata?.orgId || obj.client_reference_id
    const plan = obj.metadata?.plan
    if (orgId && (plan === 'starter' || plan === 'premium')) {
      const months = 1
      await db
        .collection('organizations')
        .doc(orgId)
        .set(
          {
            plan,
            planExpiresAt: Date.now() + months * 30 * 24 * 60 * 60 * 1000,
          },
          { merge: true },
        )
      const payments = await db
        .collection('payments')
        .where('stripeSessionId', '==', obj.id)
        .limit(1)
        .get()
      for (const d of payments.docs) {
        await d.ref.set({ status: 'paid', paidAt: Date.now() }, { merge: true })
      }
    }
  }

  res.json({ received: true })
})

/** Görev olayları: onay, atama, değişiklik, onay/red sonucu */
exports.onTaskNotify = onDocumentUpdated(
  'groups/{groupId}/tasks/{taskId}',
  async (event) => {
    const before = event.data.before.data() || {}
    const after = event.data.after.data() || {}
    const groupId = event.params.groupId
    const taskId = event.params.taskId
    const title = after.title || 'Görev'

    const groupSnap = await db.collection('groups').doc(groupId).get()
    const orgId = groupSnap.data()?.orgId

    const adminIds = []
    if (orgId) {
      const memberships = await db
        .collection('memberships')
        .where('orgId', '==', orgId)
        .where('role', '==', 'admin')
        .get()
      for (const m of memberships.docs) adminIds.push(m.data().profileId)
    }

    // Onay bekleyen → yöneticiler
    const becamePending =
      after.status === 'completed' &&
      after.approvalStatus === 'pending' &&
      before.approvalStatus !== 'pending'
    if (becamePending) {
      await notifyProfiles(adminIds, 'approvalPending', {
        title: 'Onay bekleyen görev',
        body: title,
        groupId,
        taskId,
        kind: 'approval',
        notifKey: `approval:${taskId}`,
      })
    }

    // Onay / red → atananlar (+ oluşturan)
    const decided =
      (after.approvalStatus === 'approved' || after.approvalStatus === 'rejected') &&
      before.approvalStatus !== after.approvalStatus
    if (decided) {
      const people = taskPeople(after).filter((id) => id !== after.approvedById)
      await notifyProfiles(people, 'approvalDecision', {
        title: after.approvalStatus === 'approved' ? 'Görev onaylandı' : 'Görev reddedildi',
        body: title,
        groupId,
        taskId,
        kind: 'approval-decision',
        notifKey: `decision:${taskId}:${after.approvalStatus}`,
      })
    }

    // Yeni atananlar (oluşturanı atama bildiriminden çıkar)
    const beforeAssignees = [
      ...(before.assigneeIds || []),
      ...(before.assigneeId ? [before.assigneeId] : []),
    ]
    const afterAssignees = [
      ...(after.assigneeIds || []),
      ...(after.assigneeId ? [after.assigneeId] : []),
    ]
    let newly = listDiff(beforeAssignees, afterAssignees)
    if (after.assignEveryone && !before.assignEveryone) {
      newly = [...new Set([...(groupSnap.data()?.memberIds || []), ...newly])]
    }
    newly = newly.filter((id) => id && id !== after.createdById)
    if (newly.length) {
      const notifKey = `assigned:${taskId}`
      if (await claimReceipt(`${notifKey}:upd:${newly.sort().join(',')}`)) {
        await notifyProfiles(newly, 'taskAssigned', {
          title: 'Yeni görev atandı',
          body: title,
          groupId,
          taskId,
          kind: 'assigned',
          notifKey,
        })
      }
    }

    // İçerik / durum / miad değişimi
    const changed =
      before.status !== after.status ||
      before.title !== after.title ||
      before.description !== after.description ||
      before.dueAt !== after.dueAt
    if (changed && !becamePending && !decided) {
      const recipients = new Set([...taskPeople(after), ...adminIds])
      await notifyProfiles([...recipients], 'taskChanges', {
        title: 'Görev güncellendi',
        body: title,
        groupId,
        taskId,
        kind: 'task-change',
        notifKey: `change:${taskId}:${after.updatedAt || Date.now()}`,
      })
    }
  },
)

/** Yeni görev oluşturulunca atananlara (oluşturan hariç) */
exports.onTaskCreatedNotify = onDocumentCreated(
  'groups/{groupId}/tasks/{taskId}',
  async (event) => {
    const after = event.data?.data() || {}
    const groupId = event.params.groupId
    const taskId = event.params.taskId
    let recipients = taskAssignees(after)
    if (after.assignEveryone) {
      const groupSnap = await db.collection('groups').doc(groupId).get()
      recipients = [...new Set([...(groupSnap.data()?.memberIds || []), ...recipients])]
    }
    recipients = recipients.filter((id) => id && id !== after.createdById)
    if (!recipients.length) return

    const notifKey = `assigned:${taskId}`
    if (!(await claimReceipt(notifKey))) return

    await notifyProfiles(recipients, 'taskAssigned', {
      title: 'Yeni görev atandı',
      body: after.title || 'Görev',
      groupId,
      taskId,
      kind: 'assigned',
      notifKey,
    })
  },
)

/** Takdir / rozet */
exports.onRecognitionNotify = onDocumentCreated('recognitions/{id}', async (event) => {
  const data = event.data?.data() || {}
  const profileId = data.profileId
  if (!profileId) return
  await notifyProfiles([profileId], 'recognition', {
    title: 'Takdir aldınız',
    body: data.title || data.badge || 'Yeni takdir',
    groupId: '',
    taskId: '',
    kind: 'recognition',
    notifKey: `recognition:${event.params.id}`,
  })
})

/** Uygulama kapalıyken miad / gecikme push (30 dk) */
exports.scanTaskDeadlines = onSchedule(
  {
    schedule: 'every 30 minutes',
    timeZone: 'Europe/Istanbul',
  },
  async () => {
    const now = Date.now()
    const soon = now + 24 * 60 * 60 * 1000
    const snap = await db.collectionGroup('tasks').where('dueAt', '<=', soon).get()

    for (const docSnap of snap.docs) {
      const t = docSnap.data() || {}
      if (!t.dueAt) continue
      if (t.status === 'completed' || t.status === 'blocked') continue

      const groupId = docSnap.ref.parent.parent?.id
      if (!groupId) continue
      const taskId = docSnap.id
      const category = t.dueAt < now ? 'overdue' : 'dueSoon'
      const kind = t.dueAt < now ? 'overdue' : 'due-soon'
      const notifKey = `${kind}:${taskId}`
      if (!(await claimReceipt(notifKey))) continue

      const recipients = new Set(taskPeople(t))
      const groupSnap = await db.collection('groups').doc(groupId).get()
      const orgId = groupSnap.data()?.orgId
      if (orgId) {
        const admins = await db
          .collection('memberships')
          .where('orgId', '==', orgId)
          .where('role', '==', 'admin')
          .get()
        for (const m of admins.docs) recipients.add(m.data().profileId)
      }

      await notifyProfiles([...recipients], category, {
        title: kind === 'overdue' ? 'Miad geçti' : 'Miad yaklaşıyor',
        body: t.title || 'Görev',
        groupId,
        taskId,
        kind,
        notifKey,
      })
    }
  },
)
