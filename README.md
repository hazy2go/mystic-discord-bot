# Mystic Discord Bot

A feature-rich Discord bot for community engagement with raid coordination, interactive challenges, automated social media posting, and more.

## Features

- **Multi-System Raid Coordination**: Three independent raiding systems with support for Twitter and Instagram
- **Interactive Challenges**: "Complete the Line" challenges with modal-based submissions
- **Automated Reminders**: Scheduled challenge reminders every 12 hours
- **Tournament System**: Roll-based tournament bracket system with cooldowns
- **Report Generation**: AI-powered chat analysis and reporting using OpenAI
- **Role Management**: Bulk role checking with CSV export
- **Image Fetching**: Download images from bot messages in bulk
- **Forum Post Builder**: Interactive forum post creation with embeds
- **File Upload System**: Upload and host files with direct links

## Prerequisites

- Node.js 16.0.0 or higher
- A Discord Bot Token ([Get one here](https://discord.com/developers/applications))
- OpenAI API Key ([Get one here](https://platform.openai.com/api-keys))
- npm or yarn package manager

## Installation

1. Clone this repository:
```bash
git clone <your-repo-url>
cd mystic-discord-bot
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory by copying `.env.example`:
```bash
cp .env.example .env
```

4. Fill in your credentials and configuration in the `.env` file:
```env
DISCORD_BOT_TOKEN=your_bot_token_here
OPENAI_API_KEY=your_openai_key_here
# ... add all other configuration values
```

## Configuration

Edit the `.env` file with your specific channel IDs, role IDs, and API keys. The `.env.example` file contains all required variables with descriptions.

### Raid System Toggles

In [mystic.js](mystic.js:34-47), you can enable/disable specific raid types:
```javascript
const raidToggles = {
  system1: {
    twitter: false,
    instagram: true
  },
  // ... configure for each system
};
```

## Usage

Start the bot:
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

## Commands

### General Commands
- `!safe` - Display safety notice about suspicious links
- `!upload` - Upload a file and get a direct link

### Tournament Commands
- `!roll @user` - Roll against another user for tournament ban order
- `!rollcd` / `!rollcooldown` - Check your roll cooldown status

### Challenge Commands (Requires Manage Messages permission)
- `!riddle [channelID]` - Post a new challenge
- `!riddlereset` - Reset challenge progress
- `!riddlestats` - View challenge statistics
- `!riddleprogress <userID>` - Check individual user progress
- `!riddlereminder start [channelID]` - Start automated reminders
- `!riddlereminder stop` - Stop automated reminders
- `!riddlereminder status` - Check reminder status

### Moderation Commands (Requires Manage Messages permission)
- `!fetchimages [channelID] [botID] [limit]` - Fetch images from bot messages
- `!report [channelID] [24h|7d]` - Generate AI-powered chat report
- `!rolecheck @role [attachment.txt]` - Check role assignment for users

### Forum Builder Commands (Requires "Hazy" role)
- `!forum` - Display forum builder help
- `!setup` - Interactive forum post creation

## Security

- **Never commit your `.env` file** - It contains sensitive credentials
- The `.gitignore` file is configured to exclude sensitive files
- All API keys and tokens are loaded from environment variables
- Downloaded files and CSVs are excluded from git tracking

## File Structure

```
.
├── mystic.js           # Main bot file
├── package.json        # Node.js dependencies
├── .env               # Your credentials (NOT committed)
├── .env.example       # Template for environment variables
├── .gitignore         # Git ignore rules
├── README.md          # This file
└── downloads/         # Downloaded files (NOT committed)
```

## Contributing

Feel free to submit issues and pull requests for improvements!

## License

MIT License - See LICENSE file for details

## Support

For issues or questions, please open an issue on GitHub.
