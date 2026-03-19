import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";
import { z } from "zod";

const app = express();
app.use(cors());
app.use(express.json());

const USER_AGENT = "ClaudeRedditMCP/1.0";

async function redditFetch(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "application/json",
    },
  });
  if (!res.ok) throw new Error(`Reddit returned ${res.status} for ${url}`);
  return res.json();
}

function formatPost(p) {
  const d = p.data;
  const preview = d.selftext?.trim()
    ? "\n" + d.selftext.slice(0, 400) + (d.selftext.length > 400 ? "…" : "")
    : "";
  return `**${d.title}**
r/${d.subreddit} · ${d.score} pts · ${d.num_comments} comments · u/${d.author}
${d.url}${preview}`;
}

const transports = {};

function buildServer() {
  const server = new McpServer({ name: "reddit-mcp", version: "1.0.0" });

  server.tool(
    "search_reddit",
    "Search all of Reddit for posts matching a query.",
    {
      query: z.string().describe("Search terms"),
      sort: z
        .enum(["relevance", "top", "new"])
        .default("relevance")
        .describe("Sort order"),
      time: z
        .enum(["all", "year", "month", "week", "day"])
        .default("all")
        .describe("Time filter"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(25)
        .default(10)
        .describe("Number of results"),
    },
    async ({ query, sort, time, limit }) => {
      const url =
        `https://www.reddit.com/search.json` +
        `?q=${encodeURIComponent(query)}&sort=${sort}&t=${time}&limit=${limit}`;
      const data = await redditFetch(url);
      const posts = data.data.children;
      if (!posts.length) return { content: [{ type: "text", text: "No results found." }] };
      const text = posts.map(formatPost).join("\n\n---\n\n");
      return { content: [{ type: "text", text }] };
    }
  );

  server.tool(
    "get_reddit_comments",
    "Fetch the top comments from a Reddit thread by URL.",
    {
      url: z.string().describe("Full Reddit thread URL"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe("Number of top-level comments to return"),
    },
    async ({ url, limit }) => {
      const match = url.match(/\/comments\/([a-z0-9]+)/i);
      if (!match) throw new Error("Couldn't find a thread ID in that URL.");
      const id = match[1];

      const jsonUrl =
        `https://www.reddit.com/comments/${id}.json?sort=top&limit=${limit}`;
      const data = await redditFetch(jsonUrl);

      const post = data[0].data.children[0].data;
      const comments = data[1].data.children
        .filter((c) => c.kind === "t1")
        .slice(0, limit)
        .map((c) => {
          const d = c.data;
          return `**u/${d.author}** (${d.score} pts)\n${d.body}`;
        })
        .join("\n\n---\n\n");

      const header = `**${post.title}**\nr/${post.subreddit} · ${post.score} pts · u/${post.author}\n${post.url}`;
      const body = post.selftext?.trim() ? `\n\n${post.selftext.slice(0, 600)}\n` : "";
      const text = `${header}${body}\n\n## Top Comments\n\n${comments || "No comments found."}`;
      return { content: [{ type: "text", text }] };
    }
  );

  return server;
}

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;
  res.on("close", () => delete transports[transport.sessionId]);
  await buildServer().connect(transport);
});

app.post("/messages", async (req, res) => {
  const transport = transports[req.query.sessionId];
  if (!transport) return res.status(400).send("Session not found.");
  await transport.handlePostMessage(req, res);
});

app.get("/", (req, res) => res.send("Reddit MCP server is running."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Reddit MCP listening on port ${PORT}`));
