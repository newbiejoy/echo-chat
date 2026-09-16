const mongoose = require('mongoose')

const messageSchema = new mongoose.Schema({
  from: { type: String, required: true },
  to: { type: String, required: true },
  text: { type: String, default: '' },
  time: { type: String, required: true },
  file: {
    url: String,
    name: String,
    type: String
  },
  createdAt: { type: Date, default: Date.now }
})

messageSchema.index({ from: 1, to: 1 })
messageSchema.index({ to: 1 })

const Message = mongoose.model('Message', messageSchema)

module.exports = Message
