// discord-assignment-app/models/User.js

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    discordId: { type: String, unique: true, sparse: true }, // Discord ID, unique if present
    username: { type: String, required: true, unique: true },
    password: { type: String, select: false }, // Store hashed password, don't return by default
    email: { type: String, unique: true, sparse: true }, // Email from Discord or local registration
    avatarUrl: String, // Discord avatar URL
    roles: [{ type: String, enum: ['client', 'helper', 'admin'], default: 'client' }],
    isAdmin: { type: Boolean, default: false },
    authType: { type: String, enum: ['discord', 'local'], required: true }, // How the user registered
    isActive: { type: Boolean, default: true }, // For admin to activate/deactivate users

    // Helper-specific fields
    region: { type: String, enum: ['local', 'foreign'], default: 'local' }, // New: Region for payment
    walletType: { type: String }, // New: Type of wallet (e.g., Opay, PayPal, BTC)
    specializedCategories: [{ type: String }], // Array of category names helper specializes in
    totalEarnings: { type: Number, default: 0 }, // Total amount earned by helper

    // Specific payment details based on region/walletType
    accountNumber: { type: String, sparse: true }, // For local (Opay/Palmpay)
    accountName: { type: String, sparse: true },   // For local (Opay/Palmpay)
    paypalEmail: { type: String, sparse: true },   // For foreign (PayPal)
    cashAppTag: { type: String, sparse: true },     // For foreign (CashApp)
    cryptoWalletAddress: { type: String, sparse: true }, // For foreign (Crypto)
    cryptoNetwork: { type: String, sparse: true },       // For foreign (Crypto, e.g., BTC, USDT)

}, { timestamps: true });

// Check if the model already exists before compiling it to prevent OverwriteModelError
module.exports = mongoose.models.User || mongoose.model('User', userSchema);
