// POST /api/mono?action=link|sync|unlink   (called by the EduFinance app, needs a signed-in user)
const { getAdmin, cors, verifyUser, mono, syncLink } = require('./_lib');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const user = await verifyUser(req);
    const db = getAdmin().firestore();
    const links = db.collection('users').doc(user.uid).collection('bankLinks');
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = req.query.action;

    if (action === 'link') {
      if (!body.code) return res.status(400).json({ error: 'Missing code' });
      // 1. swap the one-time code from the Mono widget for a permanent account id
      const auth = await mono('/v2/accounts/auth', { method: 'POST', body: { code: body.code } });
      const accountId = (auth.data && auth.data.id) || auth.id;
      if (!accountId) return res.status(502).json({ error: 'Bank did not return an account' });
      // 2. read the bank name and last 4 digits for display
      let bank = 'Bank', last4 = '0000';
      try {
        const d = await mono('/v2/accounts/' + accountId);
        const acc = (d.data && (d.data.account || d.data)) || {};
        bank = (acc.institution && acc.institution.name) || acc.bank || bank;
        last4 = String(acc.accountNumber || acc.account_number || '0000').slice(-4);
      } catch (e) { /* display details are optional */ }
      const ref = await links.add({ bank, last4, demo: false, status: 'active', accountId, createdAt: new Date().toISOString() });
      await db.collection('bankAccountIndex').doc(accountId).set({ uid: user.uid, linkId: ref.id });
      const added = await syncLink(user.uid, { id: ref.id, accountId, bank }).catch(() => 0);
      return res.json({ ok: true, added });
    }

    if (action === 'sync') {
      const snap = await links.where('demo', '==', false).get();
      let added = 0;
      for (const d of snap.docs) added += await syncLink(user.uid, { id: d.id, ...d.data() });
      return res.json({ ok: true, added });
    }

    if (action === 'unlink') {
      const doc = await links.doc(String(body.linkId || '')).get();
      if (!doc.exists) return res.status(404).json({ error: 'Link not found' });
      const { accountId } = doc.data();
      if (accountId) {
        await mono('/v2/accounts/' + accountId + '/unlink', { method: 'POST' }).catch(() => {});
        await db.collection('bankAccountIndex').doc(accountId).delete().catch(() => {});
      }
      await doc.ref.delete();
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' });
  }
};
