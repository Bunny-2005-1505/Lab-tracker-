(async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const line = document.getElementById('orgLine');
  const roleLabel = (r) => (r === 'assistant' ? 'Lab Assistant' : 'Lab Teacher');
  const verifyLink = (text) => {
    const a = document.createElement('a');
    a.href = 'verify-teacher.html'; a.textContent = text; a.style.cssText = 'margin-left:8px;font-weight:normal;font-size:14px';
    return a;
  };
  const say = (text, link) => { if (!line) return; line.textContent = text; if (link) line.append(link); };

  async function pendingState() {
    const r = await supabase.from('teacher_verifications').select('status').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1);
    const s = r.data && r.data[0] && r.data[0].status;
    return s === 'pending' || s === 'flagged';
  }

  let { data: mem } = await supabase.rpc('my_membership');
  let status = null;

  if (!mem) {
    const res = await supabase.rpc('claim_organization', {});
    if (res.error) { console.error(res.error.message); return; }
    status = res.data && res.data.status;
    if (status === 'joined') { location.reload(); return; }
    if (status === 'member') { location.reload(); return; }
  }

  if (mem) {
    const base = mem.org_name + ' · ' + roleLabel(mem.role);
    if (mem.role === 'assistant') say(base, (await pendingState()) ? document.createTextNode(' · teacher verification under review') : verifyLink("I'm a teacher: verify"));
    else say(base);
    return;
  }

  if (status === 'unverified') return say('Please confirm your email address to continue.');
  if (status === 'free_email') return say('Personal account · use your college or company email to join an organization');
  if (status === 'no_org') {
    return say('Lab Assistant / Other · no organization yet', (await pendingState()) ? document.createTextNode(' · teacher verification under review') : verifyLink("I'm a teacher: verify"));
  }
})();
