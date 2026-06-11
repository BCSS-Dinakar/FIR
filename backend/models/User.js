const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  badge: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  mobile: {
    type: String,
    required: true,
    trim: true
  },
  station: {
    type: String,
    required: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  rank: {
    type: String,
    default: 'Inspector'
  },
  state: {
    type: String,
    default: 'Telangana'
  },
  district: {
    type: String,
    default: 'Hyderabad'
  },
  lastLogin: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Hash password before saving to database
UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (err) {
    throw err;
  }
});

// Match user-entered password to hashed password in database
UserSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
