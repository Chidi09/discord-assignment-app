// discord-assignment-app/models/User.js

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    discordId: { type: String },
    username: { type: String, required: true, unique: true },
    email: { type: String, unique: true, sparse: true },
    password: { type: String, select: false },
    avatarUrl: String,
    roles: { type: [String], default: ['client'] },
    isAdmin: { type: Boolean, default: false },
    walletAddress: String,
    walletType: String,
    specializedCategories: { type: [String], default: [] },
    authType: { type: String, enum: ['discord', 'local'], required: true },
    isActive: { type: Boolean, default: true },
    totalEarnings: { type: Number, default: 0 },
    region: { type: String, enum: ['local', 'foreign'], required: false }, // NEW FIELD: 'local' for Opay/Palmpay, 'foreign' for others
});

// Corrected index: Add sparse: true to allow multiple null discordId values
userSchema.index({ discordId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('User', userSchema);
