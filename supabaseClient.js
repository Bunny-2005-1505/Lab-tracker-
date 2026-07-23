// Fill these in from your Supabase project: Settings -> API
const SUPABASE_URL = 'https://sqogstesfxozvnseomgn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxb2dzdGVzZnhvenZuc2VvbWduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3ODE3NTksImV4cCI6MjEwMDM1Nzc1OX0.RhK59ITVVaNpXSQqSJqnRulZ1_A6ejm9rRBb-uE8T-Q';

function getSession() {
  try { return JSON.parse(localStorage.getItem('sb_session') || 'null'); }
  catch { return null; }
}
function setSession(session) {
  if (session) localStorage.setItem('sb_session', JSON.stringify(session));
  else localStorage.removeItem('sb_session');
}

const supabase = {
  auth: {
    async signUp({ email, password }) {
      const res = await fetch(SUPABASE_URL + '/auth/v1/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) return { data: null, error: { message: data.error_description || data.msg || data.error || 'Sign up failed' } };
      return { data, error: null };
    },
    async signInWithPassword({ email, password }) {
      const res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) return { data: null, error: { message: data.error_description || data.msg || 'Login failed' } };
      setSession(data);
      return { data, error: null };
    },
    async getUser() {
      const session = getSession();
      if (!session || !session.access_token) return { data: { user: null }, error: null };
      const res = await fetch(SUPABASE_URL + '/auth/v1/user', {
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + session.access_token }
      });
      if (!res.ok) { setSession(null); return { data: { user: null }, error: null }; }
      const user = await res.json();
      return { data: { user }, error: null };
    },
    async signOut() {
      const session = getSession();
      if (session && session.access_token) {
        try {
          await fetch(SUPABASE_URL + '/auth/v1/logout', {
            method: 'POST',
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + session.access_token }
          });
        } catch (e) {}
      }
      setSession(null);
      return { error: null };
    }
  },
  from(table) {
    return {
      _select: '*', _order: null,
      select(cols) { this._select = cols || '*'; return this; },
      order(col, opts) { this._order = col + '.' + ((opts && opts.ascending === false) ? 'desc' : 'asc'); return this; },
      async insert(row) {
        const session = getSession();
        const res = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + (session ? session.access_token : SUPABASE_ANON_KEY),
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(row)
        });
        const data = await res.json();
        if (!res.ok) return { data: null, error: { message: data.message || 'Insert failed' } };
        return { data, error: null };
      },
      delete() {
        return {
          eq: async (col, val) => {
            const session = getSession();
            const res = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + col + '=eq.' + encodeURIComponent(val), {
              method: 'DELETE',
              headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + (session ? session.access_token : SUPABASE_ANON_KEY)
              }
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              return { error: { message: data.message || 'Delete failed' } };
            }
            return { error: null };
          }
        };
      },
      then(resolve) {
        const session = getSession();
        let url = SUPABASE_URL + '/rest/v1/' + table + '?select=' + encodeURIComponent(this._select);
        if (this._order) url += '&order=' + encodeURIComponent(this._order);
        fetch(url, {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + (session ? session.access_token : SUPABASE_ANON_KEY)
          }
        }).then(async (res) => {
          const data = await res.json();
          if (!res.ok) resolve({ data: null, error: { message: data.message || 'Query failed' } });
          else resolve({ data, error: null });
        }).catch((err) => resolve({ data: null, error: { message: err.message } }));
      }
    };
  }
};
