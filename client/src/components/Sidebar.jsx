const GLOBAL_KEY = '__global__'

function Sidebar({ onlineUsers, selectedUser, onSelectUser, currentUser, unreadFrom, onLogout, theme, onToggleTheme }) {
  const otherUsers = onlineUsers.filter((user) => user !== currentUser)

  return (
    <aside className="w-64 bg-dark-900 border-r border-dark-700 flex flex-col h-full shrink-0">
      <div className="p-4 border-b border-dark-700 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-text-primary">💬 Echo</h1>
          <p className="text-xs text-text-muted">
            {currentUser}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            id="theme-toggle"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="text-sm p-1.5 rounded-lg hover:bg-dark-800 cursor-pointer transition-colors"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button
            id="logout-button"
            onClick={onLogout}
            title="Log out"
            className="text-xs text-text-muted hover:text-text-primary cursor-pointer p-1.5"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="px-2 pt-3 pb-1">
        <button
          id="global-chat-button"
          onClick={() => onSelectUser(GLOBAL_KEY)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer
                     text-left transition-colors
                     ${selectedUser === GLOBAL_KEY
                       ? 'bg-dark-800'
                       : 'hover:bg-dark-800'
                     }`}
        >
          <span className="text-lg">🌍</span>
          <div>
            <p className="text-sm font-medium text-text-primary">Global Chat</p>
            <p className="text-xs text-text-muted">Everyone</p>
          </div>
          {unreadFrom.has(GLOBAL_KEY) && (
            <span className="w-2 h-2 bg-accent-300 rounded-full ml-auto" />
          )}
        </button>
      </div>

      <div className="mx-4 my-1 border-t border-dark-700" />

      <div className="px-4 pt-2 pb-1">
        <p className="text-xs text-text-muted uppercase">
          Online — {otherUsers.length}
        </p>
      </div>

      <ul className="flex-1 overflow-y-auto px-2">
        {otherUsers.length === 0 ? (
          <li className="px-3 py-4 text-center text-sm text-text-muted">
            No one else is online
          </li>
        ) : (
          otherUsers.map((user) => (
            <li
              key={user}
              id={`user-${user}`}
              onClick={() => onSelectUser(user)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer
                         transition-colors
                         ${user === selectedUser ? 'bg-dark-800' : 'hover:bg-dark-800'}`}
            >
              <div className="w-8 h-8 rounded-full bg-accent-500 flex items-center justify-center
                              text-xs font-bold text-white">
                {user[0].toUpperCase()}
              </div>
              <span className="text-sm text-text-primary">{user}</span>
              {unreadFrom.has(user) && (
                <span className="w-2 h-2 bg-accent-300 rounded-full ml-auto" />
              )}
            </li>
          ))
        )}
      </ul>
    </aside>
  )
}

export default Sidebar
