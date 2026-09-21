/* Bildirim tıkla → uygulamayı aç + hedef görevi ilet (yalnızca bu bildirim kapanır) */
function buildOpenUrl(data) {
  var scope = self.registration.scope
  var taskId = data.taskId || ''
  if (!taskId) return scope
  var u = new URL(scope)
  u.searchParams.set('openTask', taskId)
  if (data.groupId) u.searchParams.set('groupId', data.groupId)
  if (data.kind) u.searchParams.set('kind', data.kind)
  if (data.notifKey) u.searchParams.set('notifKey', data.notifKey)
  return u.toString()
}

function notifPayload(notification) {
  var data = notification.data || {}
  var tag = notification.tag || data.notifKey || ''
  var groupId = data.groupId || ''
  var taskId = data.taskId || ''
  var kind = data.kind || data.type || ''
  var notifKey = data.notifKey || tag || (kind && taskId ? kind + ':' + taskId : '')
  return {
    type: 'NOTIFICATION_CLICK',
    groupId: groupId,
    taskId: taskId,
    kind: kind,
    notifKey: notifKey,
    tag: tag,
  }
}

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var payload = notifPayload(event.notification)
  var openUrl = buildOpenUrl(payload)

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var client = list[i]
        try {
          client.postMessage(payload)
        } catch (e) {}
        if ('focus' in client) {
          return client.focus().then(function (focused) {
            try {
              if (focused) focused.postMessage(payload)
            } catch (e) {}
            return focused
          })
        }
      }
      if (clients.openWindow) return clients.openWindow(openUrl)
    }),
  )
})
