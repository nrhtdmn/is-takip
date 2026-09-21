const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { onRequest } = require('firebase-functions/v2/https')
const { setGlobalOptions } = require('firebase-functions/v2')
const admin = require('firebase-admin')
const Stripe = require('stripe')

setGlobalOptions({ region: 'europe-west1' })
admin.initializeApp()
const db = admin.firestore()

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

/** Görev tamamlanınca yönetici tokenlarına onay bildirimi */
exports.onTaskApprovalPending = onDocumentUpdated(
  'groups/{groupId}/tasks/{taskId}',
  async (event) => {
    const before = event.data.before.data() || {}
    const after = event.data.after.data() || {}
    const becamePending =
      after.status === 'completed' &&
      after.approvalStatus === 'pending' &&
      before.approvalStatus !== 'pending'

    if (!becamePending) return

    const groupId = event.params.groupId
    const groupSnap = await db.collection('groups').doc(groupId).get()
    const orgId = groupSnap.data()?.orgId
    if (!orgId) return

    const memberships = await db
      .collection('memberships')
      .where('orgId', '==', orgId)
      .where('role', '==', 'admin')
      .get()

    const tokens = []
    for (const m of memberships.docs) {
      const profileId = m.data().profileId
      const tok = await db.collection('pushTokens').doc(profileId).get()
      if (tok.exists && tok.data()?.token) tokens.push(tok.data().token)
    }
    if (tokens.length === 0) return

    await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: 'Onay bekleyen görev',
        body: after.title || 'Bir görev onay bekliyor',
      },
      data: {
        groupId,
        taskId: event.params.taskId,
        type: 'approval',
      },
    })
  },
)
