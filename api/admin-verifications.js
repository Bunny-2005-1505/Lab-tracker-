const L = require('../lib/verify-lib');

const bad = (res, code, msg) => res.status(code).json({ error: msg });
const COLS = 'id,user_id,email,full_name,org_name,employee_id,id_last4,status,suspicion,auto_decided,ai_result,reasons,admin_note,decided_at,reported_to,reported_at,created_at,id_image_path';
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));
const ist = (d) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

function draftReport(row, note) {
  const reasons = (row.reasons || []).map(r => '- ' + r).join('\n') || '- (no details recorded)';
  const subject = `Please confirm employment: "${row.full_name}" - ${row.org_name}`;
  const body =
`Hello,

I am the administrator of Lab Tracker (${L.siteUrl()}), a laboratory inventory web app.

On ${ist(row.created_at)} a user registered with the institutional email address ${row.email} and asked for teacher-level access, giving the name "${row.full_name}" and the institution "${row.org_name}".

We could not confirm the identity card that was submitted. Our automated review noted (these are observations, not proof):
${reasons}
${note ? '\nMy note: ' + note + '\n' : ''}
I am not making an accusation. I am writing so that your office can tell me whether ${row.full_name} is currently employed at ${row.org_name} as teaching or lab staff, and whether this email address belongs to them. Teacher access has been withheld until then.

If this is not the right department, please forward it to the right one.

Regards,
${process.env.ADMIN_NAME || 'Lab Tracker administrator'}
${process.env.ADMIN_EMAIL}`;
  return { subject, body };
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return bad(res, 405, 'POST only');
    const missing = L.missingEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_EMAIL']);
    if (missing.length) return bad(res, 500, 'Server not configured: ' + missing.join(', '));

    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = token ? await L.getUser(token) : null;
    if (!user || !user.email_confirmed_at || String(user.email).toLowerCase() !== process.env.ADMIN_EMAIL.trim().toLowerCase()) {
      return bad(res, 403, 'Not allowed');
    }

    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = b.action;
    if (action === 'whoami') return res.status(200).json({ ok: true });

    if (action === 'list') {
      const rows = await L.sb(`/rest/v1/teacher_verifications?select=${COLS}&order=created_at.desc&limit=100`);
      return res.status(200).json({ rows: rows.map(({ id_image_path, ...r }) => ({ ...r, has_image: !!id_image_path })) });
    }

    const id = String(b.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return bad(res, 400, 'Bad id');
    const found = await L.sb(`/rest/v1/teacher_verifications?id=eq.${id}&select=${COLS}`);
    const row = found[0];
    if (!row) return bad(res, 404, 'Request not found');
    const note = String(b.note || '').trim().slice(0, 500) || null;
    const now = new Date().toISOString();

    if (action === 'image') {
      if (!row.id_image_path) return bad(res, 404, 'No ID photo is stored for this request (it is deleted after approval/rejection).');
      return res.status(200).json({ url: await L.signProof(row.id_image_path) });
    }

    if (action === 'approve') {
      if (!['flagged', 'pending', 'rejected'].includes(row.status)) return bad(res, 409, 'This request is already ' + row.status);
      try { await L.grantTeacher(row.user_id, row.org_name); }
      catch (e) { return bad(res, 400, 'Could not grant access: ' + e.message); }
      await L.updateRow(id, { status: 'approved', admin_note: note, decided_at: now, id_image_path: null });
      await L.deleteProof(row.id_image_path);
      return res.status(200).json({ ok: true });
    }

    if (action === 'reject') {
      if (!['flagged', 'pending'].includes(row.status)) return bad(res, 409, 'This request is already ' + row.status);
      await L.updateRow(id, { status: 'rejected', admin_note: note, decided_at: now, id_image_path: null });
      await L.deleteProof(row.id_image_path);
      try {
        if (!L.missingEnv(['GMAIL_USER', 'GMAIL_APP_PASSWORD']).length) {
          await L.sendMail({
            to: row.email,
            subject: 'Lab Tracker: teacher verification not approved',
            text: `Hello ${row.full_name},\n\nWe could not approve your teacher verification request. You can keep using Lab Tracker as a Lab Assistant (your own products), and you may apply again with a clearer photo of your ID card.\n\nIf you think this is a mistake, reply to this email.\n\n- Lab Tracker`,
            replyTo: process.env.ADMIN_EMAIL
          });
        }
      } catch (e) { console.error('REJECT EMAIL FAILED:', e.message); }
      return res.status(200).json({ ok: true });
    }

    if (action === 'revoke') {
      if (row.status !== 'approved') return bad(res, 409, 'Only approved requests can be revoked');
      await L.revokeTeacher(row.user_id);
      await L.updateRow(id, { status: 'revoked', admin_note: note, decided_at: now });
      return res.status(200).json({ ok: true });
    }

    if (action === 'compose') return res.status(200).json(draftReport(row, note));

    if (action === 'report') {
      if (!['flagged', 'rejected', 'approved'].includes(row.status)) return bad(res, 409, 'Cannot report a request that is ' + row.status);
      const to = String(b.to || '').trim();
      const subject = String(b.subject || '').trim().slice(0, 200);
      const text = String(b.body || '').trim().slice(0, 6000);
      if (!isEmail(to)) return bad(res, 400, 'Enter the college email address to send to.');
      if (!subject || text.length < 40) return bad(res, 400, 'The message is too short.');
      if (L.missingEnv(['GMAIL_USER', 'GMAIL_APP_PASSWORD']).length) return bad(res, 500, 'Email is not set up (GMAIL_USER / GMAIL_APP_PASSWORD).');

      const mail = { to, subject, text, replyTo: process.env.ADMIN_EMAIL, bcc: process.env.ADMIN_EMAIL };
      if (b.attach === true && row.id_image_path) {
        const buf = await L.downloadProof(row.id_image_path);
        mail.attachments = [{ filename: 'submitted-id.jpg', content: buf }];
      }
      await L.sendMail(mail);
      if (row.status === 'approved') await L.revokeTeacher(row.user_id);
      await L.updateRow(id, { status: 'reported', admin_note: note, reported_to: to, reported_at: now, decided_at: now });
      return res.status(200).json({ ok: true });
    }

    return bad(res, 400, 'Unknown action');
  } catch (e) {
    console.error('ADMIN API CRASHED:', e && e.message, e && e.stack);
    return bad(res, 500, 'Server error: ' + (e && e.message));
  }
};
