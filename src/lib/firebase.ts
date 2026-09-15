import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getFunctions, type Functions } from 'firebase/functions'
import { getMessaging, isSupported, type Messaging } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const FAMILY_PASSWORD =
  import.meta.env.VITE_FAMILY_PASSWORD || '123456'

export const NURHAT_PIN = import.meta.env.VITE_NURHAT_PIN || '2580'

export const GROUP_ID = import.meta.env.VITE_GROUP_ID || 'aile'

export const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || ''

export const isFirebaseConfigured =
  Boolean(firebaseConfig.apiKey) &&
  firebaseConfig.apiKey !== 'demo' &&
  firebaseConfig.projectId !== 'demo'

let app: FirebaseApp | null = null
let db: Firestore | null = null
let auth: Auth | null = null
let functions: Functions | null = null
let messaging: Messaging | null = null

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase henüz yapılandırılmadı. .env dosyasını doldurun.')
  }
  if (!app) {
    app = getApps()[0] || initializeApp(firebaseConfig)
    db = getFirestore(app)
    auth = getAuth(app)
  }
  return app
}

export function getDb(): Firestore {
  getFirebaseApp()
  return db!
}

export function getFirebaseAuth(): Auth {
  getFirebaseApp()
  return auth!
}

export function getFirebaseFunctions(): Functions {
  const a = getFirebaseApp()
  if (!functions) functions = getFunctions(a, 'europe-west1')
  return functions
}

export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (!isFirebaseConfigured || !VAPID_KEY) return null
  if (!(await isSupported())) return null
  const a = getFirebaseApp()
  if (!messaging) messaging = getMessaging(a)
  return messaging
}

/** Auth e-posta: T.C. → {tc}@istakip.app (Auth UID = T.C.) */
export function tcAuthEmail(tc: string) {
  return `${tc}@istakip.app`
}
