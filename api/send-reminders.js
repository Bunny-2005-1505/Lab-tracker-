const nodemailer = require('nodemailer');

const REMIND_DAYS = [5, 1];

function dateIn(n) {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

module.exports = async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).send('Unauthorized');
  }
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  const dates = REMIND_DAYS.map(dateIn);
  const pr = await fetch(
    `${base}/rest/v1/products?expiry_date=in.(${dates.join(',')})&select=name,lab,quantity,expiry_date,user_id`,
    { headers }
  );
  const products = await pr.json();
  if (!Array.isArray(products)) return res.status(500).json(products);

  const byUser = {};
  products.forEach(p => (byUser[p.user_id] = byUser[p.user_id] || []).push(p));

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
  });

  let sent = 0;
  for (const [uid, items] of Object.entries(byUser)) {
    const ur = await fetch(`${base}/auth/v1/admin/users/${uid}`, { headers });
    const u = await ur.json();
    if (!u.email) continue;

    const lines = items.map(p => {
      const days = REMIND_DAYS[dates.indexOf(p.expiry_date)];
      return `• ${p.name} (${p.lab}) – qty ${p.quantity} – expires ${p.expiry_date} (${days} day${days > 1 ? 's' : ''} left)`;
    });

    await transporter.sendMail({
      from: `"Lab Tracker" <${process.env.GMAIL_USER}>`,
      to: u.email,
      subject: `Lab Tracker: ${items.length} product(s) expiring soon`,
      text: `Hello,\n\nThese products are about to expire:\n\n${lines.join('\n')}\n\nPlease check them at https://lab-tracker.vercel.app\n\n– Lab Tracker`
    });
    sent++;
  }
  res.status(200).json({ checked: products.length, emailsSent: sent });
};
