# CalBot - AI Calendar Agent

CalBot is a CLI application that provides an interactive AI agent with access to Google Calendar tools. It helps you check availability, schedule events, discover coworkers, and manage your calendar efficiently.

## Features

- 🤖 Interactive AI agent with natural language interface
- 📅 Google Calendar integration (read and write events)
- 👥 Automatic coworker discovery from calendar events
- 💳 Echo API integration for AI model billing
- 🔧 Built-in bash command execution
- 📊 Account balance and payment management

## Prerequisites

- Node.js 18+ or Bun
- Google Cloud Project with Calendar API enabled
- Echo API account

## Installation

### 1. Install Dependencies

This project uses bun for package management:

```bash
bun install
```

Alternatively, you can use npm:

```bash
npm install
```

### 2. Build the Project

```bash
bun run build
```

### 3. (Optional) Link for Global Usage

To use `calbot` command globally:

```bash
bun run link
```

## Google Credentials Setup

### 1. Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Calendar API:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Calendar API"
   - Click "Enable"

### 2. Create OAuth2 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. Configure the OAuth consent screen if prompted:
   - Choose "External" user type
   - Fill in the required fields (app name, user support email, developer contact)
   - Add your email to test users
4. For Application type, select "Desktop application"
5. Give it a name (e.g., "CalBot")
6. Click "Create"

### 3. Download Credentials

1. Click the download button (⬇️) next to your newly created OAuth2 client
2. Save the downloaded JSON file as `credentials.json` in the project root directory

The `credentials.json` file should look like this:

```json
{
  "installed": {
    "client_id": "your-client-id.googleusercontent.com",
    "project_id": "your-project-id",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "your-client-secret",
    "redirect_uris": ["http://localhost"]
  }
}
```

## Echo API Setup

### 1. Get Your Echo API Key

1. Sign up at [Echo](https://echo.zdql.com) if you haven't already
2. Get your API key from the dashboard

### 2. Login to Echo

```bash
calbot login
```

Follow the prompts to enter your Echo API key, or provide it directly:

```bash
calbot login -k your-echo-api-key
```

### 3. Check Your Balance

```bash
calbot balance
```

### 4. Add Credits (if needed)

```bash
calbot payment -a 10 -d "CalBot credits"
```

## Usage

### Initialize Coworker Discovery

Before using the agent, run the initialization to discover coworkers from your calendar:

```bash
calbot init
```

This will:
- Authenticate with Google Calendar (browser will open for first-time auth)
- Scan your calendar events for attendees
- Create a `coworker_config.json` file with discovered contacts
- Save authentication tokens for future use

### Start the AI Agent

```bash
calbot agent
```

The agent will start an interactive session where you can:
- Ask about your calendar availability
- Schedule new events
- Check coworker availability
- Get calendar insights


#### Check Account Balance
```bash
calbot balance
```

#### Generate Payment Link
```bash
calbot payment -a 25 -d "Monthly CalBot usage"
```

#### Logout
```bash
calbot logout
```

## File Structure

After setup, your project directory will contain:

```
cal-bot/
├── credentials.json          # Google OAuth2 credentials (don't commit)
├── token.json               # Saved Google auth tokens (don't commit)
├── coworker_config.json     # Discovered coworkers (don't commit)
├── .env                     # Echo API key (don't commit)
├── package.json
├── README.md
└── src/
    ├── agent-loop.ts        # Main agent logic
    ├── google-tools.ts      # Google Calendar integration
    ├── cli.ts              # CLI interface
    └── ...
```

## Development

### Watch Mode
```bash
bun run dev
```

### Type Checking
```bash
bun run type-check
```

### Linting
```bash
bun run lint
bun run lint:fix
```

## Troubleshooting

### Google Authentication Issues

1. **"Credentials file not found"**
   - Ensure `credentials.json` is in the project root
   - Verify the file was downloaded correctly from Google Cloud Console

2. **"Auth verification failed"**
   - Delete `token.json` and re-run initialization
   - Check that Calendar API is enabled in Google Cloud Console

3. **"Access denied" during browser auth**
   - Add your email to test users in OAuth consent screen
   - Ensure you're using the correct Google account

### Echo API Issues

1. **"Insufficient balance"**
   - Check balance: `calbot balance`
   - Add credits: `calbot payment`

2. **"Invalid API key"**
   - Re-login: `calbot logout && calbot login`
   - Verify your API key in the Echo dashboard

### General Issues

1. **Command not found**
   - Run `bun run build` to compile TypeScript
   - Run `bun run link` to link globally

2. **Permission errors**
   - Ensure the compiled CLI has execute permissions
   - The build script should handle this automatically

## Security Notes

- Never commit `credentials.json`, `token.json`, `.env`, or `coworker_config.json`
- These files are already included in `.gitignore`
- Keep your Echo API key secure
- Regularly rotate your Google OAuth2 credentials if needed

## License

MIT License - see LICENSE file for details.
