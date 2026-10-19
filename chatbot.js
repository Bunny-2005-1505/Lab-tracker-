(function () {
  const OWNER = {
    name: "Hemanth Kumar Pinnu",
    email: "hemanthkumarpinnu@gmail.com",
    phone: "+91 9177843853"   
      
      
  };


  const css = `
  #ltChatBtn{position:fixed;bottom:18px;right:18px;width:56px;height:56px;border-radius:50%;border:none;background:teal;color:#fff;font-size:26px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.35);z-index:10000}
  #ltChat{position:fixed;bottom:84px;right:18px;width:340px;max-width:calc(100vw - 24px);height:460px;max-height:70vh;background:#fff;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.35);display:none;flex-direction:column;overflow:hidden;z-index:10000;font-family:Arial,sans-serif}
  #ltChat header{background:teal;color:#fff;padding:12px 14px;font-weight:bold;display:flex;justify-content:space-between;align-items:center}
  #ltChat header span{cursor:pointer;font-size:20px}
  #ltMsgs{flex:1;overflow-y:auto;padding:10px;background:#f2f6f6}
  .ltm{max-width:85%;margin:6px 0;padding:8px 12px;border-radius:12px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word}
  .ltm.bot{background:#fff;color:#222;border:1px solid #d7e3e3}
  .ltm.me{background:teal;color:#fff;margin-left:auto}
  #ltForm{display:flex;border-top:1px solid #ddd}
  #ltForm input{flex:1;border:none;padding:12px;font-size:16px;outline:none;min-width:0}
  #ltForm button{border:none;background:teal;color:#fff;padding:0 16px;cursor:pointer;font-size:14px}
  @media (max-width:600px){#ltChat{right:8px;bottom:80px;width:calc(100vw - 16px);height:65vh}}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const btn = document.createElement('button'); btn.id = 'ltChatBtn'; btn.innerHTML = '💬'; btn.title = 'Chat with assistant';
  const box = document.createElement('div'); box.id = 'ltChat';
  box.innerHTML = `<header>Lab Tracker Assistant <span id="ltClose">×</span></header>
    <div id="ltMsgs"></div>
    <form id="ltForm"><input id="ltInput" placeholder="Type your question..." autocomplete="off"><button>Send</button></form>`;
  document.body.append(btn, box);

  const msgs = box.querySelector('#ltMsgs');
  const history = [];
  function add(text, who) {
    const d = document.createElement('div'); d.className = 'ltm ' + who; d.textContent = text;
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; return d;
  }
  const contactText = `You can contact the developer, ${OWNER.name}:\n📧 ${OWNER.email}\n📞 ${OWNER.phone}`;

  function localReply(q) {
    q = q.toLowerCase();
    if (/(contact|owner|developer|creator|phone|number|mail|email|reach|talk to|human|support)/.test(q)) return contactText;
    if (/(add|new).*(product|item)|how.*add/.test(q)) return "Go to Dashboard → Add Products. Choose the lab (CSE, Physics, Chemistry or Other), fill in name, quantity and expiry date, then press Add.";
    if (/(edit|modify|update|change)/.test(q)) return "Go to Dashboard → View Products and press 'Modify' on any product you added. Change the details and press Save.";
    if (/delete|remove/.test(q)) return "In View Products, press 'Delete' next to a product you added. You can only delete your own products.";
    if (/other lab|new lab|lab name/.test(q)) return "In Add Product, pick 'Other' in the Lab list and a box will appear where you can type your own lab name.";
    if (/expir/.test(q)) return "When you add a product that expires within 7 days, you get an alert. Expired items show in red in View Products.";
    if (/login|password|register|sign/.test(q)) return "Use the Register page to create an account, then log in with your email and password. If login fails, check your email for a confirmation link.";
    if (/\b(hi|hello|hey)\b/.test(q)) return "Hello! 👋 Ask me how to add, modify or delete products, or ask for the developer's contact details.";
    return null;
  }

  async function reply(q) {
    const typing = add('Typing...', 'bot');
    history.push({ role: 'user', content: q });
    let ans = null;
    try {
      const r = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-10) })
      });
      if (r.ok) { const j = await r.json(); ans = j.reply; }
    } catch (e) {}
    if (!ans) ans = localReply(q) || ("I'm not sure about that one. " + contactText);
    typing.textContent = ans;
    history.push({ role: 'assistant', content: ans });
    msgs.scrollTop = msgs.scrollHeight;
  }

  btn.onclick = () => {
    box.style.display = box.style.display === 'flex' ? 'none' : 'flex';
    if (!msgs.children.length) add("Hi! I'm the Lab Tracker assistant. Ask me how to use the site, or say 'contact' to get the developer's details.", 'bot');
  };
  box.querySelector('#ltClose').onclick = () => (box.style.display = 'none');
  box.querySelector('#ltForm').onsubmit = (e) => {
    e.preventDefault();
    const inp = box.querySelector('#ltInput'); const q = inp.value.trim(); if (!q) return;
    inp.value = ''; add(q, 'me'); reply(q);
  };
})();
