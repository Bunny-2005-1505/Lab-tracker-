const REMIND_DAYS = [5, 1];

function dateIn(n) {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const fmtIST = (iso) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

module.exports = async (req, res) => {
  try {
    const needed = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GMAIL_USER', 'GMAIL_APP_PASSWORD', 'CRON_SECRET'];
    const missing = needed.filter(k => !process.env[k]);
    if (missing.length) {
      console.error('MISSING ENV VARS:', missing.join(', '));
      return res.status(500).json({ error: 'Missing env vars', missing });
    }
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).send('Unauthorized');
    }
    let nodemailer;
    try {
      nodemailer = require('nodemailer');
    } catch (e) {
      console.error('NODEMAILER NOT INSTALLED - add package.json:', e.message);
      return res.status(500).json({ error: 'nodemailer not installed. Add package.json to the repo root.' });
    }

    const base = new URL(process.env.SUPABASE_URL.trim()).origin;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    const get = async (path) => {
      const r = await fetch(`${base}/rest/v1/${path}`, { headers });
      const j = await r.json();
      if (!Array.isArray(j)) { console.error('SUPABASE ERROR on', path.split('?')[0], JSON.stringify(j)); return null; }
      return j;
    };


    const byUser = {};
    const add = (uid, section, line) => {
      const u = (byUser[uid] = byUser[uid] || {});
      (u[section] = u[section] || []).push(line);
    };

    
    const dates = REMIND_DAYS.map(dateIn);
    const products = await get(`products?expiry_date=in.(${dates.join(',')})&select=name,lab,quantity,expiry_date,user_id`);
    if (!products) return res.status(500).json({ error: 'Supabase query failed (products)' });
    products.forEach(p => {
      const days = REMIND_DAYS[dates.indexOf(p.expiry_date)];
      add(p.user_id, 'Products expiring soon', `• ${p.name} (${p.lab}) – qty ${p.quantity} – expires ${p.expiry_date} (${days} day${days > 1 ? 's' : ''} left)`);
    });

    
    const service = await get(`equipment?service_due=in.(${dates.join(',')})&select=name,lab,service_due,owner_id`);
    (service || []).forEach(e => {
      const days = REMIND_DAYS[dates.indexOf(e.service_due)];
      add(e.owner_id, 'Equipment service due', `• ${e.name} (${e.lab}) – service or calibration due ${e.service_due} (${days} day${days > 1 ? 's' : ''} left)`);
    });

    const nowIso = new Date().toISOString();
    const overdue = await get(`equipment_bookings?kind=eq.booking&status=eq.active&ends_at=lt.${encodeURIComponent(nowIso)}&select=user_id,ends_at,equipment(name,lab)`);
    (overdue || []).forEach(b => {
      const hrs = Math.max(1, Math.floor((Date.now() - Date.parse(b.ends_at)) / 36e5));
      const e = b.equipment || {};
      add(b.user_id, 'Overdue equipment returns', `• ${e.name || 'Equipment'} (${e.lab || ''}) – was due ${fmtIST(b.ends_at)} (${hrs}h overdue). Please return it and mark it returned.`);
    });

    const soonIso = new Date(Date.now() + 24 * 36e5).toISOString();
    const upcoming = await get(`equipment_bookings?kind=eq.booking&status=eq.active&starts_at=gte.${encodeURIComponent(nowIso)}&starts_at=lt.${encodeURIComponent(soonIso)}&select=user_id,starts_at,ends_at,purpose,equipment(name,lab)`);
    (upcoming || []).forEach(b => {
      const e = b.equipment || {};
      add(b.user_id, 'Your bookings in the next 24 hours', `• ${e.name || 'Equipment'} (${e.lab || ''}) – ${fmtIST(b.starts_at)} to ${fmtIST(b.ends_at)}${b.purpose ? ' – ' + b.purpose : ''}`);
    });

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });

    let sent = 0;
    for (const [uid, sections] of Object.entries(byUser)) {
      const ur = await fetch(`${base}/auth/v1/admin/users/${uid}`, { headers });
      const u = await ur.json();
      if (!u.email) { console.error('USER LOOKUP FAILED:', JSON.stringify(u)); continue; }

      const titles = Object.keys(sections);
      const count = titles.reduce((n, t) => n + sections[t].length, 0);
      const body = titles.map(t => `${t}:\n${sections[t].join('\n')}`).join('\n\n');
      await transporter.sendMail({
        from: `"Lab Tracker" <${process.env.GMAIL_USER}>`,
        to: u.email,
        subject: `Lab Tracker: ${count} reminder${count > 1 ? 's' : ''} for you`,
        text: `Hello,\n\n${body}\n\nPlease check them at https://lab-tracker.vercel.app\n\n– Lab Tracker`
      });
      sent++;
    }
    const summary = { products: products.length, serviceDue: (service || []).length, overdue: (overdue || []).length, upcoming: (upcoming || []).length, emailsSent: sent };
    console.log('RESULT:', JSON.stringify(summary));
    return res.status(200).json(summary);
  } catch (e) {
    console.error('REMINDER JOB CRASHED:', e && e.message, e && e.stack);
    return res.status(500).json({ error: String(e && e.message) });
  }
};
