const dns = require('dns')
dns.setServers(['8.8.8.8', '8.8.4.4'])

require('dotenv').config()

const express = require('express')
const { createServer } = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const mongoose = require('mongoose')
const path = require('path')
const fs = require('fs')
const multer = require('multer')
const Message = require('./models/Message')

const uploadsDir = path.join(__dirname, 'uploads')
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir)
}

const app = express()
const PORT = process.env.PORT || 5000
const CLIENT_URL = (process.env.CLIENT_URL || 'http://localhost:5173').trim()

const httpServer = createServer(app)

const allowedOrigins = [
  'http://localhost:5173',
  'https://chat-app-will-name-it-later.vercel.app',
  'https://chat-app-will-name-it-later-git-main-newbiejoys-projects.vercel.app'
]

function corsOriginCheck(origin, callback) {
  if (!origin) return callback(null, true)

  const isAllowedList = allowedOrigins.includes(origin)
  const isVercelPreview = /^https:\/\/chat-app-will-name-it-later.*\.vercel\.app$/.test(origin)

  if (isAllowedList || isVercelPreview) {
    callback(null, true)
  } else {
    callback(new Error(`Not allowed by CORS: ${origin}`))
  }
}

const io = new Server(httpServer, {
  cors: {
    origin: corsOriginCheck,
    methods: ['GET', 'POST']
  }
})

app.use(cors({ origin: corsOriginCheck }))


/*
  Serve uploaded files statically.
  A file saved at server/uploads/abc123.png will be accessible at:
  http://localhost:5000/uploads/abc123.png
*/
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

app.get('/', (req, res) => {
  res.json({ message: 'QuickChat server is running' })
})

/*
  Multer configuration for file uploads.
  
  - storage: saves files to server/uploads/ with a unique name
  - limits: max 5MB per file (keeps things simple and prevents abuse)
  - fileFilter: only allow images (jpg, png, gif, webp) and PDFs
*/
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads'))
  },
  filename: (req, file, cb) => {
    // Create a unique filename: timestamp-randomNumber.extension
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9)
    const ext = path.extname(file.originalname)
    cb(null, uniqueName + ext)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Only images (JPG, PNG, GIF, WebP) and PDFs are allowed.'))
    }
  }
})

/*
  POST /upload — Upload a file.
  
  The client sends a multipart form with a single file field named "file".
  On success, returns the file URL and metadata.
*/
app.post('/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      // Multer error (file too large, wrong type, etc.)
      return res.status(400).json({ error: err.message })
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' })
    }

    // Build the public URL for the uploaded file
    const baseUrl = (process.env.SERVER_URL || `http://localhost:${PORT}`).trim()
    const fileUrl = `${baseUrl}/uploads/${req.file.filename}`


    res.json({
      url: fileUrl,
      name: req.file.originalname,
      type: req.file.mimetype
    })
  })
})


// In-memory storage for online users
const onlineUsers = new Map()
const socketToUser = new Map()


function getOnlineUsersList() {
  return Array.from(onlineUsers.keys())
}


mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB Atlas')
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message)
    console.warn('⚠ Server will continue without database — messages won\'t be saved')
  })


io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`)


  socket.on('user:join', (username, callback) => {
    const trimmed = username?.trim()

    if (!trimmed || trimmed.length < 1 || trimmed.length > 20) {
      callback({ success: false, error: 'Username must be 1–20 characters.' })
      return
    }

    if (onlineUsers.has(trimmed) && onlineUsers.get(trimmed) !== socket.id) {
      callback({ success: false, error: 'Username is already taken.' })
      return
    }

    onlineUsers.set(trimmed, socket.id)
    socketToUser.set(socket.id, trimmed)

    socket.join('global')

    console.log(`User joined: ${trimmed} (${socket.id})`)
    const usersList = getOnlineUsersList()
    io.emit('users:online', usersList)
    callback({ success: true, users: usersList })
  })

  
  socket.on('message:private', async (data) => {
    const senderUsername = socketToUser.get(socket.id)
    if (!senderUsername) return

    // Basic validation
    if (!data.to || typeof data.to !== 'string') return

    // A message must have either text or a file (or both)
    const hasText = data.text && typeof data.text === 'string' && data.text.trim()
    const hasFile = data.file && data.file.url
    if (!hasText && !hasFile) return

    const recipientSocketId = onlineUsers.get(data.to)

    const message = {
      from: senderUsername,
      to: data.to,
      text: data.text || '',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    // Attach file metadata if present
    if (hasFile) {
      message.file = {
        url: data.file.url,
        name: data.file.name,
        type: data.file.type
      }
    }

    // Save to MongoDB first so we get a real _id
    if (mongoose.connection.readyState === 1) {
      try {
        const saved = await Message.create(message)
        message._id = saved._id.toString()
      } catch (err) {
        console.error('Failed to save message:', err.message)
        // Generate a temporary ID so client can still track the message
        message._id = 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2)
      }
    } else {
      message._id = 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2)
    }

    // Send to recipient (if online)
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('message:receive', message)
    }

    // Send back to sender
    socket.emit('message:receive', message)
  })

  /*
    "message:global" — A user sends a message to the global chat room.
    
    Data shape: { text: "message content" }
    
    Broadcasts to ALL connected users and saves to the database.
    We use to: "__global__" to distinguish global messages from private ones.
  */
  socket.on('message:global', async (data) => {
    const senderUsername = socketToUser.get(socket.id)
    if (!senderUsername) return

    // A message must have either text or a file (or both)
    const hasText = data.text && typeof data.text === 'string' && data.text.trim()
    const hasFile = data.file && data.file.url
    if (!hasText && !hasFile) return

    const message = {
      from: senderUsername,
      to: '__global__',
      text: data.text || '',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    // Attach file metadata if present
    if (hasFile) {
      message.file = {
        url: data.file.url,
        name: data.file.name,
        type: data.file.type
      }
    }

    // Save to MongoDB first so we get a real _id
    if (mongoose.connection.readyState === 1) {
      try {
        const saved = await Message.create(message)
        message._id = saved._id.toString()
      } catch (err) {
        console.error('Failed to save global message:', err.message)
        message._id = 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2)
      }
    } else {
      message._id = 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2)
    }

    // Broadcast to ALL connected users (including sender)
    io.emit('message:globalReceive', message)
  })

  /*
    "message:history" — Load past messages between two users.
    
    Data shape: { with: "otherUsername" }
    
    Returns the last 50 messages between the requesting user and the other user.
    We query for messages where (from=me, to=them) OR (from=them, to=me).
  */
  socket.on('message:history', async (data, callback) => {
    const myUsername = socketToUser.get(socket.id)
    if (!myUsername) {
      callback([])
      return
    }

    // If MongoDB isn't connected, return empty (don't hang)
    if (mongoose.connection.readyState !== 1) {
      callback([])
      return
    }

    try {
      const messages = await Message.find({
        $or: [
          { from: myUsername, to: data.with },
          { from: data.with, to: myUsername }
        ]
      })
        .sort({ createdAt: 1 })  // Oldest first
        .limit(50)
        .lean()  // Return plain objects instead of Mongoose documents

      // Send back only the fields the client needs
      const cleaned = messages.map((msg) => ({
        _id: msg._id.toString(),
        from: msg.from,
        to: msg.to,
        text: msg.text,
        time: msg.time,
        ...(msg.file && { file: msg.file })
      }))

      callback(cleaned)
    } catch (err) {
      console.error('Failed to load history:', err.message)
      callback([])
    }
  })

  /*
    "message:globalHistory" — Load past global chat messages.
    
    Returns the last 50 global messages (where to === "__global__").
  */
  socket.on('message:globalHistory', async (callback) => {
    // If MongoDB isn't connected, return empty (don't hang)
    if (mongoose.connection.readyState !== 1) {
      callback([])
      return
    }

    try {
      const messages = await Message.find({ to: '__global__' })
        .sort({ createdAt: 1 })
        .limit(50)
        .lean()

      const cleaned = messages.map((msg) => ({
        _id: msg._id.toString(),
        from: msg.from,
        to: msg.to,
        text: msg.text,
        time: msg.time,
        ...(msg.file && { file: msg.file })
      }))

      callback(cleaned)
    } catch (err) {
      console.error('Failed to load global history:', err.message)
      callback([])
    }
  })

  /*
    "message:delete" — Delete a message for everyone.
    
    Data shape: { messageId: "abc123", chatPartner: "username" or "__global__" }
    
    Only the sender of the message can delete it.
    Removes from DB and notifies all relevant users.
  */
  socket.on('message:delete', async (data) => {
    const myUsername = socketToUser.get(socket.id)
    if (!myUsername) return

    const { messageId, chatPartner } = data
    if (!messageId || !chatPartner) return

    // Temporary IDs (messages not saved to DB) — just broadcast deletion
    if (messageId.startsWith('tmp_')) {
      if (chatPartner === '__global__') {
        io.emit('message:deleted', { messageId, chatPartner })
      } else {
        socket.emit('message:deleted', { messageId, chatPartner })
        const recipientSocketId = onlineUsers.get(chatPartner)
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('message:deleted', { messageId, chatPartner: myUsername })
        }
      }
      return
    }

    if (mongoose.connection.readyState !== 1) return

    try {
      // Find the message and verify the sender owns it
      const msg = await Message.findById(messageId)
      if (!msg) return
      if (msg.from !== myUsername) return  // Only sender can delete

      await Message.findByIdAndDelete(messageId)

      if (chatPartner === '__global__') {
        // Broadcast to everyone for global messages
        io.emit('message:deleted', { messageId, chatPartner: '__global__' })
      } else {
        // Notify both sender and recipient for private messages
        socket.emit('message:deleted', { messageId, chatPartner })
        const recipientSocketId = onlineUsers.get(msg.to === myUsername ? msg.from : msg.to)
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('message:deleted', { messageId, chatPartner: myUsername })
        }
      }
    } catch (err) {
      console.error('Failed to delete message:', err.message)
    }
  })

  /*
    "disconnect" — Clean up when a user leaves.
  */
  socket.on('disconnect', () => {
    const username = socketToUser.get(socket.id)

    if (username) {
      onlineUsers.delete(username)
      socketToUser.delete(socket.id)
      console.log(`User left: ${username}`)
      io.emit('users:online', getOnlineUsersList())
    }

    console.log(`Socket disconnected: ${socket.id}`)
  })
})

// Start the HTTP server
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
