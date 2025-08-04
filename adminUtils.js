// adminUtils.js
const User = require('./models/User'); // Ensure User model is imported

/**
 * Ensures that specified admin users exist in the database with the correct roles.
 * This function is called on application startup.
 * @param {string} myDiscordId - The Discord ID for your admin account.
 * @param {string} jolomiDiscordId - The Discord ID for Jolomi's admin account.
 */
async function ensureAdminsExist(myDiscordId, jolomiDiscordId) {
    try {
        // Define admin users with their Discord IDs and default details
        const adminsToEnsure = [
            {
                discordId: myDiscordId,
                username: 'benimaru177', // Your Discord tag
                email: 'benimaru.admin@example.com', // Example email for your admin
                roles: ['admin', 'client'], // Assign admin and client roles
                isAdmin: true,
                authType: 'discord',
                isActive: true,
            },
            {
                discordId: jolomiDiscordId,
                username: 'streetfighter0542', // Jolomi's Discord tag
                email: 'jolomi.admin@example.com', // Example email for Jolomi's admin
                roles: ['admin', 'client'], // Assign admin and client roles
                isAdmin: true,
                authType: 'discord',
                isActive: true,
            }
        ];

        for (const adminData of adminsToEnsure) {
            let user = await User.findOne({ discordId: adminData.discordId });

            if (!user) {
                // Create the admin user if they don't exist
                user = new User(adminData);
                await user.save();
                console.log(`Admin user ${adminData.username} (ID: ${adminData.discordId}) created.`);
            } else {
                // Update existing admin user's roles and admin status if necessary
                let changed = false;
                if (!user.roles.includes('admin')) {
                    user.roles.push('admin');
                    changed = true;
                }
                if (!user.isAdmin) {
                    user.isAdmin = true;
                    changed = true;
                }
                // Ensure other fields are up-to-date if they might change
                if (user.username !== adminData.username) {
                    user.username = adminData.username;
                    changed = true;
                }
                if (user.email !== adminData.email) {
                    user.email = adminData.email;
                    changed = true;
                }
                if (user.authType !== adminData.authType) {
                    user.authType = adminData.authType;
                    changed = true;
                }
                if (user.isActive !== adminData.isActive) {
                    user.isActive = adminData.isActive;
                    changed = true;
                }
                
                if (changed) {
                    await user.save();
                    console.log(`Admin user ${user.username} (ID: ${user.discordId}) updated with required roles/status.`);
                } else {
                    console.log(`Admin user ${user.username} (ID: ${user.discordId}) found and already has required roles.`);
                }
            }
        }
    } catch (error) {
        console.error('Error ensuring admin users exist:', error);
    }
}

module.exports = { ensureAdminsExist };
