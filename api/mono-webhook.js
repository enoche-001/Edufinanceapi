export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const secret = process.env.MONO_WEBHOOK_SECRET;
  const sig = req.headers["mono-webhook-signature"];
  if (!secret || sig !== secret) return res.status(401).json({ error: "Invalid webhook signature" });
  return res.status(200).json({ received: true, event: req.body?.event || "unknown" });
}
