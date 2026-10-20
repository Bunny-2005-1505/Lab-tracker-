(async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: mem } = await supabase.rpc('my_membership');
  const line = document.getElementById('orgLine');
  if (mem) {
    if (line) line.textContent = mem.org_name + ' · ' + (mem.role === 'assistant' ? 'Lab Assistant' : 'Lab Teacher');
    return;
  }

  let res = await supabase.rpc('claim_organization', {});
  if (res.error) { console.error(res.error.message); return; }
  let r = res.data;

  if (r.status === 'joined') { location.reload(); return; }
  if (r.status === 'free_email' && line) {
    line.textContent = 'Personal account · use your college or company email to join an organization';
    return;
  }
  if (r.status !== 'need_name') return;

  const o = document.createElement('div');
  o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:15000;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Arial,sans-serif';
  o.innerHTML = '<div style="background:#fff;padding:24px;border-radius:12px;width:380px;max-width:100%">' +
    '<h3 style="margin-top:0">Set up your organization</h3>' +
    '<p style="font-size:14px">You are the first person from <b></b> to join. Enter your college or company name. You will become its owner and can see all products from your organization.</p>' +
    '<input id="orgName" placeholder="e.g. ABC College of Engineering" style="width:100%;padding:12px;font-size:16px;border:1px solid #bbb;border-radius:6px">' +
    '<button id="orgGo" style="width:100%;margin-top:10px;padding:12px;font-size:16px;background:teal;color:#fff;border:none;border-radius:6px;cursor:pointer">Create organization</button>' +
    '<p id="orgErr" style="color:red;font-size:13px"></p></div>';
  o.querySelector('b').textContent = '@' + r.domain;
  document.body.appendChild(o);

  document.getElementById('orgGo').onclick = async () => {
    const name = document.getElementById('orgName').value.trim();
    if (name.length < 3) { document.getElementById('orgErr').textContent = 'Please enter the full name.'; return; }
    const x = await supabase.rpc('claim_organization', { org_name: name });
    if (x.error) { document.getElementById('orgErr').textContent = x.error.message; return; }
    location.reload();
  };
})();
