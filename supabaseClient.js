(function () {
  var SUPABASE_URL = 'https://sqogstesfxozvnseomgn.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxb2dzdGVzZnhvenZuc2VvbWduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3ODE3NTksImV4cCI6MjEwMDM1Nzc1OX0.RhK59ITVVaNpXSQqSJqnRulZ1_A6ejm9rRBb-uE8T-Q';

  document.write(
    '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"><\/script>' +
    '<script>window.supabase = window.supabase.createClient("' + SUPABASE_URL + '", "' + SUPABASE_ANON_KEY + '");<\/script>'
  );
})();
