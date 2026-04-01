import { Routes, Route } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import JoinNetworkPage from './pages/JoinNetworkPage'
import HomePage from './pages/HomePage'
import ChatPage from './pages/ChatPage'
import DirectMessagesPage from './pages/DirectMessagesPage'
import GroupChatPage from './pages/GroupChatPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<JoinNetworkPage />} />
      <Route path="/home" element={<HomePage />} />
      <Route element={<AppLayout />}>
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/messages" element={<DirectMessagesPage />} />
        <Route path="/groups" element={<GroupChatPage />} />
      </Route>
    </Routes>
  )
}

export default App
