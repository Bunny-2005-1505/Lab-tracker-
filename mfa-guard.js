(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!(data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2')) return;

  const { data: f } = await supabase.auth.mfa.listFactors();
  const factor = (f.totp || []).find(x => x.status === 'verified');
  if (!factor) return;

  const o = document.createElement('div');
  o.style.cssText = 'position:fixed;inset:0;background:#0b3d3d;z-index:20000;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Arial,sans-serif';
  o.innerHTML = `<div style="background:#fff;padding:24px;border-radius:12px;width:340px;max-width:100%;text-align:center">
    <h3 style="margin-top:0">Two-step verification</h3>
    <p style="font-size:14px">Enter the 6-digit code from your authenticator app.</p>
    <input id="mgCode" inputmode="numeric" maxlength="6" placeholder="123456" style="width:100%;padding:12px;font-size:18px;text-align:center;border:1px solid #bbb;border-radius:6px">
    <button id="mgBtn" style="width:100%;margin-top:10px;padding:12px;font-size:16px;background:teal;color:#fff;border:none;border-radius:6px;cursor:pointer">Verify</button>
    <p id="mgErr" style="color:red;font-size:13px"></p>
    <a href="#" id="mgOut" style="font-size:13px">Log out</a></div>`;
  document.body.appendChild(o);

  document.getElementById('mgBtn').onclick = async () => {
    const ch = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (ch.error) { document.getElementById('mgErr').textContent = ch.error.message; return; }
    const v = await supabase.auth.mfa.verify({
      factorId: factor.id, challengeId: ch.data.id,
      code: document.getElementById('mgCode').value.trim()
    });
    if (v.error) { document.getElementById('mgErr').textContent = 'Wrong code, try again'; return; }
    o.remove();
  };
  document.getElementById('mgOut').onclick = async (e) => {
    e.preventDefault(); await supabase.auth.signOut(); location.href = 'login.html';
  };
})();
