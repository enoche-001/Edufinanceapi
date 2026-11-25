export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: "Missing auth code" });
  const r = await fetch("https://api.withmono.com/v2/accounts/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json", "mono-sec-key": process.env.MONO_SECRET_KEY },
    body: JSON.stringify({ code })
  });
  const data = await r.json();
  return res.status(r.status).json(data);
}
