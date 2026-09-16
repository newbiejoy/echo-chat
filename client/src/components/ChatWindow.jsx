/*
  ChatWindow component.
  Shows messages and the input bar for sending text messages and files.
  
  File sharing flow:
  1. User clicks the attach button (📎) and picks a file
  2. File is uploaded to the server via POST /upload
  3. Server returns the file URL and metadata
  4. We emit a Socket.IO message with the file info attached
  5. The recipient sees the image inline or a PDF download link
*/

import { useState, useEffect, useRef, useCallback } from 'react'

// Server URL for file uploads
const SERVER_URL = 'http://localhost:5000'

function ChatWindow({ selectedUser, messages, onSendMessage, onDeleteMessage, currentUser, isGlobal, loadingHistory }) {
  const [inputText, setInputText] = useState('')
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)

  // Track file upload state
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  // Context menu state for "Delete for Everyone"
  const [contextMenu, setContextMenu] = useState(null) // { x, y, messageId }

  // Auto-scroll to bottom when new messages come in
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Close context menu when clicking anywhere
  useEffect(() => {
    function handleClick() {
      setContextMenu(null)
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  function handleSend() {
    if (!inputText.trim()) return
    onSendMessage(inputText)
    setInputText('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  /*
    Handle file selection.
    
    1. Upload the file to the server using fetch + FormData
    2. On success, call onSendMessage with the file info
    3. The message will contain a file object: { url, name, type }
  */
  async function handleFileSelect(e) {
    const file = e.target.files[0]
    if (!file) return

    // Reset the file input so the same file can be selected again
    e.target.value = ''

    // Validate file size on the client too (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File is too large. Max size is 5MB.')
      setTimeout(() => setUploadError(''), 3000)
      return
    }

    setIsUploading(true)
    setUploadError('')

    try {
      // FormData lets us send files via HTTP (multipart/form-data)
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${SERVER_URL}/upload`, {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed')
      }

      // Send a message with the file attachment
      onSendMessage('', {
        url: result.url,
        name: result.name,
        type: result.type
      })
    } catch (err) {
      setUploadError(err.message || 'Failed to upload file')
      setTimeout(() => setUploadError(''), 3000)
    } finally {
      setIsUploading(false)
    }
  }

  /**
   * Right-click handler for messages — shows context menu with "Delete for Everyone"
   */
  const handleContextMenu = useCallback((e, msg) => {
    if (msg.from !== currentUser) return // Only allow deleting own messages
    e.preventDefault()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      messageId: msg._id
    })
  }, [currentUser])

  /**
   * Delete button click — quick delete via the trash icon
   */
  const handleDelete = useCallback((messageId) => {
    onDeleteMessage(messageId)
    setContextMenu(null)
  }, [onDeleteMessage])

  // No user selected — show empty state
  if (!selectedUser) {
    return (
      <main className="flex-1 flex items-center justify-center bg-dark-950">
        <div className="text-center text-text-muted">
          <p className="text-3xl mb-2">💬</p>
          <p className="text-sm">Select a chat to start messaging</p>
        </div>
      </main>
    )
  }

  const displayName = isGlobal ? '🌍 Global Chat' : selectedUser

  return (
    <main className="flex-1 flex flex-col bg-dark-950 h-full relative">
      {/* Chat header */}
      <div className="px-5 py-3 bg-dark-900 border-b border-dark-700 flex items-center gap-3">
        {!isGlobal && (
          <div className="w-8 h-8 rounded-full bg-accent-500 flex items-center justify-center
                          text-xs font-bold text-white">
            {selectedUser[0].toUpperCase()}
          </div>
        )}
        <p className="text-sm font-semibold text-text-primary">{displayName}</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
        {loadingHistory && (
          <p className="text-center text-xs text-text-muted py-2">Loading messages...</p>
        )}

        {!loadingHistory && messages.length === 0 && (
          <p className="text-center text-sm text-text-muted mt-8">
            No messages yet. Say hi! 👋
          </p>
        )}

        {messages.map((msg, index) => {
          const isOwn = msg.from === currentUser

          return (
            <div
              key={msg._id || index}
              className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group`}
              onContextMenu={(e) => handleContextMenu(e, msg)}
            >
              {/* Delete button — visible on hover for own messages */}
              {isOwn && msg._id && (
                <button
                  onClick={() => handleDelete(msg._id)}
                  title="Delete for everyone"
                  className="self-center mr-1 p-1 rounded-md opacity-0 group-hover:opacity-100
                             text-text-muted hover:text-red-400 hover:bg-dark-800
                             transition-all duration-150 cursor-pointer text-xs"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.519.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                  </svg>
                </button>
              )}

              <div
                className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                  isOwn
                    ? 'bg-bubble-own'
                    : 'bg-bubble-other'
                }`}
              >
                {/* Show sender name in global chat or for other people's messages */}
                {(isGlobal || !isOwn) && (
                  <p className="text-xs font-semibold text-accent-300 mb-0.5">
                    {isOwn ? 'You' : msg.from}
                  </p>
                )}

                {/* File attachment display */}
                {msg.file && (
                  <FilePreview file={msg.file} />
                )}

                {/* Text content (only show if there's actual text) */}
                {msg.text && (
                  <p className="text-text-primary">{msg.text}</p>
                )}

                <p className="text-[10px] text-text-muted mt-0.5 text-right">{msg.time}</p>
              </div>
            </div>
          )
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Context menu for "Delete for Everyone" */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-dark-900 border border-dark-700 rounded-lg shadow-xl py-1 min-w-[180px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleDelete(contextMenu.messageId)}
            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-dark-800
                       transition-colors cursor-pointer flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.519.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
            </svg>
            Delete for Everyone
          </button>
        </div>
      )}

      {/* Upload error banner */}
      {uploadError && (
        <div className="px-4 py-2 bg-red-900/30 border-t border-red-800 text-red-300 text-xs text-center">
          {uploadError}
        </div>
      )}

      {/* Input bar */}
      <div className="px-4 py-3 bg-dark-900 border-t border-dark-700">
        <div className="flex gap-2 items-center">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Attach button */}
          <button
            id="attach-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            title="Attach image or PDF"
            className="text-text-muted hover:text-text-primary p-2 rounded-lg
                       hover:bg-dark-800 transition-colors cursor-pointer
                       disabled:opacity-50"
          >
            {isUploading ? (
              <span className="text-sm">⏳</span>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M15.621 4.379a3 3 0 0 0-4.242 0l-7 7a3 3 0 0 0 4.241 4.243h.001l.497-.5a.75.75 0 0 1 1.064 1.057l-.498.501-.002.002a4.5 4.5 0 0 1-6.364-6.364l7-7a4.5 4.5 0 0 1 6.368 6.36l-3.455 3.553A2.625 2.625 0 1 1 9.52 9.52l3.45-3.451a.75.75 0 1 1 1.061 1.06l-3.45 3.451a1.125 1.125 0 0 0 1.587 1.595l3.454-3.553a3 3 0 0 0 0-4.242Z" clipRule="evenodd" />
              </svg>
            )}
          </button>

          {/* Text input */}
          <input
            id="message-input"
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 bg-dark-800 text-text-primary text-sm rounded-lg px-4 py-2.5
                       border border-dark-700 outline-none placeholder:text-text-muted
                       focus:border-accent-500 transition-colors"
          />

          {/* Send button */}
          <button
            id="send-button"
            onClick={handleSend}
            disabled={!inputText.trim()}
            className="bg-accent-500 hover:bg-accent-400 disabled:opacity-50
                       text-white text-sm px-4 py-2.5 rounded-lg
                       transition-colors cursor-pointer"
          >
            Send
          </button>
        </div>
      </div>
    </main>
  )
}

/*
  FilePreview component.
  
  Renders uploaded files differently based on type:
  - Images: shown inline with a click-to-open-full-size link
  - PDFs: shown as a download link with a file icon
*/
function FilePreview({ file }) {
  const isImage = file.type?.startsWith('image/')

  if (isImage) {
    return (
      <a href={file.url} target="_blank" rel="noopener noreferrer" className="block mb-1">
        <img
          src={file.url}
          alt={file.name || 'Shared image'}
          className="max-w-full rounded-md max-h-48 object-cover"
          loading="lazy"
        />
      </a>
    )
  }

  // PDF or other file — show as download link
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-3 py-2 bg-dark-700/50 rounded-md mb-1
                 hover:bg-dark-700 transition-colors"
    >
      <span className="text-lg">📄</span>
      <span className="text-xs text-accent-300 underline truncate">
        {file.name || 'Download file'}
      </span>
    </a>
  )
}

export default ChatWindow
