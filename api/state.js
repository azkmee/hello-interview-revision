// Vercel serverless function. Holds the only copy of MONGODB_URI; the browser never sees it.
const { MongoClient } = require("mongodb");
const crypto = require("crypto");

let client;
async function col() {
  if (!client) {
    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
  }
  return client.db(process.env.MONGODB_DB || "hello_interview").collection("state");
}

function authorized(req) {
  const given = Buffer.from((req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(process.env.APP_TOKEN || "");
  return want.length > 0 && given.length === want.length && crypto.timingSafeEqual(given, want);
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!authorized(req)) return res.status(401).json({ error: "unauthorized" });

  try {
    const c = await col();
    if (req.method === "GET") {
      const doc = await c.findOne({ _id: "main" });
      return res.json({ cards: (doc && doc.cards) || {}, log: (doc && doc.log) || [] });
    }
    if (req.method === "PUT") {
      const { cards, log } = req.body || {};
      if (!cards || typeof cards !== "object" || !Array.isArray(log) || JSON.stringify(req.body).length > 200000)
        return res.status(400).json({ error: "bad body" });
      await c.updateOne({ _id: "main" }, { $set: { cards, log, updatedAt: new Date() } }, { upsert: true });
      return res.json({ ok: true });
    }
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: "server error" });
  }
};
