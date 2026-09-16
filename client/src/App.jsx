

import { useState, useEffect, useCallback, useRef } from 'react'
import { socket } from './socket'
import UsernameScreen from './components/UsernameScreen'
import Sidebar from './components/Sidebar'
import ChatWindow from './components/ChatWindow'

/**
 * Merge history messages with any real-time messages already in state.
 * Deduplicates by _id. History comes first, then any real-time messages
 * that weren't in the history (i.e., arrived after the DB query ran).
 */
function mergeMessages(historyMessages, existingMessages) {
  const seenIds = new Set()
  const merged = []

  // Add all history messages first
  for (const msg of historyMessages) {
    if (msg._id) seenIds.add(msg._id)
    merged.push(msg)
  }

  // Then add any existing real-time messages that aren't already in history
  for (const msg of existingMessages) {
    if (msg._id && seenIds.has(msg._id)) continue // Skip duplicates
    merged.push(msg)
  }

  return merged
}

// Special key for the global chat conversation
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

      setMessages((prev) => {
        const existing = prev[partner] || []
        // Skip if we already have this message (by _id)
        if (message._id && existing.some((m) => m._id === message._id)) {
          return prev
        }
        return {
          ...prev,
          [partner]: [...existing, message]
        }
      })

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
      setMessages((prev) => {
        const existing = prev[GLOBAL_KEY] || []
        // Skip if we already have this message (by _id)
        if (message._id && existing.some((m) => m._id === message._id)) {
          return prev
        }
        return {
          ...prev,
          [GLOBAL_KEY]: [...existing, message]
        }
      })

      if (message.from !== username && selectedUserRef.current !== GLOBAL_KEY) {
        setUnreadFrom((prev) => {
          const newSet = new Set(prev)
          newSet.add(GLOBAL_KEY)
          return newSet
        })
      }
    }

    // Message deleted by sender (for everyone)
    function handleMessageDeleted({ messageId, chatPartner }) {
      setMessages((prev) => {
        const key = chatPartner
        if (!prev[key]) return prev
        return {
          ...prev,
          [key]: prev[key].filter((msg) => msg._id !== messageId)
        }
      })
    }

    socket.on('users:online', handleOnlineUsers)
    socket.on('message:receive', handleMessage)
    socket.on('message:globalReceive', handleGlobalMessage)
    socket.on('message:deleted', handleMessageDeleted)

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
      socket.off('message:deleted', handleMessageDeleted)
    }
  }, [username])


  useEffect(() => {
    if (!selectedUser || !socket.connected) return

    if (historyLoaded.has(selectedUser)) return

    setLoadingHistory(true)

    if (selectedUser === GLOBAL_KEY) {
      // Load global chat history — merge with any real-time messages
      socket.emit('message:globalHistory', (history) => {
        setMessages((prev) => ({
          ...prev,
          [GLOBAL_KEY]: mergeMessages(history, prev[GLOBAL_KEY] || [])
        }))
        setHistoryLoaded((prev) => new Set(prev).add(GLOBAL_KEY))
        setLoadingHistory(false)
      })
    } else {
      // Load private chat history — merge with any real-time messages
      socket.emit('message:history', { with: selectedUser }, (history) => {
        setMessages((prev) => ({
          ...prev,
          [selectedUser]: mergeMessages(history, prev[selectedUser] || [])
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

  /**
   * Delete a message for everyone.
   * Only the sender's own messages can be deleted.
   */
  const handleDeleteMessage = useCallback((messageId) => {
    if (!selectedUser || !messageId) return

    const chatPartner = selectedUser === GLOBAL_KEY ? '__global__' : selectedUser
    socket.emit('message:delete', { messageId, chatPartner })
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
        onDeleteMessage={handleDeleteMessage}
        currentUser={username}
        isGlobal={selectedUser === GLOBAL_KEY}
        loadingHistory={loadingHistory}
      />
    </div>
  )
}

export default App
