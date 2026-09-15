import { AppProvider } from './components/AppProvider'
import { AuthScreen } from './components/AuthScreen'
import { GroupScreen } from './components/GroupScreen'
import { HomeScreen } from './components/HomeScreen'
import { NotificationWatcher } from './components/NotificationWatcher'
import { OrgScreen } from './components/OrgScreen'
import { useApp } from './hooks/useApp'
import './App.css'

function Gate() {
  const { session } = useApp()
  if (!session?.memberId) return <AuthScreen />
  if (!session.orgId) return <OrgScreen />
  if (!session.groupId) return <GroupScreen />
  return <HomeScreen />
}

export default function App() {
  return (
    <AppProvider>
      <NotificationWatcher />
      <Gate />
    </AppProvider>
  )
}
