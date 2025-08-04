// discord-assignment-app/scripts/seed-categories.js

// Load environment variables from .env file
require('dotenv').config({ path: './.env' });

const mongoose = require('mongoose');
const Category = require('../models/Category'); // Adjust path if your models folder is different

async function seedCategories() {
    // Ensure MongoDB is connected
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/assignment_platform');
        console.log('MongoDB connected successfully for category seeding.');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1); // Exit if connection fails
    }

    const categoriesToSeed = [
        {
            name: 'python-help',
            description: 'Assignments related to Python programming.',
            handlerType: 'comp_sci_helpers',
            discordChannelId: null // Will be created dynamically by bot if not set
        },
        {
            name: 'java-help',
            description: 'Assignments related to Java programming.',
            handlerType: 'comp_sci_helpers',
            discordChannelId: null // Will be created dynamically by bot if not set
        },
        {
            name: 'rstudio-help',
            description: 'Assignments related to RStudio and R programming.',
            handlerType: 'comp_sci_helpers',
            discordChannelId: null // Will be created dynamically by bot if not set
        },
        {
            name: 'matlab-help',
            description: 'Assignments related to MATLAB programming.',
            handlerType: 'comp_sci_helpers',
            discordChannelId: null // Will be created dynamically by bot if not set
        },
        {
            name: 'mathematics-help',
            description: 'Assignments related to various mathematics topics.',
            handlerType: 'external_stem_team',
            discordChannelId: null // Will be created dynamically by bot if not set
        },
        {
            name: 'physics-help',
            description: 'Assignments related to physics topics.',
            handlerType: 'external_stem_team',
            discordChannelId: null // Will be created dynamically by bot if not set
        },
        {
            name: 'general', // For general assignments not fitting specific categories
            description: 'General assignment inquiries.',
            handlerType: 'ai_misc', // Or whatever handler type makes sense
            discordChannelId: '1395552389054070849' // Your provided ID for the general channel
        },
        // Add more categories as needed, setting discordChannelId to null if bot should create it
    ];

    console.log('Starting to seed categories...');
    for (const categoryData of categoriesToSeed) {
        try {
            // Find and update if exists, otherwise create new
            // We use upsert:true to either insert if not found or update if found
            const category = await Category.findOneAndUpdate(
                { name: categoryData.name },
                {
                    $set: {
                        description: categoryData.description,
                        handlerType: categoryData.handlerType,
                        // Only set discordChannelId if it's explicitly provided in categoryData
                        // This prevents overwriting existing IDs with null if the bot has already set one
                        ...(categoryData.discordChannelId !== null && { discordChannelId: categoryData.discordChannelId })
                    }
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            console.log(`Category "${category.name}" seeded/updated with ID: ${category._id}. Discord Channel ID: ${category.discordChannelId || 'Will be created dynamically'}`);
        } catch (error) {
            console.error(`Error seeding category "${categoryData.name}":`, error.message);
        }
    }
    console.log('Category seeding complete.');

    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
}

// Execute the seeding function
seedCategories();
