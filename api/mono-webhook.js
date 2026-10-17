// POST /api/mono-webhook   (called by Mono, not by the app)
// In the Mono dashboard set this URL as your webhook and use the same secret as MONO_WEBHOOK_SECRET.
const { getAdmin, syncLink } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  // Mono sends your webhook secret in a header; check Mono's docs if the header name ever changes.
  const sent = req.headers['mono-webhook-secret'];
  if (!process.env.MONO_WEBHOOK_SECRET || sent !== process.env.MONO_WEBHOOK_SECRET) return res.status(401).end();

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  // New data is ready for a linked account
  if (body.event === 'mono.events.account_updated') {
    const d = body.data || body;
    const acc = d.account || d;
    const accountId = acc._id || acc.id || d.id;
    try {
      if (accountId) {
        const db = getAdmin().firestore();
        const idx = await db.collection('bankAccountIndex').doc(String(accountId)).get();
        if (idx.exists) {
          const { uid, linkId } = idx.data();
          const link = await db.collection('users').doc(uid).collection('bankLinks').doc(linkId).get();
          if (link.exists) await syncLink(uid, { id: link.id, ...link.data() });
        }
      }
    } catch (e) { console.error('webhook sync failed', e.message); }
  }
  return res.status(200).json({ ok: true });
};
