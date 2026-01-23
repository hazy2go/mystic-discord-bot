require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const fetch = require('node-fetch');
const path = require('path');
const { OpenAI } = require('openai');
const { parse } = require('csv-parse/sync');
const https = require('https');
const schedule = require('node-schedule');

const { Client,SelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, GatewayIntentBits,ActionRowBuilder, ButtonBuilder, ButtonStyle,AttachmentBuilder, EmbedBuilder,Partials,ChannelType,Events, Collection} = require("discord.js");

const createCsvWriter = require('csv-writer').createObjectCsvWriter;
// Challenge system - stores users who have correctly answered
let riddleCorrectUsers = new Set(); // Using a Set to avoid duplicates

// Individual user progress tracking for challenges
let userChallengeProgress = new Map(); // Map<userId, {submitted: Date[], attempts: number}>

// Track users who have been reminded in each forum thread
// Map<threadId, Set<userId>>
let forumThreadReminders = new Map();


// Social media post queue and timing variables for both systems (Twitter & Instagram)
let tweetQueue = [];
let lastTweetTime = 0;
let processingQueue = false;

let tweetQueue2 = [];
let lastTweetTime2 = 0;
let processingQueue2 = false;

let tweetQueue3 = [];
let lastTweetTime3 = 0;
let processingQueue3 = false;

// Raid type toggles - set to true/false to enable/disable specific raid types
const raidToggles = {
  system1: {
    twitter: false,
    instagram: true
  },
  system2: {
    twitter: false,
    instagram: true
  },
  system3: {
    twitter: false,
    instagram: true
  }
};


const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
    ],
    partials: [Partials.Channel]
});

// First raiding system
const TWEET_CHANNEL_ID = process.env.TWEET_CHANNEL_ID;
const FORUM_CHANNEL_ID = process.env.FORUM_CHANNEL_ID;
const NOTIFY_CHANNEL_ID = process.env.NOTIFY_CHANNEL_ID;
const RAIDER_ROLE_ID = process.env.RAIDER_ROLE_ID;

// Second raiding system
const TWEET_CHANNEL_ID_2 = process.env.TWEET_CHANNEL_ID_2;
const FORUM_CHANNEL_ID_2 = process.env.FORUM_CHANNEL_ID_2;
const NOTIFY_CHANNEL_ID_2 = process.env.NOTIFY_CHANNEL_ID_2;
const RAIDER_ROLE_ID_2 = process.env.RAIDER_ROLE_ID_2;

// Third raiding system (Portuguese)
const TWEET_CHANNEL_ID_3 = process.env.TWEET_CHANNEL_ID_3;
const FORUM_CHANNEL_ID_3 = process.env.FORUM_CHANNEL_ID_3;
const NOTIFY_CHANNEL_ID_3 = process.env.NOTIFY_CHANNEL_ID_3;
const RAIDER_ROLE_ID_3 = process.env.RAIDER_ROLE_ID_3;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let rollCooldowns = new Map(); // Store user cooldowns
const ROLL_COOLDOWN = 30000; // 30 seconds cooldown


const csvFilePath = 'messages.csv';

// Riddle reminder settings
let riddleReminderActive = false;
let riddleReminderChannelId = process.env.RIDDLE_REMINDER_CHANNEL_ID || process.env.NOTIFY_CHANNEL_ID;
let riddleReminderJob = null;

// CSV writer to record username and message
let csvWriter = createCsvWriter({
    path: csvFilePath,
    header: [
        { id: 'username', title: 'USERNAME' },
        { id: 'message', title: 'MESSAGE' },
    ],
    append: true
});

// Forum builder variables
let targetChannelId;
let embedTitle = '';
let embedDescription = '';
let embedImageUrl = '';
const prefix = '!';


client.once('ready', () => {
    console.log('Mystic is online!');
});

client.on('messageCreate', async message => {
    // Auto-reply in forum threads for raid proof submissions
    if (message.channel.isThread() && message.channel.parent) {
        const parentChannelId = message.channel.parent.id;

        // Check if this thread is in one of the raid forum channels
        const isRaidForum = [FORUM_CHANNEL_ID, FORUM_CHANNEL_ID_2, FORUM_CHANNEL_ID_3].includes(parentChannelId);

        if (isRaidForum && !message.author.bot) {
            try {
                // Check if user has Community Team role
                const member = await message.guild.members.fetch(message.author.id);
                const hasCommunityTeamRole = member.roles.cache.some(role => role.name === 'Community Team');

                if (!hasCommunityTeamRole) {
                    // Initialize Set for this thread if it doesn't exist
                    if (!forumThreadReminders.has(message.channel.id)) {
                        forumThreadReminders.set(message.channel.id, new Set());
                    }

                    const threadReminders = forumThreadReminders.get(message.channel.id);

                    // Only reply if we haven't reminded this user in this thread yet
                    if (!threadReminders.has(message.author.id)) {
                        // Determine language based on parent forum channel
                        let reminderMessage;
                        if (parentChannelId === FORUM_CHANNEL_ID_3) {
                            // Portuguese
                            reminderMessage = `<@${message.author.id}> Lembre-se: você precisa **seguir, curtir E compartilhar com um amigo** no post para garantir sua recompensa! Não esqueça de compartilhar! 🔗`;
                        } else {
                            // English
                            reminderMessage = `<@${message.author.id}> Remember: you need to **follow, like AND share to a friend** on the post to claim your reward! Don't forget to share! 🔗`;
                        }

                        await message.channel.send(reminderMessage);

                        // Mark this user as reminded in this thread
                        threadReminders.add(message.author.id);
                    }
                }
            } catch (error) {
                console.error('Error sending raid reminder:', error);
            }
        }
    }

    // Helper function to extract Instagram username from embed
    const extractInstagramUsername = (msg) => {
        // Try to get username from embeds
        if (msg.embeds && msg.embeds.length > 0) {
            for (const embed of msg.embeds) {
                // Check author name (e.g., "reignoftitans (@reignoftitans)")
                if (embed.author && embed.author.name) {
                    // Extract username from format like "username (@username)" or just "username"
                    const match = embed.author.name.match(/@(\w+)/);
                    if (match) return match[1];
                    // If no @ format, use the author name directly
                    return embed.author.name.split(' ')[0];
                }
            }
        }
        return 'instagram';
    };

    // Helper function to process social media link detection
    const handleSocialMediaLink = (channelId, systemConfig, queueData, systemName) => {
        if (message.channel.id !== channelId) return false;
        if (!message.content.includes('https://twitter.com') && !message.content.includes('https://www.instagram.com')) return false;

        let socialLink;
        const twitterMatch = message.content.match(/https:\/\/twitter\.com\/[^\s]+/);
        const instagramMatch = message.content.match(/https:\/\/www\.instagram\.com\/[^\s]+/);

        if (twitterMatch && systemConfig.twitter) {
            socialLink = twitterMatch[0];
        } else if (instagramMatch && systemConfig.instagram) {
            socialLink = instagramMatch[0];
        }

        if (!socialLink) return true;

        if (socialLink.endsWith('>')) {
            socialLink = socialLink.slice(0, -1);
        }

        // Extract Instagram username from the embed
        const accountName = extractInstagramUsername(message);

        const currentTime = Date.now();
        const oneHour = 60 * 60 * 1000;

        // Create post data object with link and account name
        const postData = { link: socialLink, accountName: accountName };

        if (currentTime - queueData.lastTime >= oneHour && queueData.queue.length === 0) {
            processTweet(postData.link, queueData.forumId, queueData.notifyId, queueData.roleId, queueData.language, postData.accountName);
            queueData.lastTime = currentTime;
            console.log(`Post processed immediately (${systemName})`);
        } else {
            queueData.queue.push(postData);
            console.log(`Post added to queue (${systemName}). Position: ${queueData.queue.length}`);

            if (!queueData.processing) {
                queueData.processFunction();
            }
        }
        return true;
    };

    // First raiding system
    if (handleSocialMediaLink(TWEET_CHANNEL_ID, raidToggles.system1, {
        queue: tweetQueue,
        lastTime: lastTweetTime,
        processing: processingQueue,
        forumId: FORUM_CHANNEL_ID,
        notifyId: NOTIFY_CHANNEL_ID,
        roleId: RAIDER_ROLE_ID,
        processFunction: processQueue
    }, 'System 1')) return;

    // Second raiding system
    if (handleSocialMediaLink(TWEET_CHANNEL_ID_2, raidToggles.system2, {
        queue: tweetQueue2,
        lastTime: lastTweetTime2,
        processing: processingQueue2,
        forumId: FORUM_CHANNEL_ID_2,
        notifyId: NOTIFY_CHANNEL_ID_2,
        roleId: RAIDER_ROLE_ID_2,
        processFunction: processQueue2
    }, 'System 2')) return;

    // Third raiding system (Portuguese)
    if (handleSocialMediaLink(TWEET_CHANNEL_ID_3, raidToggles.system3, {
        queue: tweetQueue3,
        lastTime: lastTweetTime3,
        processing: processingQueue3,
        forumId: FORUM_CHANNEL_ID_3,
        notifyId: NOTIFY_CHANNEL_ID_3,
        roleId: RAIDER_ROLE_ID_3,
        language: 'pt',
        processFunction: processQueue3
    }, 'System 3')) return;

// Function to process a social media post (Twitter or Instagram)
async function processTweet(tweetLink, forumChannelId, notifyChannelId, raiderRoleId, language = 'en', accountName = 'instagram') {
  try {
    const forumChannel = await client.channels.fetch(forumChannelId);
    const notify = await client.channels.fetch(notifyChannelId);

    if (forumChannel.type === ChannelType.GuildForum) {
      // Generate date string in MM/DD format
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const dateStr = `${month}/${day}`;

      // Set messages based on language
      let threadName, threadMessage, notifyMessage;

      // Thread name with date and account name
      threadName = `${dateStr} ${accountName}`;

      if (language === 'pt') {
        threadMessage = `Manda um print mostrando que você seguiu, curtiu e compartilhou com um amigo pra pegar suas 2 Caixas de Loot Médias!\n${tweetLink}`;
        notifyMessage = `Ganhe 2 Caixas de Loot Médias!** Acesse ${'{thread_url}'}, compartilhe com um amigo, curta e siga pra pegar sua recompensa. <@&${raiderRoleId}>`;
      } else {
        threadMessage = `Drop a screenshot showing you've followed, liked, and shared to a friend to claim your 2 Medium Loot Boxes!\n${tweetLink}`;
        notifyMessage = `**Earn 2 Medium Loot Boxes!** Visit ${'{thread_url}'}, share to a friend, like, and follow to claim your reward. <@&${raiderRoleId}>`;
      }

      const thread = await forumChannel.threads.create({
        name: threadName,
        autoArchiveDuration: 1440, // 1 day
        message: {
          content: threadMessage
        }
      });

      notify.send(notifyMessage.replace('{thread_url}', thread.url));
      console.log(`Social post processed: ${tweetLink} (${language}) - Thread: ${threadName}`);
    } else {
      console.error('The specified channel is not a forum channel.');
    }
  } catch (error) {
    console.error('Error processing social post:', error);
  }
}

// Generic function to process the social media post queue
function createQueueProcessor(queueRef, processingRef, lastTimeRef, forumId, notifyId, roleId, systemName, language = 'en') {
    return async function processQueueInternal() {
        const queue = queueRef();
        const isProcessing = processingRef.get();

        if (isProcessing || queue.length === 0) {
            return;
        }

        processingRef.set(true);
        const currentTime = Date.now();
        const oneHour = 60 * 60 * 1000;
        const lastTime = lastTimeRef.get();

        if (currentTime - lastTime >= oneHour) {
            const postData = queue.shift();

            // Handle both old format (string) and new format (object with link and accountName)
            const link = typeof postData === 'string' ? postData : postData.link;
            const accountName = typeof postData === 'string' ? 'instagram' : postData.accountName;

            await processTweet(link, forumId, notifyId, roleId, language, accountName);
            lastTimeRef.set(currentTime);

            console.log(`Queue processed (${systemName}). Remaining posts in queue: ${queue.length}`);

            if (queue.length > 0) {
                setTimeout(() => {
                    processingRef.set(false);
                    processQueueInternal();
                }, oneHour);
            } else {
                processingRef.set(false);
            }
        } else {
            const timeLeft = oneHour - (currentTime - lastTime);
            console.log(`Next post will be processed in ${Math.round(timeLeft / 1000 / 60)} minutes (${systemName})`);

            setTimeout(() => {
                processingRef.set(false);
                processQueueInternal();
            }, timeLeft);
        }
    };
}

// Queue processors for each system
const processQueue = createQueueProcessor(
    () => tweetQueue,
    { get: () => processingQueue, set: (v) => { processingQueue = v; } },
    { get: () => lastTweetTime, set: (v) => { lastTweetTime = v; } },
    FORUM_CHANNEL_ID, NOTIFY_CHANNEL_ID, RAIDER_ROLE_ID, 'System 1'
);

const processQueue2 = createQueueProcessor(
    () => tweetQueue2,
    { get: () => processingQueue2, set: (v) => { processingQueue2 = v; } },
    { get: () => lastTweetTime2, set: (v) => { lastTweetTime2 = v; } },
    FORUM_CHANNEL_ID_2, NOTIFY_CHANNEL_ID_2, RAIDER_ROLE_ID_2, 'System 2'
);

const processQueue3 = createQueueProcessor(
    () => tweetQueue3,
    { get: () => processingQueue3, set: (v) => { processingQueue3 = v; } },
    { get: () => lastTweetTime3, set: (v) => { lastTweetTime3 = v; } },
    FORUM_CHANNEL_ID_3, NOTIFY_CHANNEL_ID_3, RAIDER_ROLE_ID_3, 'System 3', 'pt'
);

    if (message.author.bot) return;

    const args = message.content.slice(prefix.length).split(/ +/);
    const command = args.shift().toLowerCase();

    // File upload command
    if (message.content === '!upload' && message.attachments.size > 0) {
        const attachment = message.attachments.first();
        const filePath = path.join(__dirname, 'downloads', attachment.name);

        // Download the file
        const response = await fetch(attachment.url);
        const buffer = await response.buffer();
        fs.writeFileSync(filePath, buffer);

        // Upload the file to a specific channel
        const channel = client.channels.cache.get(process.env.UPLOAD_CHANNEL_ID);
        if (channel) {
            channel.send({
                files: [filePath]
            }).then(sentMessage => {
                const uploadedFile = sentMessage.attachments.first();
                message.reply(`Here's your direct link: \n\`${uploadedFile.url}\``);
            }).catch(console.error);
        }
    }

    // Tournament roll command
    if (command === 'roll') {
        const mentionedUser = message.mentions.users.first();
        if (!mentionedUser) {
            return message.reply('❌ Please mention a player to roll against! Usage: `!roll @player2`');
        }

        if (mentionedUser.id === message.author.id) {
            return message.reply('❌ You cannot roll against yourself!');
        }

        if (mentionedUser.bot) {
            return message.reply('❌ You cannot roll against a bot!');
        }

        const userId = message.author.id;
        const now = Date.now();

        if (rollCooldowns.has(userId)) {
            const expirationTime = rollCooldowns.get(userId) + ROLL_COOLDOWN;

            if (now < expirationTime) {
                const timeLeft = Math.round((expirationTime - now) / 1000);
                return message.reply(`⏰ You're on cooldown! Please wait ${timeLeft} more seconds before rolling again.`);
            }
        }

        rollCooldowns.set(userId, now);

        setTimeout(() => {
            rollCooldowns.delete(userId);
        }, ROLL_COOLDOWN);

        const roll = Math.floor(Math.random() * 2);
        const winner = roll === 0 ? message.author : mentionedUser;
        const loser = roll === 0 ? mentionedUser : message.author;

        const rollEmbed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle('🎲 Tournament Ban Order Roll')
            .setDescription(`**${message.author.displayName}** vs **${mentionedUser.displayName}**`)
            .addFields(
                {
                    name: '🏆 First to Ban',
                    value: `**${winner.displayName}** goes first!`,
                    inline: false
                },
                {
                    name: '⏳ Second to Ban',
                    value: `**${loser.displayName}** goes second!`,
                    inline: false
                }
            )
            .setFooter({
                text: `Roll initiated by ${message.author.displayName}`,
                iconURL: message.author.displayAvatarURL()
            })
            .setTimestamp();

        await message.channel.send({ embeds: [rollEmbed] });
        console.log(`Tournament roll: ${message.author.tag} vs ${mentionedUser.tag} - Winner: ${winner.tag}`);
    }

    // Check roll cooldown
    if (command === 'rollcd' || command === 'rollcooldown') {
        const userId = message.author.id;
        const now = Date.now();

        if (rollCooldowns.has(userId)) {
            const expirationTime = rollCooldowns.get(userId) + ROLL_COOLDOWN;

            if (now < expirationTime) {
                const timeLeft = Math.round((expirationTime - now) / 1000);
                return message.reply(`⏰ You have ${timeLeft} seconds left on your roll cooldown.`);
            } else {
                return message.reply('✅ You can use the roll command now!');
            }
        } else {
            return message.reply('✅ You can use the roll command now!');
        }
    }

    // Fetch images command
    if (command === 'fetchimages') {
        if (!message.member.permissions.has('ManageMessages')) {
            return message.reply('You need Manage Messages permission to use this command.');
        }

        if (args.length < 2) {
            return message.reply('Usage: !fetchimages [channelID] [botID] (limit)');
        }

        const targetChannelId = args[0];
        const targetBotId = args[1];
        const limit = args[2] ? parseInt(args[2]) : 100;

        message.reply(`Starting to fetch up to ${limit} images from bot <@${targetBotId}> in channel <#${targetChannelId}>...`);
        fetchImagesFromBot(message, targetChannelId, targetBotId, limit);
    }

    // Generate report command
    if (command === 'report') {
        if (args.length < 2) {
            return message.reply('Please provide a channel ID and time range (24h or 7d).');
        }

        const channelId = args[0];
        const timeRange = args[1].toLowerCase();

        if (timeRange !== '24h' && timeRange !== '7d') {
            return message.reply('Invalid time range. Please use 24h or 7d.');
        }

        generateReport(message, channelId, timeRange);
    }

    // Safety notice command
    if (command === "safe") {
        const safetyMessage = "**Please never click on suspicious links.**\n\n" +
            "The team will never share things such as airdrops, secret giveaways, or free NFTs. " +
            "Always double-check the Discord ID of staff members before interacting with DMs or links. " +
            "For your safety, only engage with links shared through our official channels, as these are verified and secure.";

        const embed = new EmbedBuilder()
            .setTitle('Safety Notice')
            .setDescription(safetyMessage)
            .setImage("https://i.postimg.cc/tgnTtqwD/Mystic-s-Missions-copy.png")
            .addFields(
                { name: '**Titan Talk**', value: `Don´t miss todays Titan Talk with Adz! https://discord.gg/qHkhThk4?event=1232672985308200980` }
            );

        message.channel.send({ embeds: [embed] });
    }

    // Forum builder help command
    if (command === "forum") {
        message.delete(1000);
        if (!message.member.roles.cache.some((r) => r.name === 'Hazy')) {
            message.channel.send('https://giphy.com/gifs/high-quality-highqualitygifs-L0coY9I1D2BnaKln9a');
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0xca3332)
            .setTitle("RoT Forum Builder")
            .setDescription("You are too lazy to open the Cloud Server? \nYou want to create Forum Messages with Mystic inside discord? \nJust use the RoT Forum Builder! \nEasy, fast and made by lazy people for lazy people! \n \n- !aim ChannelID \n- !tit YourTitel \n- !descrip YourDescription \n- !imageurl YourImageLink \n- !mystic1 Sents Message to target Forum\n\nEasy to use Image Links : \nTTM Coin : ``https://i.postimg.cc/pLQsDnvY/Picsart-23-11-21-01-15-36-541.png``\nLarge TTM Image : ``https://i.postimg.cc/L86sgv01/image.png``")
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
    }






    // Role check command
    if (command === 'rolecheck') {
        if (!message.member.permissions.has('ManageRoles')) {
        return message.reply('You do not have permission to use this command.');
    }

    // Check if a role is mentioned
    const roleMention = message.mentions.roles.first();
    if (!roleMention) {
        return message.reply('Please mention a role to check. Usage: `!rolecheck @role`');
    }

    // Check if a file is attached
    if (message.attachments.size === 0) {
        return message.reply('Please attach a text file containing the Discord IDs to check.');
    }

    const attachment = message.attachments.first();
    if (!attachment.name.endsWith('.txt')) {
        return message.reply('Please attach a valid .txt file.');
    }

    // Inform user that processing has started
    message.channel.send('Processing role check, please wait...');

    // Download and process the file
    (async () => {
        try {
            const response = await fetch(attachment.url);
            const text = await response.text();
            
            // Parse the file content
            const lines = text.split('\n').filter(line => line.trim() !== '');
            
            let results = {
                hasRole: [],
                doesNotHave: [],
                notFound: []
            };
            
            let processedCount = 0;
            const totalLines = lines.length;
            
            // Process each line to extract user ID
            for (const line of lines) {
                processedCount++;
                
                // Extract the user ID from different formats
                let userId = null;
                
                // Extract from <@ID> format
                const mentionMatch = line.match(/<@!?(\d+)>/);
                if (mentionMatch) {
                    userId = mentionMatch[1];
                } else {
                    // Extract just the ID if it's a plain number
                    const idMatch = line.match(/\d{17,20}/);
                    if (idMatch) {
                        userId = idMatch[0];
                    } else {
                        // Try to extract username if no ID is found
                        const parts = line.split(':');
                        if (parts.length > 0) {
                            const username = parts[0].trim();
                            // Try to find user by username in the guild
                            const guildMembers = await message.guild.members.fetch();
                            const member = guildMembers.find(m => 
                                m.user.username.toLowerCase() === username.toLowerCase() || 
                                (m.nickname && m.nickname.toLowerCase() === username.toLowerCase()));
                            
                            if (member) {
                                userId = member.id;
                            }
                        }
                    }
                }
                
                // If we found a userId, check if they have the role
                if (userId) {
                    try {
                        const member = await message.guild.members.fetch(userId);
                        if (member) {
                            const hasRole = member.roles.cache.has(roleMention.id);
                            if (hasRole) {
                                results.hasRole.push({
                                    id: userId,
                                    username: member.user.username,
                                    nickname: member.nickname
                                });
                            } else {
                                results.doesNotHave.push({
                                    id: userId,
                                    username: member.user.username,
                                    nickname: member.nickname
                                });
                            }
                        } else {
                            results.notFound.push({ line });
                        }
                    } catch (error) {
                        console.error(`Error fetching member ${userId}:`, error);
                        results.notFound.push({ id: userId, line });
                    }
                } else {
                    results.notFound.push({ line });
                }
                
                // Send a progress update every 10 users or at the end
                if (processedCount % 10 === 0 || processedCount === totalLines) {
                    await message.channel.send(`Progress: ${processedCount}/${totalLines} users processed`);
                }
            }
            
            // Create report embeds
            const mainEmbed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`Role Check Results: ${roleMention.name}`)
                .setDescription(`Total users processed: ${totalLines}`)
                .addFields(
                    { name: 'Has Role', value: `${results.hasRole.length} users`, inline: true },
                    { name: 'Missing Role', value: `${results.doesNotHave.length} users`, inline: true },
                    { name: 'Not Found', value: `${results.notFound.length} users`, inline: true }
                )
                .setTimestamp();
                
            await message.channel.send({ embeds: [mainEmbed] });
            
            // Function to create detail embeds
            const createDetailEmbed = (title, color, users) => {
                const embed = new EmbedBuilder()
                    .setColor(color)
                    .setTitle(title)
                    .setTimestamp();
                
                // Split into chunks of 20 users to avoid hitting embed field limits
                const chunks = [];
                for (let i = 0; i < users.length; i += 20) {
                    chunks.push(users.slice(i, i + 20));
                }
                
                return chunks.map((chunk, index) => {
                    const detailEmbed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${title} (Part ${index + 1}/${chunks.length})`);
                    
                    chunk.forEach((user, i) => {
                        if (user.username) {
                            const displayName = user.nickname || user.username;
                            detailEmbed.addFields({
                                name: `${i + 1 + (index * 20)}. ${displayName}`,
                                value: `ID: ${user.id}`,
                                inline: true
                            });
                        } else {
                            detailEmbed.addFields({
                                name: `${i + 1 + (index * 20)}. Unknown User`,
                                value: `Line: ${user.line}`,
                                inline: true
                            });
                        }
                    });
                    
                    return detailEmbed;
                });
            };
            
            // Send detail embeds if there are users in each category
            if (results.hasRole.length > 0) {
                const hasRoleEmbeds = createDetailEmbed('Users With Role', 0x00FF00, results.hasRole);
                for (const embed of hasRoleEmbeds) {
                    await message.channel.send({ embeds: [embed] });
                }
            }
            
            if (results.doesNotHave.length > 0) {
                const doesNotHaveEmbeds = createDetailEmbed('Users Missing Role', 0xFF0000, results.doesNotHave);
                for (const embed of doesNotHaveEmbeds) {
                    await message.channel.send({ embeds: [embed] });
                }
            }
            
            if (results.notFound.length > 0) {
                const notFoundEmbeds = createDetailEmbed('Users Not Found', 0xFFFF00, results.notFound);
                for (const embed of notFoundEmbeds) {
                    await message.channel.send({ embeds: [embed] });
                }
            }
            
            // Generate a CSV file with the results
            const csvData = [
                ['Status', 'Username', 'Nickname', 'UserID'],
                ...results.hasRole.map(user => ['Has Role', user.username, user.nickname || '', user.id]),
                ...results.doesNotHave.map(user => ['Missing Role', user.username, user.nickname || '', user.id]),
                ...results.notFound.map(user => ['Not Found', '', '', user.id || user.line])
            ];
            
            const csvContent = csvData.map(row => row.join(',')).join('\n');
            
            // Save the CSV file
            const csvFilePath = path.join(__dirname, 'role-check-results.csv');
            fs.writeFileSync(csvFilePath, csvContent);
            
            // Send the CSV file as an attachment
            const csvAttachment = new AttachmentBuilder(csvFilePath, { name: `role-check-${roleMention.name}.csv` });
            await message.channel.send({ 
                content: 'Here is a CSV file with detailed results:', 
                files: [csvAttachment] 
            });
            
        } catch (error) {
            console.error('Error processing file:', error);
            message.channel.send(`An error occurred while processing the file: ${error.message}`);
        }
    })();
}





// Update the riddle command with Complete the Line Challenge #3
if (command === 'riddle') {
  // Check for permissions 
  if (!message.member.permissions.has('ManageMessages')) {
    return message.reply('You need Manage Messages permission to use this command.');
  }

  // Define the channel to post the riddle in
  const riddleChannelId = args[0] || message.channel.id; // Use provided ID or current channel
  const modChannelId = process.env.MOD_CHANNEL_ID;

  try {
    const riddleChannel = client.channels.cache.get(riddleChannelId);
    if (!riddleChannel) {
      return message.reply('Invalid channel ID.');
    }

    // Create the embed for Complete the Line Challenge #3
    const riddleEmbed = new EmbedBuilder()
      .setColor(0xca3332)
      .setTitle("💥 Complete the Line Challenge #3 💥")
      .setDescription("TitanArmy! <:ROT:1105716764542763138>\n\n**Episode 5:** \"You have been given the power to...\"\n\n**Complete the line!**\n\n**🏆 Reward:**\n• **Correct Answer:** 2 Mega Loot Box")
      .setImage("https://i.ibb.co/B2f1qcgp/Mystic-4.png")
      .setFooter({ text: "Submit your answer below! Unlimited attempts." })
      .setTimestamp();

    // Create the button for submission
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('submitRiddleAnswer')
          .setLabel('Submit Your Answer')
          .setStyle(ButtonStyle.Primary)
      );

    // Send the riddle embed with button
    await riddleChannel.send({ embeds: [riddleEmbed], components: [row] });
    
    message.reply(`Complete the Line Challenge #3 has been posted in <#${riddleChannelId}>!`);
  } catch (error) {
    console.error('Error posting challenge:', error);
    message.reply(`An error occurred: ${error.message}`);
  }
}

// Update the reminder function with Complete the Line Challenge #3
if (command === 'riddlereminder') {
  // Check for permissions
  if (!message.member.permissions.has('ManageMessages')) {
    return message.reply('You need Manage Messages permission to use this command.');
  }

  const subCommand = args[0]?.toLowerCase();
  
  if (subCommand === 'start') {
    // Set channel ID (use provided or current channel)
    riddleReminderChannelId = args[1] || message.channel.id;
    
    // Check if the channel exists
    const reminderChannel = client.channels.cache.get(riddleReminderChannelId);
    if (!reminderChannel) {
      return message.reply('Invalid channel ID.');
    }
    
    // Stop existing job if it's running
    if (riddleReminderJob) {
      riddleReminderJob.cancel();
    }
    
    // Schedule the job to run every 12 hours
    riddleReminderJob = schedule.scheduleJob('0 */12 * * *', async function() {
      try {
        // Create the same challenge embed for the reminder
        const riddleEmbed = new EmbedBuilder()
          .setColor(0xca3332)
          .setTitle("💥 Complete the Line Challenge #3 💥")
          .setDescription("REMINDER: TitanArmy! <:ROT:1105716764542763138>\n\n**Episode 5:** \"You have been given the power to...\"\n\n**Complete the line!**\n\n**🏆 Reward:**\n• **Correct Answer:** 2 Mega Loot Box")
          .setImage("https://i.ibb.co/B2f1qcgp/Mystic-4.png")
          .setFooter({ text: "Submit your answer below! Unlimited attempts." })
          .setTimestamp();

        // Create the button for submission
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('submitRiddleAnswer')
              .setLabel('Submit Your Answer')
              .setStyle(ButtonStyle.Primary)
          );

        // Send the riddle embed with button
        await reminderChannel.send({ embeds: [riddleEmbed], components: [row] });
        console.log(`Challenge reminder sent to channel ${riddleReminderChannelId}`);
      } catch (error) {
        console.error('Error sending challenge reminder:', error);
      }
    });
    
    riddleReminderActive = true;
    message.reply(`Challenge reminders scheduled for every 12 hours in <#${riddleReminderChannelId}>.`);
    
  } else if (subCommand === 'stop') {
    // Stop the scheduler
    if (riddleReminderJob) {
      riddleReminderJob.cancel();
      riddleReminderJob = null;
      riddleReminderActive = false;
      message.reply('Challenge reminders have been stopped.');
    } else {
      message.reply('No challenge reminders are currently active.');
    }
    
  } else if (subCommand === 'status') {
    // Check the status
    if (riddleReminderActive) {
      message.reply(`Challenge reminders are active and scheduled for <#${riddleReminderChannelId}>.`);
    } else {
      message.reply('Challenge reminders are currently inactive.');
    }
    
  } else {
    // Show help for the command
    const helpEmbed = new EmbedBuilder()
      .setColor(0xca3332)
      .setTitle("Challenge Reminder Help")
      .setDescription("Commands for managing automated challenge reminders:")
      .addFields(
        { name: "!riddlereminder start [channelID]", value: "Start sending challenge reminders every 12 hours to the specified channel (or current channel if none specified)" },
        { name: "!riddlereminder stop", value: "Stop automated challenge reminders" },
        { name: "!riddlereminder status", value: "Check if challenge reminders are currently active" }
      );
      
    message.channel.send({ embeds: [helpEmbed] });
  }
}


// Update reset command
if (command === 'riddlereset') {
  if (!message.member.permissions.has('ManageMessages')) {
    return message.reply('You need Manage Messages permission to use this command.');
  }
  
  riddleCorrectUsers.clear();
  userChallengeProgress.clear(); // Clear individual progress
  
  message.reply('The challenge has been reset. All users can submit answers again and attempt tracking has been cleared.');
}

// Update stats command
if (command === 'riddlestats') {
  if (!message.member.permissions.has('ManageMessages')) {
    return message.reply('You need Manage Messages permission to use this command.');
  }
  
  const totalParticipants = userChallengeProgress.size;
  const completedUsers = riddleCorrectUsers.size;
  const activeUsers = totalParticipants - completedUsers;
  
  // Calculate total attempts
  let totalAttempts = 0;
  userChallengeProgress.forEach((progress) => {
    totalAttempts += progress.attempts;
  });
  
  const statsEmbed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle("💥 Complete the Line Challenge #3 Statistics")
    .setDescription(`**Completed:** ${completedUsers} users\n**Still Trying:** ${activeUsers} users\n**Total Participants:** ${totalParticipants}\n**Total Attempts:** ${totalAttempts}\n**Success Rate:** ${totalParticipants > 0 ? Math.round((completedUsers / totalParticipants) * 100) : 0}%`)
    .setTimestamp();
  
  message.reply({ embeds: [statsEmbed] });
}

// Individual progress command
if (command === 'riddleprogress') {
  if (!message.member.permissions.has('ManageMessages')) {
    return message.reply('You need Manage Messages permission to use this command.');
  }
  
  const targetUserId = args[0];
  if (!targetUserId) {
    return message.reply('Please provide a user ID. Usage: `!riddleprogress <userID>`');
  }
  
  if (!userChallengeProgress.has(targetUserId)) {
    return message.reply('This user has not participated in the challenge yet.');
  }
  
  const progress = userChallengeProgress.get(targetUserId);
  const user = await client.users.fetch(targetUserId).catch(() => null);
  const username = user ? user.tag : 'Unknown User';
  const completed = riddleCorrectUsers.has(targetUserId);
  
  const progressEmbed = new EmbedBuilder()
    .setColor(completed ? 0x00FF00 : 0xFFAA00)
    .setTitle(`Individual Progress: ${username}`)
    .setDescription(`**Status:** ${completed ? '✅ Completed' : '🔄 Still Trying'}\n**Attempts:** ${progress.attempts}\n**Challenge:** Complete the Episode 5 quote`)
    .setTimestamp();
  
  message.reply({ embeds: [progressEmbed] });
}


    if (message.content === '!setup') {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('setChannel')
                    .setLabel('Set Channel')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('setTitle')
                    .setLabel('Set Title')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('setDescription')
                    .setLabel('Set Description')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('setImage')
                    .setLabel('Set Image')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('sendEmbed')
                    .setLabel('Send Forum Post')
                    .setStyle(ButtonStyle.Success)
            );

        const embed = new EmbedBuilder()
            .setColor(0x00AE86)
            .setTitle("Mystic Forum Creator V2")
            .setDescription("Use the buttons below to set up your forum post:")
            .setImage("https://media.discordapp.net/attachments/1036349587394408468/1249544200807125052/800_x_400_09.53.47.png?ex=6667b038&is=66665eb8&hm=597487b9f523d7c7266ffb4c894aaee02d4ab0771313e0ac9d85d8dcc750cb3f&=&format=webp&quality=lossless&width=1100&height=550")
            .addFields(
                { name: "Select Channel", value: "Click to select the target channel for the forum post." },
                { name: "Set Title", value: "Click to set the title for the forum post." },
                { name: "Set Description", value: "Click to set the description for the forum post." },
                { name: "Set Image", value: "Click to upload an image for the forum post." },
                { name: "Send Forum Post", value: "Click to create the forum post with the provided details." }
            );

        await message.channel.send({ embeds: [embed], components: [row] });
    }


/**
 * Fetches and downloads images sent by a specific bot in a specific channel
 * @param {Object} message - The original command message
 * @param {string} channelId - The ID of the channel to fetch messages from
 * @param {string} botId - The ID of the bot to filter messages by
 * @param {number} limit - Maximum number of messages to fetch
 */
async function fetchImagesFromBot(message, channelId, botId, limit) {
    try {
        // Get the target channel
        const targetChannel = await client.channels.fetch(channelId);
        if (!targetChannel) {
            return message.reply('Invalid channel ID.');
        }

        // Create downloads directory if it doesn't exist
        const downloadsDir = path.join(__dirname, 'downloads', 'images', channelId, botId);
        if (!fs.existsSync(downloadsDir)) {
            fs.mkdirSync(downloadsDir, { recursive: true });
        }

        let statusMessage = await message.channel.send('Fetching messages...');
        
        // Variables to track progress
        let fetchedCount = 0;
        let downloadedCount = 0;
        let lastMessageId = null;
        let images = [];

        // Keep fetching messages until we reach the limit
        while (fetchedCount < limit) {
            const options = { limit: 100 }; // Discord API allows max 100 messages per request
            
            if (lastMessageId) {
                options.before = lastMessageId;
            }

            // Fetch messages
            const messages = await targetChannel.messages.fetch(options);
            
            if (messages.size === 0) {
                break; // No more messages
            }

            // Update lastMessageId for pagination
            lastMessageId = messages.last().id;
            
            // Filter messages by bot ID and has attachments
            const botMessages = messages.filter(msg => 
                msg.author.id === botId && 
                msg.attachments.size > 0
            );

            // Extract image attachments
            botMessages.forEach(msg => {
                msg.attachments.forEach(attachment => {
                    // Check if attachment is an image
                    if (attachment.contentType && attachment.contentType.startsWith('image/')) {
                        images.push({
                            url: attachment.url,
                            filename: attachment.name || `image_${Date.now()}_${attachment.id}.${getExtension(attachment.url)}`
                        });
                    }
                });
            });

            fetchedCount += messages.size;
            
            // Update status message every 500 messages
            if (fetchedCount % 500 === 0) {
                await statusMessage.edit(`Fetched ${fetchedCount} messages, found ${images.length} images so far...`);
            }
            
            // If we have fewer than 100 messages, we've reached the end
            if (messages.size < 100) {
                break;
            }
        }

        // Update status message with final fetch count
        await statusMessage.edit(`Fetched ${fetchedCount} messages, found ${images.length} images. Starting download...`);

        // Download each image
        for (let i = 0; i < images.length; i++) {
            const image = images[i];
            const filePath = path.join(downloadsDir, sanitizeFilename(image.filename));
            
            // Download the image
            await downloadImage(image.url, filePath);
            downloadedCount++;
            
            // Update status every 10 downloads
            if (downloadedCount % 10 === 0 || downloadedCount === images.length) {
                await statusMessage.edit(`Downloading images: ${downloadedCount}/${images.length} complete...`);
            }
        }

        // Create a text file with all image URLs
        const urlListPath = path.join(downloadsDir, 'image_urls.txt');
        fs.writeFileSync(urlListPath, images.map(img => img.url).join('\n'));

        // Create a zip file attachment if there are images
        if (images.length > 0) {
            const zipAttachment = await createZipAttachment(downloadsDir, `bot_${botId}_images.zip`);
            await message.channel.send({
                content: `Completed! Downloaded ${downloadedCount} images from bot <@${botId}> in channel <#${channelId}>.`,
                files: [zipAttachment]
            });
        } else {
            await message.channel.send(`No images found from bot <@${botId}> in channel <#${channelId}>.`);
        }

    } catch (error) {
        console.error('Error fetching images:', error);
        message.channel.send(`An error occurred while fetching images: ${error.message}`);
    }
}

/**
 * Downloads an image from a URL to a file path
 * @param {string} url - URL of the image to download
 * @param {string} filePath - Path to save the image to
 * @returns {Promise} - Promise that resolves when the download is complete
 */
function downloadImage(url, filePath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filePath);
        
        https.get(url, response => {
            response.pipe(file);
            
            file.on('finish', () => {
                file.close(resolve);
            });
            
            file.on('error', err => {
                fs.unlink(filePath, () => {}); // Delete the file if there was an error
                reject(err);
            });
        }).on('error', err => {
            fs.unlink(filePath, () => {}); // Delete the file if there was an error
            reject(err);
        });
    });
}

/**
 * Gets the file extension from a URL
 * @param {string} url - The URL to extract extension from
 * @returns {string} - The file extension (without the dot)
 */
function getExtension(url) {
    const pathname = new URL(url).pathname;
    const filename = pathname.split('/').pop();
    const extension = filename.split('.').pop();
    return extension || 'jpg'; // Default to jpg if no extension found
}

/**
 * Sanitizes a filename by removing invalid characters
 * @param {string} filename - The filename to sanitize
 * @returns {string} - The sanitized filename
 */
function sanitizeFilename(filename) {
    return filename.replace(/[/\\?%*:|"<>]/g, '-');
}

/**
 * Creates a ZIP file of downloaded images
 * @param {string} directory - Directory containing images
 * @param {string} zipName - Name for the ZIP file
 * @returns {AttachmentBuilder} - Discord.js attachment for the ZIP file
 */
async function createZipAttachment(directory, zipName) {
    const AdmZip = require('adm-zip'); // Make sure to install this: npm install adm-zip
    
    const zip = new AdmZip();
    const outputFile = path.join(__dirname, 'downloads', zipName);
    
    // Add all files except the image_urls.txt
    const files = fs.readdirSync(directory);
    files.forEach(file => {
        if (file !== 'image_urls.txt') {
            const filePath = path.join(directory, file);
            if (fs.statSync(filePath).isFile()) {
                zip.addLocalFile(filePath);
            }
        }
    });
    
    // Also add the image_urls.txt file
    const urlsFilePath = path.join(directory, 'image_urls.txt');
    if (fs.existsSync(urlsFilePath)) {
        zip.addLocalFile(urlsFilePath);
    }
    
    // Write the zip file
    zip.writeZip(outputFile);
    
    // Return as an attachment
    return new AttachmentBuilder(outputFile, { name: zipName });
}

async function generateReport(message, channelId, timeRange) {
    try {
        await message.channel.send("📊 Generating report... This may take a moment.");

        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            return message.reply('Invalid channel ID.');
        }

        const now = new Date();
        const startTime = timeRange === '24h' ? now.getTime() - 24 * 60 * 60 * 1000 : now.getTime() - 7 * 24 * 60 * 60 * 1000;

        let messages = await channel.messages.fetch({ limit: 100 });
        messages = messages.filter(msg => msg.createdTimestamp > startTime);

        const messageContent = messages.map(msg => `${msg.author.username}: ${msg.content}`).join('\n');

        const prompt = `Analyze and summarize the following chat messages from the last ${timeRange === '24h' ? '24 hours' : '7 days'}:\n\n${messageContent}\n\nProvide a detailed, well-structured report including key topics discussed, notable interactions, and any important information shared. Be thorough in your analysis.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 3000
        });

        const report = response.choices[0].message.content;

        const embedLimit = 4096;
        const embeds = [];
        let currentEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`Chat Report - Last ${timeRange === '24h' ? '24 Hours' : '7 Days'}`)
            .setTimestamp();

        let currentDescription = '';
        const words = report.split(' ');

        for (const word of words) {
            if ((currentDescription + word).length > embedLimit) {
                currentEmbed.setDescription(currentDescription.trim());
                embeds.push(currentEmbed);

                currentEmbed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle(`Chat Report - Last ${timeRange === '24h' ? '24 Hours' : '7 Days'} (Continued)`)
                    .setTimestamp();
                currentDescription = '';
            }
            currentDescription += word + ' ';
        }

        if (currentDescription) {
            currentEmbed.setDescription(currentDescription.trim());
            embeds.push(currentEmbed);
        }

        for (const embed of embeds) {
            await message.channel.send({ embeds: [embed] });
        }

        await message.channel.send("📊 Report generation complete!");
    } catch (error) {
        console.error('Error generating report:', error);
        message.reply('An error occurred while generating the report.');
    }
}

});

client.on(Events.InteractionCreate, async interaction => {
  // Skip if it's not a button, modal submit, or select menu
  if (!interaction.isButton() && !interaction.isModalSubmit() && !interaction.isSelectMenu()) return;

  try {
    // Handle Complete the Line Challenge #3 button click
    if (interaction.isButton() && interaction.customId === 'submitRiddleAnswer') {
      const userId = interaction.user.id;
      
      // Check if user already completed the challenge
      if (riddleCorrectUsers.has(userId)) {
        await interaction.reply({
          content: "You've already completed this challenge successfully! 🎉",
          ephemeral: true
        });
        return;
      }
      
      // Get user's attempt count
      const userProgress = userChallengeProgress.get(userId) || { submitted: [], attempts: 0 };
      
      // Create the modal with single input
      const modal = new ModalBuilder()
        .setCustomId('riddleAnswerModal')
        .setTitle("Complete the Line #3");
    
      // Answer input
      const answerInput = new TextInputBuilder()
        .setCustomId('powerAnswer')
        .setLabel(`Complete the quote (Attempt ${userProgress.attempts + 1})`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("...the power to...")
        .setRequired(true);
    
      // Add input to action row
      const firstActionRow = new ActionRowBuilder().addComponents(answerInput);
      modal.addComponents(firstActionRow);
    
      // Show the modal
      await interaction.showModal(modal);
      return;
    }
    
    // Handle modal submission for Complete the Line Challenge #3
    if (interaction.isModalSubmit() && interaction.customId === 'riddleAnswerModal') {
      const userId = interaction.user.id;
      
      // Check if user already completed the challenge
      if (riddleCorrectUsers.has(userId)) {
        await interaction.reply({
          content: "You've already completed this challenge successfully! 🎉",
          ephemeral: true
        });
        return;
      }
      
      // Get or create user progress
      if (!userChallengeProgress.has(userId)) {
        userChallengeProgress.set(userId, {
          submitted: [],
          attempts: 0
        });
      }
      
      const userProgress = userChallengeProgress.get(userId);
      
      // Get the answer
      const userAnswer = interaction.fields.getTextInputValue('powerAnswer').toLowerCase().trim();
      
      // Function to check if an answer is correct - VERY FLEXIBLE
      const checkAnswer = (answer) => {
        // Normalize the answer - remove punctuation and extra spaces
        answer = answer.toLowerCase()
          .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()""…]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        
        // Core concepts that MUST be present
        const hasUnlock = answer.includes("unlock") || answer.includes("open") || answer.includes("activate");
        const hasTotem = answer.includes("totem");
        
        // If both core concepts are present, it's correct!
        if (hasUnlock && hasTotem) {
          return true;
        }
        
        // Check for close matches with the exact quote
        const exactVariations = [
          "unlock the totem",
          "unlock totem",
          "open the totem",
          "activate the totem",
          "unlock the totems",
          "open the totems"
        ];
        
        for (const variation of exactVariations) {
          if (answer.includes(variation.toLowerCase())) {
            return true;
          }
        }
        
        // Check if the meaning is captured even with different wording
        const meaningCapture = (
          (answer.includes("unlock") || answer.includes("open") || answer.includes("free") || answer.includes("access")) &&
          (answer.includes("totem") || answer.includes("artifact"))
        );
        
        if (meaningCapture) {
          return true;
        }
        
        return false;
      };
      
      // Update user progress
      userProgress.attempts++;
      userProgress.submitted.push(new Date());
      
      // Check if the answer is correct
      const isCorrect = checkAnswer(userAnswer);
      
      // Determine response message
      let successMessage = "";
      let rewardText = "";
      
      if (isCorrect) {
        // Correct answer!
        riddleCorrectUsers.add(userId);
        successMessage = `💥 PERFECT! "...unlock the Totem." The power has been granted in Episode 5! Our moderators will send you 2 Mega Loot Box!`;
        rewardText = "2 Mega Loot Box";
      } else {
        // Incorrect answer
        successMessage = `❌ Not quite! Think about Episode 5 - what specific ability was granted? Try again!`;
        rewardText = "No reward";
      }
      
      await interaction.reply({ 
        content: successMessage, 
        ephemeral: true 
      });
      
      // Only send notification to mod channel for correct answers (to reduce spam)
      if (isCorrect) {
        const modChannel = client.channels.cache.get(process.env.MOD_CHANNEL_ID);
        if (modChannel) {
          const notificationEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle("💥 Complete the Line Challenge #3 - CORRECT!")
            .setDescription(`User **${interaction.user.tag}** (${interaction.user.id}) - Attempt #${userProgress.attempts}\n\n**Answer submitted:** "${userAnswer}"\n**Result:** ✅ CORRECT\n**Expected:** "...unlock the Totem."\n**Reward:** ${rewardText}`)
            .setTimestamp();
              
          await modChannel.send({ embeds: [notificationEmbed] });
        }
      }
      return;
    }
    
    

    // Handle the existing button interactions from your forum builder
    if (interaction.customId === 'setChannel') {
      const channelSelectRow = new ActionRowBuilder()
        .addComponents(
          new SelectMenuBuilder()
            .setCustomId('selectChannel')
            .setPlaceholder('Select a channel')
            .addOptions([
              {
                label: 'English Forum',
                description: 'Send the Forum post for the Global Community',
                value: '1186264373849763861', 
              },
              {
                label: 'ESP Forum',
                description: 'Send the Forum post for the ESP Community',
                value: '1187760766598791279',
              },
              {
                label: 'Test Forum',
                description: 'Send the Forum post in a Test Channel',
                value: '1186675498995155024',
              }
            ])
        );
      await interaction.reply({ content: 'Please select a channel:', components: [channelSelectRow], ephemeral: true });
      return;
    }

    if (interaction.customId === 'selectChannel') {
      targetChannelId = interaction.values[0];
      await interaction.update({ content: `Channel ID set to ${targetChannelId}!`, components: [], ephemeral: true });
      return;
    }

    // The rest of your forum builder interaction handlers
    if (interaction.customId === 'setTitle') {
      await interaction.reply({ content: 'Please enter the forum post title:', ephemeral: true });
      const collectedTitle = await interaction.channel.awaitMessages({ filter: m => m.author.id === interaction.user.id, max: 1, time: 60000, errors: ['time'] });
      embedTitle = collectedTitle.first().content;
      await collectedTitle.first().delete();
      await interaction.followUp({ content: 'Title set!', ephemeral: true });
      return;
    }

    if (interaction.customId === 'setDescription') {
      await interaction.reply({ content: 'Please enter the forum post description:', ephemeral: true });
      const collectedDescription = await interaction.channel.awaitMessages({ filter: m => m.author.id === interaction.user.id, max: 1, time: 60000, errors: ['time'] });
      embedDescription = collectedDescription.first().content;
      await collectedDescription.first().delete();
      await interaction.followUp({ content: 'Description set!', ephemeral: true });
      return;
    }

    if (interaction.customId === 'setImage') {
      await interaction.reply({ content: 'Please upload the image:', ephemeral: true });
      const collectedImage = await interaction.channel.awaitMessages({ filter: m => m.author.id === interaction.user.id, max: 1, time: 60000, errors: ['time'] });
      
      // Handle image upload
      if (collectedImage.first().attachments.size > 0) {
        const attachment = collectedImage.first().attachments.first();
        const filePath = path.join(__dirname, 'downloads', attachment.name);

        // Download the file
        const response = await fetch(attachment.url);
        const buffer = await response.buffer();
        fs.writeFileSync(filePath, buffer);

        // Upload the file to a specific channel
        const uploadChannel = client.channels.cache.get(process.env.UPLOAD_CHANNEL_ID);
        if (uploadChannel) {
          const sentMessage = await uploadChannel.send({ files: [filePath] });
          const uploadedFile = sentMessage.attachments.first();
          embedImageUrl = uploadedFile.url;
          await interaction.followUp({ content: `Image URL set: ${embedImageUrl}`, ephemeral: true });
        }
      } else {
        await interaction.followUp({ content: 'No image was uploaded.', ephemeral: true });
      }
      await collectedImage.first().delete();
      return;
    }

    if (interaction.customId === 'sendEmbed') {
      await interaction.deferReply({ ephemeral: true });

      try {
        const targetChannel = await client.channels.fetch(targetChannelId);
        if (targetChannel.type !== ChannelType.GuildForum) {
          throw new Error('The specified channel is not a forum channel.');
        }
        const attachment = new AttachmentBuilder(embedImageUrl);
        const thread = await targetChannel.threads.create({
          name: embedTitle,
          autoArchiveDuration: 1440,
          message: {
            content: `${embedDescription}`,
            files: [attachment] 
          }
        });

        await interaction.editReply({ content: `Forum thread created! ${thread.url}`, ephemeral: true });
      } catch (error) {
        console.error(error);
        await interaction.editReply({ content: `Error: ${error.message}`, ephemeral: true });
      }
      return;
    }

    // Default case if no other handler matched
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Unknown action.', ephemeral: true });
    }
    
  } catch (error) {
    console.error('Error in interaction handler:', error);
    
    // Only try to respond if we haven't already responded
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({ 
          content: "There was an error processing your request. Please try again.", 
          ephemeral: true 
        });
      } catch (replyError) {
        console.error('Failed to send error message:', replyError);
      }
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);