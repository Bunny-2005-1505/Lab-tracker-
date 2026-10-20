const L = require('../lib/verify-lib');

const bad = (res, code, msg) => res.status(code).json({ error: msg });

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return bad(res, 405, 'POST only');

    const missing = L.missingEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY', 'ADMIN_EMAIL']);
    if (missing.length) { console.error('MISSING ENV VARS:', missing.join(', ')); return bad(res, 500, 'Verification is not set up yet. Please contact the administrator.'); }
    
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = token ? await L.getUser(token) : null;
    if (!user || !user.id) return bad(res, 401, 'Please log in again.');
    if (!user.email_confirmed_at) return bad(res, 403, 'Confirm your email address first, then try again.');

    const email = String(user.email || '').toLowerCase();
    const domain = email.split('@')[1] || '';
    if (L.FREE_DOMAINS.includes(domain)) return bad(res, 400, 'Teacher verification needs your college or company email, not a personal one (Gmail, Yahoo, etc.).');

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const fullName = String(body.fullName || '').trim().replace(/\s+/g, ' ');
    const orgName = String(body.orgName || '').trim().replace(/\s+/g, ' ');
    const employeeId = String(body.employeeId || '').trim().slice(0, 40);
    const path = String(body.path || '');
    if (fullName.length < 3 || fullName.length > 80) return bad(res, 400, 'Enter your full name as printed on your ID.');
    if (orgName.length < 3 || orgName.length > 120) return bad(res, 400, 'Enter your college or company name.');
    if (body.consent !== true) return bad(res, 400, 'Please tick the consent box.');
    if (!path.startsWith(user.id + '/') || path.includes('..')) return bad(res, 400, 'Invalid upload. Please try again.');

    const mem = await L.sb(`/rest/v1/memberships?user_id=eq.${user.id}&select=role,org_id`);
    if (mem[0] && ['owner', 'teacher'].includes(mem[0].role)) return bad(res, 409, 'You already have teacher access.');
    const open = await L.sb(`/rest/v1/teacher_verifications?user_id=eq.${user.id}&status=in.(pending,flagged,approved)&select=id,status`);
    if (open.length) return bad(res, 409, open[0].status === 'approved' ? 'You are already verified.' : 'Your request is already being reviewed.');
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const recent = await L.sb(`/rest/v1/teacher_verifications?user_id=eq.${user.id}&created_at=gte.${encodeURIComponent(since)}&select=id`);
    if (recent.length >= 3) return bad(res, 429, 'Too many attempts today. Please try again tomorrow.');

    const ins = await L.sb('/rest/v1/teacher_verifications', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: { user_id: user.id, email, full_name: fullName, org_name: orgName, employee_id: employeeId || null, id_image_path: path, status: 'pending' }
    });
    const row = ins[0];

    let buf, mime;
    try {
      buf = await L.downloadProof(path);
      mime = L.imageMime(buf);
      if (!mime || buf.length > 5 * 1024 * 1024) throw new Error('bad image');
    } catch (e) {
      await L.updateRow(row.id, { status: 'rejected', reasons: ['The uploaded file was not a readable JPG/PNG/WebP photo'], decided_at: new Date().toISOString(), id_image_path: null });
      await L.deleteProof(path);
      return bad(res, 400, 'We could not read that photo. Please upload a clear JPG or PNG of your ID.');
    }

    let ai = null, aiError = null;
    try { ai = await L.askGemini(buf, mime); } catch (e) { aiError = e.message || 'AI error'; console.error('GEMINI FAILED:', aiError); }

    let verdict, patch = {};
    if (!ai) {
      verdict = { status: 'flagged', suspicion: 'low', reasons: ['Automatic check unavailable (' + aiError + ') - needs your manual review'] };
    } else {
      const hash = L.idHash(ai.id_number, ai.institution_name || orgName);
      let duplicateId = false;
      if (hash) {
        const dup = await L.sb(`/rest/v1/teacher_verifications?id_hash=eq.${hash}&user_id=neq.${user.id}&status=in.(pending,flagged,approved,reported)&select=id`);
        duplicateId = dup.length > 0;
        patch.id_hash = hash;
      }
      patch.id_last4 = L.last4(ai.id_number);
      const org = await L.sb(`/rest/v1/organizations?domain=eq.${encodeURIComponent(domain)}&select=name`);
      verdict = L.decide(ai, { fullName, orgName }, { emailDomain: domain, duplicateId, existingOrgName: org[0] && org[0].name });
      const { id_number, ...safeAi } = ai; // never store the full ID number
      patch.ai_result = safeAi;
    }

    if (verdict.status === 'approved') {
      try {
        await L.grantTeacher(user.id, orgName);
        await L.updateRow(row.id, { ...patch, status: 'approved', suspicion: 'none', auto_decided: true, reasons: verdict.reasons, decided_at: new Date().toISOString(), id_image_path: null });
        await L.deleteProof(path); // privacy: keep no ID photo once approved
        return res.status(200).json({ status: 'approved' });
      } catch (e) {
        console.error('GRANT FAILED:', e.message);
        verdict = { status: 'flagged', suspicion: 'low', reasons: ['Looked valid, but granting access failed: ' + e.message] };
      }
    }

    await L.updateRow(row.id, { ...patch, status: 'flagged', suspicion: verdict.suspicion, reasons: verdict.reasons });
    try {
      if (!L.missingEnv(['GMAIL_USER', 'GMAIL_APP_PASSWORD']).length) {
        await L.sendMail({
          to: process.env.ADMIN_EMAIL,
          subject: `[Lab Tracker] Teacher verification needs your review${verdict.suspicion === 'high' ? ' - HIGH suspicion' : ''}`,
          text: `${fullName} (${email}) asked for teacher access at "${orgName}".\n\nAI review: ${verdict.suspicion.toUpperCase()} concern\n- ${verdict.reasons.join('\n- ')}\n\nYou decide (approve, reject, or prepare a report to the college):\n${L.siteUrl()}/admin.html`
        });
      }
    } catch (e) { console.error('ADMIN EMAIL FAILED:', e.message); }
    return res.status(200).json({ status: 'under_review' });
  } catch (e) {
    console.error('VERIFY CRASHED:', e && e.message, e && e.stack);
    return bad(res, 500, 'Something went wrong. Please try again in a minute.');
  }
};
