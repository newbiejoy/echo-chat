import { useState } from 'react'
import { socket } from '../socket'

function UsernameScreen({ onJoin }) {
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const trimmed = username.trim()
    if (!trimmed) {
      setError('Please enter a username.')
      return
    }

    setIsLoading(true)

    if (socket.connected) {
      joinWithUsername(trimmed)
    } else {
      socket.connect()
      socket.once('connect', () => {
        joinWithUsername(trimmed)
      })
    }
  }

  function joinWithUsername(trimmed) {
    socket.emit('user:join', trimmed, (response) => {
      setIsLoading(false)

      if (response.success) {
        localStorage.setItem('quickchat-username', trimmed)
        onJoin(trimmed)
      } else {
        setError(response.error)
      }
    })
  }

  return (
    <div className="h-screen flex items-center justify-center bg-dark-950">
      <div className="w-full max-w-sm mx-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-text-primary">
            💬 QuickChat
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Enter a username to start chatting
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            id="username-input"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Choose a username..."
            maxLength={20}
            autoFocus
            className="w-full bg-dark-800 text-text-primary text-sm rounded-lg px-4 py-3
                       border border-dark-700 outline-none
                       placeholder:text-text-muted
                       focus:border-accent-500 transition-colors"
          />

          {error && (
            <p className="text-red-400 text-xs mt-2">{error}</p>
          )}

          <button
            id="join-button"
            type="submit"
            disabled={isLoading || !username.trim()}
            className="w-full mt-3 bg-accent-500 hover:bg-accent-400 disabled:opacity-50
                       disabled:cursor-not-allowed text-white text-sm font-medium
                       py-3 rounded-lg transition-colors cursor-pointer"
          >
            {isLoading ? 'Joining...' : 'Join Chat'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default UsernameScreen
