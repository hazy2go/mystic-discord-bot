// ╔══════════════════════════════════════════════════════════════════════════════════╗
// ║                              MYSTIC 2.0                                        ║
// ║               Reign of Titans — Unified Discord Bot                            ║
// ╠══════════════════════════════════════════════════════════════════════════════════╣
// ║                                                                                ║
// ║  Merged from the original Mogan (tournament admin) and Mystic (raids &         ║
// ║  community engagement) bots into a single, unified system.                     ║
// ║                                                                                ║
// ╠══════════════════════════════════════════════════════════════════════════════════╣
// ║  SLASH COMMANDS                                                                ║
// ║  ──────────────                                                                ║
// ║  /data              - Look up your tournament registration & bracket data      ║
// ║  /win @user          - Declare a tournament match winner, rename channel,      ║
// ║                        update permissions, and ping relevant moderators         ║
// ║  /win-stats          - View how many times each mod has used /win              ║
// ║  /reset-win-stats    - Reset all moderator /win usage statistics (admin)       ║
// ║  /archive            - Export a channel's messages to a text transcript         ║
// ║                        with timeframe filters and bot-message toggle           ║
// ║  /update-database    - Upload an Excel/CSV file to refresh the tournament DB   ║
// ║                        with preview mode for safety                            ║
// ║  /panel              - Create, edit, post, and manage Components V2 panels     ║
// ║     create/edit/list/delete/post/update/json/export subcommands                ║
// ║  /welcome            - Manage role-triggered welcome messages using panels     ║
// ║     add/remove/list subcommands                                                ║
// ║                                                                                ║
// ╠══════════════════════════════════════════════════════════════════════════════════╣
// ║  PREFIX COMMANDS (!)                                                           ║
// ║  ───────────────────                                                           ║
// ║  !create             - Bulk-create tournament ticket channels for eligible     ║
// ║                        holders (admin only)                                    ║
// ║  !upload             - Upload an attachment and get a permanent CDN link       ║
// ║  !roll @player       - Random ban-order roll for tournament matches (30s cd)   ║
// ║  !rollcd             - Check your remaining roll cooldown                      ║
// ║  !fetchimages        - Download all images from a specific bot in a channel    ║
// ║                        Usage: !fetchimages [channelID] [botID] (limit)         ║
// ║  !report             - Generate an AI-powered chat summary via OpenAI          ║
// ║                        Usage: !report [channelID] [24h|7d]                     ║
// ║  !riddle             - Post the Complete the Line Challenge with submit button ║
// ║  !riddlereminder     - Schedule/stop automated challenge reminders (12h)       ║
// ║  !riddlereset        - Reset challenge progress so all users can retry         ║
// ║  !riddlestats        - View challenge participation & completion statistics    ║
// ║  !riddleprogress     - Check an individual user's challenge attempts           ║
// ║                        Usage: !riddleprogress [userID]                         ║
// ║  !raidreminder       - Manually trigger raid reminders for open raids          ║
// ║                        Usage: !raidreminder [all|1|2|3|status]                 ║
// ║  !setup              - Interactive forum post builder with buttons             ║
// ║                                                                                ║
// ╠══════════════════════════════════════════════════════════════════════════════════╣
// ║  AUTOMATED FEATURES                                                            ║
// ║  ──────────────────                                                            ║
// ║  - Raid system: 3 parallel raid queues (EN/EN/PT) with 1-hour intervals,      ║
// ║    automatic forum thread creation, and bilingual notifications                ║
// ║  - Raid reminders: Cron jobs at 6am & 6pm JST for active raids                ║
// ║  - Forum thread auto-replies: Reminds raiders to follow/like/share            ║
// ║  - Tournament auto-messages: Posts rules when channels/threads are created     ║
// ║    in mapped tournament category IDs                                           ║
// ║  - Challenge system: Modal-based answer submission with unlimited attempts,    ║
// ║    progress tracking, and mod notifications on correct answers                 ║
// ║                                                                                ║
// ╠══════════════════════════════════════════════════════════════════════════════════╣
// ║  CONFIGURATION                                                                 ║
// ║  ─────────────                                                                 ║
// ║  All secrets & channel IDs are loaded from .env (see .env.example).            ║
// ║  Tournament data is stored in SQLite (TTV10.db).                               ║
// ║  Mod stats are persisted in mod-stats.json.                                    ║
// ║                                                                                ║
// ╚══════════════════════════════════════════════════════════════════════════════════╝

// ========================================================================================
// IMPORTS
// ========================================================================================

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const fetch = require('node-fetch');
const https = require('https');
const schedule = require('node-schedule');
const XLSX = require('xlsx');
const Papa = require('papaparse');
const sqlite3 = require('sqlite3').verbose();
const { OpenAI } = require('openai');
const { parse } = require('csv-parse/sync');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  Partials,
  ChannelType,
  AttachmentBuilder,
  SelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  Collection,
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ThumbnailBuilder,
  FileBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  StringSelectMenuBuilder,
} = require('discord.js');

// ========================================================================================
// CONFIGURATION & CONSTANTS
// ========================================================================================

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || '925747778548801557';
const GIPHY_API_KEY = 'bmtnQFfuxy2IfZWEFn3YVv46vSmTbPQD';
const statsFilePath = path.join(__dirname, 'mod-stats.json');
const PREFIX = '!';

// Tournament ticket config
const ticketConfig = {
  guildId: GUILD_ID,
  ticketRoleId: '1038108123526864906',
  exemptRoleId: '1250382515995148289',
  categoryName: 'Tournament Tickets',
  maxTicketsPerCategory: 50,
};

// Cooldowns & rate limiting
const COOLDOWN_TIME = 30000;
const SPAM_WARNING_COOLDOWN = 5000;
const WARNING_DELETE_TIME = 3000;
const ROLL_COOLDOWN = 30000;

// Raid system channels (3 parallel systems)
const TWEET_CHANNEL_ID = process.env.TWEET_CHANNEL_ID;
const FORUM_CHANNEL_ID = process.env.FORUM_CHANNEL_ID;
const NOTIFY_CHANNEL_ID = process.env.NOTIFY_CHANNEL_ID;
const RAIDER_ROLE_ID = process.env.RAIDER_ROLE_ID;

const TWEET_CHANNEL_ID_2 = process.env.TWEET_CHANNEL_ID_2;
const FORUM_CHANNEL_ID_2 = process.env.FORUM_CHANNEL_ID_2;
const NOTIFY_CHANNEL_ID_2 = process.env.NOTIFY_CHANNEL_ID_2;
const RAIDER_ROLE_ID_2 = process.env.RAIDER_ROLE_ID_2;

const TWEET_CHANNEL_ID_3 = process.env.TWEET_CHANNEL_ID_3;
const FORUM_CHANNEL_ID_3 = process.env.FORUM_CHANNEL_ID_3;
const NOTIFY_CHANNEL_ID_3 = process.env.NOTIFY_CHANNEL_ID_3;
const RAIDER_ROLE_ID_3 = process.env.RAIDER_ROLE_ID_3;

// Raid type toggles
const raidToggles = {
  system1: { twitter: false, instagram: true },
  system2: { twitter: false, instagram: true },
  system3: { twitter: false, instagram: true },
};

// ========================================================================================
// DISCORD CLIENT SETUP
// ========================================================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ========================================================================================
// DATABASE SETUP
// ========================================================================================

const db = new sqlite3.Database('./TTV10.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('Error opening database', err);
  } else {
    console.log('Database opened in read-write mode');
    db.run('PRAGMA foreign_keys = ON');
    db.run(`CREATE TABLE IF NOT EXISTS panels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#E8943A',
      components TEXT DEFAULT '[]',
      created_by TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now')),
      UNIQUE(guild_id, name)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS panel_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      panel_id INTEGER NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      posted_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (panel_id) REFERENCES panels(id) ON DELETE CASCADE
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS welcome_triggers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      panel_id INTEGER NOT NULL,
      created_by TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (panel_id) REFERENCES panels(id) ON DELETE CASCADE
    )`);
    console.log('Panel, panel_posts, and welcome_triggers tables ensured');
  }
});

// ========================================================================================
// OPENAI CLIENT
// ========================================================================================

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ========================================================================================
// DATABASE ASYNC HELPERS
// ========================================================================================

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

// ========================================================================================
// STATE VARIABLES
// ========================================================================================

// Command cooldowns
const cooldowns = new Map();
let commandCounter = 0;

// Roll cooldowns
const rollCooldowns = new Map();

// Challenge system
let riddleCorrectUsers = new Set();
let userChallengeProgress = new Map();

// Forum thread raid-proof reminders (Map<threadId, Set<userId>>)
let forumThreadReminders = new Map();

// Social media post queues (3 parallel systems)
let tweetQueue = [];
let lastTweetTime = 0;
let processingQueue = false;

let tweetQueue2 = [];
let lastTweetTime2 = 0;
let processingQueue2 = false;

let tweetQueue3 = [];
let lastTweetTime3 = 0;
let processingQueue3 = false;

// Riddle reminder scheduling
let riddleReminderActive = false;
let riddleReminderChannelId = process.env.RIDDLE_REMINDER_CHANNEL_ID || process.env.NOTIFY_CHANNEL_ID;
let riddleReminderJob = null;

// Raid reminder cron jobs
let raidReminderMorningJob = null;
let raidReminderEveningJob = null;

// Panel editor sessions
const panelEditorSessions = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of panelEditorSessions) {
    if (now - session.lastActivity > 30 * 60 * 1000) {
      panelEditorSessions.delete(key);
    }
  }
}, 30 * 60 * 1000);

// Forum builder state
let forumBuilderChannelId;
let embedTitle = '';
let embedDescription = '';
let embedImageUrl = '';

// CSV writer for message logging
const csvFilePath = 'messages.csv';
const csvWriter = createCsvWriter({
  path: csvFilePath,
  header: [
    { id: 'username', title: 'USERNAME' },
    { id: 'message', title: 'MESSAGE' },
  ],
  append: true,
});

// ========================================================================================
// TOURNAMENT AUTO-POST MESSAGES (by category ID)
// ========================================================================================

const categoryMessages = {
  '1431634247239733318': 'Welcome to the **Round of 32** in the Diwali Tournament 2025!\n\n**Match Details:**\n- **Format:** Best of 3\n- **Titan:** Use your assigned Titan with a full deck of scrolls. Modify your Titan(s) until **4 hours** before the tournament. During the tournament, weapons and decks can be changed at any time.\n- **Timeframe:** Play your match within the given timeframe.\n- **Check-In:** Check in by sending a message in this channel within **5 minutes** of the start time (e.g., "Hello, I can battle at [specific time]!"). Failure to do so will result in disqualification, and your opponent will advance to the next round.\n- **Issues:** Tag a mod immediately if you experience disconnect issues, with a detailed report.\n- **Results:** Submit a full-screen screenshot of the match results after each game.\n\n**Reminder:** Make sure to read the tournament rules [here](<https://discord.com/channels/925747778548801557/1429217646414663730>). Not following these rules will result in **disqualification**.\n\nTIMEFRAME\n<t:1761480000:t> – <t:1761481800:t>\n\nGood luck, Titans!',
  '1431634278781026365': 'Welcome to the **Round of 32** in the Diwali Tournament 2025!\n\n**Match Details:**\n- **Format:** Best of 3\n- **Titan:** Use your assigned Titan with a full deck of scrolls. Modify your Titan(s) until **4 hours** before the tournament. During the tournament, weapons and decks can be changed at any time.\n- **Timeframe:** Play your match within the given timeframe.\n- **Check-In:** Check in by sending a message in this channel within **5 minutes** of the start time (e.g., "Hello, I can battle at [specific time]!"). Failure to do so will result in disqualification, and your opponent will advance to the next round.\n- **Issues:** Tag a mod immediately if you experience disconnect issues, with a detailed report.\n- **Results:** Submit a full-screen screenshot of the match results after each game.\n\n**Reminder:** Make sure to read the tournament rules [here](<https://discord.com/channels/925747778548801557/1429217646414663730>). Not following these rules will result in **disqualification**.\n\nTIMEFRAME\n<t:1761480000:t> – <t:1761481800:t>\n\nGood luck, Titans!',
  '1431634629848207451': 'Welcome to the **Round of 16** in the Diwali Tournament 2025!\n\n**Match Details:**\n- **Format:** Best of 3\n- **Titan:** Use your assigned Titan with a full deck of scrolls. Modify your Titan(s) until **4 hours** before the tournament. During the tournament, weapons and decks can be changed at any time.\n- **Timeframe:** Play your match within the given timeframe.\n- **Check-In:** Check in by sending a message in this channel within **5 minutes** of the start time (e.g., "Hello, I can battle at [specific time]!"). Failure to do so will result in disqualification, and your opponent will advance to the next round.\n- **Issues:** Tag a mod immediately if you experience disconnect issues, with a detailed report.\n- **Results:** Submit a full-screen screenshot of the match results after each game.\n\n**Reminder:** Make sure to read the tournament rules [here](<https://discord.com/channels/925747778548801557/1429217646414663730>). Not following these rules will result in **disqualification**.\n\nTIMEFRAME\n<t:1761482100:t> – <t:1761483600:t>\n\nGood luck, Titans!',
  '1431634673540530216': 'Welcome to the **Round of 16** in the Diwali Tournament 2025!\n\n**Match Details:**\n- **Format:** Best of 3\n- **Titan:** Use your assigned Titan with a full deck of scrolls. Modify your Titan(s) until **4 hours** before the tournament. During the tournament, weapons and decks can be changed at any time.\n- **Timeframe:** Play your match within the given timeframe.\n- **Check-In:** Check in by sending a message in this channel within **5 minutes** of the start time (e.g., "Hello, I can battle at [specific time]!"). Failure to do so will result in disqualification, and your opponent will advance to the next round.\n- **Issues:** Tag a mod immediately if you experience disconnect issues, with a detailed report.\n- **Results:** Submit a full-screen screenshot of the match results after each game.\n\n**Reminder:** Make sure to read the tournament rules [here](<https://discord.com/channels/925747778548801557/1429217646414663730>). Not following these rules will result in **disqualification**.\n\nTIMEFRAME\n<t:1761482100:t> – <t:1761483600:t>\n\nGood luck, Titans!',
  '1431636311546138654': 'Welcome to the **Round of 8** in the Diwali Tournament 2025!\n\n**Match Details:**\n- **Format:** Best of 3\n- **Titan:** Use your assigned Titan with a full deck of scrolls. Modify your Titan(s) until **4 hours** before the tournament. During the tournament, weapons and decks can be changed at any time.\n- **Timeframe:** Play your match within the given timeframe.\n- **Check-In:** Check in by sending a message in this channel within **5 minutes** of the start time (e.g., "Hello, I can battle at [specific time]!"). Failure to do so will result in disqualification, and your opponent will advance to the next round.\n- **Issues:** Tag a mod immediately if you experience disconnect issues, with a detailed report.\n- **Results:** Submit a full-screen screenshot of the match results after each game.\n\n**Reminder:** Make sure to read the tournament rules [here](<https://discord.com/channels/925747778548801557/1429217646414663730>). Not following these rules will result in **disqualification**.\n\nTIMEFRAME\n<t:1761483900:t> - <t:1761485100:t>\n\nGood luck, Titans!',
  '1431636343967973457': 'Welcome to the **Round of 8** in the Diwali Tournament 2025!\n\n**Match Details:**\n- **Format:** Best of 3\n- **Titan:** Use your assigned Titan with a full deck of scrolls. Modify your Titan(s) until **4 hours** before the tournament. During the tournament, weapons and decks can be changed at any time.\n- **Timeframe:** Play your match within the given timeframe.\n- **Check-In:** Check in by sending a message in this channel within **5 minutes** of the start time (e.g., "Hello, I can battle at [specific time]!"). Failure to do so will result in disqualification, and your opponent will advance to the next round.\n- **Issues:** Tag a mod immediately if you experience disconnect issues, with a detailed report.\n- **Results:** Submit a full-screen screenshot of the match results after each game.\n\n**Reminder:** Make sure to read the tournament rules [here](<https://discord.com/channels/925747778548801557/1429217646414663730>). Not following these rules will result in **disqualification**.\n\nTIMEFRAME\n<t:1761483900:t> - <t:1761485100:t>\n\nGood luck, Titans!',
  '1431636379162382427': 'Welcome to the **Block Semi Finals** in the Diwali Tournament 2025!\n\n**Match Details:**\n- **Format:** Best of 3\n- **Titan:** Use your assigned Titan with a full deck of scrolls. Modify your Titan(s) until **4 hours** before the tournament. During the tournament, weapons and decks can be changed at any time.\n- **Timeframe:** Play your matches within the given timeframe.\n- **Check-In:** Check in by sending a message in this channel within **5 minutes** of the start time **AFTER** Mystic pings you (e.g., "Hello, I can battle at [specific time]!"). Failure to do so will result in disqualification, and your opponent will advance to the next round.\n- **Issues:** Tag a mod immediately if you experience disconnect issues, with a detailed report.\n- **Results:** Submit a full-screen screenshot of the match results after each game.\n\n**Reminder:** Make sure to read the tournament rules [here](<https://discord.com/channels/925747778548801557/1429217646414663730>). Not following these rules will result in **disqualification**.\n\nTIMEFRAME\n<t:1761485400:t> - <t:1761486600:t>\n\nGood luck, Titans!',
  '1431636407335522546': 'Welcome to the **Block Semi Finals** in the Diwali Tournament 2025!\n\n**Match Details:**\n- **Format:** Best of 3\n- **Titan:** Use your assigned Titan with a full deck of scrolls. Modify your Titan(s) until **4 hours** before the tournament. During the tournament, weapons and decks can be changed at any time.\n- **Timeframe:** Play your matches within the given timeframe.\n- **Check-In:** Check in by sending a message in this channel within **5 minutes** of the start time **AFTER** Mystic pings you (e.g., "Hello, I can battle at [specific time]!"). Failure to do so will result in disqualification, and your opponent will advance to the next round.\n- **Issues:** Tag a mod immediately if you experience disconnect issues, with a detailed report.\n- **Results:** Submit a full-screen screenshot of the match results after each game.\n\n**Reminder:** Make sure to read the tournament rules [here](<https://discord.com/channels/925747778548801557/1429217646414663730>). Not following these rules will result in **disqualification**.\n\nTIMEFRAME\n<t:1761485400:t> - <t:1761486600:t>\n\nGood luck, Titans!',
  '1431636814342651995': 'Welcome to the **Block Finals** in the Diwali Tournament 2025!\n\n**Match Details:**\n- **Format:** Best of 3\n- **Titan:** Use your assigned Titan with a full deck of scrolls. Modify your Titan(s) until **4 hours** before the tournament. During the tournament, weapons and decks can be changed at any time.\n- **Timeframe:** Play your matches within the given timeframe.\n- **Check-In:** Check in by sending a message in this channel within **5 minutes** of the start time **AFTER** Mystic pings you (e.g., "Hello, I can battle at [specific time]!"). Failure to do so will result in disqualification, and your opponent will advance to the next round.\n- **Issues:** Tag a mod immediately if you experience disconnect issues, with a detailed report.\n- **Results:** Submit a full-screen screenshot of the match results after each game.\n\n**Reminder:** Make sure to read the tournament rules [here](<https://discord.com/channels/925747778548801557/1429217646414663730>). Not following these rules will result in **disqualification**.\n\nTIMEFRAME\n<t:1761486900:t> - <t:1761488100:t>\n\nGood luck, Titans!',
  '1431636841127219200': 'Welcome to the **Block Finals** in the Diwali Tournament 2025!\n\n**Match Details:**\n- **Format:** Best of 3\n- **Titan:** Use your assigned Titan with a full deck of scrolls. Modify your Titan(s) until **4 hours** before the tournament. During the tournament, weapons and decks can be changed at any time.\n- **Timeframe:** Play your matches within the given timeframe.\n- **Check-In:** Check in by sending a message in this channel within **5 minutes** of the start time **AFTER** Mystic pings you (e.g., "Hello, I can battle at [specific time]!"). Failure to do so will result in disqualification, and your opponent will advance to the next round.\n- **Issues:** Tag a mod immediately if you experience disconnect issues, with a detailed report.\n- **Results:** Submit a full-screen screenshot of the match results after each game.\n\n**Reminder:** Make sure to read the tournament rules [here](<https://discord.com/channels/925747778548801557/1429217646414663730>). Not following these rules will result in **disqualification**.\n\nTIMEFRAME\n<t:1761486900:t> - <t:1761488100:t>\n\nGood luck, Titans!',
  '1431636925667606719': 'Welcome to the **Championship** in the Diwali Tournament 2025!\n\n**Match Details:**\n- **Format:** Best of 5\n- **Titan:** Use your assigned Titan with a full deck of scrolls. Modify your Titan(s) until **4 hours** before the tournament. During the tournament, weapons and decks can be changed at any time.\n- **Timeframe:** Play your matches within the given timeframe. \n- **Check-In:** Check in by sending a message in this channel within **5 minutes** of the start time **AFTER** Mystic pings you (e.g., "Hello, I can battle at [specific time]!"). Failure to do so will result in disqualification, and your opponent will advance to the next round.\n- **Issues:** Tag a mod immediately if you experience disconnect issues, with a detailed report.\n- **Results:** Submit a full-screen screenshot of the match results after each game.\n\n**Reminder:** Make sure to read the tournament rules [here](<https://discord.com/channels/925747778548801557/1429217646414663730>). Not following these rules will result in **disqualification**.\n\nTIMEFRAME\n<t:1761488400:t> - <t:1761489600:t>\n\nGood luck, Titans!',
};

// ========================================================================================
// UTILITY FUNCTIONS
// ========================================================================================

function loadStats() {
  try {
    if (fs.existsSync(statsFilePath)) {
      const data = fs.readFileSync(statsFilePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading stats file:', error);
  }
  return { winCommand: {} };
}

function saveStats(stats) {
  try {
    fs.writeFileSync(statsFilePath, JSON.stringify(stats, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving stats file:', error);
  }
}

async function getRandomTridentGif() {
  const response = await axios.get('https://api.giphy.com/v1/gifs/random', {
    params: { api_key: GIPHY_API_KEY, tag: 'trident gum', rating: 'g' },
  });
  return response.data.data.images.original.url;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ========================================================================================
// PANEL UTILITIES
// ========================================================================================

const VALID_COMPONENT_TYPES = ['text', 'separator', 'gallery', 'section_button', 'footer', 'fields', 'thumbnail', 'buttons', 'file', 'timestamp'];

const COMP_ICONS = {
  text: '\ud83d\udcdd', separator: '\u2796', gallery: '\ud83d\uddbc\ufe0f', section_button: '\ud83d\udd18',
  footer: '\ud83d\udc63', fields: '\ud83d\udcca', thumbnail: '\ud83d\uddbc\ufe0f', buttons: '\ud83d\udd18',
  file: '\ud83d\udcc1', timestamp: '\ud83d\udd52',
};

function normalizeDiscordJson(data) {
  if (!data || typeof data !== 'object') return data;
  const components = data.components || [];
  if (!Array.isArray(components) || components.length === 0) return data;
  const firstType = components[0]?.type;
  if (typeof firstType === 'string' && isNaN(Number(firstType))) return data;

  let container = null;
  if (Number(data.type) === 17) container = data;
  else container = components.find(c => Number(c.type) === 17);

  if (!container) {
    return { color: data.color, components: components.map(c => normalizeComponent(c)).filter(Boolean) };
  }

  const result = { components: [] };
  if (container.accent_color != null) {
    result.color = `#${container.accent_color.toString(16).padStart(6, '0').toUpperCase()}`;
  } else if (container.color != null) {
    result.color = typeof container.color === 'string' ? container.color : `#${container.color.toString(16).padStart(6, '0').toUpperCase()}`;
  } else if (data.color) {
    result.color = data.color;
  }

  for (const comp of (container.components || [])) {
    const normalized = normalizeComponent(comp);
    if (normalized) result.components.push(normalized);
  }
  return result;
}

function normalizeComponent(comp) {
  if (!comp || typeof comp !== 'object') return null;
  const t = Number(comp.type);
  switch (t) {
    case 10: return { type: 'text', content: comp.content || '' };
    case 14: return { type: 'separator', divider: comp.divider !== false, spacing: comp.spacing || 1 };
    case 12: {
      const items = (comp.items || []).map(item => {
        const url = item.media?.url || item.url || '';
        const result = { url };
        if (item.description) result.altText = item.description;
        if (item.spoiler) result.spoiler = true;
        return result;
      });
      return { type: 'gallery', items };
    }
    case 9: {
      const textParts = (comp.components || []).filter(c => Number(c.type) === 10);
      const text = textParts.map(c => c.content || '').join('\n');
      const accessory = comp.accessory;
      if (accessory && Number(accessory.type) === 2) {
        const button = { label: accessory.label || '' };
        if (accessory.url) { button.url = accessory.url; button.style = 5; }
        else if (accessory.custom_id) { button.customId = accessory.custom_id; button.style = accessory.style || 2; }
        return { type: 'section_button', text, button };
      }
      if (accessory && Number(accessory.type) === 11) {
        return { type: 'thumbnail', url: accessory.media?.url || accessory.url || '', altText: accessory.description };
      }
      return text ? { type: 'text', content: text } : null;
    }
    case 13: return { type: 'file', name: comp.file?.url || comp.url || '' };
    case 1: {
      const buttons = (comp.components || []).filter(c => Number(c.type) === 2).map(b => {
        const btn = { label: b.label || '', style: b.style || 2 };
        if (b.url) btn.url = b.url;
        if (b.custom_id) btn.customId = b.custom_id;
        if (b.emoji) btn.emoji = b.emoji;
        return btn;
      });
      if (buttons.length > 0) return { type: 'buttons', buttons };
      return null;
    }
    default:
      if (typeof comp.type === 'string' && VALID_COMPONENT_TYPES.includes(comp.type)) return comp;
      return null;
  }
}

function validatePanelJson(data) {
  if (!data || typeof data !== 'object') return 'JSON must be an object.';
  if (data.components !== undefined && !Array.isArray(data.components)) return '"components" must be an array.';
  const components = data.components || [];
  if (components.length > 10) return `Too many components (${components.length}/10 max).`;
  for (let i = 0; i < components.length; i++) {
    const comp = components[i];
    if (!comp || typeof comp !== 'object') return `Component ${i + 1}: must be an object.`;
    if (!comp.type) return `Component ${i + 1}: missing "type" field.`;
    if (!VALID_COMPONENT_TYPES.includes(comp.type)) return `Component ${i + 1}: unknown type "${comp.type}". Valid: ${VALID_COMPONENT_TYPES.join(', ')}`;
    switch (comp.type) {
      case 'text': case 'footer':
        if (typeof comp.content !== 'string') return `Component ${i + 1} (${comp.type}): missing "content" string.`;
        break;
      case 'gallery':
        if (!Array.isArray(comp.items) || comp.items.length === 0) return `Component ${i + 1} (gallery): needs "items" array with at least one item.`;
        for (const item of comp.items) { if (!item.url) return `Component ${i + 1} (gallery): each item needs a "url".`; }
        break;
      case 'section_button':
        if (typeof comp.text !== 'string') return `Component ${i + 1} (section_button): missing "text" string.`;
        if (!comp.button || !comp.button.label) return `Component ${i + 1} (section_button): missing "button.label".`;
        if (!comp.button.url && !comp.button.customId) return `Component ${i + 1} (section_button): button needs "url" or "customId".`;
        break;
      case 'buttons':
        if (!Array.isArray(comp.buttons) || comp.buttons.length === 0) return `Component ${i + 1} (buttons): needs "buttons" array.`;
        break;
    }
  }
  if (data.color !== undefined) {
    const c = String(data.color);
    if (!/^#?[0-9a-fA-F]{6}$/.test(c)) return `Invalid color "${data.color}". Use hex format like "#E8943A".`;
  }
  return null;
}

function compSummary(comp, maxLen = 50) {
  const icon = COMP_ICONS[comp.type] || '\u2753';
  let preview = '';
  switch (comp.type) {
    case 'text': case 'footer':
      preview = comp.content?.substring(0, maxLen) || '(empty)'; break;
    case 'separator':
      preview = comp.divider === false ? 'spacing only' : 'divider'; break;
    case 'gallery':
      preview = `${comp.items?.length || 0} image(s)`; break;
    case 'section_button':
      preview = `"${(comp.text || '').substring(0, 30)}" \u2192 [${comp.button?.label || '?'}]`; break;
    case 'thumbnail':
      preview = comp.url ? 'image set' : 'no image'; break;
    case 'buttons':
      preview = (comp.buttons || []).map(b => `[${b.label || '?'}]`).join(' '); break;
    default:
      preview = JSON.stringify(comp).substring(0, maxLen);
  }
  return `${icon} **${comp.type}** \u2014 ${preview}`;
}

// ========================================================================================
// CONTAINER MESSAGE BUILDER (Components V2)
// ========================================================================================

function normalizeEmoji(emoji) {
  if (!emoji) return undefined;
  if (typeof emoji === 'object') return emoji;
  if (/^\d+$/.test(emoji)) return { id: emoji };
  return { name: emoji };
}

class ContainerMessage {
  constructor() {
    this._color = null;
    this._components = [];
    this._files = [];
    this._spoiler = false;
  }

  setColor(color) { this._color = color; return this; }
  setSpoiler(spoiler = true) { this._spoiler = spoiler; return this; }
  setTitle(text) { this._components.push({ type: 'text', content: `### ${text}` }); return this; }
  setDescription(text) { this._components.push({ type: 'text', content: text }); return this; }
  addText(text) { this._components.push({ type: 'text', content: text }); return this; }

  addFields(...fields) {
    const flat = fields.flat();
    this._components.push({ type: 'fields', fields: flat });
    return this;
  }

  setThumbnail(url, altText) {
    this._components.push({ type: 'thumbnail', url, altText });
    return this;
  }

  addImage(url, altText) {
    this._components.push({ type: 'gallery', items: [{ url, altText }] });
    return this;
  }

  addGallery(items) {
    this._components.push({ type: 'gallery', items });
    return this;
  }

  addFile(name, attachment) {
    this._components.push({ type: 'file', name });
    this._files.push(attachment);
    return this;
  }

  setSeparator({ divider = true, spacing = 'small' } = {}) {
    this._components.push({
      type: 'separator', divider,
      spacing: spacing === 'large' ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small,
    });
    return this;
  }

  addButtons(...buttons) {
    const flat = buttons.flat();
    this._components.push({ type: 'buttons', buttons: flat });
    return this;
  }

  addSectionButton(text, button) {
    this._components.push({ type: 'section_button', text, button });
    return this;
  }

  addActionRow(actionRow) {
    this._components.push({ type: 'action_row', row: actionRow });
    return this;
  }

  setFooter(text) {
    this._components.push({ type: 'footer', content: text });
    return this;
  }

  setTimestamp(date) {
    const ts = Math.floor((date || new Date()).getTime() / 1000);
    this._components.push({ type: 'timestamp', ts });
    return this;
  }

  toMessage(options = {}) {
    const container = new ContainerBuilder();
    if (this._color !== null) container.setAccentColor(this._color);
    if (this._spoiler) container.setSpoiler(true);

    let pendingTexts = [];
    const flushPendingTexts = () => {
      for (const t of pendingTexts) {
        container.addTextDisplayComponents(td => td.setContent(t));
      }
      pendingTexts = [];
    };

    for (const comp of this._components) {
      switch (comp.type) {
        case 'text': pendingTexts.push(comp.content); break;
        case 'fields': {
          flushPendingTexts();
          const lines = [];
          let inlineBuffer = [];
          const flushInline = () => {
            if (inlineBuffer.length > 0) {
              lines.push(inlineBuffer.map(f => `**${f.name}:** ${f.value}`).join('  \u00B7  '));
              inlineBuffer = [];
            }
          };
          for (const field of comp.fields) {
            if (field.inline) inlineBuffer.push(field);
            else { flushInline(); lines.push(`**${field.name}**\n${field.value}`); }
          }
          flushInline();
          container.addTextDisplayComponents(td => td.setContent(lines.join('\n')));
          break;
        }
        case 'thumbnail': {
          const thumbTexts = comp.content
            ? [comp.content]
            : (pendingTexts.length > 0 ? pendingTexts.splice(0, 3) : ['\u200b']);
          container.addSectionComponents(section => {
            section.addTextDisplayComponents(...thumbTexts.map(t => (td => td.setContent(t))));
            section.setThumbnailAccessory(thumb => {
              thumb.setURL(comp.url);
              if (comp.altText) thumb.setDescription(comp.altText);
              return thumb;
            });
            return section;
          });
          if (!comp.content) flushPendingTexts();
          break;
        }
        case 'gallery': {
          flushPendingTexts();
          container.addMediaGalleryComponents(gallery => {
            for (const item of comp.items) {
              gallery.addItems(gi => {
                gi.setURL(item.url);
                if (item.altText) gi.setDescription(item.altText);
                if (item.spoiler) gi.setSpoiler(true);
                return gi;
              });
            }
            return gallery;
          });
          break;
        }
        case 'file': {
          flushPendingTexts();
          container.addFileComponents(f => f.setURL(`attachment://${comp.name}`));
          break;
        }
        case 'separator': {
          flushPendingTexts();
          container.addSeparatorComponents(sep => {
            sep.setDivider(comp.divider);
            sep.setSpacing(comp.spacing);
            return sep;
          });
          break;
        }
        case 'buttons': {
          flushPendingTexts();
          container.addActionRowComponents(row => {
            const btns = comp.buttons.map(b => {
              const btn = new ButtonBuilder().setLabel(b.label).setStyle(b.style || ButtonStyle.Secondary);
              if (b.customId) btn.setCustomId(b.customId);
              if (b.url) btn.setURL(b.url);
              if (b.emoji) btn.setEmoji(normalizeEmoji(b.emoji));
              if (b.disabled) btn.setDisabled(true);
              return btn;
            });
            row.setComponents(...btns);
            return row;
          });
          break;
        }
        case 'section_button': {
          flushPendingTexts();
          container.addSectionComponents(section => {
            section.addTextDisplayComponents(td => td.setContent(comp.text));
            section.setButtonAccessory(btn => {
              btn.setLabel(comp.button.label).setStyle(comp.button.style || ButtonStyle.Secondary);
              if (comp.button.customId) btn.setCustomId(comp.button.customId);
              if (comp.button.url) btn.setURL(comp.button.url).setStyle(ButtonStyle.Link);
              if (comp.button.emoji) btn.setEmoji(normalizeEmoji(comp.button.emoji));
              return btn;
            });
            return section;
          });
          break;
        }
        case 'action_row': {
          flushPendingTexts();
          container.addActionRowComponents(() => comp.row);
          break;
        }
        case 'footer': {
          flushPendingTexts();
          container.addTextDisplayComponents(td => td.setContent(`-# ${comp.content}`));
          break;
        }
        case 'timestamp': {
          flushPendingTexts();
          container.addTextDisplayComponents(td => td.setContent(`-# <t:${comp.ts}:f>`));
          break;
        }
      }
    }
    flushPendingTexts();

    const flags = MessageFlags.IsComponentsV2 | (options.ephemeral ? MessageFlags.Ephemeral : 0);
    const payload = { components: [container], flags };
    if (this._files.length > 0) payload.files = this._files;
    return payload;
  }
}

// ========================================================================================
// PANEL EDITOR SYSTEM
// ========================================================================================

async function handlePanelCommand(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: 'You need Administrator permission to use this command.', flags: MessageFlags.Ephemeral });
    return;
  }
  const sub = interaction.options.getSubcommand();
  switch (sub) {
    case 'create': await handlePanelCreate(interaction); break;
    case 'edit': await handlePanelEdit(interaction); break;
    case 'list': await handlePanelList(interaction); break;
    case 'delete': await handlePanelDelete(interaction); break;
    case 'post': await handlePanelPost(interaction); break;
    case 'update': await handlePanelUpdate(interaction); break;
    case 'json': await handlePanelJson(interaction); break;
    case 'export': await handlePanelExport(interaction); break;
  }
}

async function handlePanelCreate(interaction) {
  const name = interaction.options.getString('name').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const existing = await dbGet('SELECT * FROM panels WHERE guild_id = ? AND name = ?', [interaction.guild.id, name]);
  if (existing) {
    await interaction.reply({ content: `A panel named **${name}** already exists. Use \`/panel edit ${name}\` instead.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const result = await dbRun('INSERT INTO panels (guild_id, name, color, components, created_by) VALUES (?, ?, ?, ?, ?)',
    [interaction.guild.id, name, '#E8943A', '[]', interaction.user.id]);

  const sessionKey = `${interaction.guild.id}:${interaction.user.id}`;
  const session = { panelId: result.lastID, panelName: name, color: '#E8943A', components: [], selectedIndex: null, lastActivity: Date.now() };
  panelEditorSessions.set(sessionKey, session);

  const embed = buildEditorEmbed(name, '#E8943A', [], null);
  const rows = buildEditorRows(session);
  await interaction.reply({ embeds: [embed], components: rows, flags: MessageFlags.Ephemeral });
}

async function handlePanelEdit(interaction) {
  const name = interaction.options.getString('name').toLowerCase();
  const panel = await dbGet('SELECT * FROM panels WHERE guild_id = ? AND name = ?', [interaction.guild.id, name]);
  if (!panel) {
    await interaction.reply({ content: `No panel named **${name}** found.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const components = JSON.parse(panel.components || '[]');
  const sessionKey = `${interaction.guild.id}:${interaction.user.id}`;
  const session = { panelId: panel.id, panelName: panel.name, color: panel.color || '#E8943A', components, selectedIndex: null, lastActivity: Date.now() };
  panelEditorSessions.set(sessionKey, session);

  const embed = buildEditorEmbed(panel.name, panel.color || '#E8943A', components, null);
  const rows = buildEditorRows(session);
  await interaction.reply({ embeds: [embed], components: rows, flags: MessageFlags.Ephemeral });
}

async function handlePanelList(interaction) {
  const panels = await dbAll('SELECT * FROM panels WHERE guild_id = ?', [interaction.guild.id]);
  if (panels.length === 0) {
    await interaction.reply({ content: 'No panels found. Create one with `/panel create <name>`.', flags: MessageFlags.Ephemeral });
    return;
  }
  const lines = [];
  for (const p of panels) {
    const comps = JSON.parse(p.components || '[]');
    const posted = await dbAll('SELECT * FROM panel_posts WHERE panel_id = ?', [p.id]);
    lines.push(`**${p.name}** \u2014 ${comps.length} component${comps.length !== 1 ? 's' : ''}, ${posted.length} post${posted.length !== 1 ? 's' : ''}`);
  }
  const embed = new EmbedBuilder()
    .setTitle('Panels')
    .setDescription(lines.join('\n'))
    .setColor(0xE8943A)
    .setFooter({ text: `${panels.length} panel${panels.length !== 1 ? 's' : ''}` });
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handlePanelDelete(interaction) {
  const name = interaction.options.getString('name').toLowerCase();
  const panel = await dbGet('SELECT * FROM panels WHERE guild_id = ? AND name = ?', [interaction.guild.id, name]);
  if (!panel) {
    await interaction.reply({ content: `No panel named **${name}** found.`, flags: MessageFlags.Ephemeral });
    return;
  }
  await dbRun('DELETE FROM panels WHERE id = ?', [panel.id]);
  await interaction.reply({ content: `Panel **${name}** deleted.`, flags: MessageFlags.Ephemeral });
}

async function handlePanelPost(interaction) {
  const name = interaction.options.getString('name').toLowerCase();
  const panel = await dbGet('SELECT * FROM panels WHERE guild_id = ? AND name = ?', [interaction.guild.id, name]);
  if (!panel) {
    await interaction.reply({ content: `No panel named **${name}** found.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const components = JSON.parse(panel.components || '[]');
  if (components.length === 0) {
    await interaction.reply({ content: 'Cannot post an empty panel. Add components first with `/panel edit`.', flags: MessageFlags.Ephemeral });
    return;
  }
  const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
  const container = buildContainerFromPanel(panel);
  const msg = await targetChannel.send(container);
  await dbRun('INSERT INTO panel_posts (panel_id, channel_id, message_id) VALUES (?, ?, ?)', [panel.id, targetChannel.id, msg.id]);
  await interaction.reply({ content: `Panel **${name}** posted in <#${targetChannel.id}>.`, flags: MessageFlags.Ephemeral });
}

async function handlePanelUpdate(interaction) {
  const name = interaction.options.getString('name').toLowerCase();
  const panel = await dbGet('SELECT * FROM panels WHERE guild_id = ? AND name = ?', [interaction.guild.id, name]);
  if (!panel) {
    await interaction.reply({ content: `No panel named **${name}** found.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const posts = await dbAll('SELECT * FROM panel_posts WHERE panel_id = ?', [panel.id]);
  if (posts.length === 0) {
    await interaction.reply({ content: `Panel **${name}** has no posted instances. Use \`/panel post\` first.`, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const container = buildContainerFromPanel(panel);
  let updated = 0, failed = 0;
  for (const post of posts) {
    try {
      const channel = await interaction.guild.channels.fetch(post.channel_id).catch(() => null);
      if (!channel) { await dbRun('DELETE FROM panel_posts WHERE id = ?', [post.id]); failed++; continue; }
      const msg = await channel.messages.fetch(post.message_id).catch(() => null);
      if (!msg) { await dbRun('DELETE FROM panel_posts WHERE id = ?', [post.id]); failed++; continue; }
      await msg.edit(container);
      updated++;
    } catch { await dbRun('DELETE FROM panel_posts WHERE id = ?', [post.id]); failed++; }
  }
  let status = `Updated **${updated}** posted instance${updated !== 1 ? 's' : ''} of **${name}**.`;
  if (failed > 0) status += ` ${failed} stale post${failed !== 1 ? 's' : ''} cleaned up.`;
  await interaction.editReply({ content: status });
}

async function handlePanelJson(interaction) {
  const name = interaction.options.getString('name').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const dataStr = interaction.options.getString('data');
  if (!dataStr) {
    const modal = new ModalBuilder().setCustomId(`pe_modal:json_import:${name}`).setTitle(`Import JSON: ${name}`);
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('json_data').setLabel('Paste panel JSON').setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('{"color":"#E8943A","components":[{"type":"text","content":"Hello"}]}').setRequired(true)
      )
    );
    await interaction.showModal(modal);
    return;
  }
  let data;
  try { data = JSON.parse(dataStr); } catch (e) {
    await interaction.reply({ content: `Invalid JSON: ${e.message}`, flags: MessageFlags.Ephemeral });
    return;
  }
  data = normalizeDiscordJson(data);
  const error = validatePanelJson(data);
  if (error) { await interaction.reply({ content: `Validation error: ${error}`, flags: MessageFlags.Ephemeral }); return; }
  await importPanelFromJson(interaction, name, data);
}

async function importPanelFromJson(interaction, name, data) {
  const components = data.components || [];
  const color = data.color ? `#${String(data.color).replace('#', '').toUpperCase()}` : '#E8943A';
  const existing = await dbGet('SELECT * FROM panels WHERE guild_id = ? AND name = ?', [interaction.guild.id, name]);
  if (existing) {
    await dbRun('UPDATE panels SET components = ?, color = ?, updated_at = datetime("now") WHERE id = ?', [JSON.stringify(components), color, existing.id]);
  } else {
    await dbRun('INSERT INTO panels (guild_id, name, color, components, created_by) VALUES (?, ?, ?, ?, ?)',
      [interaction.guild.id, name, color, JSON.stringify(components), interaction.user.id]);
  }
  const action = existing ? 'updated' : 'created';
  const reply = { content: `Panel **${name}** ${action} from JSON with ${components.length} component${components.length !== 1 ? 's' : ''}.`, flags: MessageFlags.Ephemeral };
  if (interaction.deferred || interaction.replied) await interaction.editReply(reply);
  else await interaction.reply(reply);
}

async function handlePanelExport(interaction) {
  const name = interaction.options.getString('name').toLowerCase();
  const panel = await dbGet('SELECT * FROM panels WHERE guild_id = ? AND name = ?', [interaction.guild.id, name]);
  if (!panel) {
    await interaction.reply({ content: `No panel named **${name}** found.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const components = JSON.parse(panel.components || '[]');
  const exportData = { color: panel.color || '#E8943A', components };
  const json = JSON.stringify(exportData, null, 2);
  if (json.length <= 1900) {
    await interaction.reply({ content: `**Panel: ${name}**\n\`\`\`json\n${json}\n\`\`\``, flags: MessageFlags.Ephemeral });
  } else {
    const buf = Buffer.from(json, 'utf-8');
    const file = new AttachmentBuilder(buf, { name: `${name}.json` });
    await interaction.reply({ content: `**Panel: ${name}** (exported as file)`, files: [file], flags: MessageFlags.Ephemeral });
  }
}

// ── Editor UI Builders ──────────────────────────────────────────────────

function buildEditorEmbed(panelName, color, components, selectedIndex) {
  const lines = components.map((comp, i) => {
    const pointer = i === selectedIndex ? '\u25B6 ' : '\u2003 ';
    return `${pointer}\`${i + 1}\` ${compSummary(comp)}`;
  });
  const description = lines.length > 0 ? lines.join('\n') : '*Empty panel \u2014 use the menu below to add components.*';
  const hexColor = parseInt(color.replace('#', ''), 16) || 0xE8943A;
  return new EmbedBuilder()
    .setTitle(`Panel Editor: ${panelName}`)
    .setDescription(description)
    .setColor(hexColor)
    .setFooter({ text: `Color: ${color}  \u00B7  ${components.length}/10 components${selectedIndex != null ? `  \u00B7  Selected: #${selectedIndex + 1}` : ''}` });
}

function buildEditorRows(session) {
  const { components, selectedIndex } = session;
  const count = components.length;
  const atLimit = count >= 10;
  const hasSel = selectedIndex != null && selectedIndex >= 0 && selectedIndex < count;
  const rows = [];

  if (count > 0) {
    const options = components.map((comp, i) => ({
      label: `${i + 1}. ${compSummary(comp).substring(0, 90)}`,
      value: String(i),
      default: i === selectedIndex,
    }));
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('pe_select').setPlaceholder('Select a component to edit...').setOptions(options)
    ));
  }

  const addOptions = [
    { label: 'Title', value: 'add_title', description: 'Heading text (### markdown)' },
    { label: 'Text', value: 'add_text', description: 'Rich markdown text block' },
    { label: 'Subtext', value: 'add_subtext', description: 'Small dimmed text (-#)' },
    { label: 'Separator', value: 'add_separator', description: 'Divider line between sections' },
    { label: 'Image', value: 'add_image', description: 'Media gallery image' },
    { label: 'Link Section', value: 'add_link_section', description: 'Text with link button accessory' },
    { label: 'Thumbnail Section', value: 'add_thumbnail_section', description: 'Text with thumbnail image' },
    { label: 'Button Row', value: 'add_button_row', description: 'Row of interactive buttons' },
    { label: 'Footer', value: 'add_footer', description: 'Small footer text' },
  ];
  rows.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('pe_add')
      .setPlaceholder(atLimit ? 'Component limit reached (10/10)' : 'Add a component...')
      .setOptions(addOptions).setDisabled(atLimit)
  ));

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pe_edit_selected').setLabel('Edit').setStyle(ButtonStyle.Primary).setDisabled(!hasSel),
    new ButtonBuilder().setCustomId('pe_move_up').setLabel('\u25B2 Up').setStyle(ButtonStyle.Secondary).setDisabled(!hasSel || selectedIndex === 0),
    new ButtonBuilder().setCustomId('pe_move_down').setLabel('\u25BC Down').setStyle(ButtonStyle.Secondary).setDisabled(!hasSel || selectedIndex >= count - 1),
    new ButtonBuilder().setCustomId('pe_duplicate').setLabel('Dupe').setStyle(ButtonStyle.Secondary).setDisabled(!hasSel || atLimit),
    new ButtonBuilder().setCustomId('pe_delete_selected').setLabel('Delete').setStyle(ButtonStyle.Danger).setDisabled(!hasSel),
  ));

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pe_set_color').setLabel('Color').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('pe_preview').setLabel('Preview').setStyle(ButtonStyle.Success).setDisabled(count === 0),
    new ButtonBuilder().setCustomId('pe_save').setLabel('Save & Close').setStyle(ButtonStyle.Success),
  ));

  return rows;
}

function buildContainerFromPanel(panel) {
  const components = JSON.parse(panel.components || '[]');
  const color = parseInt((panel.color || '#E8943A').replace('#', ''), 16) || 0xE8943A;
  const cm = new ContainerMessage();
  cm._color = color;
  cm._components = components;
  return cm.toMessage();
}

// ── Editor Interaction Handlers ─────────────────────────────────────────

function getEditorSession(interaction) {
  const sessionKey = `${interaction.guild.id}:${interaction.user.id}`;
  const session = panelEditorSessions.get(sessionKey);
  if (session) session.lastActivity = Date.now();
  return session;
}

async function refreshPanelEditor(interaction, session, isModal = false) {
  const embed = buildEditorEmbed(session.panelName, session.color, session.components, session.selectedIndex);
  const rows = buildEditorRows(session);
  const payload = { embeds: [embed], components: rows };
  if (isModal) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
    await interaction.editReply(payload);
  } else {
    await interaction.update(payload);
  }
}

async function handlePanelEditorSelect(interaction) {
  const session = getEditorSession(interaction);
  if (!session) {
    await interaction.reply({ content: 'Editor session expired. Use `/panel edit` to reopen.', flags: MessageFlags.Ephemeral });
    return;
  }
  const customId = interaction.customId;
  const value = interaction.values[0];

  if (customId === 'pe_select') {
    session.selectedIndex = parseInt(value, 10);
    await refreshPanelEditor(interaction, session);
    return;
  }

  if (customId === 'pe_add') {
    if (session.components.length >= 10) {
      await interaction.reply({ content: 'Component limit reached (10/10).', flags: MessageFlags.Ephemeral });
      return;
    }
    if (value === 'add_separator') {
      session.components.push({ type: 'separator', divider: true, spacing: 1 });
      session.selectedIndex = session.components.length - 1;
      await dbRun('UPDATE panels SET components = ?, updated_at = datetime("now") WHERE id = ?', [JSON.stringify(session.components), session.panelId]);
      await refreshPanelEditor(interaction, session);
      return;
    }
    const modal = buildComponentModal(value.replace('add_', ''), null);
    if (modal) await interaction.showModal(modal);
    else await interaction.reply({ content: 'Unknown component type.', flags: MessageFlags.Ephemeral });
  }
}

function buildComponentModal(type, existing, editIndex) {
  const prefix = editIndex != null ? `pe_modal:edit:${editIndex}:` : 'pe_modal:add:';
  switch (type) {
    case 'title': {
      const modal = new ModalBuilder().setCustomId(`${prefix}title`).setTitle(existing ? 'Edit Title' : 'Add Title');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('title_text').setLabel('Title text').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true)
          .setValue(existing ? existing.content.replace(/^### /, '') : '')
      ));
      return modal;
    }
    case 'text': {
      const modal = new ModalBuilder().setCustomId(`${prefix}text`).setTitle(existing ? 'Edit Text' : 'Add Text Block');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('content').setLabel('Content (supports markdown)').setStyle(TextInputStyle.Paragraph).setMaxLength(4000).setRequired(true)
          .setValue(existing?.content || '')
      ));
      return modal;
    }
    case 'subtext': {
      const modal = new ModalBuilder().setCustomId(`${prefix}subtext`).setTitle(existing ? 'Edit Subtext' : 'Add Subtext');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('content').setLabel('Subtext content').setStyle(TextInputStyle.Paragraph).setMaxLength(2000).setRequired(true)
          .setValue(existing ? existing.content.replace(/^-# /, '') : '')
      ));
      return modal;
    }
    case 'image': {
      const modal = new ModalBuilder().setCustomId(`${prefix}image`).setTitle(existing ? 'Edit Image' : 'Add Image');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('url').setLabel('Image URL').setStyle(TextInputStyle.Short).setRequired(true)
            .setValue(existing?.items?.[0]?.url || '')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('alt_text').setLabel('Alt text (optional)').setStyle(TextInputStyle.Short).setRequired(false)
            .setValue(existing?.items?.[0]?.altText || '')
        )
      );
      return modal;
    }
    case 'link_section': {
      const modal = new ModalBuilder().setCustomId(`${prefix}link_section`).setTitle(existing ? 'Edit Link Section' : 'Add Link Section');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('text').setLabel('Section text (supports markdown)').setStyle(TextInputStyle.Paragraph).setMaxLength(2000).setRequired(true)
            .setValue(existing?.text || '')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('button_label').setLabel('Button label').setStyle(TextInputStyle.Short).setMaxLength(80).setRequired(true)
            .setValue(existing?.button?.label || '')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('button_url').setLabel('Button URL').setStyle(TextInputStyle.Short).setRequired(true)
            .setValue(existing?.button?.url || '')
        )
      );
      return modal;
    }
    case 'thumbnail_section': {
      const modal = new ModalBuilder().setCustomId(`${prefix}thumbnail_section`).setTitle(existing ? 'Edit Thumbnail Section' : 'Add Thumbnail Section');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('text').setLabel('Section text (supports markdown)').setStyle(TextInputStyle.Paragraph).setMaxLength(2000).setRequired(true)
            .setValue(existing?.content || '')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('thumbnail_url').setLabel('Thumbnail image URL').setStyle(TextInputStyle.Short).setRequired(true)
            .setValue(existing?.url || '')
        )
      );
      return modal;
    }
    case 'button_row': {
      const modal = new ModalBuilder().setCustomId(`${prefix}button_row`).setTitle(existing ? 'Edit Button Row' : 'Add Button Row');
      const existingBtns = existing?.buttons || [];
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('buttons_json').setLabel('Buttons (one per line: label | url)').setStyle(TextInputStyle.Paragraph).setRequired(true)
          .setPlaceholder('Visit Site | https://example.com\nDocs | https://docs.example.com')
          .setValue(existingBtns.map(b => `${b.label} | ${b.url || b.customId || ''}`).join('\n'))
      ));
      return modal;
    }
    case 'footer': {
      const modal = new ModalBuilder().setCustomId(`${prefix}footer`).setTitle(existing ? 'Edit Footer' : 'Add Footer');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('content').setLabel('Footer text').setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(true)
          .setValue(existing?.content || '')
      ));
      return modal;
    }
    default: return null;
  }
}

function getModalTypeForComponent(comp) {
  if (!comp) return null;
  switch (comp.type) {
    case 'text':
      if (comp.content.startsWith('### ')) return 'title';
      if (comp.content.startsWith('-# ')) return 'subtext';
      return 'text';
    case 'gallery': return 'image';
    case 'section_button': return 'link_section';
    case 'thumbnail': return 'thumbnail_section';
    case 'buttons': return 'button_row';
    case 'footer': return 'footer';
    default: return null;
  }
}

async function handlePanelEditorButton(interaction) {
  const customId = interaction.customId;
  const session = getEditorSession(interaction);
  if (!session) {
    await interaction.reply({ content: 'Editor session expired. Use `/panel edit` to reopen.', flags: MessageFlags.Ephemeral });
    return;
  }
  const sel = session.selectedIndex;
  const hasSel = sel != null && sel >= 0 && sel < session.components.length;

  if (customId === 'pe_edit_selected') {
    if (!hasSel) { await interaction.reply({ content: 'No component selected.', flags: MessageFlags.Ephemeral }); return; }
    const comp = session.components[sel];
    if (comp.type === 'separator') { await interaction.reply({ content: 'Separators have no editable properties.', flags: MessageFlags.Ephemeral }); return; }
    const modalType = getModalTypeForComponent(comp);
    if (!modalType) { await interaction.reply({ content: 'This component type cannot be edited via modal.', flags: MessageFlags.Ephemeral }); return; }
    const modal = buildComponentModal(modalType, comp, sel);
    if (modal) await interaction.showModal(modal);
    return;
  }

  if (customId === 'pe_move_up') {
    if (!hasSel || sel === 0) { await interaction.reply({ content: 'Cannot move up.', flags: MessageFlags.Ephemeral }); return; }
    [session.components[sel - 1], session.components[sel]] = [session.components[sel], session.components[sel - 1]];
    session.selectedIndex = sel - 1;
    await dbRun('UPDATE panels SET components = ?, updated_at = datetime("now") WHERE id = ?', [JSON.stringify(session.components), session.panelId]);
    await refreshPanelEditor(interaction, session);
    return;
  }

  if (customId === 'pe_move_down') {
    if (!hasSel || sel >= session.components.length - 1) { await interaction.reply({ content: 'Cannot move down.', flags: MessageFlags.Ephemeral }); return; }
    [session.components[sel], session.components[sel + 1]] = [session.components[sel + 1], session.components[sel]];
    session.selectedIndex = sel + 1;
    await dbRun('UPDATE panels SET components = ?, updated_at = datetime("now") WHERE id = ?', [JSON.stringify(session.components), session.panelId]);
    await refreshPanelEditor(interaction, session);
    return;
  }

  if (customId === 'pe_duplicate') {
    if (!hasSel || session.components.length >= 10) { await interaction.reply({ content: 'Cannot duplicate.', flags: MessageFlags.Ephemeral }); return; }
    const clone = JSON.parse(JSON.stringify(session.components[sel]));
    session.components.splice(sel + 1, 0, clone);
    session.selectedIndex = sel + 1;
    await dbRun('UPDATE panels SET components = ?, updated_at = datetime("now") WHERE id = ?', [JSON.stringify(session.components), session.panelId]);
    await refreshPanelEditor(interaction, session);
    return;
  }

  if (customId === 'pe_delete_selected') {
    if (!hasSel) { await interaction.reply({ content: 'No component selected.', flags: MessageFlags.Ephemeral }); return; }
    session.components.splice(sel, 1);
    if (session.components.length === 0) session.selectedIndex = null;
    else if (sel >= session.components.length) session.selectedIndex = session.components.length - 1;
    await dbRun('UPDATE panels SET components = ?, updated_at = datetime("now") WHERE id = ?', [JSON.stringify(session.components), session.panelId]);
    await refreshPanelEditor(interaction, session);
    return;
  }

  if (customId === 'pe_preview') {
    if (session.components.length === 0) { await interaction.reply({ content: 'Nothing to preview. Add components first.', flags: MessageFlags.Ephemeral }); return; }
    const panel = await dbGet('SELECT * FROM panels WHERE id = ?', [session.panelId]);
    const container = buildContainerFromPanel(panel);
    container.flags = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
    await interaction.reply(container);
    return;
  }

  if (customId === 'pe_save') {
    const sessionKey = `${interaction.guild.id}:${interaction.user.id}`;
    await dbRun('UPDATE panels SET components = ?, updated_at = datetime("now") WHERE id = ?', [JSON.stringify(session.components), session.panelId]);
    await dbRun('UPDATE panels SET color = ?, updated_at = datetime("now") WHERE id = ?', [session.color, session.panelId]);
    panelEditorSessions.delete(sessionKey);

    const panel = await dbGet('SELECT * FROM panels WHERE id = ?', [session.panelId]);
    const posts = panel ? await dbAll('SELECT * FROM panel_posts WHERE panel_id = ?', [panel.id]) : [];
    let updated = 0, failed = 0;
    if (posts.length > 0) {
      const container = buildContainerFromPanel(panel);
      for (const post of posts) {
        try {
          const ch = await interaction.guild.channels.fetch(post.channel_id).catch(() => null);
          if (!ch) { await dbRun('DELETE FROM panel_posts WHERE id = ?', [post.id]); failed++; continue; }
          const msg = await ch.messages.fetch(post.message_id).catch(() => null);
          if (!msg) { await dbRun('DELETE FROM panel_posts WHERE id = ?', [post.id]); failed++; continue; }
          await msg.edit(container);
          updated++;
        } catch { await dbRun('DELETE FROM panel_posts WHERE id = ?', [post.id]); failed++; }
      }
    }

    let desc = `Panel **${session.panelName}** saved with ${session.components.length} component${session.components.length !== 1 ? 's' : ''}.`;
    if (updated > 0) desc += `\nAuto-updated **${updated}** posted instance${updated !== 1 ? 's' : ''}.`;
    if (failed > 0) desc += ` ${failed} stale post${failed !== 1 ? 's' : ''} cleaned up.`;
    await interaction.update({ embeds: [new EmbedBuilder().setTitle('Panel Saved').setDescription(desc).setColor(0x00FF00)], components: [] });
    return;
  }

  if (customId === 'pe_set_color') {
    const modal = new ModalBuilder().setCustomId('pe_modal:color').setTitle('Set Accent Color');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('color').setLabel('Hex color (e.g. #E8943A)').setStyle(TextInputStyle.Short).setMaxLength(7).setRequired(true).setValue(session.color)
    ));
    await interaction.showModal(modal);
    return;
  }
}

async function handlePanelEditorModal(interaction) {
  const modalType = interaction.customId.replace('pe_modal:', '');

  if (modalType.startsWith('json_import:')) {
    const name = modalType.replace('json_import:', '');
    const jsonStr = interaction.fields.getTextInputValue('json_data');
    let data;
    try { data = JSON.parse(jsonStr); } catch (e) {
      await interaction.reply({ content: `Invalid JSON: ${e.message}`, flags: MessageFlags.Ephemeral }); return;
    }
    data = normalizeDiscordJson(data);
    const error = validatePanelJson(data);
    if (error) { await interaction.reply({ content: `Validation error: ${error}`, flags: MessageFlags.Ephemeral }); return; }
    await importPanelFromJson(interaction, name, data);
    return;
  }

  const session = getEditorSession(interaction);
  if (!session) {
    await interaction.reply({ content: 'Editor session expired. Use `/panel edit` to reopen.', flags: MessageFlags.Ephemeral });
    return;
  }

  let mode = 'add', editIndex = null, compType = modalType;
  if (modalType.startsWith('add:')) compType = modalType.slice(4);
  else if (modalType.startsWith('edit:')) {
    mode = 'edit';
    const rest = modalType.slice(5);
    const colonIdx = rest.indexOf(':');
    editIndex = parseInt(rest.slice(0, colonIdx), 10);
    compType = rest.slice(colonIdx + 1);
  }

  if (compType === 'color') {
    const colorInput = interaction.fields.getTextInputValue('color').trim();
    const hexMatch = colorInput.match(/^#?([0-9a-fA-F]{6})$/);
    if (!hexMatch) { await interaction.reply({ content: 'Invalid hex color. Use format like `#E8943A` or `E8943A`.', flags: MessageFlags.Ephemeral }); return; }
    const hexColor = `#${hexMatch[1].toUpperCase()}`;
    session.color = hexColor;
    await dbRun('UPDATE panels SET color = ?, updated_at = datetime("now") WHERE id = ?', [hexColor, session.panelId]);
    await dbRun('UPDATE panels SET components = ?, updated_at = datetime("now") WHERE id = ?', [JSON.stringify(session.components), session.panelId]);
    await refreshPanelEditor(interaction, session, true);
    return;
  }

  let newComp = null;
  switch (compType) {
    case 'title': {
      const titleText = interaction.fields.getTextInputValue('title_text');
      newComp = { type: 'text', content: `### ${titleText}` };
      break;
    }
    case 'text': {
      const content = interaction.fields.getTextInputValue('content');
      newComp = { type: 'text', content };
      break;
    }
    case 'subtext': {
      const content = interaction.fields.getTextInputValue('content');
      newComp = { type: 'text', content: `-# ${content}` };
      break;
    }
    case 'image': {
      const url = interaction.fields.getTextInputValue('url').trim();
      const altText = interaction.fields.getTextInputValue('alt_text')?.trim() || undefined;
      if (!/^https?:\/\/.+/i.test(url)) { await interaction.reply({ content: 'Invalid URL. Must start with http:// or https://', flags: MessageFlags.Ephemeral }); return; }
      newComp = { type: 'gallery', items: [{ url }] };
      if (altText) newComp.items[0].altText = altText;
      break;
    }
    case 'link_section': {
      const text = interaction.fields.getTextInputValue('text');
      const buttonLabel = interaction.fields.getTextInputValue('button_label');
      const buttonUrl = interaction.fields.getTextInputValue('button_url').trim();
      if (!/^https?:\/\/.+/i.test(buttonUrl)) { await interaction.reply({ content: 'Invalid button URL. Must start with http:// or https://', flags: MessageFlags.Ephemeral }); return; }
      newComp = { type: 'section_button', text, button: { label: buttonLabel, url: buttonUrl, style: 5 } };
      break;
    }
    case 'thumbnail_section': {
      const text = interaction.fields.getTextInputValue('text');
      const thumbUrl = interaction.fields.getTextInputValue('thumbnail_url').trim();
      if (!/^https?:\/\/.+/i.test(thumbUrl)) { await interaction.reply({ content: 'Invalid URL. Must start with http:// or https://', flags: MessageFlags.Ephemeral }); return; }
      newComp = { type: 'thumbnail', url: thumbUrl, content: text };
      break;
    }
    case 'button_row': {
      const raw = interaction.fields.getTextInputValue('buttons_json').trim();
      const lines = raw.split('\n').filter(l => l.trim());
      const buttons = [];
      for (const line of lines) {
        const parts = line.split('|').map(s => s.trim());
        if (parts.length < 2 || !parts[0] || !parts[1]) continue;
        if (/^https?:\/\/.+/i.test(parts[1])) buttons.push({ label: parts[0], url: parts[1], style: 5 });
        else buttons.push({ label: parts[0], customId: parts[1], style: 2 });
      }
      if (buttons.length === 0) { await interaction.reply({ content: 'No valid buttons found. Use format: `Label | URL` (one per line).', flags: MessageFlags.Ephemeral }); return; }
      newComp = { type: 'buttons', buttons };
      break;
    }
    case 'footer': {
      const content = interaction.fields.getTextInputValue('content');
      newComp = { type: 'footer', content };
      break;
    }
    default:
      await interaction.reply({ content: 'Unknown component type.', flags: MessageFlags.Ephemeral });
      return;
  }

  if (mode === 'edit' && editIndex != null && editIndex >= 0 && editIndex < session.components.length) {
    session.components[editIndex] = newComp;
    session.selectedIndex = editIndex;
  } else {
    if (session.components.length >= 10) { await interaction.reply({ content: 'Component limit reached (10/10).', flags: MessageFlags.Ephemeral }); return; }
    session.components.push(newComp);
    session.selectedIndex = session.components.length - 1;
  }

  await dbRun('UPDATE panels SET components = ?, updated_at = datetime("now") WHERE id = ?', [JSON.stringify(session.components), session.panelId]);
  await refreshPanelEditor(interaction, session, true);
}

// ========================================================================================
// WELCOME SYSTEM
// ========================================================================================

function interpolateWelcomeText(text, member) {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/\{user\}/gi, member.user.username)
    .replace(/\{user\.mention\}/gi, `<@${member.id}>`)
    .replace(/\{user\.tag\}/gi, member.user.tag)
    .replace(/\{user\.id\}/gi, member.id)
    .replace(/\{server\}/gi, member.guild.name)
    .replace(/\{server\.name\}/gi, member.guild.name)
    .replace(/\{server\.membercount\}/gi, String(member.guild.memberCount));
}

function interpolateComponents(components, member) {
  const clone = JSON.parse(JSON.stringify(components));
  for (const comp of clone) {
    if (comp.content) comp.content = interpolateWelcomeText(comp.content, member);
    if (comp.text) comp.text = interpolateWelcomeText(comp.text, member);
    if (comp.items) {
      for (const item of comp.items) {
        if (item.altText) item.altText = interpolateWelcomeText(item.altText, member);
      }
    }
    if (comp.button?.label) comp.button.label = interpolateWelcomeText(comp.button.label, member);
    if (comp.buttons) {
      for (const btn of comp.buttons) {
        if (btn.label) btn.label = interpolateWelcomeText(btn.label, member);
      }
    }
  }
  return clone;
}

async function sendWelcomePanel(member, trigger) {
  try {
    const panel = await dbGet('SELECT * FROM panels WHERE id = ?', [trigger.panel_id]);
    if (!panel) return;

    const components = interpolateComponents(JSON.parse(panel.components || '[]'), member);
    if (components.length === 0) return;

    const color = parseInt((panel.color || '#E8943A').replace('#', ''), 16) || 0xE8943A;
    const cm = new ContainerMessage();
    cm._color = color;
    cm._components = components;

    const channel = await member.guild.channels.fetch(trigger.channel_id).catch(() => null);
    if (!channel) return;

    const payload = cm.toMessage();
    payload.content = `<@${member.id}>`;
    await channel.send(payload);
  } catch (err) {
    console.error(`[Welcome] Error sending welcome panel for trigger ${trigger.id}:`, err);
  }
}

async function handleWelcomeCommand(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: 'You need Administrator permission to use this command.', flags: MessageFlags.Ephemeral });
    return;
  }
  const sub = interaction.options.getSubcommand();
  switch (sub) {
    case 'add': await handleWelcomeAdd(interaction); break;
    case 'remove': await handleWelcomeRemove(interaction); break;
    case 'list': await handleWelcomeList(interaction); break;
  }
}

async function handleWelcomeAdd(interaction) {
  const role = interaction.options.getRole('role');
  const channel = interaction.options.getChannel('channel');
  const panelName = interaction.options.getString('panel').toLowerCase();

  const panel = await dbGet('SELECT * FROM panels WHERE guild_id = ? AND name = ?', [interaction.guild.id, panelName]);
  if (!panel) {
    await interaction.reply({ content: `No panel named **${panelName}** found. Create one first with \`/panel create\`.`, flags: MessageFlags.Ephemeral });
    return;
  }

  await dbRun('INSERT INTO welcome_triggers (guild_id, role_id, channel_id, panel_id, created_by) VALUES (?, ?, ?, ?, ?)',
    [interaction.guild.id, role.id, channel.id, panel.id, interaction.user.id]);

  await interaction.reply({
    content: `Welcome trigger created: when a member gets <@&${role.id}>, panel **${panelName}** will be sent to <#${channel.id}>.`,
    flags: MessageFlags.Ephemeral
  });
}

async function handleWelcomeRemove(interaction) {
  const triggerId = interaction.options.getInteger('id');
  const trigger = await dbGet('SELECT * FROM welcome_triggers WHERE id = ? AND guild_id = ?', [triggerId, interaction.guild.id]);
  if (!trigger) {
    await interaction.reply({ content: `No welcome trigger with ID **${triggerId}** found.`, flags: MessageFlags.Ephemeral });
    return;
  }
  await dbRun('DELETE FROM welcome_triggers WHERE id = ?', [triggerId]);
  await interaction.reply({ content: `Welcome trigger **#${triggerId}** removed.`, flags: MessageFlags.Ephemeral });
}

async function handleWelcomeList(interaction) {
  const triggers = await dbAll('SELECT wt.*, p.name as panel_name FROM welcome_triggers wt JOIN panels p ON wt.panel_id = p.id WHERE wt.guild_id = ?', [interaction.guild.id]);
  if (triggers.length === 0) {
    await interaction.reply({ content: 'No welcome triggers configured. Add one with `/welcome add`.', flags: MessageFlags.Ephemeral });
    return;
  }
  const lines = triggers.map(t =>
    `**#${t.id}** \u2014 Role: <@&${t.role_id}> \u2192 Channel: <#${t.channel_id}> \u2192 Panel: **${t.panel_name}**`
  );
  const embed = new EmbedBuilder()
    .setTitle('Welcome Triggers')
    .setDescription(lines.join('\n'))
    .setColor(0xE8943A)
    .setFooter({ text: `${triggers.length} trigger${triggers.length !== 1 ? 's' : ''}` });
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// ========================================================================================
// RAID SYSTEM FUNCTIONS
// ========================================================================================

async function getOpenRaids(forumChannelId) {
  try {
    const forumChannel = await client.channels.fetch(forumChannelId);
    if (!forumChannel || forumChannel.type !== ChannelType.GuildForum) {
      console.error(`Channel ${forumChannelId} is not a forum channel`);
      return [];
    }
    const activeThreads = await forumChannel.threads.fetchActive();
    return activeThreads.threads
      .map(thread => ({ name: thread.name, url: thread.url, createdAt: thread.createdAt }))
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    console.error(`Error fetching open raids from ${forumChannelId}:`, error);
    return [];
  }
}

async function sendRaidReminders(system) {
  const systems = {
    system1: { forumId: FORUM_CHANNEL_ID, notifyId: NOTIFY_CHANNEL_ID, roleId: RAIDER_ROLE_ID, language: 'en', name: 'System 1' },
    system2: { forumId: FORUM_CHANNEL_ID_2, notifyId: NOTIFY_CHANNEL_ID_2, roleId: RAIDER_ROLE_ID_2, language: 'en', name: 'System 2' },
    system3: { forumId: FORUM_CHANNEL_ID_3, notifyId: NOTIFY_CHANNEL_ID_3, roleId: RAIDER_ROLE_ID_3, language: 'pt', name: 'System 3 (PT)' },
  };

  const systemsToProcess = system === 'all' ? Object.keys(systems) : [system];

  for (const sysKey of systemsToProcess) {
    const sys = systems[sysKey];
    if (!sys || !sys.forumId || !sys.notifyId) {
      console.log(`Skipping ${sysKey}: missing channel configuration`);
      continue;
    }

    const openRaids = await getOpenRaids(sys.forumId);
    if (openRaids.length === 0) {
      console.log(`No open raids found for ${sys.name}`);
      continue;
    }

    const raidList = openRaids.map(raid => `[${raid.name}](${raid.url})`).join('\n');
    const raidCount = openRaids.length;
    const raidWord = raidCount === 1 ? 'raid is' : 'raids are';
    const raidWordPt = raidCount === 1 ? 'raid está' : 'raids estão';

    let embed;
    if (sys.language === 'pt') {
      embed = new EmbedBuilder()
        .setColor(0xFFAA00)
        .setTitle('⚔️ Raids Estão Abertas, TitanArmy!')
        .setDescription(`**${raidCount}** ${raidWordPt} esperando por você:\n\n${raidList}\n\nEntre lá, mostre seu apoio e espalhe a palavra.\nLonga vida ao seu Reinado! 👑`)
        .setTimestamp();
    } else {
      embed = new EmbedBuilder()
        .setColor(0xFFAA00)
        .setTitle('⚔️ Raids Are Live, TitanArmy!')
        .setDescription(`**${raidCount}** ${raidWord} waiting for you:\n\n${raidList}\n\nGet in there, show some love, and spread the word.\nLong may you Reign! 👑`)
        .setTimestamp();
    }

    try {
      const notifyChannel = await client.channels.fetch(sys.notifyId);
      await notifyChannel.send({ embeds: [embed] });
      console.log(`Raid reminder sent for ${sys.name} (${openRaids.length} open raids)`);
    } catch (error) {
      console.error(`Error sending raid reminder for ${sys.name}:`, error);
    }
  }
}

async function processTweet(tweetLink, forumChannelId, notifyChannelId, raiderRoleId, language = 'en', accountName = 'instagram') {
  try {
    const forumChannel = await client.channels.fetch(forumChannelId);
    const notify = await client.channels.fetch(notifyChannelId);

    if (forumChannel.type === ChannelType.GuildForum) {
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const dateStr = `${month}/${day}`;
      const threadName = `${dateStr} ${accountName}`;

      let threadMessage, notifyMessage;
      if (language === 'pt') {
        threadMessage = `Manda um print mostrando que você seguiu, curtiu e compartilhou com um amigo pra pegar suas 2 Caixas de Loot Médias!\n${tweetLink}`;
        notifyMessage = `Ganhe 2 Caixas de Loot Médias!** Acesse {thread_url}, compartilhe com um amigo, curta e siga pra pegar sua recompensa. <@&${raiderRoleId}>`;
      } else {
        threadMessage = `Drop a screenshot showing you've followed, liked, and shared to a friend to claim your 2 Medium Loot Boxes!\n${tweetLink}`;
        notifyMessage = `**Earn 2 Medium Loot Boxes!** Visit {thread_url}, share to a friend, like, and follow to claim your reward. <@&${raiderRoleId}>`;
      }

      const thread = await forumChannel.threads.create({
        name: threadName,
        autoArchiveDuration: 1440,
        message: { content: threadMessage },
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

// Generic queue processor factory
function createQueueProcessor(queueRef, processingRef, lastTimeRef, forumId, notifyId, roleId, systemName, language = 'en') {
  return async function processQueueInternal() {
    const queue = queueRef();
    if (processingRef.get() || queue.length === 0) return;

    processingRef.set(true);
    const currentTime = Date.now();
    const oneHour = 60 * 60 * 1000;
    const lastTime = lastTimeRef.get();

    if (currentTime - lastTime >= oneHour) {
      const postData = queue.shift();
      const link = typeof postData === 'string' ? postData : postData.link;
      const accountName = typeof postData === 'string' ? 'instagram' : postData.accountName;

      await processTweet(link, forumId, notifyId, roleId, language, accountName);
      lastTimeRef.set(currentTime);
      console.log(`Queue processed (${systemName}). Remaining posts in queue: ${queue.length}`);

      if (queue.length > 0) {
        setTimeout(() => { processingRef.set(false); processQueueInternal(); }, oneHour);
      } else {
        processingRef.set(false);
      }
    } else {
      const timeLeft = oneHour - (currentTime - lastTime);
      console.log(`Next post will be processed in ${Math.round(timeLeft / 1000 / 60)} minutes (${systemName})`);
      setTimeout(() => { processingRef.set(false); processQueueInternal(); }, timeLeft);
    }
  };
}

// Queue processors for each raid system
const processQueue1 = createQueueProcessor(
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

// Extract Instagram username from message embeds
function extractInstagramUsername(msg) {
  if (msg.embeds && msg.embeds.length > 0) {
    for (const embed of msg.embeds) {
      if (embed.author && embed.author.name) {
        const match = embed.author.name.match(/@(\w+)/);
        if (match) return match[1];
        return embed.author.name.split(' ')[0];
      }
    }
  }
  return 'instagram';
}

// Handle social media link detection and queuing
function handleSocialMediaLink(message, channelId, systemConfig, queueData, systemName) {
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
  if (socialLink.endsWith('>')) socialLink = socialLink.slice(0, -1);

  const accountName = extractInstagramUsername(message);
  const currentTime = Date.now();
  const oneHour = 60 * 60 * 1000;
  const postData = { link: socialLink, accountName };

  if (currentTime - queueData.lastTime >= oneHour && queueData.queue.length === 0) {
    processTweet(postData.link, queueData.forumId, queueData.notifyId, queueData.roleId, queueData.language || 'en', postData.accountName);
    queueData.lastTime = currentTime;
    console.log(`Post processed immediately (${systemName})`);
  } else {
    queueData.queue.push(postData);
    console.log(`Post added to queue (${systemName}). Position: ${queueData.queue.length}`);
    if (!queueData.processing) queueData.processFunction();
  }
  return true;
}

// ========================================================================================
// TICKET SYSTEM FUNCTIONS
// ========================================================================================

async function createTicketsForEligibleMembers(guild) {
  const members = await guild.members.fetch();
  let category = await getOrCreateCategory(guild);
  let ticketCount = 0;

  for (const [memberId, member] of members) {
    if (isEligibleForTicket(member)) {
      if (ticketCount >= ticketConfig.maxTicketsPerCategory) {
        category = await createCategory(guild);
        ticketCount = 0;
      }
      await createTicket(member, category);
      ticketCount++;
    }
  }
}

function isEligibleForTicket(member) {
  return member.roles.cache.has(ticketConfig.ticketRoleId) && !member.roles.cache.has(ticketConfig.exemptRoleId);
}

async function getOrCreateCategory(guild) {
  let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === ticketConfig.categoryName);
  if (!category) category = await createCategory(guild);
  return category;
}

async function createCategory(guild) {
  return await guild.channels.create({
    name: ticketConfig.categoryName,
    type: ChannelType.GuildCategory,
  });
}

async function createTicket(member, category) {
  const ticketChannel = await member.guild.channels.create({
    name: `ticket-${member.user.username}`,
    type: ChannelType.GuildText,
    parent: category,
    permissionOverwrites: [
      { id: member.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ],
  });

  const welcomeMessage = `Hello ${member}!

We're opening this ticket because you are a proud **HOLDER** of a Titan! That means you get exclusive access to our holders-only tournament happening this weekend! There will be $3,000 USD up for grabs!

You can find more information at the link below and if you're interested, you can register on CM and fill out the form linked below!

**Register here:**
https://invite.cm/X2hJvg

**Fill out the form here:**
https://forms.gle/nMVK1vioR3EgGBoi7

There are only 64 slots available, so be quick! Please let us know if you register or are unable to register.

If you have already registered, congratulations! Make sure to also fill out the form as soon as possible if you have not done so already.`;

  await ticketChannel.send(welcomeMessage);
  console.log(`Created ticket for ${member.user.tag}`);
}

// ========================================================================================
// IMAGE & FILE UTILITY FUNCTIONS
// ========================================================================================

async function fetchImagesFromBot(message, channelId, botId, limit) {
  try {
    const targetChannel = await client.channels.fetch(channelId);
    if (!targetChannel) return message.reply('Invalid channel ID.');

    const downloadsDir = path.join(__dirname, 'downloads', 'images', channelId, botId);
    if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

    let statusMessage = await message.channel.send('Fetching messages...');
    let fetchedCount = 0;
    let downloadedCount = 0;
    let lastMessageId = null;
    let images = [];

    while (fetchedCount < limit) {
      const options = { limit: 100 };
      if (lastMessageId) options.before = lastMessageId;

      const messages = await targetChannel.messages.fetch(options);
      if (messages.size === 0) break;

      lastMessageId = messages.last().id;
      const botMessages = messages.filter(msg => msg.author.id === botId && msg.attachments.size > 0);

      botMessages.forEach(msg => {
        msg.attachments.forEach(attachment => {
          if (attachment.contentType && attachment.contentType.startsWith('image/')) {
            images.push({
              url: attachment.url,
              filename: attachment.name || `image_${Date.now()}_${attachment.id}.${getExtension(attachment.url)}`,
            });
          }
        });
      });

      fetchedCount += messages.size;
      if (fetchedCount % 500 === 0) {
        await statusMessage.edit(`Fetched ${fetchedCount} messages, found ${images.length} images so far...`);
      }
      if (messages.size < 100) break;
    }

    await statusMessage.edit(`Fetched ${fetchedCount} messages, found ${images.length} images. Starting download...`);

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const filePath = path.join(downloadsDir, sanitizeFilename(image.filename));
      await downloadImage(image.url, filePath);
      downloadedCount++;
      if (downloadedCount % 10 === 0 || downloadedCount === images.length) {
        await statusMessage.edit(`Downloading images: ${downloadedCount}/${images.length} complete...`);
      }
    }

    const urlListPath = path.join(downloadsDir, 'image_urls.txt');
    fs.writeFileSync(urlListPath, images.map(img => img.url).join('\n'));

    if (images.length > 0) {
      const zipAttachment = await createZipAttachment(downloadsDir, `bot_${botId}_images.zip`);
      await message.channel.send({
        content: `Completed! Downloaded ${downloadedCount} images from bot <@${botId}> in channel <#${channelId}>.`,
        files: [zipAttachment],
      });
    } else {
      await message.channel.send(`No images found from bot <@${botId}> in channel <#${channelId}>.`);
    }
  } catch (error) {
    console.error('Error fetching images:', error);
    message.channel.send(`An error occurred while fetching images: ${error.message}`);
  }
}

function downloadImage(url, filePath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    https.get(url, response => {
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', err => { fs.unlink(filePath, () => {}); reject(err); });
    }).on('error', err => { fs.unlink(filePath, () => {}); reject(err); });
  });
}

function getExtension(url) {
  const pathname = new URL(url).pathname;
  const filename = pathname.split('/').pop();
  const extension = filename.split('.').pop();
  return extension || 'jpg';
}

function sanitizeFilename(filename) {
  return filename.replace(/[/\\?%*:|"<>]/g, '-');
}

async function createZipAttachment(directory, zipName) {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip();
  const outputFile = path.join(__dirname, 'downloads', zipName);

  const files = fs.readdirSync(directory);
  files.forEach(file => {
    if (file !== 'image_urls.txt') {
      const filePath = path.join(directory, file);
      if (fs.statSync(filePath).isFile()) zip.addLocalFile(filePath);
    }
  });

  const urlsFilePath = path.join(directory, 'image_urls.txt');
  if (fs.existsSync(urlsFilePath)) zip.addLocalFile(urlsFilePath);

  zip.writeZip(outputFile);
  return new AttachmentBuilder(outputFile, { name: zipName });
}

// ========================================================================================
// REPORT GENERATOR (OpenAI)
// ========================================================================================

async function generateReport(message, channelId, timeRange) {
  try {
    await message.channel.send('📊 Generating report... This may take a moment.');

    const channel = await client.channels.fetch(channelId);
    if (!channel) return message.reply('Invalid channel ID.');

    const now = new Date();
    const startTime = timeRange === '24h' ? now.getTime() - 24 * 60 * 60 * 1000 : now.getTime() - 7 * 24 * 60 * 60 * 1000;

    let messages = await channel.messages.fetch({ limit: 100 });
    messages = messages.filter(msg => msg.createdTimestamp > startTime);

    const messageContent = messages.map(msg => `${msg.author.username}: ${msg.content}`).join('\n');
    const prompt = `Analyze and summarize the following chat messages from the last ${timeRange === '24h' ? '24 hours' : '7 days'}:\n\n${messageContent}\n\nProvide a detailed, well-structured report including key topics discussed, notable interactions, and any important information shared. Be thorough in your analysis.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 3000,
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
    await message.channel.send('📊 Report generation complete!');
  } catch (error) {
    console.error('Error generating report:', error);
    message.reply('An error occurred while generating the report.');
  }
}

// ========================================================================================
// CHALLENGE ANSWER CHECKER
// ========================================================================================

function checkChallengeAnswer(answer) {
  answer = answer.toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()""…]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const hasUnlock = answer.includes('unlock') || answer.includes('open') || answer.includes('activate');
  const hasTotem = answer.includes('totem');
  if (hasUnlock && hasTotem) return true;

  const exactVariations = [
    'unlock the totem', 'unlock totem', 'open the totem',
    'activate the totem', 'unlock the totems', 'open the totems',
  ];
  for (const variation of exactVariations) {
    if (answer.includes(variation)) return true;
  }

  const meaningCapture = (
    (answer.includes('unlock') || answer.includes('open') || answer.includes('free') || answer.includes('access')) &&
    (answer.includes('totem') || answer.includes('artifact'))
  );
  return meaningCapture;
}

// ========================================================================================
// SLASH COMMAND REGISTRATION
// ========================================================================================

const commands = [
  new SlashCommandBuilder()
    .setName('data')
    .setDescription('Retrieve your tournament data'),

  new SlashCommandBuilder()
    .setName('win')
    .setDescription('Rename the channel to the mentioned user handle + won')
    .addUserOption(option =>
      option.setName('target').setDescription('The user to mention').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('archive')
    .setDescription("Archive a channel's messages to a text transcript")
    .addChannelOption(option =>
      option.setName('channel').setDescription('Channel to archive (defaults to current)').setRequired(false))
    .addStringOption(option =>
      option.setName('timeframe').setDescription('Time range to archive').setRequired(false)
        .addChoices(
          { name: 'Last 24 hours', value: '24h' },
          { name: 'Last 7 days', value: '7d' },
          { name: 'Last 30 days', value: '30d' },
          { name: 'Last 90 days', value: '90d' },
          { name: 'All time', value: 'all' },
        ))
    .addStringOption(option =>
      option.setName('after_date').setDescription('Start date (YYYY-MM-DD)').setRequired(false))
    .addStringOption(option =>
      option.setName('before_date').setDescription('End date (YYYY-MM-DD)').setRequired(false))
    .addChannelOption(option =>
      option.setName('output_channel').setDescription('Channel to send the archive file to (defaults to current)').setRequired(false))
    .addBooleanOption(option =>
      option.setName('include_bots').setDescription('Include bot messages (default: true)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('update-database')
    .setDescription('Update tournament database from uploaded Excel/CSV file')
    .addAttachmentOption(option =>
      option.setName('file').setDescription('Excel (.xlsx) or CSV file with tournament data').setRequired(true))
    .addBooleanOption(option =>
      option.setName('preview').setDescription('Preview changes without applying them (default: true)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('win-stats')
    .setDescription('Check how many times each mod has used the win command'),

  new SlashCommandBuilder()
    .setName('reset-win-stats')
    .setDescription('Reset the win command usage statistics'),

  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Create and manage Components V2 container panels')
    .addSubcommand(sub =>
      sub.setName('create').setDescription('Create a new panel and open the editor')
        .addStringOption(opt => opt.setName('name').setDescription('Unique name for the panel').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('edit').setDescription('Open the editor for an existing panel')
        .addStringOption(opt => opt.setName('name').setDescription('Panel name').setRequired(true).setAutocomplete(true)))
    .addSubcommand(sub =>
      sub.setName('list').setDescription('List all panels in this server'))
    .addSubcommand(sub =>
      sub.setName('delete').setDescription('Delete a panel')
        .addStringOption(opt => opt.setName('name').setDescription('Panel name').setRequired(true).setAutocomplete(true)))
    .addSubcommand(sub =>
      sub.setName('post').setDescription('Post a panel to a channel')
        .addStringOption(opt => opt.setName('name').setDescription('Panel name').setRequired(true).setAutocomplete(true))
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel to post in (defaults to current)').setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('update').setDescription('Update all posted instances of a panel')
        .addStringOption(opt => opt.setName('name').setDescription('Panel name').setRequired(true).setAutocomplete(true)))
    .addSubcommand(sub =>
      sub.setName('json').setDescription('Import a panel from JSON')
        .addStringOption(opt => opt.setName('name').setDescription('Panel name (creates new or overwrites existing)').setRequired(true))
        .addStringOption(opt => opt.setName('data').setDescription('JSON data (or omit to open a modal)').setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('export').setDescription('Export a panel as JSON')
        .addStringOption(opt => opt.setName('name').setDescription('Panel name').setRequired(true).setAutocomplete(true))),

  new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Manage role-triggered welcome messages')
    .addSubcommand(sub =>
      sub.setName('add').setDescription('Add a welcome trigger for a role')
        .addRoleOption(opt => opt.setName('role').setDescription('Role that triggers the welcome').setRequired(true))
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel to send the welcome in').setRequired(true))
        .addStringOption(opt => opt.setName('panel').setDescription('Panel name to send').setRequired(true).setAutocomplete(true)))
    .addSubcommand(sub =>
      sub.setName('remove').setDescription('Remove a welcome trigger')
        .addIntegerOption(opt => opt.setName('id').setDescription('Trigger ID (from /welcome list)').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('list').setDescription('List all welcome triggers')),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');
    const data = await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands },
    );
    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    console.error('Error refreshing application (/) commands:', error);
  }
})();

// ========================================================================================
// EVENT: READY
// ========================================================================================

client.once('ready', () => {
  console.log(`Mystic 2.0 is online as ${client.user.tag}!`);

  // Schedule raid reminder cron jobs (6am and 6pm JST)
  // JST is UTC+9, so 6am JST = 21:00 UTC (prev day), 6pm JST = 09:00 UTC
  raidReminderMorningJob = schedule.scheduleJob('0 21 * * *', async () => {
    console.log('Running 6am JST raid reminder...');
    await sendRaidReminders('all');
  });

  raidReminderEveningJob = schedule.scheduleJob('0 9 * * *', async () => {
    console.log('Running 6pm JST raid reminder...');
    await sendRaidReminders('all');
  });

  console.log('Raid reminder cron jobs scheduled (6am & 6pm JST)');
});

// ========================================================================================
// EVENT: CHANNEL CREATE (Tournament auto-post)
// ========================================================================================

client.on('channelCreate', async (channel) => {
  if (channel.type === ChannelType.GuildText && categoryMessages[channel.parentId]) {
    try {
      await channel.send(categoryMessages[channel.parentId]);
      console.log(`Sent tournament message to channel ${channel.name}`);
    } catch (error) {
      console.error(`Error sending message to channel ${channel.name}:`, error);
    }
  }
});

// ========================================================================================
// EVENT: THREAD CREATE (Tournament auto-post)
// ========================================================================================

client.on('threadCreate', async (thread) => {
  if (categoryMessages[thread.parentId]) {
    try {
      await thread.send(categoryMessages[thread.parentId]);
      console.log(`Sent tournament message to thread ${thread.name}`);
    } catch (error) {
      console.error(`Error sending message to thread ${thread.name}:`, error);
    }
  }
});

// ========================================================================================
// EVENT: MESSAGE CREATE (Raid system + all prefix commands)
// ========================================================================================

client.on('messageCreate', async (message) => {
  // --- Forum thread auto-replies for raid proof submissions ---
  if (message.channel.isThread() && message.channel.parent) {
    const parentChannelId = message.channel.parent.id;
    const isRaidForum = [FORUM_CHANNEL_ID, FORUM_CHANNEL_ID_2, FORUM_CHANNEL_ID_3].includes(parentChannelId);

    if (isRaidForum && !message.author.bot) {
      try {
        const member = await message.guild.members.fetch(message.author.id);
        const hasCommunityTeamRole = member.roles.cache.some(role => role.name === 'Community Team');

        if (!hasCommunityTeamRole) {
          if (!forumThreadReminders.has(message.channel.id)) {
            forumThreadReminders.set(message.channel.id, new Set());
          }
          const threadReminders = forumThreadReminders.get(message.channel.id);

          if (!threadReminders.has(message.author.id)) {
            let reminderMessage;
            if (parentChannelId === FORUM_CHANNEL_ID_3) {
              reminderMessage = `<@${message.author.id}> Lembre-se: você precisa **seguir, curtir E compartilhar com um amigo** no post para garantir sua recompensa! Não esqueça de compartilhar! 🔗`;
            } else {
              reminderMessage = `<@${message.author.id}> Remember: you need to **follow, like AND share to a friend** on the post to claim your reward! Don't forget to share! 🔗`;
            }
            await message.channel.send(reminderMessage);
            threadReminders.add(message.author.id);
          }
        }
      } catch (error) {
        console.error('Error sending raid reminder:', error);
      }
    }
  }

  // --- Social media link detection for raid systems ---
  if (handleSocialMediaLink(message, TWEET_CHANNEL_ID, raidToggles.system1, {
    queue: tweetQueue, lastTime: lastTweetTime, processing: processingQueue,
    forumId: FORUM_CHANNEL_ID, notifyId: NOTIFY_CHANNEL_ID, roleId: RAIDER_ROLE_ID,
    processFunction: processQueue1,
  }, 'System 1')) return;

  if (handleSocialMediaLink(message, TWEET_CHANNEL_ID_2, raidToggles.system2, {
    queue: tweetQueue2, lastTime: lastTweetTime2, processing: processingQueue2,
    forumId: FORUM_CHANNEL_ID_2, notifyId: NOTIFY_CHANNEL_ID_2, roleId: RAIDER_ROLE_ID_2,
    processFunction: processQueue2,
  }, 'System 2')) return;

  if (handleSocialMediaLink(message, TWEET_CHANNEL_ID_3, raidToggles.system3, {
    queue: tweetQueue3, lastTime: lastTweetTime3, processing: processingQueue3,
    forumId: FORUM_CHANNEL_ID_3, notifyId: NOTIFY_CHANNEL_ID_3, roleId: RAIDER_ROLE_ID_3,
    language: 'pt', processFunction: processQueue3,
  }, 'System 3')) return;

  // --- Ignore bot messages for prefix commands ---
  if (message.author.bot) return;

  // --- File upload command ---
  if (message.content === '!upload' && message.attachments.size > 0) {
    const attachment = message.attachments.first();
    const filePath = path.join(__dirname, 'downloads', attachment.name);

    const response = await fetch(attachment.url);
    const buffer = await response.buffer();
    fs.writeFileSync(filePath, buffer);

    const channel = client.channels.cache.get(process.env.UPLOAD_CHANNEL_ID);
    if (channel) {
      channel.send({ files: [filePath] }).then(sentMessage => {
        const uploadedFile = sentMessage.attachments.first();
        message.reply(`Here's your direct link: \n\`${uploadedFile.url}\``);
      }).catch(console.error);
    }
    return;
  }

  // --- Parse prefix commands ---
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // !create - Tournament ticket creation (admin only)
  if (command === 'create') {
    if (!message.member.permissions.has('ADMINISTRATOR')) {
      return message.reply('You do not have permission to use this command.');
    }
    await message.reply('Starting ticket creation process. This may take a while...');
    await createTicketsForEligibleMembers(message.guild);
    await message.reply('Ticket creation process completed.');
    return;
  }

  // !roll @player - Tournament ban order roll
  if (command === 'roll') {
    const mentionedUser = message.mentions.users.first();
    if (!mentionedUser) return message.reply('❌ Please mention a player to roll against! Usage: `!roll @player2`');
    if (mentionedUser.id === message.author.id) return message.reply('❌ You cannot roll against yourself!');
    if (mentionedUser.bot) return message.reply('❌ You cannot roll against a bot!');

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
    setTimeout(() => rollCooldowns.delete(userId), ROLL_COOLDOWN);

    const roll = Math.floor(Math.random() * 2);
    const winner = roll === 0 ? message.author : mentionedUser;
    const loser = roll === 0 ? mentionedUser : message.author;

    const rollEmbed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🎲 Tournament Ban Order Roll')
      .setDescription(`**${message.author.displayName}** vs **${mentionedUser.displayName}**`)
      .addFields(
        { name: '🏆 First to Ban', value: `**${winner.displayName}** goes first!`, inline: false },
        { name: '⏳ Second to Ban', value: `**${loser.displayName}** goes second!`, inline: false },
      )
      .setFooter({ text: `Roll initiated by ${message.author.displayName}`, iconURL: message.author.displayAvatarURL() })
      .setTimestamp();

    await message.channel.send({ embeds: [rollEmbed] });
    console.log(`Tournament roll: ${message.author.tag} vs ${mentionedUser.tag} - Winner: ${winner.tag}`);
    return;
  }

  // !rollcd / !rollcooldown - Check roll cooldown
  if (command === 'rollcd' || command === 'rollcooldown') {
    const userId = message.author.id;
    const now = Date.now();

    if (rollCooldowns.has(userId)) {
      const expirationTime = rollCooldowns.get(userId) + ROLL_COOLDOWN;
      if (now < expirationTime) {
        const timeLeft = Math.round((expirationTime - now) / 1000);
        return message.reply(`⏰ You have ${timeLeft} seconds left on your roll cooldown.`);
      }
    }
    return message.reply('✅ You can use the roll command now!');
  }

  // !fetchimages [channelID] [botID] (limit)
  if (command === 'fetchimages') {
    if (!message.member.permissions.has('ManageMessages')) {
      return message.reply('You need Manage Messages permission to use this command.');
    }
    if (args.length < 2) return message.reply('Usage: !fetchimages [channelID] [botID] (limit)');

    const targetChannelId = args[0];
    const targetBotId = args[1];
    const limit = args[2] ? parseInt(args[2]) : 100;

    message.reply(`Starting to fetch up to ${limit} images from bot <@${targetBotId}> in channel <#${targetChannelId}>...`);
    fetchImagesFromBot(message, targetChannelId, targetBotId, limit);
    return;
  }

  // !report [channelID] [24h|7d]
  if (command === 'report') {
    if (args.length < 2) return message.reply('Please provide a channel ID and time range (24h or 7d).');

    const channelId = args[0];
    const timeRange = args[1].toLowerCase();
    if (timeRange !== '24h' && timeRange !== '7d') {
      return message.reply('Please provide a valid time range (24h or 7d).');
    }

    // Process Excel/CSV attachments for report if present
    if (message.attachments.size > 0) {
      (async () => {
        try {
          const attachment = message.attachments.first();
          if (!attachment.name.endsWith('.csv') && !attachment.name.endsWith('.xlsx') && !attachment.name.endsWith('.xls')) {
            return message.reply('Please attach a CSV or Excel file.');
          }

          const response = await fetch(attachment.url);
          const buffer = await response.buffer();
          const tempPath = path.join(__dirname, 'downloads', attachment.name);
          fs.writeFileSync(tempPath, buffer);

          let records;
          if (attachment.name.endsWith('.csv')) {
            const content = fs.readFileSync(tempPath, 'utf-8');
            records = parse(content, { columns: true, skip_empty_lines: true });
          } else {
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            records = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
          }

          const csvPath = path.join(__dirname, 'downloads', `report_${Date.now()}.csv`);
          const writer = createCsvWriter({
            path: csvPath,
            header: Object.keys(records[0]).map(key => ({ id: key, title: key })),
          });
          await writer.writeRecords(records);

          await message.channel.send({
            content: `Processed ${records.length} records from ${attachment.name}`,
            files: [csvPath],
          });
        } catch (error) {
          console.error('Error processing file:', error);
          message.channel.send(`An error occurred while processing the file: ${error.message}`);
        }
      })();
    }

    generateReport(message, channelId, timeRange);
    return;
  }

  // !riddle [channelId] - Post challenge
  if (command === 'riddle') {
    if (!message.member.permissions.has('ManageMessages')) {
      return message.reply('You need Manage Messages permission to use this command.');
    }

    const riddleChannelId = args[0] || message.channel.id;

    try {
      const riddleChannel = client.channels.cache.get(riddleChannelId);
      if (!riddleChannel) return message.reply('Invalid channel ID.');

      const riddleEmbed = new EmbedBuilder()
        .setColor(0xca3332)
        .setTitle('💥 Complete the Line Challenge #3 💥')
        .setDescription('TitanArmy! <:ROT:1105716764542763138>\n\n**Episode 5:** "You have been given the power to..."\n\n**Complete the line!**\n\n**🏆 Reward:**\n• **Correct Answer:** 2 Mega Loot Box')
        .setImage('https://i.ibb.co/B2f1qcgp/Mystic-4.png')
        .setFooter({ text: 'Submit your answer below! Unlimited attempts.' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('submitRiddleAnswer').setLabel('Submit Your Answer').setStyle(ButtonStyle.Primary)
      );

      await riddleChannel.send({ embeds: [riddleEmbed], components: [row] });
      message.reply(`Complete the Line Challenge #3 has been posted in <#${riddleChannelId}>!`);
    } catch (error) {
      console.error('Error posting challenge:', error);
      message.reply(`An error occurred: ${error.message}`);
    }
    return;
  }

  // !riddlereminder [start|stop|status]
  if (command === 'riddlereminder') {
    if (!message.member.permissions.has('ManageMessages')) {
      return message.reply('You need Manage Messages permission to use this command.');
    }

    const subCommand = args[0]?.toLowerCase();

    if (subCommand === 'start') {
      riddleReminderChannelId = args[1] || message.channel.id;
      const reminderChannel = client.channels.cache.get(riddleReminderChannelId);
      if (!reminderChannel) return message.reply('Invalid channel ID.');

      if (riddleReminderJob) riddleReminderJob.cancel();

      riddleReminderJob = schedule.scheduleJob('0 */12 * * *', async () => {
        try {
          const riddleEmbed = new EmbedBuilder()
            .setColor(0xca3332)
            .setTitle('💥 Complete the Line Challenge #3 💥')
            .setDescription('REMINDER: TitanArmy! <:ROT:1105716764542763138>\n\n**Episode 5:** "You have been given the power to..."\n\n**Complete the line!**\n\n**🏆 Reward:**\n• **Correct Answer:** 2 Mega Loot Box')
            .setImage('https://i.ibb.co/B2f1qcgp/Mystic-4.png')
            .setFooter({ text: 'Submit your answer below! Unlimited attempts.' })
            .setTimestamp();

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('submitRiddleAnswer').setLabel('Submit Your Answer').setStyle(ButtonStyle.Primary)
          );

          await reminderChannel.send({ embeds: [riddleEmbed], components: [row] });
          console.log(`Challenge reminder sent to channel ${riddleReminderChannelId}`);
        } catch (error) {
          console.error('Error sending challenge reminder:', error);
        }
      });

      riddleReminderActive = true;
      message.reply(`Challenge reminders scheduled for every 12 hours in <#${riddleReminderChannelId}>.`);
    } else if (subCommand === 'stop') {
      if (riddleReminderJob) {
        riddleReminderJob.cancel();
        riddleReminderJob = null;
        riddleReminderActive = false;
        message.reply('Challenge reminders have been stopped.');
      } else {
        message.reply('No challenge reminders are currently active.');
      }
    } else if (subCommand === 'status') {
      if (riddleReminderActive) {
        message.reply(`Challenge reminders are active and scheduled for <#${riddleReminderChannelId}>.`);
      } else {
        message.reply('Challenge reminders are currently inactive.');
      }
    } else {
      const helpEmbed = new EmbedBuilder()
        .setColor(0xca3332)
        .setTitle('Challenge Reminder Help')
        .setDescription('Commands for managing automated challenge reminders:')
        .addFields(
          { name: '!riddlereminder start [channelID]', value: 'Start sending challenge reminders every 12 hours to the specified channel (or current channel if none specified)' },
          { name: '!riddlereminder stop', value: 'Stop automated challenge reminders' },
          { name: '!riddlereminder status', value: 'Check if challenge reminders are currently active' },
        );
      message.channel.send({ embeds: [helpEmbed] });
    }
    return;
  }

  // !riddlereset - Reset challenge progress
  if (command === 'riddlereset') {
    if (!message.member.permissions.has('ManageMessages')) {
      return message.reply('You need Manage Messages permission to use this command.');
    }
    riddleCorrectUsers.clear();
    userChallengeProgress.clear();
    message.reply('The challenge has been reset. All users can submit answers again and attempt tracking has been cleared.');
    return;
  }

  // !riddlestats - View challenge statistics
  if (command === 'riddlestats') {
    if (!message.member.permissions.has('ManageMessages')) {
      return message.reply('You need Manage Messages permission to use this command.');
    }

    const totalParticipants = userChallengeProgress.size;
    const completedUsers = riddleCorrectUsers.size;
    const activeUsers = totalParticipants - completedUsers;
    let totalAttempts = 0;
    userChallengeProgress.forEach((progress) => { totalAttempts += progress.attempts; });

    const statsEmbed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('💥 Complete the Line Challenge #3 Statistics')
      .setDescription(`**Completed:** ${completedUsers} users\n**Still Trying:** ${activeUsers} users\n**Total Participants:** ${totalParticipants}\n**Total Attempts:** ${totalAttempts}\n**Success Rate:** ${totalParticipants > 0 ? Math.round((completedUsers / totalParticipants) * 100) : 0}%`)
      .setTimestamp();

    message.reply({ embeds: [statsEmbed] });
    return;
  }

  // !raidreminder [all|1|2|3|status]
  if (command === 'raidreminder') {
    if (!message.member.permissions.has('ManageMessages')) {
      return message.reply('You need Manage Messages permission to use this command.');
    }

    const target = args[0]?.toLowerCase();

    if (!target) {
      const helpEmbed = new EmbedBuilder()
        .setColor(0xFFAA00)
        .setTitle('Raid Reminder Command')
        .setDescription('Manually trigger raid reminders for open raids.')
        .addFields(
          { name: '!raidreminder all', value: 'Send reminders for all raid systems' },
          { name: '!raidreminder 1', value: 'Send reminder for System 1 (English)' },
          { name: '!raidreminder 2', value: 'Send reminder for System 2 (English)' },
          { name: '!raidreminder 3', value: 'Send reminder for System 3 (Portuguese)' },
          { name: '!raidreminder status', value: 'Check cron job status' },
        );
      return message.channel.send({ embeds: [helpEmbed] });
    }

    if (target === 'status') {
      return message.reply(`Raid reminder cron jobs:\n• 6am JST: ${raidReminderMorningJob ? '✅ Active' : '❌ Inactive'}\n• 6pm JST: ${raidReminderEveningJob ? '✅ Active' : '❌ Inactive'}`);
    }

    let system;
    if (target === 'all') system = 'all';
    else if (target === '1') system = 'system1';
    else if (target === '2') system = 'system2';
    else if (target === '3') system = 'system3';
    else return message.reply('Invalid option. Use `all`, `1`, `2`, or `3`.');

    await message.reply(`Sending raid reminder for ${system === 'all' ? 'all systems' : system}...`);
    await sendRaidReminders(system);
    await message.channel.send('Raid reminder(s) sent!');
    return;
  }

  // !riddleprogress [userID]
  if (command === 'riddleprogress') {
    if (!message.member.permissions.has('ManageMessages')) {
      return message.reply('You need Manage Messages permission to use this command.');
    }

    const targetUserId = args[0];
    if (!targetUserId) return message.reply('Please provide a user ID. Usage: `!riddleprogress <userID>`');

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
    return;
  }

  // !setup - Interactive forum post builder
  if (command === 'setup') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('setChannel').setLabel('Set Channel').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('setTitle').setLabel('Set Title').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('setDescription').setLabel('Set Description').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('setImage').setLabel('Set Image').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('sendEmbed').setLabel('Send Forum Post').setStyle(ButtonStyle.Success),
    );

    const embed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setTitle('Mystic Forum Creator V2')
      .setDescription('Use the buttons below to set up your forum post:')
      .setImage('https://media.discordapp.net/attachments/1036349587394408468/1249544200807125052/800_x_400_09.53.47.png?ex=6667b038&is=66665eb8&hm=597487b9f523d7c7266ffb4c894aaee02d4ab0771313e0ac9d85d8dcc750cb3f&=&format=webp&quality=lossless&width=1100&height=550')
      .addFields(
        { name: 'Select Channel', value: 'Click to select the target channel for the forum post.' },
        { name: 'Set Title', value: 'Click to set the title for the forum post.' },
        { name: 'Set Description', value: 'Click to set the description for the forum post.' },
        { name: 'Set Image', value: 'Click to upload an image for the forum post.' },
        { name: 'Send Forum Post', value: 'Click to create the forum post with the provided details.' },
      );

    await message.channel.send({ embeds: [embed], components: [row] });
    return;
  }
});

// ========================================================================================
// EVENT: INTERACTION CREATE — Slash Commands
// ========================================================================================

client.on('interactionCreate', async interaction => {
  // ── Panel/Welcome autocomplete ──
  if (interaction.isAutocomplete()) {
    const cmd = interaction.commandName;
    const focused = interaction.options.getFocused(true);
    if ((cmd === 'panel' || cmd === 'welcome') && (focused.name === 'name' || focused.name === 'panel')) {
      try {
        const panels = await dbAll('SELECT name FROM panels WHERE guild_id = ?', [interaction.guild.id]);
        const query = focused.value.toLowerCase();
        const filtered = panels
          .filter(p => p.name.toLowerCase().includes(query))
          .slice(0, 25)
          .map(p => ({ name: p.name, value: p.name }));
        await interaction.respond(filtered);
      } catch { await interaction.respond([]); }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  try {
    // /data - Tournament data lookup
    if (interaction.commandName === 'data') {
      try {
        await interaction.deferReply({ ephemeral: true });
        const userTag = interaction.user.tag;

        db.get(`
          SELECT * FROM tournament
          WHERE TRIM(LOWER(discord_name)) = LOWER(TRIM(?))
        `, [userTag], async (err, row) => {
          try {
            if (err) {
              console.error('Database error:', err.message);
              return await interaction.editReply({
                content: '❌ There was an error accessing the database. Please try again later or contact an administrator.',
              });
            }

            if (!row) {
              const embed = new EmbedBuilder()
                .setColor(0xFF6B6B)
                .setTitle('❌ No Tournament Data Found')
                .setDescription(`No tournament registration found for **${interaction.user.tag}**`)
                .addFields({
                  name: '🔍 What to do next:',
                  value: '• Check if you registered with a different Discord account\n• Contact tournament staff if you believe this is an error\n• Make sure you completed the registration process',
                  inline: false,
                })
                .setTimestamp()
                .setFooter({ text: 'Reign of Titans Tournament System', iconURL: interaction.guild.iconURL() });
              return await interaction.editReply({ embeds: [embed] });
            }

            const getFieldValue = (value, defaultValue = '-') => {
              return value && value.toString().trim() !== '' ? value.toString().trim() : defaultValue;
            };

            const embed = new EmbedBuilder()
              .setColor(0x00D4AA)
              .setTitle('🏆 Your Tournament Data')
              .setDescription(`Tournament registration details for **${interaction.user.tag}**`)
              .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
              .addFields(
                {
                  name: '👤 Player Information',
                  value: `**Discord:** ${getFieldValue(row.discord_name)}\n**Wallet:** ${getFieldValue(row.player_wallet)}\n**CM ID:** ${getFieldValue(row.cm_id)}`,
                  inline: false,
                },
                {
                  name: '⚔️ Tournament Brackets & Titans',
                  value: `**Bracket 1:** ${getFieldValue(row.bracket1_titan)}\n**Bracket 2:** ${getFieldValue(row.bracket2_titan)}\n**Bracket 3:** ${getFieldValue(row.bracket3_titan)}\n**Bracket 4:** ${getFieldValue(row.bracket4_titan)}`,
                  inline: false,
                },
                {
                  name: '⚠️ Important Tournament Rules',
                  value: '**🇺🇸 English:**\n• You must **check in to ALL brackets** before starting\n• **Notify all brackets** about your playing order\n• **Keep other players updated** on your match progress\n• **Communicate your estimated finish time**\n• ❌ **Failure to follow = DISQUALIFICATION**\n\n**🇪🇸 Español:**\n• Debes **registrarte en TODOS los brackets** antes de comenzar\n• **Notifica a todos los brackets** sobre tu orden de juego\n• **Mantén a otros jugadores actualizados** sobre tu progreso\n• **Comunica tu tiempo estimado de finalización**\n• ❌ **No seguir las reglas = DESCALIFICACIÓN**',
                  inline: false,
                },
              )
              .setTimestamp()
              .setFooter({ text: 'Reign of Titans Tournament System • Good luck!', iconURL: interaction.guild.iconURL() });

            await interaction.editReply({ embeds: [embed] });
          } catch (followUpError) {
            console.error('Error in follow-up:', followUpError);
            try {
              await interaction.editReply({ content: '❌ An unexpected error occurred while displaying your data. Please try again or contact an administrator.' });
            } catch (finalError) {
              console.error('Critical error in data command:', finalError);
            }
          }
        });
      } catch (initialError) {
        console.error('Error in data command initialization:', initialError);
        try {
          if (interaction.deferred) {
            await interaction.editReply({ content: '❌ Command failed to initialize. Please try again or contact an administrator.' });
          } else {
            await interaction.reply({ content: '❌ Command failed to initialize. Please try again or contact an administrator.', ephemeral: true });
          }
        } catch (replyError) {
          console.error('Failed to send error message:', replyError);
        }
      }
    }

    // /update-database - Upload and sync tournament data
    else if (interaction.commandName === 'update-database') {
      if (!interaction.member.permissions.has('ADMINISTRATOR') &&
          !interaction.member.roles.cache.has('1316589364339408896')) {
        return await interaction.reply({ content: '❌ You do not have permission to update the database.', ephemeral: true });
      }

      try {
        await interaction.deferReply({ ephemeral: true });
        const file = interaction.options.getAttachment('file');
        const previewMode = interaction.options.getBoolean('preview') ?? true;

        if (!file) return await interaction.editReply('❌ No file was uploaded.');

        const allowedExtensions = ['.xlsx', '.xls', '.csv'];
        const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
        if (!allowedExtensions.includes(fileExtension)) {
          return await interaction.editReply('❌ Please upload an Excel (.xlsx/.xls) or CSV (.csv) file.');
        }

        await interaction.editReply('📥 Downloading and processing file...');

        const response = await fetch(file.url);
        const buffer = await response.arrayBuffer();

        let processedData;
        if (fileExtension === '.csv') {
          const text = new TextDecoder().decode(buffer);
          const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
          processedData = parsed.data;
        } else {
          const workbook = XLSX.read(buffer, { type: 'buffer' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          processedData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

          if (processedData.length > 0) {
            const headers = processedData[0].map(h => h.toString().trim());
            processedData = processedData.slice(1).map(row => {
              const obj = {};
              headers.forEach((header, index) => { obj[header] = row[index] || ''; });
              return obj;
            });
          }
        }

        await interaction.editReply('🔍 Validating data format...');

        const columnMapping = {
          'discord name': 'discord_name', 'cm id': 'cm_id', 'player wallet': 'player_wallet',
          'bracket 1 titan': 'bracket1_titan', 'bracket 2 titan': 'bracket2_titan',
          'bracket 3 titan': 'bracket3_titan', 'bracket 4 titan': 'bracket4_titan',
          'discord_name': 'discord_name', 'cm_id': 'cm_id', 'player_wallet': 'player_wallet',
          'bracket_1_titan': 'bracket1_titan', 'bracket_2_titan': 'bracket2_titan',
          'bracket_3_titan': 'bracket3_titan', 'bracket_4_titan': 'bracket4_titan',
        };

        if (processedData.length === 0) return await interaction.editReply('❌ No data found in the uploaded file.');

        const fileColumns = Object.keys(processedData[0]);
        const missingRequired = [];
        const requiredDbCols = ['discord_name'];

        requiredDbCols.forEach(requiredDbCol => {
          const found = fileColumns.some(fileCol => {
            const normalizedFileCol = fileCol.toLowerCase().trim();
            return columnMapping[normalizedFileCol] === requiredDbCol;
          });
          if (!found) {
            const displayName = Object.keys(columnMapping).find(key =>
              columnMapping[key] === requiredDbCol && !key.includes('_')
            ) || requiredDbCol;
            missingRequired.push(displayName);
          }
        });

        if (missingRequired.length > 0) {
          return await interaction.editReply(
            `❌ Missing required columns: ${missingRequired.join(', ')}\n\n` +
            `**Required columns:** Discord Name (others are optional)\n` +
            `**Found columns:** ${fileColumns.join(', ')}\n\n` +
            `**Note:** Processing stops at "Renters:" section automatically`
          );
        }

        const fileToDbMapping = {};
        fileColumns.forEach(fileCol => {
          const normalizedFileCol = fileCol.toLowerCase().trim();
          const dbCol = columnMapping[normalizedFileCol];
          if (dbCol) fileToDbMapping[fileCol] = dbCol;
        });

        const validatedData = [];
        for (let i = 0; i < processedData.length; i++) {
          const row = processedData[i];
          const firstColumnValue = Object.values(row)[0];
          if (firstColumnValue && firstColumnValue.toString().toLowerCase().trim().startsWith('renters:')) {
            console.log(`Stopped processing at row ${i + 2} - found "Renters:" section`);
            break;
          }

          const cleanedRow = {};
          Object.values(columnMapping).forEach(dbCol => { cleanedRow[dbCol] = null; });
          Object.keys(row).forEach(fileCol => {
            const dbCol = fileToDbMapping[fileCol];
            if (dbCol) {
              const value = row[fileCol];
              cleanedRow[dbCol] = value && value.toString().trim() !== '' ? value.toString().trim() : null;
            }
          });

          if (!cleanedRow.discord_name || cleanedRow.discord_name.trim() === '') continue;
          validatedData.push(cleanedRow);
        }

        if (previewMode) {
          const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle('📋 Database Update Preview')
            .setDescription(`**File:** ${file.name}\n**Valid records:** ${validatedData.length}`)
            .addFields(
              {
                name: '📊 Sample Data (First 3 records)',
                value: validatedData.slice(0, 3).map((row, i) =>
                  `**${i + 1}.** ${row.discord_name} | ${row.cm_id || 'No CM ID'} | Titans: ${[row.bracket1_titan, row.bracket2_titan, row.bracket3_titan, row.bracket4_titan].filter(Boolean).length}/4`
                ).join('\n') || 'No valid data',
                inline: false,
              },
              {
                name: '⚠️ Next Steps',
                value: '• This is a **PREVIEW ONLY**\n• No changes have been made to the database\n• Run the command again with `preview: False` to apply changes\n• **WARNING:** This will completely replace all tournament data!',
                inline: false,
              },
            )
            .setTimestamp()
            .setFooter({ text: 'Database Update System' });

          return await interaction.editReply({ embeds: [embed] });
        }

        // Apply changes
        await interaction.editReply('🗄️ Updating database... This may take a moment.');

        await new Promise((resolve, reject) => {
          db.serialize(() => {
            db.run('DELETE FROM tournament', (err) => {
              if (err) { console.error('Error clearing database:', err); return reject(err); }
              console.log('Database cleared successfully');
            });

            const insertStmt = db.prepare(`
              INSERT INTO tournament (discord_name, player_wallet, cm_id, bracket1_titan, bracket2_titan, bracket3_titan, bracket4_titan)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            let insertedCount = 0;
            let insertErrors = [];

            validatedData.forEach((row, index) => {
              insertStmt.run([
                row.discord_name, row.player_wallet, row.cm_id,
                row.bracket1_titan, row.bracket2_titan, row.bracket3_titan, row.bracket4_titan,
              ], function(err) {
                if (err) insertErrors.push(`Row ${index + 1}: ${err.message}`);
                else insertedCount++;

                if (insertedCount + insertErrors.length === validatedData.length) {
                  insertStmt.finalize();
                  if (insertErrors.length > 0) reject(new Error(`Insert errors: ${insertErrors.join(', ')}`));
                  else resolve(insertedCount);
                }
              });
            });
          });
        });

        const successEmbed = new EmbedBuilder()
          .setColor(0x27AE60)
          .setTitle('✅ Database Updated Successfully!')
          .setDescription(`**File processed:** ${file.name}`)
          .addFields(
            { name: '📊 Results', value: `• **${validatedData.length}** records inserted\n• Database completely refreshed\n• All previous data replaced`, inline: false },
            { name: '👤 Updated by', value: `${interaction.user.tag}`, inline: true },
            { name: '⏰ Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
          )
          .setTimestamp()
          .setFooter({ text: 'Database Update System' });

        await interaction.editReply({ embeds: [successEmbed] });
        console.log(`Database updated by ${interaction.user.tag}: ${validatedData.length} records inserted`);

      } catch (error) {
        console.error('Error in update-database command:', error);
        await interaction.editReply(`❌ An error occurred: ${error.message}`);
      }
    }

    // /win - Declare tournament winner
    else if (interaction.commandName === 'win') {
      const targetUser = interaction.options.getUser('target');
      const context = interaction.channel;
      const moderator = interaction.user;

      if (!interaction.member.roles.cache.has('1316589364339408896') &&
          !interaction.member.roles.cache.has('1250382515995148289')) {
        return await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      }

      if (!targetUser || !context) {
        return interaction.reply({ content: 'Could not find the user or the channel/thread.', ephemeral: true });
      }

      await interaction.reply({ content: `Processing win for ${targetUser.username}. Please wait...`, ephemeral: false });

      try {
        console.log('1. Starting win command process');

        // Track moderator usage
        const stats = loadStats();
        const modId = moderator.id;
        if (!stats.winCommand[modId]) {
          stats.winCommand[modId] = { count: 0, username: moderator.username };
        }
        stats.winCommand[modId].count++;
        saveStats(stats);

        const isThread = context.isThread();
        let currentPermissions;
        if (context.permissionOverwrites && context.permissionOverwrites.cache) {
          currentPermissions = context.permissionOverwrites.cache;
        } else {
          console.log('No direct permission overwrites available.');
          currentPermissions = new Map();
        }

        // Rename channel/thread
        const newName = `${targetUser.username}-won`;
        const renamedContext = await context.setName(newName);
        console.log(`2. ${isThread ? 'Thread' : 'Channel'}'s new name is ${renamedContext.name}`);

        // Handle channel positioning (channels only, not threads)
        if (!isThread) {
          const category = renamedContext.parent;
          if (category) {
            console.log('3. Channel is in a category');
            const categoryChannels = category.children.cache.sort((a, b) => a.position - b.position);

            try {
              await renamedContext.setParent(category.id, { lockPermissions: false });
              console.log('4. Channel moved to category');
            } catch (error) {
              if (error.code === 50035) {
                console.log('4a. Cannot move channel - category limit reached');
                throw new Error('Category channel limit reached');
              }
              throw error;
            }

            await renamedContext.setPosition(categoryChannels.first().position);
            console.log('5. Channel moved to top position');
          }
        }

        // Update permissions
        console.log('6. Starting permission restoration');
        if (renamedContext.permissionOverwrites && renamedContext.permissionOverwrites.edit) {
          await renamedContext.permissionOverwrites.edit(interaction.guild.id, {
            ViewChannel: false,
            SendMessages: false,
          });

          const processedIds = new Set();
          for (const [id, overwrite] of currentPermissions) {
            if (id === interaction.guild.id) continue;
            if (processedIds.has(id)) continue;
            processedIds.add(id);

            try {
              console.log(`Restoring permission for ${id}`);
              if (overwrite.type === 0) {
                const role = interaction.guild.roles.cache.get(id);
                if (role) {
                  await renamedContext.permissionOverwrites.edit(role, overwrite.toJSON());
                  console.log(`Role permission restored for ${role.name}`);
                } else {
                  console.log(`Role ${id} not found`);
                }
              } else if (overwrite.type === 1) {
                const member = await interaction.guild.members.fetch(id).catch(() => null);
                if (member) {
                  await renamedContext.permissionOverwrites.edit(member, overwrite.toJSON());
                  console.log(`Member permission restored for ${member.user.tag}`);
                } else {
                  console.log(`Member ${id} not found`);
                }
              }
            } catch (permError) {
              console.error(`Error restoring permission for ${id}:`, permError);
            }
          }
          console.log('7. Permissions restored and privacy ensured');
        } else {
          console.log('Permission overwrites not available for this context. Skipping permission changes.');
        }

        // Determine moderators to ping based on category
        let moderatorsToPing = ['638121878707503105'];

        if (isThread) {
          const parentChannel = interaction.guild.channels.cache.get(context.parentId);
          if (parentChannel) {
            const categoryId = parentChannel.parentId;
            console.log(`Thread's parent channel is in category ID: ${categoryId}`);

            const categoryModerators = {
              '1374724827444678676': ['638121878707503105'], // Hammer Throw Heritage Cup
              '1372539274536157266': ['819560925769236500'], // Wingslash Waltz Cup
              '1372539300389851246': ['732865409233059941'], // Piledrive Promenade Cup
            };

            if (categoryModerators[categoryId]) {
              moderatorsToPing = categoryModerators[categoryId];
              console.log(`Using category-specific moderators for category ${categoryId}`);
            }
          }
        }

        console.log('8. Preparing final announcement');
        const moderatorMentions = moderatorsToPing.map(id => `<@${id}>`).join(' ');
        const finalMessage = `The winner is <@${targetUser.id}>! (Declared by <@${moderator.id}>) ${moderatorMentions}`;
        console.log('Final message content:', finalMessage);

        await interaction.followUp({ content: finalMessage });
        console.log('9. Final announcement sent successfully');
      } catch (error) {
        console.error('Error in win command:', error);
        await interaction.followUp({ content: 'There was an error processing the command. Please try again or contact an administrator.', ephemeral: true });
      }
    }

    // /win-stats - View moderator statistics
    else if (interaction.commandName === 'win-stats') {
      if (!interaction.member.roles.cache.has('1316589364339408896') &&
          !interaction.member.roles.cache.has('1250382515995148289')) {
        return await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      }

      try {
        const stats = loadStats();
        if (!stats.winCommand || Object.keys(stats.winCommand).length === 0) {
          return await interaction.reply('No win command statistics available.');
        }

        const embed = new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle('Win Command Usage Statistics')
          .setDescription('Number of times each moderator has used the win command')
          .setTimestamp();

        for (const modId in stats.winCommand) {
          const modData = stats.winCommand[modId];
          embed.addFields({ name: modData.username || 'Unknown Moderator', value: `${modData.count} times`, inline: true });
        }

        await interaction.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Error displaying win stats:', error);
        await interaction.reply('There was an error retrieving the statistics.');
      }
    }

    // /reset-win-stats - Reset moderator statistics (admin only)
    else if (interaction.commandName === 'reset-win-stats') {
      if (!interaction.member.permissions.has('ADMINISTRATOR')) {
        return await interaction.reply({
          content: 'You do not have permission to use this command. Only administrators can reset statistics.',
          ephemeral: true,
        });
      }

      try {
        const stats = loadStats();
        stats.winCommand = {};
        saveStats(stats);
        await interaction.reply('Win command statistics have been reset successfully.');
      } catch (error) {
        console.error('Error resetting win stats:', error);
        await interaction.reply('There was an error resetting the statistics.');
      }
    }

    // /panel - Panel editor system
    else if (interaction.commandName === 'panel') {
      await handlePanelCommand(interaction);
    }

    // /welcome - Welcome trigger system
    else if (interaction.commandName === 'welcome') {
      await handleWelcomeCommand(interaction);
    }

    // /archive - Channel archiving
    else if (interaction.commandName === 'archive') {
      if (!interaction.member.permissions.has('MANAGE_CHANNELS')) {
        return await interaction.reply({ content: 'You do not have permission to archive channels.', ephemeral: true });
      }

      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const timeframe = interaction.options.getString('timeframe') || 'all';
      const afterDateStr = interaction.options.getString('after_date');
      const beforeDateStr = interaction.options.getString('before_date');
      const outputChannel = interaction.options.getChannel('output_channel') || interaction.channel;
      const includeBots = interaction.options.getBoolean('include_bots') ?? true;

      if (!channel.isTextBased() || channel.type === ChannelType.GuildCategory) {
        return await interaction.reply({ content: 'Please select a text-based channel to archive.', ephemeral: true });
      }
      if (!outputChannel.isTextBased() || outputChannel.type === ChannelType.GuildCategory) {
        return await interaction.reply({ content: 'Output channel must be a text-based channel.', ephemeral: true });
      }

      if (afterDateStr && !/^\d{4}-\d{2}-\d{2}$/.test(afterDateStr)) {
        return await interaction.reply({ content: 'Invalid `after_date` format. Use `YYYY-MM-DD`.', ephemeral: true });
      }
      if (beforeDateStr && !/^\d{4}-\d{2}-\d{2}$/.test(beforeDateStr)) {
        return await interaction.reply({ content: 'Invalid `before_date` format. Use `YYYY-MM-DD`.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      try {
        let afterDate = null;
        let beforeDate = null;

        if (afterDateStr) afterDate = new Date(afterDateStr + 'T00:00:00.000Z');
        if (beforeDateStr) beforeDate = new Date(beforeDateStr + 'T23:59:59.999Z');

        if (!afterDate && timeframe !== 'all') {
          const now = new Date();
          switch (timeframe) {
            case '24h': afterDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
            case '7d': afterDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
            case '30d': afterDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
            case '90d': afterDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); break;
          }
        }

        const allMessages = [];
        let cursor = null;
        let fetchCount = 0;
        let hitDateFloor = false;

        while (true) {
          const fetchOptions = { limit: 100 };
          if (cursor) fetchOptions.before = cursor;

          const fetched = await channel.messages.fetch(fetchOptions);
          if (fetched.size === 0) break;

          const sorted = [...fetched.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
          for (const msg of sorted) {
            if (beforeDate && msg.createdAt > beforeDate) continue;
            if (afterDate && msg.createdAt < afterDate) { hitDateFloor = true; continue; }
            allMessages.push(msg);
          }

          cursor = sorted[sorted.length - 1].id;
          fetchCount++;

          if (fetchCount % 5 === 0) {
            try {
              await interaction.editReply(
                `Archiving **#${channel.name}**... ${allMessages.length.toLocaleString()} messages collected (~${(fetchCount * 100).toLocaleString()} fetched)`
              );
            } catch {}
          }

          if (fetched.size < 100 || hitDateFloor) break;
          await new Promise(r => setTimeout(r, 300));
        }

        allMessages.reverse();

        if (allMessages.length === 0) {
          return await interaction.editReply(`No messages found in **#${channel.name}** for the specified time range.`);
        }

        await interaction.editReply(`Fetched **${allMessages.length.toLocaleString()}** messages. Building transcript...`);

        let rangeDesc = 'All time';
        if (afterDateStr && beforeDateStr) rangeDesc = `${afterDateStr} to ${beforeDateStr}`;
        else if (afterDateStr) rangeDesc = `From ${afterDateStr}`;
        else if (beforeDateStr) rangeDesc = `Until ${beforeDateStr}`;
        else if (timeframe === '24h') rangeDesc = 'Last 24 hours';
        else if (timeframe === '7d') rangeDesc = 'Last 7 days';
        else if (timeframe === '30d') rangeDesc = 'Last 30 days';
        else if (timeframe === '90d') rangeDesc = 'Last 90 days';

        const lines = [];
        const sep = '─'.repeat(60);

        lines.push(sep);
        lines.push(`  CHANNEL ARCHIVE: #${channel.name}`);
        lines.push(`  Server: ${interaction.guild.name}`);
        lines.push(`  Channel ID: ${channel.id}`);
        lines.push(`  Time Range: ${rangeDesc}`);
        lines.push(`  Archived by: ${interaction.user.tag}`);
        lines.push(`  Created at: ${new Date().toISOString()}`);
        lines.push(`  Bots included: ${includeBots ? 'Yes' : 'No'}`);
        lines.push(sep);
        lines.push('');

        let messageCount = 0;
        const uniqueAuthors = new Set();

        for (const msg of allMessages) {
          if (!includeBots && msg.author.bot) continue;

          uniqueAuthors.add(msg.author.id);
          messageCount++;

          const ts = msg.createdAt.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
          const authorTag = msg.author.tag || msg.author.username;
          const botTag = msg.author.bot ? ' [BOT]' : '';

          lines.push(`[${ts}] ${authorTag}${botTag}`);
          if (msg.content) lines.push(msg.content);

          if (msg.attachments.size > 0) {
            for (const att of msg.attachments.values()) {
              const size = att.size ? ` (${formatFileSize(att.size)})` : '';
              lines.push(`  [Attachment: ${att.name || 'unknown'}${size}] ${att.url}`);
            }
          }

          if (msg.embeds.length > 0) {
            for (const embed of msg.embeds) {
              const parts = [];
              if (embed.title) parts.push(`Title: ${embed.title}`);
              if (embed.description) parts.push(`Description: ${embed.description.substring(0, 200)}${embed.description.length > 200 ? '...' : ''}`);
              if (embed.url) parts.push(`URL: ${embed.url}`);
              if (embed.fields?.length > 0) {
                for (const field of embed.fields) {
                  parts.push(`  ${field.name}: ${field.value.substring(0, 150)}${field.value.length > 150 ? '...' : ''}`);
                }
              }
              if (parts.length > 0) lines.push(`  [Embed] ${parts.join(' | ')}`);
            }
          }

          if (msg.stickers?.size > 0) {
            lines.push(`  [Stickers: ${[...msg.stickers.values()].map(s => s.name).join(', ')}]`);
          }

          if (msg.reactions?.cache.size > 0) {
            const reactions = [...msg.reactions.cache.values()].map(r => `${r.emoji.name} x${r.count}`).join(', ');
            lines.push(`  [Reactions: ${reactions}]`);
          }

          if (msg.reference?.messageId) {
            lines.push(`  [Reply to message ${msg.reference.messageId}]`);
          }

          lines.push('');
        }

        lines.push(sep);
        lines.push(`  Total messages: ${messageCount.toLocaleString()}`);
        lines.push(`  Unique authors: ${uniqueAuthors.size}`);
        lines.push(`  Archive generated by Mystic 2.0`);
        lines.push(sep);

        const transcript = lines.join('\n');
        const transcriptBuffer = Buffer.from(transcript, 'utf-8');

        if (transcriptBuffer.length > 24 * 1024 * 1024) {
          return await interaction.editReply(
            `Archive is too large to upload (**${formatFileSize(transcriptBuffer.length)}**). Try a shorter time range or use \`after_date\`/\`before_date\` to narrow it down.`
          );
        }

        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `archive_${channel.name}_${dateStr}.txt`;

        const attachment = new AttachmentBuilder(transcriptBuffer, {
          name: filename,
          description: `Archive of #${channel.name} - ${messageCount} messages`,
        });

        const archiveEmbed = new EmbedBuilder()
          .setTitle('Channel Archive Complete')
          .setColor(0x5865F2)
          .addFields(
            { name: 'Channel', value: `<#${channel.id}>`, inline: true },
            { name: 'Time Range', value: rangeDesc, inline: true },
            { name: 'Messages', value: messageCount.toLocaleString(), inline: true },
            { name: 'Unique Authors', value: `${uniqueAuthors.size}`, inline: true },
            { name: 'Bots Included', value: includeBots ? 'Yes' : 'No', inline: true },
            { name: 'File Size', value: formatFileSize(transcriptBuffer.length), inline: true },
          )
          .setTimestamp();

        await outputChannel.send({
          content: `Archive of **#${channel.name}** (${messageCount.toLocaleString()} messages)`,
          embeds: [archiveEmbed],
          files: [attachment],
        });

        const outputNote = outputChannel.id !== interaction.channel.id ? ` Archive sent to <#${outputChannel.id}>.` : '';
        await interaction.editReply(
          `Archive complete! **${messageCount.toLocaleString()}** messages from **#${channel.name}** exported.${outputNote}`
        );
      } catch (error) {
        console.error('Error archiving the channel:', error);
        await interaction.editReply('There was an error archiving the channel: ' + error.message);
      }
    }

  } catch (error) {
    console.error('Error executing command:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
    } else {
      await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
  }
});

// ========================================================================================
// EVENT: INTERACTION CREATE — Buttons, Modals, Select Menus
// ========================================================================================

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton() && !interaction.isModalSubmit() && !interaction.isSelectMenu()) return;

  try {
    // ── Panel Editor Interactions ──
    if (interaction.isSelectMenu() && (interaction.customId === 'pe_select' || interaction.customId === 'pe_add')) {
      await handlePanelEditorSelect(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith('pe_')) {
      await handlePanelEditorButton(interaction);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('pe_modal:')) {
      await handlePanelEditorModal(interaction);
      return;
    }

    // Challenge #3 - Submit answer button
    if (interaction.isButton() && interaction.customId === 'submitRiddleAnswer') {
      const userId = interaction.user.id;

      if (riddleCorrectUsers.has(userId)) {
        await interaction.reply({ content: "You've already completed this challenge successfully! 🎉", ephemeral: true });
        return;
      }

      const userProgress = userChallengeProgress.get(userId) || { submitted: [], attempts: 0 };

      const modal = new ModalBuilder()
        .setCustomId('riddleAnswerModal')
        .setTitle('Complete the Line #3');

      const answerInput = new TextInputBuilder()
        .setCustomId('powerAnswer')
        .setLabel(`Complete the quote (Attempt ${userProgress.attempts + 1})`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('...the power to...')
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(answerInput));
      await interaction.showModal(modal);
      return;
    }

    // Challenge #3 - Modal submission
    if (interaction.isModalSubmit() && interaction.customId === 'riddleAnswerModal') {
      const userId = interaction.user.id;

      if (riddleCorrectUsers.has(userId)) {
        await interaction.reply({ content: "You've already completed this challenge successfully! 🎉", ephemeral: true });
        return;
      }

      if (!userChallengeProgress.has(userId)) {
        userChallengeProgress.set(userId, { submitted: [], attempts: 0 });
      }

      const userProgress = userChallengeProgress.get(userId);
      const userAnswer = interaction.fields.getTextInputValue('powerAnswer').toLowerCase().trim();

      userProgress.attempts++;
      userProgress.submitted.push(new Date());

      const isCorrect = checkChallengeAnswer(userAnswer);

      let successMessage;
      let rewardText;

      if (isCorrect) {
        riddleCorrectUsers.add(userId);
        successMessage = '💥 PERFECT! "...unlock the Totem." The power has been granted in Episode 5! Our moderators will send you 2 Mega Loot Box!';
        rewardText = '2 Mega Loot Box';
      } else {
        successMessage = '❌ Not quite! Think about Episode 5 - what specific ability was granted? Try again!';
        rewardText = 'No reward';
      }

      await interaction.reply({ content: successMessage, ephemeral: true });

      if (isCorrect) {
        const modChannel = client.channels.cache.get(process.env.MOD_CHANNEL_ID);
        if (modChannel) {
          const notificationEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('💥 Complete the Line Challenge #3 - CORRECT!')
            .setDescription(`User **${interaction.user.tag}** (${interaction.user.id}) - Attempt #${userProgress.attempts}\n\n**Answer submitted:** "${userAnswer}"\n**Result:** ✅ CORRECT\n**Expected:** "...unlock the Totem."\n**Reward:** ${rewardText}`)
            .setTimestamp();
          await modChannel.send({ embeds: [notificationEmbed] });
        }
      }
      return;
    }

    // Forum builder - Set Channel button
    if (interaction.customId === 'setChannel') {
      const channelSelectRow = new ActionRowBuilder().addComponents(
        new SelectMenuBuilder()
          .setCustomId('selectChannel')
          .setPlaceholder('Select a channel')
          .addOptions([
            { label: 'English Forum', description: 'Send the Forum post for the Global Community', value: '1186264373849763861' },
            { label: 'ESP Forum', description: 'Send the Forum post for the ESP Community', value: '1187760766598791279' },
            { label: 'Test Forum', description: 'Send the Forum post in a Test Channel', value: '1186675498995155024' },
          ])
      );
      await interaction.reply({ content: 'Please select a channel:', components: [channelSelectRow], ephemeral: true });
      return;
    }

    // Forum builder - Channel selected
    if (interaction.customId === 'selectChannel') {
      forumBuilderChannelId = interaction.values[0];
      await interaction.update({ content: `Channel ID set to ${forumBuilderChannelId}!`, components: [], ephemeral: true });
      return;
    }

    // Forum builder - Set Title
    if (interaction.customId === 'setTitle') {
      await interaction.reply({ content: 'Please enter the forum post title:', ephemeral: true });
      const collectedTitle = await interaction.channel.awaitMessages({ filter: m => m.author.id === interaction.user.id, max: 1, time: 60000, errors: ['time'] });
      embedTitle = collectedTitle.first().content;
      await collectedTitle.first().delete();
      await interaction.followUp({ content: 'Title set!', ephemeral: true });
      return;
    }

    // Forum builder - Set Description
    if (interaction.customId === 'setDescription') {
      await interaction.reply({ content: 'Please enter the forum post description:', ephemeral: true });
      const collectedDescription = await interaction.channel.awaitMessages({ filter: m => m.author.id === interaction.user.id, max: 1, time: 60000, errors: ['time'] });
      embedDescription = collectedDescription.first().content;
      await collectedDescription.first().delete();
      await interaction.followUp({ content: 'Description set!', ephemeral: true });
      return;
    }

    // Forum builder - Set Image
    if (interaction.customId === 'setImage') {
      await interaction.reply({ content: 'Please upload the image:', ephemeral: true });
      const collectedImage = await interaction.channel.awaitMessages({ filter: m => m.author.id === interaction.user.id, max: 1, time: 60000, errors: ['time'] });

      if (collectedImage.first().attachments.size > 0) {
        const attachment = collectedImage.first().attachments.first();
        const filePath = path.join(__dirname, 'downloads', attachment.name);

        const response = await fetch(attachment.url);
        const buffer = await response.buffer();
        fs.writeFileSync(filePath, buffer);

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

    // Forum builder - Send embed
    if (interaction.customId === 'sendEmbed') {
      await interaction.deferReply({ ephemeral: true });

      try {
        const targetChannel = await client.channels.fetch(forumBuilderChannelId);
        if (targetChannel.type !== ChannelType.GuildForum) {
          throw new Error('The specified channel is not a forum channel.');
        }
        const attachment = new AttachmentBuilder(embedImageUrl);
        const thread = await targetChannel.threads.create({
          name: embedTitle,
          autoArchiveDuration: 1440,
          message: { content: `${embedDescription}`, files: [attachment] },
        });
        await interaction.editReply({ content: `Forum thread created! ${thread.url}`, ephemeral: true });
      } catch (error) {
        console.error(error);
        await interaction.editReply({ content: `Error: ${error.message}`, ephemeral: true });
      }
      return;
    }

    // Default fallback
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Unknown action.', ephemeral: true });
    }

  } catch (error) {
    console.error('Error in interaction handler:', error);
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({ content: 'There was an error processing your request. Please try again.', ephemeral: true });
      } catch (replyError) {
        console.error('Failed to send error message:', replyError);
      }
    }
  }
});

// ========================================================================================
// EVENT: GUILD MEMBER UPDATE (Welcome triggers)
// ========================================================================================

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  try {
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    // Find roles that were added
    const addedRoles = newRoles.filter(role => !oldRoles.has(role.id));
    if (addedRoles.size === 0) return;

    for (const [roleId] of addedRoles) {
      const triggers = await dbAll('SELECT * FROM welcome_triggers WHERE guild_id = ? AND role_id = ?', [newMember.guild.id, roleId]);
      for (const trigger of triggers) {
        await sendWelcomePanel(newMember, trigger);
      }
    }
  } catch (err) {
    console.error('[Welcome] Error in guildMemberUpdate:', err);
  }
});

// ========================================================================================
// BOT LOGIN
// ========================================================================================

client.login(BOT_TOKEN);
