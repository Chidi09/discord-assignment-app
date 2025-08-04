// discord-assignment-app/models/Category.js
const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: String,
    handlerType: { type: String, enum: ['comp_sci_helpers', 'external_stem_team', 'ai_misc'], required: true },
    discordChannelId: { type: String, unique: true, sparse: true }, // NEW: Link to Discord channel
});

module.exports = mongoose.model('Category', categorySchema);
