/* auto-generated — FCM background (PWA SW + standalone) */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js')

firebase.initializeApp({
  "apiKey": "AIzaSyAiwjtMR-ucefm85njgSo3oeHUqDZQ3F2w",
  "authDomain": "is-takip-e06e2.firebaseapp.com",
  "projectId": "is-takip-e06e2",
  "storageBucket": "is-takip-e06e2.firebasestorage.app",
  "messagingSenderId": "699557529169",
  "appId": "1:699557529169:web:13b64a4f6eab33bd531a70"
})

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
      icon: '/is-takip/pwa-192.png',
      badge: '/is-takip/pwa-192.png',
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

function buildOpenUrl(data) {
  var openUrl = '/is-takip/'
  var taskId = data.taskId || ''
  if (!taskId) return openUrl
  var q = new URLSearchParams()
  q.set('openTask', taskId)
  if (data.groupId) q.set('groupId', data.groupId)
  if (data.kind) q.set('kind', data.kind)
  if (data.notifKey) q.set('notifKey', data.notifKey)
  return '/is-takip/?' + q.toString()
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
