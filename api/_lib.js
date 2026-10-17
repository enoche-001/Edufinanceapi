// Shared helpers for the EduFinance bank server (Vercel serverless functions).
const admin = require('firebase-admin');

function getAdmin() {
  if (!admin.apps.length) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }
  return admin;
}

function cors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

async function verifyUser(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) throw Object.assign(new Error('Not signed in'), { status: 401 });
  try { return await getAdmin().auth().verifyIdToken(token); }
  catch (e) { throw Object.assign(new Error('Not signed in'), { status: 401 }); }
}

async function mono(path, opts = {}) {
  const res = await fetch((process.env.MONO_BASE_URL || 'https://api.withmono.com') + path, {
    method: opts.method || 'GET',
    headers: { 'mono-sec-key': process.env.MONO_SECRET_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.message || 'Bank provider error'), { status: 502, detail: json });
  return json;
}

// Mono transaction -> EduFinance bank inbox item
function toInboxItem(t, bank) {
  const kobo = process.env.MONO_AMOUNT_IN_KOBO !== 'false';
  const amount = Math.abs(Number(t.amount)) / (kobo ? 100 : 1);
  const id = ('mono_' + t.id).replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 60);
  return {
    id,
    data: {
      amount,
      type: String(t.type).toLowerCase() === 'credit' ? 'income' : 'expense',
      description: String(t.narration || 'Bank transaction').replace(/\s+/g, ' ').trim().slice(0, 80),
      category: '',                              // the app suggests one from the description
      date: String(t.date || new Date().toISOString()).slice(0, 10),
      bank: String(bank || '').slice(0, 30),
      bankRef: id,
      source: 'mono',
      status: 'pending',
      createdAt: new Date().toISOString()
    }
  };
}

// Pull recent transactions for one linked account and queue the ones we have not seen.
async function syncLink(uid, link) {
  const db = getAdmin().firestore();
  const json = await mono('/v2/accounts/' + link.accountId + '/transactions');
  const list = (json.data && (json.data.transactions || json.data)) || [];
  const items = (Array.isArray(list) ? list : []).filter((t) => t && t.id && Number(t.amount) > 0).map((t) => toInboxItem(t, link.bank));
  if (!items.length) return 0;
  const col = db.collection('users').doc(uid).collection('bankInbox');
  const refs = items.map((i) => col.doc(i.id));
  const snaps = await db.getAll(...refs);
  const batch = db.batch();
  let added = 0;
  snaps.forEach((s, idx) => { if (!s.exists) { batch.set(refs[idx], items[idx].data); added++; } });
  if (added) await batch.commit();
  await db.collection('users').doc(uid).collection('bankLinks').doc(link.id).set({ lastSyncedAt: new Date().toISOString() }, { merge: true });
  return added;
}

module.exports = { getAdmin, cors, verifyUser, mono, syncLink };
