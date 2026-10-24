(function () {
  if (window.__ltChatLoaded) return;
  window.__ltChatLoaded = true;

  var OWNER = { name: "Hemanth Kumar Pinnu", email: "hemanthkumarpinnu@gmail.com", phone: "+91 9177843853" };
  var CONTACT = "You can contact the developer, " + OWNER.name + ":\n📧 " + OWNER.email + "\n📞 " + OWNER.phone;

  var css = `
  #ltChatBtn{position:fixed;bottom:18px;right:18px;width:56px;height:56px;border-radius:50%;border:none;background:teal;color:#fff;font-size:26px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.35);z-index:10000}
  #ltChat{position:fixed;bottom:84px;right:18px;width:350px;max-width:calc(100vw - 24px);height:500px;max-height:75vh;background:#fff;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.35);display:none;flex-direction:column;overflow:hidden;z-index:10000;font-family:Arial,sans-serif}
  #ltChat header{background:teal;color:#fff;padding:12px 14px;font-weight:bold;display:flex;justify-content:space-between;align-items:center}
  #ltChat header span{cursor:pointer;font-size:20px}
  #ltMsgs{flex:1;overflow-y:auto;padding:10px;background:#f2f6f6}
  .ltm{max-width:88%;margin:6px 0;padding:8px 12px;border-radius:12px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word;color:#222}
  .ltm.bot{background:#fff;border:1px solid #d7e3e3}
  .ltm.me{background:teal;color:#fff;margin-left:auto}
  #ltChips{display:flex;flex-wrap:wrap;gap:6px;padding:6px 8px;background:#f2f6f6;border-top:1px solid #e1ebeb}
  #ltChips button{border:1px solid teal;background:#fff;color:#007770;border-radius:14px;padding:5px 10px;font-size:12px;cursor:pointer}
  #ltChips button:hover{background:#e6fffd}
  #ltForm{display:flex;border-top:1px solid #ddd}
  #ltForm input{flex:1;border:none;padding:12px;font-size:16px;outline:none;min-width:0}
  #ltForm button{border:none;background:teal;color:#fff;padding:0 16px;cursor:pointer;font-size:14px}
  .ltfb{width:100%}
  .ltfb select,.ltfb textarea{width:100%;margin-top:6px;padding:8px;font-size:14px;border:1px solid #bbb;border-radius:6px;font-family:inherit}
  .ltfb textarea{height:80px;resize:vertical}
  .ltstars{margin-top:4px}
  .ltstars button{border:none;background:none;font-size:26px;color:#bbb;cursor:pointer;padding:0 2px}
  .ltstars button.on{color:#f5a623}
  .ltrow{display:flex;gap:6px;margin-top:8px}
  .ltrow button{flex:1;padding:8px;border:none;border-radius:6px;cursor:pointer;color:#fff;background:teal}
  .ltrow button.grey{background:#7f8c8d}
  .ltrow button:disabled{opacity:.6}
  .ltstat{font-size:12px;margin-top:6px;color:#a12a2a}
  @media (max-width:600px){#ltChat{right:8px;bottom:80px;width:calc(100vw - 16px);height:70vh}}
  @media (max-width:860px){body[data-page] #ltChatBtn{bottom:80px}body[data-page] #ltChat{bottom:146px;height:62vh}}
  `;
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var btn = document.createElement('button'); btn.id = 'ltChatBtn'; btn.innerHTML = '💬'; btn.title = 'Chat with assistant'; btn.setAttribute('aria-label', 'Open chat assistant');
  var box = document.createElement('div'); box.id = 'ltChat';
  box.innerHTML = '<header>Lab Tracker Assistant <span id="ltClose" role="button" aria-label="Close chat">×</span></header>' +
    '<div id="ltMsgs" aria-live="polite"></div><div id="ltChips"></div>' +
    '<form id="ltForm"><input id="ltInput" placeholder="Type your question..." autocomplete="off" maxlength="500"><button>Send</button></form>';
  document.body.append(btn, box);

  var msgs = box.querySelector('#ltMsgs');
  var history = [];
  var aiDown = false, aiFails = 0;

  function add(text, who) {
    var d = document.createElement('div'); d.className = 'ltm ' + who; d.textContent = text;
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; return d;
  }

  /* Order matters: the first matching entry wins, so specific topics come before general ones. */
  var KB = [
    { re: /(export|csv|download).{0,30}(data|booking|report|file|csv)?|(csv|spreadsheet|excel)/i,
      a: "Teachers can tap “Export data (CSV)” at the top of the Equipment page. It downloads one file with all bookings, maintenance blocks and refused booking attempts. Names and emails are not included. Assistants do not see this button." },
    { re: /(add|create|new|register).{0,25}(equipment|instrument|apparatus|machine)/i,
      a: "Only Lab Teachers can add equipment. Open Equipment, tap “+ Add equipment”, enter the name, pick the lab (or choose Other and type it), add an asset code and a service or calibration date if you want, then tap Add. If you do not see the button, your account is an Assistant account." },
    { re: /(maintenance|calibrat|service due)/i,
      a: "Lab Teachers can block an instrument for maintenance: on Equipment, tap Maintenance next to it, choose the time and tap “Block this time”. Nobody can book it during that time, and it shows in amber on the schedule." },
    { re: /(overdue|not returned|didn'?t return|mark.{0,10}return|return(ing)? (the )?(equipment|instrument))/i,
      a: "When you finish using an instrument, tap Return in “My upcoming bookings” (or Mark returned in the overdue list). A booking that ended without being returned shows in red as overdue, and you cannot book that instrument again until you mark it returned." },
    { re: /(cancel).{0,20}(booking|reservation|slot)|(booking|reservation).{0,20}cancel/i,
      a: "Open Equipment, find the booking under “My upcoming bookings” and tap Cancel. Once a booking has started you can only mark it returned." },
    { re: /(book|reserv|schedul|double.?book|conflict|slot|instrument|equipment)/i,
      a: "Open Equipment from the menu. Tap an empty slot on the schedule (or press Book equipment), choose the date and times, and confirm. If the instrument is already booked or under maintenance, the booking is refused and you see when it is free. When you finish, tap Return. Teachers can also add equipment, block time for maintenance and export booking data." },
    { re: /(used 1|log(ging)? usage|usage log|i used|mark.{0,10}used|use up|consum(e|ed|ption)|forecast|run(s|ning)? (out|low)|stock.?out|low stock|reorder|critical|\bwatch\b|undo)/i,
      a: "Open Stock and tap “Used 1” next to an item whenever you use it (the ⋯ button logs a different amount). Stock goes down instantly, and you can tap Undo within 10 minutes. From your last 14 days of usage Lab Tracker estimates when each item runs out: Critical means out of stock, at its reorder level, or gone within 7 days; Watch means gone within 21 days or likely to expire first. If nothing was logged for 14 days, the item shows “usage not logged lately”." },
    { re: /(qr|barcode|scan)/i,
      a: "On Add product, tap Scan next to the Code field to scan a QR code with your phone camera (allow camera permission), or choose a photo of the code. You can also type the code by hand." },
    { re: /(add|create|new|enter|insert).{0,25}(product|item|chemical|stock|reagent)|how.{0,15}add/i,
      a: "Tap Add product on the dashboard or in Stock. Choose the lab, enter the code (type or scan), name, description, quantity, unit, a reorder level (optional) and the expiry date, then tap Add product." },
    { re: /(edit|modify|update|change|correct).{0,25}(product|item|quantity|detail|stock)|^modify/i,
      a: "Open Stock, tap Edit on a product you added, change the details and tap Save. You can edit only your own products." },
    { re: /(delete|remove).{0,20}(product|item|stock)|^delete/i,
      a: "Open Stock and tap Delete next to a product you added, then confirm. This also removes its usage history. You can delete only your own products." },
    { re: /(forgot|forget|reset|lost|recover).{0,20}password|password.{0,20}(forgot|forget|reset|lost|recover|change)|(can'?t|cannot|unable to) log ?in/i,
      a: "On the login page tap “Forgot password?”, enter your email and we will send a reset link. Open the link, choose a new password and log in. Check your spam folder if the email does not arrive. If you signed up with Google, you can simply use “Continue with Google”." },
    { re: /(mfa|2fa|two.?step|authenticator|otp|6.?digit)/i,
      a: "Two-step verification (MFA) is optional. Open Profile → Enable MFA, scan the QR code with Google Authenticator, Microsoft Authenticator or Authy, and enter the 6-digit code. After that, login asks for a code from the app. If you lose access to the app, contact the developer for help." },
    { re: /(teacher|id card|designation|staff|verify as)/i,
      a: "Everyone starts as a Lab Assistant and sees only their own products. To become a Lab Teacher (see all products from your organization), log in with your official college or company email, open the Dashboard and tap “I'm a teacher: verify”. Enter your name and designation and upload a photo of your staff ID card. It is checked automatically and may need one more check. The ID photo is deleted after the decision." },
    { re: /google/i,
      a: "Tap “Continue with Google” on the login or register page and choose your Google account. If it does not open, allow redirects and try again, or use email and password." },
    { re: /(register|sign ?up|create.{0,10}account|new account|confirm.{0,15}email|confirmation|verification email)/i,
      a: "Tap “Register here” on the login page, enter your email and a password, then open the confirmation email and click the link. You can log in after that. Use your official college or company email to join your organization. Gmail and similar addresses work as personal accounts. If the email does not arrive, check spam." },
    { re: /(expir|remind|alert|notification)/i,
      a: "When you add a product that expires within 7 days you see an alert. Every morning the system also emails the person who added a product 5 days and 1 day before it expires. Expired products show in red in Stock, and the dashboard lists anything expiring soon. Check your spam folder for the first email." },
    { re: /(who can see|privacy|private|organi[sz]ation|domain|my data|secure|safe)/i,
      a: "Assistants see only their own products. Lab Teachers see products from people in their own organization (same college or company email domain) and never from other organizations. Different organizations cannot see each other's data." },
    { re: /(profile|photo|picture|avatar|camera|selfie)/i,
      a: "Open Profile from the menu. You can upload a photo or tap Take photo to use your camera, and set your name, job title, lab, phone and employee ID, then tap Save Profile. Allow camera permission when your browser asks." },
    { re: /(other lab|new lab|lab name|which lab|labs?\b)/i,
      a: "Labs available: CSE Lab, Physics Lab and Chemistry Lab. For any other lab, choose “Other” in the Lab list and type the lab name." },
    { re: /(free|cost|price|pricing|charge|paid)/i,
      a: "Lab Tracker is free to register and use." },
    { re: /(mobile|laptop|tablet|install|\bapp\b)/i,
      a: "Lab Tracker works in any browser on phone, tablet and laptop, and the layout adjusts to your screen. There is no separate app to install." },
    { re: /(login|log in|sign in|password)/i,
      a: "Enter your email and password on the login page, or tap “Continue with Google”. If you cannot log in: confirm your email first (check the confirmation email), use “Forgot password?” to reset it, and make sure the password has no extra spaces." },
    { re: /(what is|about|purpose|what does|features)/i,
      a: "Lab Tracker is a web-based inventory system for labs. Add chemicals, instruments and consumables, log usage with one tap, get low-stock and expiry warnings, and book equipment without double bookings." },
    { re: /(error|not working|problem|issue|stuck|fail|broken)/i,
      a: "Sorry about that! Tell me what you were doing and what message you saw. If it keeps happening, tap “Give feedback” below to report it, or contact the developer." },
    { re: /^(hi|hello|hey|hii|good (morning|afternoon|evening))\b/i,
      a: "Hello! 👋 Ask me how to log usage, book equipment, add products, how warnings and reminders work, login help, MFA or teacher verification." },
    { re: /^(help|menu|options|what can you do)\??$/i,
      a: "I can help with: logging usage and stock warnings, adding or editing products, scanning QR codes, booking and returning equipment, exporting data, reminders, login and password reset, MFA, teacher verification and your profile. Say “contact” for the developer, or “feedback” to send a suggestion." },
    { re: /^(thanks|thank you|thx|ok thanks)\b/i,
      a: "You're welcome! 😊" }
  ];
  function localReply(q) {
    for (var i = 0; i < KB.length; i++) if (KB[i].re.test(q)) return KB[i].a;
    return null;
  }

  var CONTACT_RE = /(contact|developer|owner|creator|phone number|your number|call you|mail id|email id|reach you|customer support|support team|talk to|human)/i;
  var FEEDBACK_RE = /(feedback|suggest|suggestion|complain|complaint|report (a |an )?(bug|problem|issue)|\bbug\b|rate (this|the) (site|app|website))/i;

  function showFeedbackForm() {
    var wrap = document.createElement('div'); wrap.className = 'ltm bot ltfb';
    var title = document.createElement('div'); title.textContent = 'Send feedback'; title.style.fontWeight = 'bold';
    var sub = document.createElement('div'); sub.textContent = 'How do you rate Lab Tracker?'; sub.style.fontSize = '13px';
    var stars = document.createElement('div'); stars.className = 'ltstars';
    var rating = 0, starBtns = [];
    function paint() { starBtns.forEach(function (x, idx) { x.classList.toggle('on', idx < rating); }); }
    [1, 2, 3, 4, 5].forEach(function (n) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = '★'; b.setAttribute('aria-label', n + ' star');
      b.onclick = function () { rating = n; paint(); };
      starBtns.push(b); stars.appendChild(b);
    });
    var sel = document.createElement('select');
    [['suggestion', 'Suggestion'], ['problem', 'Problem / bug'], ['compliment', 'Compliment'], ['other', 'Other']].forEach(function (o) {
      var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; sel.appendChild(op);
    });
    var ta = document.createElement('textarea'); ta.placeholder = 'Write your feedback...'; ta.maxLength = 1000;
    var row = document.createElement('div'); row.className = 'ltrow';
    var send = document.createElement('button'); send.type = 'button'; send.textContent = 'Send';
    var cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'grey'; cancel.textContent = 'Cancel';
    row.append(send, cancel);
    var status = document.createElement('div'); status.className = 'ltstat';
    wrap.append(title, sub, stars, sel, ta, row, status);
    msgs.appendChild(wrap); msgs.scrollTop = msgs.scrollHeight;

    cancel.onclick = function () { wrap.remove(); };
    send.onclick = async function () {
      var text = ta.value.trim();
      if (text.length < 3) { status.textContent = 'Please write a few words.'; return; }
      if (typeof supabase === 'undefined' || !supabase.auth) { status.textContent = 'Feedback is not available on this page. Please email ' + OWNER.email; return; }
      send.disabled = true; status.style.color = '#555'; status.textContent = 'Sending...';
      try {
        var u = await supabase.auth.getUser();
        var user = u && u.data && u.data.user;
        if (!user) { status.style.color = '#a12a2a'; status.textContent = 'Please log in first to send feedback, or email ' + OWNER.email; send.disabled = false; return; }
        var r = await supabase.from('feedback').insert({
          user_id: user.id, rating: rating || null, category: sel.value, message: text.slice(0, 1000), page: location.pathname
        });
        if (r.error) throw r.error;
        wrap.textContent = '✅ Thank you! Your feedback was sent.';
      } catch (e) {
        status.style.color = '#a12a2a';
        var msg = (e && e.message) || String(e);
        status.textContent = 'Could not send: ' + msg + '. You can also email ' + OWNER.email;
        send.disabled = false;
      }
    };
  }

  async function reply(q) {
    if (FEEDBACK_RE.test(q)) { add('Sure, I would love to hear from you. Please fill in the form below.', 'bot'); showFeedbackForm(); return; }
    if (CONTACT_RE.test(q)) { add(CONTACT, 'bot'); return; }

    // 1) Built-in answers first: instant and always match how the app really works.
    var local = localReply(q);
    if (local) { add(local, 'bot'); history.push({ role: 'user', content: q }, { role: 'assistant', content: local }); return; }

    // 2) Otherwise try the AI endpoint, if the site has one.
    var typing = add('Typing...', 'bot');
    history.push({ role: 'user', content: q });
    var ans = null;
    if (!aiDown) {
      try {
        var ctl = new AbortController(); var to = setTimeout(function () { ctl.abort(); }, 20000);
        var r = await fetch('/api/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
          body: JSON.stringify({ messages: history.slice(-10) })
        });
        clearTimeout(to);
        if (r.ok) { var j = await r.json(); ans = j.reply; aiFails = 0; }
        else { aiFails++; if (r.status === 404 || aiFails >= 2) aiDown = true; }
      } catch (e) { aiFails++; if (aiFails >= 2) aiDown = true; }
    }
    if (!ans) ans = "I'm not sure about that one. You can ask about logging usage, booking equipment, adding products, reminders, login, MFA or teacher verification, or say “feedback” to send us a message.\n\n" + CONTACT;
    typing.textContent = ans;
    history.push({ role: 'assistant', content: ans });
    msgs.scrollTop = msgs.scrollHeight;
  }

  function ask(q, label) { add(label || q, 'me'); reply(q); }

  var chips = box.querySelector('#ltChips');
  [['Log usage', 'How do I log usage?'], ['Book equipment', 'How do I book equipment?'], ['Add a product', 'How do I add a product?'], ['Give feedback', 'feedback']].forEach(function (c) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = c[0];
    b.onclick = function () { ask(c[1], c[0]); };
    chips.appendChild(b);
  });

  btn.onclick = function () {
    var open = box.style.display === 'flex';
    box.style.display = open ? 'none' : 'flex';
    if (!open) {
      if (!msgs.children.length) add("Hi! I'm the Lab Tracker assistant. Ask me about logging usage, booking equipment, reminders or login, or tap a button below. Say “contact” for the developer's details.", 'bot');
      setTimeout(function () { var i = box.querySelector('#ltInput'); if (i && window.innerWidth > 860) i.focus(); }, 50);
    }
  };
  box.querySelector('#ltClose').onclick = function () { box.style.display = 'none'; };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') box.style.display = 'none'; });
  box.querySelector('#ltForm').onsubmit = function (e) {
    e.preventDefault();
    var inp = box.querySelector('#ltInput'); var q = inp.value.trim(); if (!q) return;
    inp.value = ''; ask(q);
  };
})();
