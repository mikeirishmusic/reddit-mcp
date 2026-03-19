import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { z } from "zod";

const app = express();

// Manual CORS — no package needed
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, mcp-session-id");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json());

const USER_AGENT = "ClaudeRedditMCP/1.0";

async function redditFetch(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "application/json",
    },
  });
  if (!res.ok) throw new Error(`Reddit returned ${res.status}`);
  return res.json();
}

function formatPost(p) {
  const d = p.data;
  const preview = d.selftext?.trim()
    ? "\n" + d.selftext.slice(0, 400) + (d.selftext.length > 400 ? "…" : "")
    : "";
  return `**${d.title}**\nr/${d.subreddit} · ${d.score} pts · ${d.num_comments} comments · u/${d.author}\n${d.url}${preview}`;
}

const transports = {};

function buildServer() {
  const server = new McpServer({ name: "reddit-mcp", version: "1.0.0" });

  server.tool(
    "search_reddit",
    "Search all of Reddit for posts matching a query.",
    {
      query: z.string().describe("Search terms"),
      sort: z.enum(["relevance", "top", "new"]).default("relevance"),
      time: z.enum(["all", "year", "month", "week", "day"]).default("all"),
      limit: z.number().int().min(1).max(25).default(10),
    },
    async ({ query, sort, time, limit }) => {
      const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=${sort}&t=${time}&limit=${limit}`;
      const data = await redditFetch(url);
      const posts = data.data.children;
      if (!posts.length) return { content: [{ type: "text", text: "No results found." }] };
      return { content: [{ type: "text", text: posts.map(formatPost).join("\n\n---\n\n") }] };
    }
  );

  server.tool(
    "get_reddit_comments",
    "Fetch the top comments from a Reddit thread by URL.",
    {
      url: z.string().describe("Full Reddit thread URL"),
      limit: z.number().int().min(1).max(50).default(20),
    },
    async ({ url, limit }) => {
      const match = url.match(/\/comments\/([a-z0-9]+)/i);
      if (!match) throw new Error("Couldn't find a thread ID in that URL.");
      const data = await redditFetch(`https://www.reddit.com/comments/${match[1]}.json?sort=top&limit=${limit}`);
      const post = data[0].data.children[0].data;
      const comments = data[1].data.children
        .filter((c) => c.kind === "t1")
        .slice(0, limit)
        .map((c) => `**u/${c.data.author}** (${c.data.score} pts)\n${c.data.body}`)
        .join("\n\n---\n\n");
      const header = `**${post.title}**\nr/${post.subreddit} · ${post.score} pts\n${post.url}`;
      const body = post.selftext?.trim() ? `\n\n${post.selftext.slice(0, 600)}\n` : "";
      return { content: [{ type: "text", text: `${header}${body}\n\n## Top Comments\n\n${comments || "No comments found."}` }] };
    }
  );

  return server;
}

app.get("/sse", async (req, res) => {
  try {
    const transport = new SSEServerTransport("/messages", res);
    transports[transport.sessionId] = transport;
    res.on("close", () => delete transports[transport.sessionId]);
    await buildServer().connect(transport);
  } catch (err) {
    console.error("SSE error:", err);
  }
});

app.post("/messages", async (req, res) => {
  try {
    const transport = transports[req.query.sessionId];
    if (!transport) return res.status(400).send("Session not found.");
    await transport.handlePostMessage(req, res);
  } catch (err) {
    console.error("Message error:", err);
    res.status(500).send("Internal error");
  }
});

app.get("/", (req, res) => res.send("Reddit MCP server is running."));

// Prevent unhandled rejections from crashing the process
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Reddit MCP listening on port ${PORT}`));
