export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const { accountId } = req.query || {};
  if (!accountId) return res.status(400).json({ error: "Missing accountId" });
  const r = await fetch(`https://api.withmono.com/v2/accounts/${accountId}/transactions`, {
    headers: { "mono-sec-key": process.env.MONO_SECRET_KEY }
  });
  const data = await r.json();
  return res.status(r.status).json(data);
}
