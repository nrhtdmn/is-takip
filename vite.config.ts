import react from '@vitejs/plugin-react'
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const rootDir = dirname(fileURLToPath(import.meta.url))

function writePushScripts(env: Record<string, string>, base: string) {
  const cfg = {
    apiKey: env.VITE_FIREBASE_API_KEY || '',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: env.VITE_FIREBASE_APP_ID || '',
  }

  const fcmBody = `/* auto-generated — FCM background (PWA SW + standalone) */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js')

firebase.initializeApp(${JSON.stringify(cfg, null, 2)})

try {
  firebase.messaging().onBackgroundMessage(function (payload) {
    var data = payload.data || {}
    var title = data.title || (payload.notification && payload.notification.title) || 'İş Takip'
    var body = data.body || (payload.notification && payload.notification.body) || ''
    var kind = data.kind || data.type || ''
    var taskId = data.taskId || ''
    var notifKey = data.notifKey || (kind && taskId ? kind + ':' + taskId : '')
    return self.registration.showNotification(title, {
      body: body,
      icon: '${base}pwa-192.png',
      badge: '${base}pwa-192.png',
      tag: notifKey || undefined,
      renotify: true,
      data: {
        groupId: data.groupId || '',
        taskId: taskId,
        kind: kind,
        notifKey: notifKey,
        type: kind,
      },
    })
  })
} catch (e) {}
`

  // Ana PWA SW'ye gömülen FCM parçası (tıklama sw-notif-click.js'te)
  writeFileSync(resolve(rootDir, 'public/sw-fcm.js'), fcmBody)

  // Eski FCM kaydı / token'lar için ayrı SW (tıklama dahil)
  const clickInline = `
function buildOpenUrl(data) {
  var openUrl = '${base}'
  var taskId = data.taskId || ''
  if (!taskId) return openUrl
  var q = new URLSearchParams()
  q.set('openTask', taskId)
  if (data.groupId) q.set('groupId', data.groupId)
  if (data.kind) q.set('kind', data.kind)
  if (data.notifKey) q.set('notifKey', data.notifKey)
  return '${base}?' + q.toString()
}
self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var data = event.notification.data || {}
  var tag = event.notification.tag || data.notifKey || ''
  var groupId = data.groupId || ''
  var taskId = data.taskId || ''
  var kind = data.kind || data.type || ''
  var notifKey = data.notifKey || tag || (kind && taskId ? kind + ':' + taskId : '')
  var payload = { type: 'NOTIFICATION_CLICK', groupId: groupId, taskId: taskId, kind: kind, notifKey: notifKey, tag: tag }
  var openUrl = buildOpenUrl(payload)
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var client = list[i]
        try { client.postMessage(payload) } catch (e) {}
        if ('focus' in client) {
          return client.focus().then(function (focused) {
            try { if (focused) focused.postMessage(payload) } catch (e) {}
            return focused
          })
        }
      }
      if (clients.openWindow) return clients.openWindow(openUrl)
    })
  )
})
`
  writeFileSync(
    resolve(rootDir, 'public/firebase-messaging-sw.js'),
    fcmBody + clickInline,
  )
}

const isGitHubPages = process.env.GITHUB_PAGES === 'true'
const repoName = process.env.VITE_REPO_NAME || 'is-takip'
const base = isGitHubPages ? `/${repoName}/` : '/'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  writePushScripts(env, base)

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.svg',
          'apple-touch-icon.png',
          'logo.svg',
          'firebase-messaging-sw.js',
          'sw-fcm.js',
          'sw-notif-click.js',
        ],
        manifest: {
          name: 'İş Takip',
          short_name: 'İş Takip',
          description: 'Alan ve grup işlerini birlikte takip edin',
          theme_color: '#1a5c4a',
          background_color: '#f3f6f4',
          display: 'standalone',
          orientation: 'portrait',
          start_url: base,
          scope: base,
          icons: [
            {
              src: 'pwa-192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'pwa-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          importScripts: ['sw-fcm.js', 'sw-notif-click.js'],
        },
      }),
    ],
  }
})
