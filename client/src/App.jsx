

import { useState, useEffect, useCallback, useRef } from 'react'
import { socket } from './socket'
import UsernameScreen from './components/UsernameScreen'
import Sidebar from './components/Sidebar'
import ChatWindow from './components/ChatWindow'

const GLOBAL_KEY = '__global__'

function App() {

  const [username, setUsername] = useState(() => {
    return localStorage.getItem('quickchat-username') || null
  })

  const [onlineUsers, setOnlineUsers] = useState([])

  const [selectedUser, setSelectedUser] = useState(() => {
    return localStorage.getItem('quickchat-selected') || null
  })

  const [messages, setMessages] = useState({})

  const [unreadFrom, setUnreadFrom] = useState(new Set())

  const [historyLoaded, setHistoryLoaded] = useState(new Set())

  const [loadingHistory, setLoadingHistory] = useState(false)

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('quickchat-theme') || 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('quickchat-theme', theme)
  }, [theme])

  function toggleTheme() {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  const selectedUserRef = useRef(selectedUser)
  useEffect(() => {
    selectedUserRef.current = selectedUser
  }, [selectedUser])


  useEffect(() => {
    if (!username) return

    function handleConnect() {
      socket.emit('user:join', username, (response) => {
        if (!response.success) {
          console.warn('Username taken on reconnect:', response.error)
          handleLogout()
        } else if (response.users) {
   
          setOnlineUsers(response.users)
        }
      })
    }

    function handleOnlineUsers(users) {
      setOnlineUsers(users)
    }

    // Private message received
    function handleMessage(message) {
      const partner = message.from === username ? message.to : message.from

      setMessages((prev) => ({
        ...prev,
        [partner]: [...(prev[partner] || []), message]
      }))

      // Mark as unread if the message is from someone else and not currently selected
      if (message.from !== username && message.from !== selectedUserRef.current) {
        setUnreadFrom((prev) => {
          const newSet = new Set(prev)
          newSet.add(message.from)
          return newSet
        })
      }
    }

    function handleGlobalMessage(message) {
      setMessages((prev) => ({
        ...prev,
        [GLOBAL_KEY]: [...(prev[GLOBAL_KEY] || []), message]
      }))

      if (message.from !== username && selectedUserRef.current !== GLOBAL_KEY) {
        setUnreadFrom((prev) => {
          const newSet = new Set(prev)
          newSet.add(GLOBAL_KEY)
          return newSet
        })
      }
    }

    socket.on('users:online', handleOnlineUsers)
    socket.on('message:receive', handleMessage)
    socket.on('message:globalReceive', handleGlobalMessage)

    socket.on('connect', handleConnect)

    if (!socket.connected) {
      socket.connect()
    } else {
      handleConnect()
    }

    return () => {
      socket.off('connect', handleConnect)
      socket.off('users:online', handleOnlineUsers)
      socket.off('message:receive', handleMessage)
      socket.off('message:globalReceive', handleGlobalMessage)
    }
  }, [username])


  useEffect(() => {
    if (!selectedUser || !socket.connected) return

    if (historyLoaded.has(selectedUser)) return

    setLoadingHistory(true)

    if (selectedUser === GLOBAL_KEY) {
      socket.emit('message:globalHistory', (history) => {
        setMessages((prev) => ({
          ...prev,
          [GLOBAL_KEY]: history
        }))
        setHistoryLoaded((prev) => new Set(prev).add(GLOBAL_KEY))
        setLoadingHistory(false)
      })
    } else {
      socket.emit('message:history', { with: selectedUser }, (history) => {
        setMessages((prev) => ({
          ...prev,
          [selectedUser]: history
        }))
        setHistoryLoaded((prev) => new Set(prev).add(selectedUser))
        setLoadingHistory(false)
      })
    }
  }, [selectedUser, username])


  useEffect(() => {
    if (selectedUser) {
      setUnreadFrom((prev) => {
        if (prev.has(selectedUser)) {
          const newSet = new Set(prev)
          newSet.delete(selectedUser)
          return newSet
        }
        return prev
      })
    }
  }, [selectedUser])

  // ===== Event Handlers =====

  function handleJoin(name) {
    setUsername(name)
  }

  function handleSelectUser(user) {
    setSelectedUser(user)
    localStorage.setItem('quickchat-selected', user)

    setUnreadFrom((prev) => {
      const newSet = new Set(prev)
      newSet.delete(user)
      return newSet
    })
  }


  const handleSendMessage = useCallback((text, file) => {
    if (!selectedUser) return


    const hasText = text && text.trim()
    if (!hasText && !file) return

    const payload = { text: hasText ? text.trim() : '' }
    if (file) {
      payload.file = file
    }

    if (selectedUser === GLOBAL_KEY) {
      socket.emit('message:global', payload)
    } else {
      socket.emit('message:private', {
        to: selectedUser,
        ...payload
      })
    }
  }, [selectedUser])

  function handleLogout() {
    localStorage.removeItem('quickchat-username')
    localStorage.removeItem('quickchat-selected')
    setUsername(null)
    setSelectedUser(null)
    setMessages({})
    setOnlineUsers([])
    setUnreadFrom(new Set())
    setHistoryLoaded(new Set())
    socket.disconnect()
  }


  if (!username) {
    return <UsernameScreen onJoin={handleJoin} />
  }

  return (
    <div className="flex h-screen">
      <Sidebar
        onlineUsers={onlineUsers}
        selectedUser={selectedUser}
        onSelectUser={handleSelectUser}
        currentUser={username}
        unreadFrom={unreadFrom}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <ChatWindow
        selectedUser={selectedUser}
        messages={messages[selectedUser] || []}
        onSendMessage={handleSendMessage}
        currentUser={username}
        isGlobal={selectedUser === GLOBAL_KEY}
        loadingHistory={loadingHistory}
      />
    </div>
  )
}

export default App
