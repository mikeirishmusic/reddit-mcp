# Reddit MCP Server

A minimal MCP server that gives Claude.ai live Reddit search and thread fetching.

## Tools exposed
- **search_reddit** — full-text search across all of Reddit, sortable by relevance/top/new, filterable by time range
- **get_reddit_comments** — fetch top comments from any Reddit thread by URL

---

## Deploy to Railway (5 steps)

### 1. Create a GitHub repo
```bash
git init
git add .
git commit -m "init"
# push to a new GitHub repo
```

### 2. Deploy on Railway
1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
2. Select your repo — Railway auto-detects Node.js and runs `npm start`
3. Wait ~60 seconds for the build to finish
4. Go to **Settings → Networking → Generate Domain**
5. Copy your public URL, e.g. `https://reddit-mcp-production.up.railway.app`

### 3. Verify it's running
Visit `https://YOUR_RAILWAY_URL/` — you should see:
```
Reddit MCP server is running.
```

### 4. Connect to Claude.ai
1. Go to [claude.ai](https://claude.ai) → Settings → Connectors (or Integrations)
2. Click **Add custom connector / MCP server**
3. Enter your SSE URL:
   ```
   https://YOUR_RAILWAY_URL/sse
   ```
4. Save

### 5. Use it
In any Claude.ai chat, just say:
- *"Search Reddit for the best guitar pedals for ambient music"*
- *"Search Reddit for Ableton MIDI routing tips, sort by top"*
- *"Fetch comments from this Reddit thread: [URL]"*

---

## Rate limits
Reddit's public API allows ~60 requests/minute without auth. For higher limits,
register a free "script" app at reddit.com/prefs/apps and add OAuth — open an
issue or ask Claude to help you add it.

## Local development
```bash
npm install
node server.js
# Server runs on http://localhost:3000
```
