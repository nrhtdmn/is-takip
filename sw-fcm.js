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
