    // index.js

    // Load environment variables from .env file
    // Explicitly specify the path to .env for robustness
    require('dotenv').config({ path: './.env' });

    // DEBUG: Log the MONGODB_URI immediately after dotenv loads
    console.log('DEBUG: MONGODB_URI loaded from .env:', process.env.MONGODB_URI ? 'Loaded (not undefined)' : 'Undefined');


    // Import necessary modules
    const express = require('express');
    const mongoose = require('mongoose'); // Import Mongoose
    // Added ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, ActionRowBuilder, TextInputStyle, ApplicationCommandOptionType
    const { Client, GatewayIntentBits, Partials, Collection, Routes, ChannelType, PermissionsBitField, MessageFlags,
        ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, ActionRowBuilder, TextInputStyle, ApplicationCommandOptionType } = require('discord.js');
    const { REST } = require('@discordjs/rest');
    const axios = require('axios');
    const cron = require('node-cron'); // Import node-cron
    const cors = require('cors'); // Import cors middleware
    const multer = require('multer'); // Import multer for file uploads
    const path = require('path'); // Import path module for file paths
    const fs = require('fs').promises; // Use promise-based fs for async operations
    const bcrypt = require('bcryptjs'); // Import bcryptjs for password hashing
    const jwt = require('jsonwebtoken'); // Import jsonwebtoken for JWTs

    // Import YOUR custom summarizer module (installed as a local dependency)
    const summarizeText = require('./summarizer/src'); // or src/index if needed

    // Import admin utility functions
    const { ensureAdminsExist } = require('./adminUtils'); // Corrected import name


    // Import Mongoose Models
    const User = require('./models/User'); // Import the User model
    const Category = require('./models/Category'); // Import the Category model
    const Assignment = require('./models/Assignment'); // Import the Assignment model


    // Initialize Express app
    const app = express();
    const PORT = process.env.PORT || 3000;

    // Middleware
    app.use(cors()); // Enable CORS for all routes
    app.use(express.json()); // Enable JSON body parsing
    app.use(express.urlencoded({ extended: true })); // Enable URL-encoded body parsing

    // Ensure 'uploads' directory exists
    const uploadsDir = path.join(__dirname, 'uploads');
    fs.mkdir(uploadsDir, { recursive: true }).catch(console.error);

    // Multer setup for file uploads (for web app routes, Discord attachments are handled separately)
    const upload = multer({ dest: 'uploads/' }); // Files will be stored in the 'uploads/' directory

    // Serve static files from the 'uploads' directory
    app.use('/uploads', express.static(uploadsDir));

    // MongoDB Connection
    mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/assignment_platform')
        .then(() => {
            console.log('MongoDB connected successfully.');
            // After successful MongoDB connection, ensure admin users exist
            ensureAdminsExist(process.env.MY_DISCORD_ID, process.env.JOLOMI_DISCORD_ID); // Pass both admin IDs
        })
        .catch(err => console.error('MongoDB connection error:', err));

    // Mongoose Schemas and Models (Settings, PayoutTransaction remain here)
    const settingsSchema = new mongoose.Schema({
        name: { type: String, unique: true, required: true }, // e.g., 'global_settings'
        helperRegistrationOpen: { type: Boolean, default: true },
    });

    const payoutTransactionSchema = new mongoose.Schema({
        assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
        helperId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        amount: { type: Number, required: true },
        transactionId: { type: String, required: true }, // ID from the payment gateway
        notes: String,
        paidAt: { type: Date, default: Date.now },
    });

    const Settings = mongoose.model('Settings', settingsSchema);
    const PayoutTransaction = mongoose.model('PayoutTransaction', payoutTransactionSchema);

    // Discord Bot Setup (if applicable)
    const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
    const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
    const GUILD_ID = process.env.MAIN_GUILD_ID;
    const DISCORD_REDIRECT_URI_FRONTEND = process.env.FRONTEND_URL + '/auth/discord/callback';
    const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
    const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL; // For generic notifications

    // Discord Category ID for Tickets - Updated to the provided ID
    const DISCORD_TICKET_CATEGORY_ID = '1397348117497516234'; // Provided by user

    // DEBUG: Log Discord environment variables
    console.log('DEBUG: DISCORD_BOT_TOKEN:', DISCORD_BOT_TOKEN ? 'Loaded' : 'Undefined');
    console.log('DEBUG: CLIENT_ID (from DISCORD_CLIENT_ID):', CLIENT_ID ? 'Loaded' : 'Undefined');
    console.log('DEBUG: GUILD_ID (from MAIN_GUILD_ID):', GUILD_ID ? 'Loaded' : 'Undefined');
    console.log('DEBUG: DISCORD_REDIRECT_URI_FRONTEND:', DISCORD_REDIRECT_URI_FRONTEND ? 'Loaded' : 'Undefined');
    console.log('DEBUG: DISCORD_CLIENT_SECRET:', DISCORD_CLIENT_SECRET ? 'Loaded' : 'Undefined');
    console.log('DEBUG: DISCORD_WEBHOOK_URL:', DISCORD_WEBHOOK_URL ? 'Loaded' : 'Undefined');
    console.log('DEBUG: DISCORD_TICKET_CATEGORY_ID:', DISCORD_TICKET_CATEGORY_ID ? 'Loaded' : 'Undefined');


    // DEBUG: Log Admin Discord IDs
    console.log('DEBUG: MY_DISCORD_ID:', process.env.MY_DISCORD_ID ? 'Loaded' : 'Undefined');
    console.log('DEBUG: JOLOMI_DISCORD_ID:', process.env.JOLOMI_DISCORD_ID ? 'Loaded' : 'Undefined');


    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMembers, // Essential for fetching guild members
            GatewayIntentBits.DirectMessages,
        ],
        partials: [Partials.Channel],
    });

    client.commands = new Collection();

    // Define Discord slash commands for this bot's specific role
    const commands = [
        {
            name: 'ping',
            description: 'Replies with Pong!',
        },
        {
            name: 'create_assignment',
            description: 'Create a new assignment ticket (Client only).',
            // Options are removed here as we'll use a modal for input
        },
        {
            name: 'list_assignments',
            description: 'List available pending assignments (Admins only).', // Clarified for admin use
        },
        {
            name: 'admin_dashboard_link',
            description: 'Get the link to the admin dashboard (Admin only).',
        },
        {
            name: 'client_dashboard_link', // This command will now just tell clients to use Discord
            description: 'Get information on how clients manage assignments (Discord only).',
        },
        // NEW: Client commands for reviewing completed work via Discord
        {
            name: 'approve_work',
            description: 'Approve completed work for your assignment.',
            options: [
                {
                    name: 'assignment_id',
                    type: ApplicationCommandOptionType.String, // STRING
                    description: 'The ID of the assignment to approve.',
                    required: true,
                },
            ],
        },
        {
            name: 'request_revision',
            description: 'Request revisions for completed work on your assignment.',
            options: [
                {
                    name: 'assignment_id',
                    type: ApplicationCommandOptionType.String, // STRING
                    description: 'The ID of the assignment to request revisions for.',
                    required: true,
                },
                {
                    name: 'feedback',
                    type: ApplicationCommandOptionType.String, // STRING
                    description: 'Detailed feedback for the helper.',
                    required: true,
                },
            ],
        },
        {
            name: 'setup_ticket_button',
            description: 'Admin command to set up the "Create Ticket" button in a channel.',
            options: [
                {
                    name: 'channel',
                    type: ApplicationCommandOptionType.Channel, // Corrected from ChannelType.GuildText to numeric type 7
                    description: 'The channel where the ticket creation button should be posted.',
                    required: true,
                    channel_types: [ChannelType.GuildText], // Restrict to text channels
                },
            ],
        },
        {
            name: 'show_commands',
            description: 'Displays a list of all available commands.',
        },
    ];

    const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);

    (async () => {
        try {
            console.log('Started refreshing application (/) commands.');
            // Only attempt to register commands if CLIENT_ID and GUILD_ID are defined
            if (CLIENT_ID && GUILD_ID) {
                await rest.put(
                    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
                    { body: commands },
                );
                console.log('Successfully reloaded application (/) commands.');
            } else {
                console.warn('Skipping Discord command registration: CLIENT_ID or GUILD_ID is undefined.');
            }
        } catch (error) {
            console.error('Error reloading application (/) commands:', error);
        }
    })();

    client.on('ready', () => {
        console.log(`Logged in as ${client.user.tag}!`);
    });

    // Helper function to create an assignment ticket (reusable by slash command and button/modal)
    async function createAssignmentTicket(interaction, title, description, categoryName, paymentAmount, deadlineString, complexity, attachment = null) {
        // Ensure interaction is deferred if it hasn't been already (for modals, it's auto-deferred)
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true });
        }

        if (!GUILD_ID || !DISCORD_TICKET_CATEGORY_ID) {
            const errorMessage = 'Server configuration error: Discord Guild ID or Ticket Category ID is not set.';
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
            return;
        }

        let deadline;
        try {
            const dateMatch = deadlineString.match(/^(\d{4}-\d{2}-\d{2})[ T]?(\d{2}:\d{2})$/);
            if (dateMatch) {
                const [_, datePart, timePart] = dateMatch;
                deadline = new Date(`${datePart}T${timePart}:00`);
            } else {
                deadline = new Date(deadlineString);
            }

            if (isNaN(deadline.getTime())) {
                throw new Error('Invalid date format.');
            }
        } catch (dateError) {
            console.error('Date parsing error:', dateError.message);
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ content: 'Error: Invalid deadline format. Please use YYYY-MM-DD HH:MM (e.g., 2025-07-30 17:00).' });
            } else {
                await interaction.reply({ content: 'Error: Invalid deadline format. Please use YYYY-MM-DD HH:MM (e.g., 2025-07-30 17:00).', ephemeral: true });
            }
            return;
        }

        try {
            let user = await User.findOne({ discordId: interaction.user.id });

            if (!user) {
                user = new User({
                    discordId: interaction.user.id,
                    username: interaction.user.username,
                    avatarUrl: interaction.user.avatarURL(),
                    roles: ['client'],
                    isAdmin: false,
                    authType: 'discord',
                    isActive: true,
                });
                await user.save();
                console.log(`New Discord user created via assignment creation: ${user.username}`);
            } else if (!user.roles.includes('client')) {
                user.roles.push('client');
                await user.save();
                console.log(`Existing Discord user ${user.username} updated with 'client' role.`);
            }

            const category = await Category.findOne({ name: categoryName });
            if (!category) {
                if (interaction.replied || interaction.deferred) {
                    await interaction.editReply({ content: `Error: Category "${categoryName}" not found. Please choose a valid category.` });
                } else {
                    await interaction.reply({ content: `Error: Category "${categoryName}" not found. Please choose a valid category.`, ephemeral: true });
                }
                return;
            }

            const guild = client.guilds.cache.get(GUILD_ID);
            if (!guild) {
                if (interaction.replied || interaction.deferred) {
                    await interaction.editReply({ content: 'Error: Discord bot is not in the specified guild.' });
                } else {
                    await interaction.reply({ content: 'Error: Discord bot is not in the specified guild.', ephemeral: true });
                }
                return;
            }

            let myDiscordUser;
            if (process.env.MY_DISCORD_ID) {
                try {
                    myDiscordUser = await guild.members.fetch(process.env.MY_DISCORD_ID);
                } catch (fetchError) {
                    console.warn(`Could not fetch MY_DISCORD_ID (${process.env.MY_DISCORD_ID}):`, fetchError.message);
                }
            }

            let jolomiDiscordUser;
            if (process.env.JOLOMI_DISCORD_ID) {
                try {
                    jolomiDiscordUser = await guild.members.fetch(process.env.JOLOMI_DISCORD_ID);
                } catch (fetchError) {
                    console.warn(`Could not fetch JOLOMI_DISCORD_ID (${process.env.JOLOMI_DISCORD_ID}):`, fetchError.message);
                }
            }

            const channelName = `${title.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').substring(0, 90)}-${interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
            
            const permissionOverwrites = [
                {
                    id: guild.id, // @everyone role
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: interaction.user.id, // The client who created the ticket
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                },
                {
                    id: client.user.id, // The bot itself
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                },
            ];

            if (myDiscordUser) {
                permissionOverwrites.push({
                    id: myDiscordUser.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                });
            }
            
            if (jolomiDiscordUser) {
                permissionOverwrites.push({
                    id: jolomiDiscordUser.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                });
            }

            const ticketChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: DISCORD_TICKET_CATEGORY_ID,
                permissionOverwrites: permissionOverwrites,
                topic: `Assignment Request: ${title} by ${interaction.user.username} (Category: ${categoryName})`,
            });

            let attachmentsForDb = [];
            let attachmentSummary = '';

            // Attachment handling for slash command (if re-added) or future modal with attachments
            // For now, modals don't support attachments directly, so this part might be less used immediately.
            if (attachment) {
                const attachmentUrl = attachment.url;
                const attachmentFilename = attachment.name;
                const fileExtension = path.extname(attachmentFilename).toLowerCase().substring(1);

                const response = await axios.get(attachmentUrl, { responseType: 'arraybuffer' });
                const fileBuffer = Buffer.from(response.data);

                const uniqueFilename = `${Date.now()}-${attachmentFilename}`;
                const localFilePath = path.join(uploadsDir, uniqueFilename);
                await fs.writeFile(localFilePath, fileBuffer);

                attachmentsForDb.push({
                    url: `/uploads/${uniqueFilename}`,
                    filename: attachmentFilename,
                });

                try {
                    attachmentSummary = await summarizeText(fileBuffer, 'gemini', fileExtension);
                } catch (summarizationError) {
                    console.error('Error summarizing attachment:', summarizationError.message);
                    attachmentSummary = `(Could not generate summary for attached file: ${summarizationError.message})`;
                }
            }

            let descriptionSummary = '';
            try {
                descriptionSummary = await summarizeText(description, 'gemini');
            } catch (summarizationError) {
                console.error('Error summarizing description:', summarizationError.message);
                descriptionSummary = `(Could not generate summary for description: ${summarizationError.message})`;
            }

            const newAssignment = new Assignment({
                ownerId: user._id,
                title,
                description,
                complexity,
                category: category.name,
                deadline: deadline,
                paymentAmount,
                attachments: attachmentsForDb,
                status: 'pending',
                discordTicketChannelId: ticketChannel.id,
            });
            await newAssignment.save();

            let ticketMessage = `👋 Welcome, ${interaction.user}! Your assignment ticket for **"${title}"** has been created.\n\n` +
                `**Description Summary:** ${descriptionSummary}\n`;
            
            if (attachmentSummary) {
                ticketMessage += `**Attached Document Summary:** ${attachmentSummary}\n`;
            }

            ticketMessage += `**Category:** ${categoryName}\n` +
                `**Payment:** $${paymentAmount.toFixed(2)}\n` +
                `**Deadline:** ${deadline.toLocaleString()}\n` +
                `**Complexity:** ${complexity}\n\n`;
            
            if (attachmentsForDb.length > 0) {
                ticketMessage += `**Attachments:**\n`;
                attachmentsForDb.forEach(att => {
                    ticketMessage += `- [${att.filename}](${process.env.FRONTEND_URL}${att.url})\n`;
                });
                ticketMessage += `\n`;
            }

            ticketMessage += `A helper will review your request here shortly.`;

            await ticketChannel.send(ticketMessage);

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ content: `Your assignment ticket has been created! Please go to ${ticketChannel.toString()} to discuss your assignment.` });
            } else {
                await interaction.reply({ content: `Your assignment ticket has been created! Please go to ${ticketChannel.toString()} to discuss your assignment.`, ephemeral: true });
            }
            

            const relevantHelpers = await User.find({
                roles: 'helper',
                specializedCategories: category.name,
                isActive: true
            });

            if (relevantHelpers.length > 0) {
                for (const helper of relevantHelpers) {
                    try {
                        const helperDiscordUser = await client.users.fetch(helper.discordId);
                        if (helperDiscordUser) {
                            await helperDiscordUser.send(
                                `🔔 New Assignment Alert! A new assignment matching your specialization has been posted:\n\n` +
                                `**Title:** ${title}\n` +
                                `**Category:** ${categoryName}\n` +
                                `**Payment:** $${paymentAmount.toFixed(2)}\n` +
                                `**Deadline:** ${deadline.toLocaleString()}\n` +
                                `**Description Summary:** ${descriptionSummary}\n` +
                                (attachmentSummary ? `**Attached Document Summary:** ${attachmentSummary}\n` : '') +
                                `\nView full details and accept it on the Helper Dashboard: ${process.env.FRONTEND_URL}/helper-dashboard`
                            );
                            console.log(`Notified helper ${helper.username} about new assignment.`);
                        }
                    } catch (dmError) {
                        console.error(`Could not DM helper ${helper.username} (${helper.discordId}):`, dmError.message);
                    }
                }
            } else {
                sendDiscordNotification(`⚠️ No active helpers found for category: **${categoryName}** for new assignment: **${title}**.`);
            }

        } catch (error) {
            console.error('Error creating assignment ticket:', error);
            const errorMessage = `Failed to create assignment. Error: ${error.message || 'An unknown error occurred.'}`;
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    }


    client.on('interactionCreate', async interaction => {
        if (interaction.isAutocomplete()) {
            if (interaction.commandName === 'create_assignment' || interaction.commandName === 'create_assignment_modal') { // Autocomplete for modal too
                const focusedOption = interaction.options.getFocused(true);
                if (focusedOption.name === 'category_input') { // Changed to match modal input ID
                    try {
                        const categories = await Category.find({
                            name: { $regex: focusedOption.value, $options: 'i' }
                        });
                        const choices = categories
                            .map(category => ({ name: category.name, value: category.name }))
                            .slice(0, 25);
                        await interaction.respond(choices);
                    } catch (autocompleteError) {
                        console.error('Error during autocomplete for categories:', autocompleteError);
                        if (!interaction.responded) {
                            try {
                                await interaction.respond([]);
                            } catch (e) {
                                console.error('Failed to send empty autocomplete response:', e);
                            }
                        }
                    }
                }
            }
        }

        // Handle Slash Commands
        if (interaction.isChatInputCommand()) {
            const { commandName } = interaction;

            const isAdmin = (interaction.user.id === process.env.MY_DISCORD_ID || interaction.user.id === process.env.JOLOMI_DISCORD_ID) ||
                             interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator);

            if (commandName === 'ping') {
                await interaction.reply('Pong!');
            } else if (commandName === 'create_assignment') {
                // Show the modal for assignment creation
                const modal = new ModalBuilder()
                    .setCustomId('create_assignment_modal')
                    .setTitle('Create New Assignment');

                const titleInput = new TextInputBuilder()
                    .setCustomId('title_input')
                    .setLabel('Assignment Title')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const descriptionInput = new TextInputBuilder()
                    .setCustomId('description_input')
                    .setLabel('Detailed Description')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);
                
                const categoryInput = new TextInputBuilder()
                    .setCustomId('category_input')
                    .setLabel('Category (e.g., python-help, java-help)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setAutocomplete(true); // Enable autocomplete for this input

                const paymentAmountInput = new TextInputBuilder()
                    .setCustomId('payment_amount_input')
                    .setLabel('Payment Amount (e.g., 50.00)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const deadlineInput = new TextInputBuilder()
                    .setCustomId('deadline_input')
                    .setLabel('Deadline (YYYY-MM-DD HH:MM)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const complexityInput = new TextInputBuilder()
                    .setCustomId('complexity_input')
                    .setLabel('Complexity (low, medium, high)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(titleInput),
                    new ActionRowBuilder().addComponents(descriptionInput),
                    new ActionRowBuilder().addComponents(categoryInput),
                    new ActionRowBuilder().addComponents(paymentAmountInput),
                    new ActionRowBuilder().addComponents(deadlineInput),
                    new ActionRowBuilder().addComponents(complexityInput)
                );

                await interaction.showModal(modal);

            } else if (commandName === 'list_assignments') {
                if (!isAdmin) {
                    await interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
                    return;
                }

                await interaction.deferReply({ ephemeral: false });

                try {
                    const assignments = await Assignment.find({ status: 'pending' })
                        .populate('ownerId', 'username')
                        .sort({ createdAt: -1 });

                    if (assignments.length === 0) {
                        await interaction.editReply('There are no pending assignments available at the moment.');
                        return;
                    }

                    let replyMessage = '**Available Assignments (Pending):**\n\n';
                    for (const assignment of assignments) {
                        replyMessage += `**Title:** ${assignment.title}\n`;
                        replyMessage += `**Description:** ${assignment.description.substring(0, 100)}${assignment.description.length > 100 ? '...' : ''}\n`;
                        replyMessage += `**Category:** ${assignment.category}\n`;
                        replyMessage += `**Payment:** $${assignment.paymentAmount.toFixed(2)}\n`;
                        replyMessage += `**Deadline:** ${new Date(assignment.deadline).toLocaleString()}\n`;
                        replyMessage += `**Posted by:** ${assignment.ownerId?.username || 'Unknown'}\n`;
                        replyMessage += `**Ticket Channel:** <#${assignment.discordTicketChannelId}>\n`;
                        replyMessage += `[View Details on Web App](${process.env.FRONTEND_URL}/assignments/${assignment._id})\n\n`;
                    }

                    if (replyMessage.length > 2000) {
                        replyMessage = replyMessage.substring(0, 1990) + '... (message truncated, too many assignments)';
                    }

                    await interaction.editReply(replyMessage);

                } catch (error) {
                    console.error('Error listing assignments via Discord command:', error);
                    await interaction.editReply('Failed to retrieve assignments. An error occurred.');
                }
            } else if (commandName === 'admin_dashboard_link') {
                if (!isAdmin) {
                    await interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
                    return;
                }
                await interaction.reply({ content: `Your Admin Dashboard link: ${process.env.FRONTEND_URL}/admin-dashboard`, flags: MessageFlags.Ephemeral });
            } else if (commandName === 'client_dashboard_link') {
                await interaction.reply({ 
                    content: 'As a client, all your assignment management is done directly here on Discord! Use the `/create_assignment` command to start, and keep an eye on your private assignment ticket channels for updates and to review completed work.', 
                    flags: MessageFlags.Ephemeral 
                });
            } else if (commandName === 'approve_work') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const assignmentId = interaction.options.getString('assignment_id');

                console.log(`[APPROVE_WORK] Command received for assignment ID: ${assignmentId} by user: ${interaction.user.id}`);

                try {
                    const assignment = await Assignment.findById(assignmentId)
                                        .populate('ownerId')
                                        .populate('helperId');

                    console.log(`[APPROVE_WORK] Fetched assignment: ${assignment ? assignment.title : 'Not Found'}`);
                    console.log(`[APPROVE_WORK] Assignment status: ${assignment?.status}`);
                    console.log(`[APPROVE_WORK] Assignment owner Discord ID: ${assignment?.ownerId?.discordId}`);
                    console.log(`[APPROVE_WORK] Command user Discord ID: ${interaction.user.id}`);


                    if (!assignment) {
                        await interaction.editReply({ content: 'Assignment not found.' });
                        return;
                    }

                    if (!isAdmin && (!assignment.ownerId || assignment.ownerId.discordId !== interaction.user.id)) {
                        console.log(`[APPROVE_WORK] Authorization failed: User ${interaction.user.id} is not owner ${assignment.ownerId?.discordId} and is not an admin.`);
                        await interaction.editReply({ content: 'You are not authorized to perform this action for this assignment.' });
                        return;
                    }

                    if (assignment.status !== 'pending_client_review') {
                        console.log(`[APPROVE_WORK] Status check failed: Assignment status is ${assignment.status}, expected 'pending_client_review'.`);
                        await interaction.editReply({ content: `Assignment is not in 'pending client review' status. Current status: ${assignment.status}.` });
                        return;
                    }

                    assignment.status = 'ready_for_payout';
                    await assignment.save();
                    console.log(`[APPROVE_WORK] Assignment ${assignment.title} status updated to 'ready_for_payout'.`);


                    await interaction.editReply({ content: `Assignment **${assignment.title}** has been approved! It is now ready for admin payout.` });

                    if (assignment.helperId && assignment.helperId.discordId) {
                        try {
                            const helperDiscordUser = await client.users.fetch(assignment.helperId.discordId);
                            if (helperDiscordUser) {
                                await helperDiscordUser.send(`🎉 Your work for assignment **${assignment.title}** has been approved by the client! It is now ready for payout. Check the Helper Dashboard for updates.`);
                                console.log(`[APPROVE_WORK] Notified helper ${helper.username} via DM.`);
                            }
                        } catch (dmError) {
                            console.error(`[APPROVE_WORK] Could not DM helper ${helper.username} (${helper.discordId}):`, dmError.message);
                        }
                    }
                    sendDiscordNotification(`👍 Assignment Approved: Client **${interaction.user.username}** approved **${assignment.title}**. Ready for admin payout to helper.`);

                } catch (error) {
                    console.error('[APPROVE_WORK] Error processing command:', error);
                    await interaction.editReply({ content: `Failed to approve work. Error: ${error.message || 'An unknown error occurred.'}` });
                }
            } else if (commandName === 'request_revision') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const assignmentId = interaction.options.getString('assignment_id');
                const feedback = interaction.options.getString('feedback');

                console.log(`[REQUEST_REVISION] Command received for assignment ID: ${assignmentId} by user: ${interaction.user.id}`);
                console.log(`[REQUEST_REVISION] Feedback: "${feedback}"`);

                try {
                    const assignment = await Assignment.findById(assignmentId)
                                        .populate('ownerId')
                                        .populate('helperId');

                    console.log(`[REQUEST_REVISION] Fetched assignment: ${assignment ? assignment.title : 'Not Found'}`);
                    console.log(`[REQUEST_REVISION] Assignment status: ${assignment?.status}`);
                    console.log(`[REQUEST_REVISION] Assignment owner Discord ID: ${assignment?.ownerId?.discordId}`);
                    console.log(`[REQUEST_REVISION] Command user Discord ID: ${interaction.user.id}`);

                    if (!assignment) {
                        await interaction.editReply({ content: 'Assignment not found.' });
                        return;
                    }

                    if (!isAdmin && (!assignment.ownerId || assignment.ownerId.discordId !== interaction.user.id)) {
                        console.log(`[REQUEST_REVISION] Authorization failed: User ${interaction.user.id} is not owner ${assignment.ownerId?.discordId} and is not an admin.`);
                        await interaction.editReply({ content: 'You are not authorized to perform this action for this assignment.' });
                        return;
                    }

                    if (assignment.status !== 'pending_client_review') {
                        console.log(`[REQUEST_REVISION] Status check failed: Assignment status is ${assignment.status}, expected 'pending_client_review'.`);
                        await interaction.editReply({ content: `Assignment is not in 'pending client review' status. Current status: ${assignment.status}.` });
                        return;
                    }

                    assignment.status = 'accepted';
                    assignment.completedWorkAttachments = [];
                    await assignment.save();
                    console.log(`[REQUEST_REVISION] Assignment ${assignment.title} status updated to 'accepted' and work cleared.`);


                    await interaction.editReply({ content: `Revision requested for assignment **${assignment.title}**. Helper has been notified.` });

                    if (assignment.helperId && assignment.helperId.discordId) {
                        try {
                            const helperDiscordUser = await client.users.fetch(assignment.helperId.discordId);
                            if (helperDiscordUser) {
                                await helperDiscordUser.send(`⚠️ Revision Requested for **${assignment.title}** by the client. Feedback: "${feedback}". Please make the necessary changes and re-submit.`);
                                console.log(`[REQUEST_REVISION] Could not DM helper ${helper.discordId}:`, dmError.message);
                            }
                        } catch (dmError) {
                            console.error(`[REQUEST_REVISION] Could not DM helper ${helper.discordId}:`, dmError.message);
                        }
                    }
                    sendDiscordNotification(`👎 Assignment Rejected: Client **${interaction.user.username}** requested revisions for **${assignment.title}**. Helper needs to revise. Feedback: "${feedback || 'No specific feedback provided.'}"`);

                } catch (error) {
                    console.error('[REQUEST_REVISION] Error processing command:', error);
                    await interaction.editReply({ content: `Failed to request revision. Error: ${error.message || 'An unknown error occurred.'}` });
                }
            } else if (commandName === 'setup_ticket_button') {
                if (!isAdmin) {
                    await interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
                    return;
                }

                const targetChannel = interaction.options.getChannel('channel');

                if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
                    await interaction.reply({ content: 'Please select a valid text channel.', ephemeral: true });
                    return;
                }

                const createTicketButton = new ButtonBuilder()
                    .setCustomId('create_assignment_ticket_button')
                    .setLabel('Create New Assignment Ticket')
                    .setStyle(ButtonStyle.Primary);

                const row = new ActionRowBuilder()
                    .addComponents(createTicketButton);

                await targetChannel.send({
                    content: 'Click the button below to create a new assignment ticket:',
                    components: [row],
                });

                await interaction.reply({ content: `Ticket creation button posted in ${targetChannel.toString()}`, ephemeral: true });
            } else if (commandName === 'show_commands') {
                const commandsList = commands.map(cmd => `\`/${cmd.name}\`: ${cmd.description}`).join('\n');
                await interaction.reply({
                    content: `**Available Commands:**\n${commandsList}\n\nFor clients, use the button in the designated channel or \`/create_assignment\` to start.`,
                    ephemeral: true // Only visible to the user who ran the command
                });
            }
        }

        // Handle Button Interactions
        if (interaction.isButton()) {
            if (interaction.customId === 'create_assignment_ticket_button') {
                // Show the modal for assignment creation
                const modal = new ModalBuilder()
                    .setCustomId('create_assignment_modal')
                    .setTitle('Create New Assignment');

                const titleInput = new TextInputBuilder()
                    .setCustomId('title_input')
                    .setLabel('Assignment Title')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const descriptionInput = new TextInputBuilder()
                    .setCustomId('description_input')
                    .setLabel('Detailed Description')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);
                
                const categoryInput = new TextInputBuilder()
                    .setCustomId('category_input')
                    .setLabel('Category (e.g., python-help, java-help)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setAutocomplete(true); // Enable autocomplete for this input

                const paymentAmountInput = new TextInputBuilder()
                    .setCustomId('payment_amount_input')
                    .setLabel('Payment Amount (e.g., 50.00)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const deadlineInput = new TextInputBuilder()
                    .setCustomId('deadline_input')
                    .setLabel('Deadline (YYYY-MM-DD HH:MM)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const complexityInput = new TextInputBuilder()
                    .setCustomId('complexity_input')
                    .setLabel('Complexity (low, medium, high)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(titleInput),
                    new ActionRowBuilder().addComponents(descriptionInput),
                    new ActionRowBuilder().addComponents(categoryInput),
                    new ActionRowBuilder().addComponents(paymentAmountInput),
                    new ActionRowBuilder().addComponents(deadlineInput),
                    new ActionRowBuilder().addComponents(complexityInput)
                );

                await interaction.showModal(modal);
            }
        }

        // Handle Modal Submissions
        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'create_assignment_modal') {
                await interaction.deferReply({ ephemeral: true }); // Defer reply for modal submission

                const title = interaction.fields.getTextInputValue('title_input');
                const description = interaction.fields.getTextInputValue('description_input');
                const categoryName = interaction.fields.getTextInputValue('category_input');
                const paymentAmount = parseFloat(interaction.fields.getTextInputValue('payment_amount_input'));
                const deadlineString = interaction.fields.getTextInputValue('deadline_input');
                const complexity = interaction.fields.getTextInputValue('complexity_input').toLowerCase();

                // Validate inputs from modal
                if (isNaN(paymentAmount) || paymentAmount <= 0) {
                    await interaction.editReply({ content: 'Invalid payment amount. Please enter a valid number greater than 0.' });
                    return;
                }
                if (!['low', 'medium', 'high'].includes(complexity)) {
                    await interaction.editReply({ content: 'Invalid complexity. Please choose from: low, medium, high.' });
                    return;
                }

                // Call the shared function to create the assignment ticket
                await createAssignmentTicket(interaction, title, description, categoryName, paymentAmount, deadlineString, complexity);
            }
        }
    });

    client.login(DISCORD_BOT_TOKEN);

    // --- Utility Functions ---

    // Function to send Discord notification (used by web app for general notifications)
    async function sendDiscordNotification(message) {
        if (!process.env.DISCORD_WEBHOOK_URL) { // Use process.env here
            console.warn('DISCORD_WEBHOOK_URL is not set. Skipping Discord notification.');
            return;
        }
        try {
            await axios.post(process.env.DISCORD_WEBHOOK_URL, { content: message }); // Use process.env here
            console.log('Discord notification sent via webhook.');
        } catch (error) {
            console.error('Failed to send Discord notification via webhook:', error.response?.data || error.message);
        }
    }

    // The ensureAdminsExist function definition is now correctly imported from './adminUtils'


    // --- Authentication Middleware ---
    const authenticateUser = (req, res, next) => {
        const authHeader = req.headers.authorization;
        let token = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        } else if (req.query.token) { // Allow token in query for file downloads if needed
            token = req.query.token;
        }

        if (!token) {
            console.log('Authentication required: No token provided.'); // Debug log
            return res.status(401).json({ message: 'Authentication required. No token provided.' });
        }

        jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
            if (err) {
                console.error('JWT verification error:', err);
                return res.status(403).json({ message: 'Invalid or expired token.' });
            }
            req.user = decoded; // decoded contains { userId, username, isAdmin, roles }
            console.log(`User authenticated: ${req.user.username}, Roles: ${req.user.roles.join(', ')}`); // Debug log
            next();
        });
    };

    const authorizeRoles = (roles) => {
        return (req, res, next) => {
            if (!req.user || !req.user.roles) {
                console.log('Authorization failed: User roles not found in request.'); // Debug log
                return res.status(403).json({ message: 'Access denied. User roles not found.' });
            }
            const hasPermission = roles.some(role => req.user.roles.includes(role));
            if (hasPermission) {
                console.log(`Authorization granted for user ${req.user.username} with roles ${req.user.roles.join(', ')} for required roles ${roles.join(', ')}.`); // Debug log
                next();
            } else {
                console.log(`Authorization denied for user ${req.user.username} with roles ${req.user.roles.join(', ')} for required roles ${roles.join(', ')}.`); // Debug log
                res.status(403).json({ message: `Access denied. Requires one of: ${roles.join(', ')} role(s).` });
            }
        };
    };

    const authorizeAdmin = (req, res, next) => {
        if (req.user && req.user.isAdmin) {
            console.log(`Admin authorization granted for user: ${req.user.username}`); // Debug log
            next();
        } else {
            console.log(`Admin authorization denied for user: ${req.user.username}. IsAdmin: ${req.user?.isAdmin}`); // Debug log
            res.status(403).json({ message: 'Access denied. Admin privileges required.' });
        }
    };


    // --- Auth Routes ---

    // Discord OAuth Callback - Initiates Discord OAuth flow
    app.get('/auth/discord', (req, res) => {
        const scope = encodeURIComponent('identify email guilds');
        const redirectUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${DISCORD_REDIRECT_URI_FRONTEND}&response_type=code&scope=${scope}`;
        
        // NEW LOG: Confirming backend is sending redirect
        console.log(`DEBUG: Backend redirecting to Discord OAuth: ${redirectUrl}`);
        
        res.redirect(redirectUrl);
    });

    // Endpoint to exchange Discord OAuth code for a token (called by frontend)
    app.post('/auth/discord/exchange-code', async (req, res) => {
        const { code } = req.body;
        if (!code) {
            return res.status(400).json({ message: 'Authorization code missing.' });
        }

        try {
            // Exchange code for token
            const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: DISCORD_REDIRECT_URI_FRONTEND, // Use the same redirect_uri as in the initial request
            }).toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            });

            const { access_token } = tokenResponse.data;

            // Get user info
            const userResponse = await axios.get('https://discord.com/api/users/@me', {
                headers: {
                    Authorization: `Bearer ${access_token}`,
                },
            });
            const discordUser = userResponse.data;

            let user = await User.findOne({ discordId: discordUser.id });

            if (!user) {
                // New Discord user, create an account
                user = new User({
                    discordId: discordUser.id,
                    username: discordUser.username,
                    avatarUrl: discordUser.avatar ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : null,
                    email: discordUser.email || null,
                    roles: ['client'], // Default role for new Discord users
                    isAdmin: false,
                    authType: 'discord',
                    isActive: true, // Default to active
                });
                await user.save();
            } else {
                // Existing user, update details if necessary
                user.username = discordUser.username;
                user.avatarUrl = discordUser.avatar ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : null;
                user.email = discordUser.email || user.email; // Only update if provided by Discord
                user.authType = 'discord'; // Ensure authType is set
                // Do not change roles or isAdmin here, as they are managed by admin
                await user.save();
            }

            // Generate JWT
            const token = jwt.sign(
                { userId: user._id, username: user.username, isAdmin: user.isAdmin, roles: user.roles, authType: user.authType },
                process.env.JWT_SECRET,
                { expiresIn: '1h' } // Token expires in 1 hour
            );

            res.status(200).json({ message: 'Login successful!', user: user, token });

        } catch (error) {
            console.error('Discord OAuth error:', error.response?.data || error.message);
            res.status(500).json({ message: 'Discord authentication failed.' });
        }
    });

    // Local User Registration (for helpers)
    app.post('/auth/local/register-helper', async (req, res) => {
        const { username: rawUsername, password, specializedCategories, region,
                accountNumber, accountName, paypalEmail, cashAppTag, cryptoWalletAddress, cryptoNetwork } = req.body;

        const username = rawUsername.trim(); // Trim whitespace from username

        console.log(`[Register Helper] Attempting to register username: '${username}'`); // Debug log
        console.log(`[Register Helper] Raw password length: ${password ? password.length : 'N/A'}`); // Debug log

        // Basic validation for common required fields
        if (!username || !password || !specializedCategories || !region) {
            console.log('[Register Helper] Validation failed: Missing required fields.'); // Debug log
            return res.status(400).json({ message: 'Username, password, specialized categories, and region are required.' });
        }

        // Validate specializedCategories array length
        if (!Array.isArray(specializedCategories) || specializedCategories.length < 3) {
            console.log('[Register Helper] Validation failed: Specialized categories less than 3.'); // Debug log
            return res.status(400).json({ message: 'Helpers must specialize in at least 3 categories.' });
        }

        // Wallet/Payment method specific validation
        let paymentDetails = {};
        let walletType = ''; // To be determined based on provided fields

        if (region === 'local') { // Nigeria: Opay, Palmpay
            if (!accountNumber || !accountName) {
                console.log('[Register Helper] Validation failed: Local region requires account number and name.'); // Debug log
                return res.status(400).json({ message: 'For local region, account number and account name are required.' });
            }
            paymentDetails = { accountNumber, accountName };
            walletType = 'Local Bank/Mobile Money'; // Generic type for local payments
        } else if (region === 'foreign') {
            if (paypalEmail) {
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paypalEmail)) {
                    console.log('[Register Helper] Validation failed: Invalid PayPal email format.'); // Debug log
                    return res.status(400).json({ message: 'Invalid PayPal email format.' });
                }
                paymentDetails = { paypalEmail };
                walletType = 'PayPal';
            } else if (cashAppTag) {
                if (!cashAppTag.startsWith('$')) {
                    console.log('[Register Helper] Validation failed: CashApp tag must start with "$".'); // Debug log
                    return res.status(400).json({ message: 'CashApp tag must start with a "$".' });
                }
                paymentDetails = { cashAppTag };
                walletType = 'CashApp';
            } else if (cryptoWalletAddress && cryptoNetwork) {
                if (cryptoWalletAddress.length < 10) {
                    console.log('[Register Helper] Validation failed: Crypto wallet address too short.'); // Debug log
                    return res.status(400).json({ message: 'Crypto wallet address is too short.' });
                }
                if (!['BTC', 'USDT', 'ETH', 'LTC'].includes(cryptoNetwork.toUpperCase())) {
                    console.log('[Register Helper] Validation failed: Invalid crypto network.'); // Debug log
                    return res.status(400).json({ message: 'Invalid crypto network. Supported: BTC, USDT, ETH, LTC.' });
                }
                paymentDetails = { cryptoWalletAddress, cryptoNetwork: cryptoNetwork.toUpperCase() };
                walletType = cryptoNetwork.toUpperCase(); // Wallet type is the crypto network
            } else {
                console.log('[Register Helper] Validation failed: Foreign region requires specific payment details.'); // Debug log
                return res.status(400).json({ message: 'For foreign region, PayPal email, CashApp tag, or crypto wallet details are required.' });
            }
        } else {
            console.log('[Register Helper] Validation failed: Invalid region.'); // Debug log
            return res.status(400).json({ message: 'Invalid region specified.' });
        }

        try {
            // Check if helper registration is open
            const settings = await Settings.findOne({ name: 'global_settings' });
            if (settings && !settings.helperRegistrationOpen) {
                console.log('[Register Helper] Registration closed by admin.'); // Debug log
                return res.status(403).json({ message: 'Helper registration is currently closed by the administrator.' });
            }

            const existingUser = await User.findOne({ username });
            if (existingUser) {
                console.log(`[Register Helper] Username '${username}' already exists.`); // Debug log
                return res.status(409).json({ message: 'Username already exists.' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            console.log(`[Register Helper] Hashed password generated (first 10 chars): ${hashedPassword.substring(0, 10)}...`); // Debug log

            const newUser = new User({
                username,
                password: hashedPassword, // Store hashed password
                roles: ['helper'], // Default role for local registrations
                isAdmin: false,
                walletType: walletType, // Set the determined walletType
                specializedCategories,
                authType: 'local',
                isActive: true, // Default to active
                region,
                // Store payment details conditionally
                ...(paymentDetails.accountNumber && { accountNumber: paymentDetails.accountNumber }),
                ...(paymentDetails.accountName && { accountName: paymentDetails.accountName }),
                ...(paymentDetails.paypalEmail && { paypalEmail: paymentDetails.paypalEmail }),
                ...(paymentDetails.cashAppTag && { cashAppTag: paymentDetails.cashAppTag }),
                ...(paymentDetails.cryptoWalletAddress && { cryptoWalletAddress: paymentDetails.cryptoWalletAddress }),
                ...(paymentDetails.cryptoNetwork && { cryptoNetwork: paymentDetails.cryptoNetwork }),
            });

            console.log('[Register Helper] New user object before save:', newUser.toObject()); // Debug log

            await newUser.save();
            console.log(`[Register Helper] User '${newUser.username}' saved to DB.`); // Debug log

            const token = jwt.sign(
                { userId: newUser._id, username: newUser.username, isAdmin: newUser.isAdmin, roles: newUser.roles, authType: newUser.authType },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            // Send Discord notification for new helper registration
            sendDiscordNotification(`🔔 New Helper Registered: **${newUser.username}** (Wallet: ${newUser.walletType}, Region: ${newUser.region})`);

            res.status(201).json({ message: 'Helper registered successfully!', user: newUser, token });
        } catch (error) {
            console.error('[Register Helper] Error during local helper registration:', error);
            res.status(500).json({ message: 'Failed to register helper.' });
        }
    });

    // Local User Login (for helpers)
    app.post('/auth/local/login', async (req, res) => {
        const { username: rawUsername, password } = req.body;

        const username = rawUsername.trim(); // Trim whitespace from username

        console.log(`[Local Login] Attempting local login for username: '${username}'`); // Debug log
        console.log(`[Local Login] Raw password received (length): ${password ? password.length : 'N/A'}`); // Debug log

        if (!username || !password) {
            console.log('[Local Login] Login failed: Username or password missing.'); // Debug log
            return res.status(400).json({ message: 'Username and password are required.' });
        }

        try {
            const user = await User.findOne({ username }).select('+password'); 
            
            if (!user) {
                console.log(`[Local Login] Login failed: User '${username}' not found in DB.`); // Debug log
                return res.status(401).json({ message: 'Invalid username or password.' });
            }

            console.log(`[Local Login] User found: ${user.username}.`); // Debug log
            console.log(`[Local Login] Stored hashed password (first 10 chars): ${user.password ? user.password.substring(0, 10) + '...' : 'N/A (no password field)'}`); // Debug log

            // Ensure user.password is not null or undefined before comparing
            if (!user.password) {
                console.error(`[Local Login] User '${username}' found but has no password set in DB.`);
                return res.status(500).json({ message: 'Server error: User data corrupted (no password field).' });
            }
            
            const isPasswordValid = await bcrypt.compare(password, user.password);
            console.log(`[Local Login] bcrypt.compare result for '${username}': ${isPasswordValid}`); // Debug log

            if (!isPasswordValid) {
                console.log(`[Local Login] Login failed: Password for '${username}' is incorrect.`); // Debug log
                return res.status(401).json({ message: 'Invalid username or password.' });
            }

            if (!user.isActive) {
                console.log(`[Local Login] Login failed: User '${username}' is inactive.`); // Debug log
                return res.status(403).json({ message: 'Your account is currently inactive. Please contact an administrator.' });
            }

            const token = jwt.sign(
                { userId: user._id, username: user.username, isAdmin: user.isAdmin, roles: user.roles, authType: user.authType },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            // Return user object without the hashed password
            const userResponse = user.toObject();
            delete userResponse.password;

            console.log(`[Local Login] Login successful for user: ${user.username}`); // Debug log
            res.status(200).json({ message: 'Login successful!', user: userResponse, token });
        } catch (error) {
            console.error('[Local Login] Error during local login:', error);
            res.status(500).json({ message: 'Failed to log in.' });
        }
    });


    // --- Assignment Routes (Web App) ---
    // Note: Client-side assignment creation is now handled by Discord bot.
    // This route is for internal use or if you re-introduce a web-based client creation later.
    app.post('/assignments', authenticateUser, upload.array('attachments'), async (req, res) => {
        const { title, description, complexity, category, deadline, paymentAmount } = req.body;
        const ownerId = req.user.userId; // From authenticated user

        if (!title || !description || !complexity || !category || !deadline || !paymentAmount) {
            return res.status(400).json({ message: 'All required assignment fields must be provided.' });
        }

        try {
            const attachments = req.files ? req.files.map(file => ({
                url: `/uploads/${file.filename}`,
                filename: file.originalname,
            })) : [];

            const newAssignment = new Assignment({
                ownerId,
                title,
                description,
                complexity,
                category,
                deadline: new Date(deadline),
                paymentAmount: parseFloat(paymentAmount),
                attachments,
                status: 'pending',
            });

            await newAssignment.save();

            // Populate owner details for the response
            await newAssignment.populate('ownerId', 'username discordId avatarUrl');

            // Find the category to get its Discord channel ID for targeted notification
            const assignmentCategory = await Category.findOne({ name: newAssignment.category });
            if (assignmentCategory && assignmentCategory.discordChannelId) {
                const discordChannel = client.channels.cache.get(assignmentCategory.discordChannelId);
                if (discordChannel && discordChannel.isTextBased()) {
                    await discordChannel.send(`✨ New Assignment Posted in **#${assignmentCategory.name}**: **${newAssignment.title}** by ${req.user.username} (Payout: $${newAssignment.paymentAmount.toFixed(2)}) - [View Details](${process.env.FRONTEND_URL}/assignments/${newAssignment._id})`);
                } else {
                    console.warn(`Could not send targeted notification to Discord channel for category ${assignmentCategory.name}. Channel ID: ${assignmentCategory.discordChannelId} not found or not a text channel. Falling back to webhook.`);
                    sendDiscordNotification(`✨ New Assignment Posted: **${newAssignment.title}** by ${req.user.username} - Category: ${newAssignment.category}, Payout: $${newAssignment.paymentAmount.toFixed(2)} - [View Details](${process.env.FRONTEND_URL}/assignments/${newAssignment._id})`);
                }
            } else {
                // Fallback to generic webhook if category or channel ID is missing
                sendDiscordNotification(`✨ New Assignment Posted: **${newAssignment.title}** by ${req.user.username} - Category: ${newAssignment.category}, Payout: $${newAssignment.paymentAmount.toFixed(2)} - [View Details](${process.env.FRONTEND_URL}/assignments/${newAssignment._id})`);
            }


            res.status(201).json({ message: 'Assignment created successfully!', assignment: newAssignment });
        } catch (error) {
            console.error('Error creating assignment:', error);
            res.status(500).json({ message: 'Failed to create assignment.' });
        }
    });

    // Get assignments based on user role and filters (optimized)
    app.get('/assignments', authenticateUser, async (req, res) => {
        try {
            let query = {};
            const { status, assignedToMe, ownedByMe } = req.query; // Get query parameters

            console.log(`[GET /assignments] Request by user: ${req.user.username} (ID: ${req.user.userId}), Roles: ${req.user.roles.join(', ')}`);
            console.log(`[GET /assignments] Query params: status=${status}, assignedToMe=${assignedToMe}, ownedByMe=${ownedByMe}`);


            if (req.user.roles.includes('helper')) {
                if (assignedToMe === 'true') {
                    // Helper wants assignments assigned to them
                    query = { helperId: req.user.userId };
                    if (status) { // Filter by status if provided
                        query.status = status;
                    }
                    console.log(`[GET /assignments] Helper (assignedToMe=true) query:`, query);
                } else {
                    // Helper wants to view assignments not assigned to them.
                    // If a specific status is requested (e.g., 'pending'), apply it.
                    // Otherwise, show all active (not paid or cancelled) assignments.
                    query = { helperId: null }; // Crucial: Only show unassigned assignments
                    if (status) {
                        query.status = status; // Apply the requested status (e.g., 'pending')
                    } else {
                        query.status = { $nin: ['paid', 'cancelled'] }; // Default to active assignments
                    }
                    console.log(`[GET /assignments] Helper (assignedToMe=false) query:`, query);

                    // IMPORTANT: Category filtering for viewing is removed here.
                    // The frontend (HelperDashboardPage.tsx) handles disabling the "Accept" button
                    // for assignments outside the helper's specialized categories.
                }
            } else if (req.user.roles.includes('client')) {
                // Clients are now Discord-only, so this branch might not be hit by frontend.
                // However, keeping it for robustness if a client somehow accesses this endpoint.
                query = { ownerId: req.user.userId };
                if (status) { // Filter by status if provided
                    query.status = status;
                }
                console.log(`[GET /assignments] Client query:`, query);
            } else if (req.user.isAdmin) {
                // Admins can view all assignments or filter by status
                if (status) {
                    query.status = status;
                }
                if (ownedByMe === 'true') { // Admin might want to see assignments they own (if they are also a client)
                    query.ownerId = req.user.userId;
                }
                if (assignedToMe === 'true') { // Admin might want to see assignments assigned to them (if they are also a helper)
                    query.helperId = req.user.userId;
                }
                console.log(`[GET /assignments] Admin query:`, query);
            } else {
                console.log(`[GET /assignments] Access denied: User has no valid role.`);
                return res.status(403).json({ message: 'Access denied. Invalid role.' });
            }

            const assignments = await Assignment.find(query)
                .populate('ownerId', 'username discordId')
                .populate('helperId', 'username discordId walletAddress walletType')
                .sort({ createdAt: -1 });

            console.log(`[GET /assignments] Found ${assignments.length} assignments for query:`, JSON.stringify(query));
            res.status(200).json({ message: 'Assignments retrieved successfully.', assignments });
        } catch (error) {
            console.error('Error fetching assignments:', error);
            res.status(500).json({ message: 'Failed to retrieve assignments.' });
        }
    });


    // Get single assignment by ID
    app.get('/assignments/:id', authenticateUser, async (req, res) => {
        try {
            const assignment = await Assignment.findById(req.params.id)
                .populate('ownerId', 'username discordId')
                .populate('helperId', 'username discordId walletAddress walletType'); // Populate helper details

            if (!assignment) {
                return res.status(404).json({ message: 'Assignment not found.' });
            }

            // Authorization check: Only owner, assigned helper, or admin can view
            const isOwner = assignment.ownerId._id.equals(req.user.userId);
            const isAssignedHelper = assignment.helperId && assignment.helperId._id.equals(req.user.userId);
            const isAdmin = req.user.isAdmin;

            if (!isOwner && !isAssignedHelper && !isAdmin) {
                return res.status(403).json({ message: 'Access denied. You do not have permission to view this assignment.' });
            }

            res.status(200).json({ message: 'Assignment retrieved successfully.', assignment });
        } catch (error) {
            console.error('Error fetching assignment:', error);
            res.status(500).json({ message: 'Failed to retrieve assignment.' });
        }
    });

    // Accept Assignment (Helper only - via Web App)
    app.post('/assignments/:id/accept', authenticateUser, authorizeRoles(['helper']), async (req, res) => {
        try {
            const assignment = await Assignment.findById(req.params.id);
            const helperUser = await User.findById(req.user.userId); // Fetch helper's full user data

            if (!assignment) {
                return res.status(404).json({ message: 'Assignment not found.' });
            }
            if (!helperUser) {
                return res.status(404).json({ message: 'Helper user not found.' });
            }
            if (assignment.status !== 'pending') {
                return res.status(400).json({ message: `Assignment is already ${assignment.status}.` });
            }
            if (assignment.helperId) {
                return res.status(400).json({ message: 'Assignment is already assigned to a helper.' });
            }

            // NEW: Check if the helper is specialized in the assignment's category
            // This check remains on the backend to prevent unauthorized acceptance even if frontend is bypassed.
            if (!helperUser.specializedCategories.includes(assignment.category)) {
                return res.status(403).json({ message: `You are not specialized in the '${assignment.category}' category and cannot accept this assignment.` });
            }

            assignment.helperId = req.user.userId;
            assignment.status = 'accepted';
            await assignment.save();

            await assignment.populate('ownerId', 'username'); // Populate owner for notification
            sendDiscordNotification(`✅ Assignment Accepted: **${assignment.title}** by helper **${req.user.username}** (Client: ${assignment.ownerId.username})`);

            res.status(200).json({ message: 'Assignment accepted successfully!', assignment });
        } catch (error) {
            console.error('Error accepting assignment:', error);
            res.status(500).json({ message: 'Failed to accept assignment.' });
        }
    });

    // Mark Assignment as Complete (Helper only - via Web App)
    app.post('/assignments/:id/complete', authenticateUser, upload.array('completedWorkAttachments'), authorizeRoles(['helper']), async (req, res) => {
        try {
            const assignment = await Assignment.findById(req.params.id);

            if (!assignment) {
                return res.status(404).json({ message: 'Assignment not found.' });
            }
            if (!assignment.helperId || !assignment.helperId.equals(req.user.userId)) {
                return res.status(403).json({ message: 'You are not assigned to this assignment.' });
            }
            if (!['accepted', 'due'].includes(assignment.status)) {
                return res.status(400).json({ message: `Assignment status is ${assignment.status}. Cannot mark as complete.` });
            }

            const completedWorkAttachments = req.files ? req.files.map(file => ({
                url: `/uploads/${file.filename}`,
                filename: file.originalname,
            })) : [];

            assignment.completedWorkAttachments = completedWorkAttachments;
            assignment.status = 'pending_client_review';
            assignment.completedAt = new Date();
            await assignment.save();

            await assignment.populate('ownerId', 'username discordId'); // Populate owner for notification
            sendDiscordNotification(`🎉 Assignment Completed: **${assignment.title}** submitted by **${req.user.username}**. Awaiting client review from ${assignment.ownerId.username}.`);

            // Notify the client directly on Discord
            if (assignment.ownerId && assignment.ownerId.discordId) {
                const clientDiscordUser = await client.users.fetch(assignment.ownerId.discordId);
                if (clientDiscordUser) {
                    // The message with commands is already here, as requested by the user.
                    await clientDiscordUser.send(
                        `🔔 Your assignment **"${assignment.title}"** has been marked as complete by ${req.user.username}!\n\n` +
                        `Please review the submitted work in your ticket channel: <#${assignment.discordTicketChannelId}>\n\n` +
                        `You can approve it using \`/approve_work ${assignment._id}\` or request revisions with \`/request_revision ${assignment._id} "Your feedback here"\` in the ticket channel.`
                    );
                }
            }


            res.status(200).json({ message: 'Assignment marked as complete and submitted for review!', assignment });
        } catch (error) {
            console.error('Error marking assignment complete:', error);
            res.status(500).json({ message: 'Failed to mark assignment complete.' });
        }
    });

    // Client Review Assignment (Client only - via Web App) - This route is now deprecated as clients use Discord
    // Keeping it for now but it won't be hit by the new frontend flow
    app.post('/assignments/:id/review', authenticateUser, authorizeRoles(['client']), async (req, res) => {
        const { action } = req.body; // 'approve' or 'reject'
        const { feedback } = req.body; // Optional feedback

        try {
            const assignment = await Assignment.findById(req.params.id);

            if (!assignment) {
                return res.status(404).json({ message: 'Assignment not found.' });
            }
            if (!assignment.ownerId.equals(req.user.userId)) {
                return res.status(403).json({ message: 'You are not the owner of this assignment.' });
            }
            if (assignment.status !== 'pending_client_review') {
                return res.status(400).json({ message: `Assignment status is ${assignment.status}. Cannot review.` });
            }

            if (action === 'approve') {
                assignment.status = 'ready_for_payout'; // Ready for admin to process payout
                sendDiscordNotification(`👍 Assignment Approved: Client **${req.user.username}** approved **${assignment.title}**. Ready for admin payout to helper.`);
            } else if (action === 'reject') {
                assignment.status = 'accepted'; // Revert to accepted for helper to revise
                assignment.completedWorkAttachments = []; // Clear submitted work
                sendDiscordNotification(`👎 Assignment Rejected: Client **${req.user.username}** requested revisions for **${assignment.title}**. Helper needs to revise. Feedback: "${feedback || 'No specific feedback provided.'}"`);
            } else {
                return res.status(400).json({ message: 'Invalid review action. Must be "approve" or "reject".' });
            }

            await assignment.save();
            res.status(200).json({ message: `Assignment ${action === 'approve' ? 'approved' : 'rejected'} successfully!`, assignment });
        } catch (error) {
            console.error('Error reviewing assignment:', error);
            res.status(500).json({ message: 'Failed to review assignment.' });
        }
    });

    // --- Admin Routes (Requires authorizeAdmin middleware) ---

    // Get all assignments for admin dashboard
    app.get('/admin/assignments', authenticateUser, authorizeAdmin, async (req, res) => {
        try {
            const assignments = await Assignment.find({})
                .populate('ownerId', 'username discordId')
                .populate('helperId', 'username discordId walletAddress walletType')
                .sort({ createdAt: -1 }); // Sort by creation date, newest first

            res.status(200).json({ message: 'All assignments retrieved.', assignments });
        } catch (error) {
            console.error('Error fetching all assignments for admin:', error);
            res.status(500).json({ message: 'Failed to retrieve all assignments.' });
        }
    });

    // Get all users for admin dashboard
    app.get('/admin/users', authenticateUser, authorizeAdmin, async (req, res) => {
        try {
            const users = await User.find({})
                .select('-password') // Exclude password from results
                .sort({ username: 1 }); // Sort by username

            res.status(200).json({ message: 'All users retrieved with stats.', users });
        }
        catch (error) {
            console.error('Error fetching all users for admin:', error);
            res.status(500).json({ message: 'Failed to retrieve all users.' });
        }
    });

    // NEW: Delete a user (Admin only)
    app.delete('/admin/users/:id', authenticateUser, authorizeAdmin, async (req, res) => {
        try {
            const userIdToDelete = req.params.id;

            // Prevent admin from deleting their own account
            if (req.user.userId === userIdToDelete) {
                return res.status(403).json({ message: 'You cannot delete your own account.' });
            }

            const user = await User.findById(userIdToDelete);
            if (!user) {
                return res.status(404).json({ message: 'User not found.' });
            }

            // Optional: Check if the user has any active assignments or pending payouts
            // If so, you might want to prevent deletion or require manual resolution first.
            const activeAssignments = await Assignment.countDocuments({
                $or: [{ ownerId: userIdToDelete }, { helperId: userIdToDelete }],
                status: { $nin: ['paid', 'cancelled'] } // Not paid or cancelled
            });

            if (activeAssignments > 0) {
                return res.status(400).json({ message: `User ${user.username} has ${activeAssignments} active assignments. Please resolve them before deleting the user.` });
            }

            await User.findByIdAndDelete(userIdToDelete);
            sendDiscordNotification(`🗑️ User Deleted: Admin **${req.user.username}** deleted user **${user.username}** (ID: ${userIdToDelete}).`);

            res.status(200).json({ message: 'User deleted successfully.' });
        } catch (error) {
            console.error('Error deleting user:', error);
            res.status(500).json({ message: 'Failed to delete user.' });
        }
    });


    // Get helper registration status
    app.get('/admin/settings/helper-registration', authenticateUser, authorizeAdmin, async (req, res) => {
        try {
            let settings = await Settings.findOne({ name: 'global_settings' });
            if (!settings) {
                // Create default settings if they don't exist
                settings = new Settings({ name: 'global_settings', helperRegistrationOpen: true });
                await settings.save();
            }
            res.status(200).json({
                message: 'Helper registration status retrieved successfully.',
                isOpen: settings.helperRegistrationOpen
            });
        } catch (error) {
            console.error('Error fetching helper registration status:', error);
            res.status(500).json({ message: error.response?.data?.message || 'Failed to load registration status.' });
        }
    });

    // Toggle helper registration status
    app.put('/admin/settings/toggle-helper-registration', authenticateUser, authorizeAdmin, async (req, res) => {
        const { isOpen } = req.body; // Expecting boolean true/false

        if (typeof isOpen !== 'boolean') {
            return res.status(400).json({ message: 'Invalid input for isOpen. Must be boolean.' });
        }

        try {
            const settings = await Settings.findOneAndUpdate(
                { name: 'global_settings' },
                { $set: { helperRegistrationOpen: isOpen } },
                { new: true, upsert: true } // Create if not exists, return new doc
            );
            res.status(200).json({
                message: `Helper registration is now ${settings.helperRegistrationOpen ? 'OPEN' : 'CLOSED'}.`,
                isOpen: settings.helperRegistrationOpen
            });
        } catch (error) {
            console.error('Error toggling helper registration status:', error);
            res.status(500).json({ message: 'Failed to toggle helper registration status.' });
        }
    });

    // Update user roles
    app.put('/admin/users/:id/roles', authenticateUser, authorizeAdmin, async (req, res) => {
        const { roles } = req.body; // Expecting an array of strings, e.g., ['client', 'helper']

        if (!Array.isArray(roles) || !roles.every(role => typeof role === 'string')) {
            return res.status(400).json({ message: 'Roles must be an array of strings.' });
        }

        try {
            const user = await User.findById(req.params.id);
            if (!user) {
                return res.status(404).json({ message: 'User not found.' });
            }

            user.roles = roles;
            user.isAdmin = roles.includes('admin'); // Automatically set isAdmin based on roles
            await user.save();
            res.status(200).json({ message: 'User roles updated successfully.', user: user.toObject({ virtuals: true }) });
        } catch (error) {
            console.error('Error updating user roles:', error);
            res.status(500).json({ message: 'Failed to update user roles.' });
        }
    });

    // Update user active status
    app.put('/admin/users/:id/status', authenticateUser, authorizeAdmin, async (req, res) => {
        const { isActive } = req.body; // Expecting a boolean

        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ message: 'isActive must be a boolean value.' });
        }

        try {
            const user = await User.findById(req.params.id);
            if (!user) {
                return res.status(404).json({ message: 'User not found.' });
            }

            user.isActive = isActive;
            await user.save();
            res.status(200).json({ message: `User status updated to ${isActive ? 'active' : 'inactive'}.`, user: user.toObject({ virtuals: true }) });
        } catch (error) {
            console.error('Error updating user status:', error);
            res.status(500).json({ message: 'Failed to update user status.' });
        }
    });


    // Set Admin Determined Helper Payout
    app.put('/admin/assignments/:id/set-payout', authenticateUser, authorizeAdmin, async (req, res) => {
        const { helperPayoutAmount } = req.body;

        if (typeof helperPayoutAmount !== 'number' || helperPayoutAmount < 0) {
            return res.status(400).json({ message: 'Helper payout amount must be a non-negative number.' });
        }

        try {
            const assignment = await Assignment.findById(req.params.id);
            if (!assignment) {
                return res.status(404).json({ message: 'Assignment not found.' });
            }

            // Calculate platform fees and shares based on the new payout amount
            const platformFee = assignment.paymentAmount - helperPayoutAmount;
            // For simplicity, let's say admin gets 50% of the fee, Jolomi gets 50%
            const adminShare = platformFee * 0.5;
            const jolomiShare = platformFee * 0.5;

            assignment.adminDeterminedHelperPayout = helperPayoutAmount;
            assignment.platformFee = platformFee;
            assignment.adminShare = adminShare;
            assignment.jolomiShare = jolomiShare;

            // IMPORTANT: Removed the status change logic here.
            // The assignment status will only change to 'ready_for_payout' when the client approves the work.
           
            await assignment.save();
            res.status(200).json({ message: 'Helper payout amount set successfully.', assignment });
        } catch (error) {
            console.error('Error setting helper payout:', error);
            res.status(500).json({ message: 'Failed to set helper payout.' });
        }
    });

    // Process Payout (Admin marks as paid)
    app.post('/admin/assignments/:id/pay', authenticateUser, authorizeAdmin, async (req, res) => {
        const { transactionId, notes } = req.body;

        if (!transactionId) {
            return res.status(400).json({ message: 'Transaction ID is required to mark as paid.' });
        }

        try {
            const assignment = await Assignment.findById(req.params.id);
            if (!assignment) {
                return res.status(404).json({ message: 'Assignment not found.' });
            }
            if (assignment.status !== 'ready_for_payout') {
                return res.status(400).json({ message: `Assignment is not in 'ready_for_payout' status. Current status: ${assignment.status}.` });
            }
            if (!assignment.helperId) {
                return res.status(400).json({ message: 'Cannot process payout: No helper assigned to this assignment.' });
            }
            if (assignment.adminDeterminedHelperPayout === null || assignment.adminDeterminedHelperPayout === undefined) {
                 return res.status(400).json({ message: 'Cannot process payout: Helper payout amount has not been determined by admin.' });
            }

            assignment.status = 'paid';
            assignment.paidAt = new Date();
            await assignment.save();

            // Create a payout transaction record
            const newPayoutTransaction = new PayoutTransaction({
                assignmentId: assignment._id,
                helperId: assignment.helperId,
                amount: assignment.adminDeterminedHelperPayout,
                transactionId,
                notes,
            });
            await newPayoutTransaction.save();

            // Update helper's total earnings
            await User.findByIdAndUpdate(assignment.helperId, {
                $inc: { totalEarnings: assignment.adminDeterminedHelperPayout }
            });

            await assignment.populate('helperId', 'username'); // Populate helper for notification
            sendDiscordNotification(`💸 Payout Processed: **$${assignment.adminDeterminedHelperPayout.toFixed(2)}** paid to helper **${assignment.helperId.username}** for assignment **${assignment.title}**. Transaction ID: ${transactionId}`);

            res.status(200).json({ message: 'Payout recorded successfully! Assignment marked as paid.', assignment });
        } catch (error) {
            console.error('Error processing payout:', error);
            res.status(500).json({ message: 'Failed to process payout.' });
        }
    });

    // Get Financial Summary for Admin Dashboard
    app.get('/admin/financial-summary', authenticateUser, authorizeAdmin, async (req, res) => {
        try {
            const totalClientPaymentsResult = await Assignment.aggregate([
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$paymentAmount' }
                    }
                }
            ]);
            const totalClientPayments = totalClientPaymentsResult.length > 0 ? totalClientPaymentsResult[0].total : 0;

            const totalHelperPayoutsResult = await Assignment.aggregate([
                {
                    $match: {
                        status: 'paid', // Only count paid assignments for helper payouts
                        adminDeterminedHelperPayout: { $ne: null }
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$adminDeterminedHelperPayout' }
                    }
                }
            ]);
            const totalHelperPayouts = totalHelperPayoutsResult.length > 0 ? totalHelperPayoutsResult[0].total : 0;

            const platformProfit = totalClientPayments - totalHelperPayouts;

            res.status(200).json({
                message: 'Financial summary retrieved successfully.',
                totalClientPayments,
                totalHelperPayouts,
                platformProfit
            });
        } catch (error) {
            console.error('Error fetching financial summary:', error);
            res.status(500).json({ message: 'Failed to retrieve financial summary.' });
        }
    });


    // --- Summarization Routes (Web App) ---
    // These routes are primarily for helper/admin dashboards to summarize existing content.
    app.post('/assignments/:id/summarize-description', authenticateUser, async (req, res) => {
        try {
            const assignment = await Assignment.findById(req.params.id);
            if (!assignment) {
                return res.status(404).json({ message: 'Assignment not found.' });
            }
            if (!summarizeText) {
                return res.status(500).json({ message: 'Summarization module not available.' });
            }
            // Call the summarizeText function from your custom module with the description
            const summary = await summarizeText(assignment.description, 'gemini'); // Assuming 'gemini' is the default provider
            res.status(200).json({ message: 'Description summarized successfully.', summary });
        }
        catch (error) {
            console.error('Error summarizing description:', error);
            res.status(500).json({ message: `Failed to summarize description: ${error.message}` });
        }
    });

    // Endpoint to summarize an attached document
    app.post('/assignments/:id/summarize-document', authenticateUser, async (req, res) => {
        const { attachmentUrl } = req.body; // Expecting the URL of the attachment to summarize

        if (!attachmentUrl) {
            return res.status(400).json({ message: 'Attachment URL is required for document summarization.' });
        }

        try {
            const filePath = path.join(__dirname, attachmentUrl); // Construct local file path
            // Use fs.promises.readFile to get a buffer
            const fileBuffer = await fs.readFile(filePath);

            // Determine file type for the summarizer module
            const fileType = path.extname(filePath).toLowerCase().substring(1); // e.g., 'pdf', 'docx', 'txt'
            
            if (!summarizeText) {
                return res.status(500).json({ message: 'Summarization module not available.' });
            }

            // Call the summarizeText function from your custom module with the buffer and file type
            const summary = await summarizeText(fileBuffer, 'gemini', fileType); // Assuming 'gemini' is the default provider
            res.status(200).json({ message: 'Document summarized successfully.', summary });
        } catch (error) {
            console.error('Error summarizing document:', error);
            res.status(500).json({ message: `Failed to summarize document: ${error.message}` });
        }
    });


    app.get('/categories', async (req, res) => {
        try {
            const categories = await Category.find({}).sort({ name: 1 });
            res.status(200).json({ message: 'Categories retrieved successfully.', categories });
        } catch (error) {
            console.error('Error fetching categories:', error);
            res.status(500).json({ message: 'Failed to retrieve categories.' });
        }
    });

    app.get('/', (req, res) => {
        res.send('Welcome to the Assignment Platform Backend!');
    });

    // Error handling middleware
    app.use((err, req, res, next) => {
        console.error(err.stack);
        res.status(500).send('Something broke!');
    });

    // Start the server
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });

    // Cron job to update assignment statuses (e.g., from 'accepted' to 'due' if deadline passes)
    cron.schedule('0 0 * * *', async () => { // Runs daily at midnight
        console.log('Running daily assignment status check...');
        try {
            const now = new Date();
            const assignmentsToUpdate = await Assignment.find({
                status: { $in: ['accepted'] }, // Only check assignments that are accepted
                deadline: { $lt: now } // Where deadline has passed
            });

            for (const assignment of assignmentsToUpdate) {
                assignment.status = 'due';
                await assignment.save();
                sendDiscordNotification(`⏰ Assignment Overdue: **${assignment.title}** is now DUE! Helper: ${assignment.helperId ? assignment.helperId.username : 'N/A'}`);
                console.log(`Assignment ${assignment._id} status updated to 'due'.`);
            }
        } catch (error) {
            console.error('Error in daily assignment status cron job:', error);
        }
    });
    