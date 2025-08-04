// discord-assignment-app/register-jolomi.js (or discord-assignment-app/scripts/register-jolomi.js)

// Load environment variables from .env file
require('dotenv').config({ path: './.env' });

const mongoose = require('mongoose');
const { ensureJolomiAdminExists } = require('./adminUtils'); // Adjust path if you put it in utils/

async function runRegistration() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/assignment_platform');
        console.log('MongoDB connected successfully for CLI script.');

        // Run the Jolomi admin creation/update logic
        await ensureJolomiAdminExists();

        console.log('Jolomi admin registration/update process completed.');
    } catch (error) {
        console.error('CLI script error:', error);
        process.exitCode = 1; // Indicate failure
    } finally {
        // Disconnect from MongoDB
        await mongoose.disconnect();
        console.log('MongoDB disconnected.');
    }
}

// Execute the function
runRegistration();
