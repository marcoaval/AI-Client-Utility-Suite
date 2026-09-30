// ==UserScript==
// @name         AI Client Utility Suite
// @namespace    https://github.com/marcoaval/AI-Client-Utility-Suite
// @version      0.1.1
// @description  Quality of life tools for ChatGPT and Claude.
// @author       marcoaval
// @match        https://chatgpt.com/*
// @match        https://claude.ai/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/marcoaval/AI-Client-Utility-Suite/main/ai_client_utility_suite.user.js
// @downloadURL  https://raw.githubusercontent.com/marcoaval/AI-Client-Utility-Suite/main/ai_client_utility_suite.user.js
// ==/UserScript==

(() => {
  "use strict";

  const APP_ID = "ai-client-utility-suite";
  const STORAGE_KEY = "aiClientUtilitySuite.prompts";

  const platform = () => location.hostname.includes("claude.ai") ? "Claude" : "ChatGPT";

  function loadPrompts() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch { return []; }
  }

  function savePrompts(prompts) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
  }

  function getChatLinks() {
    const selectors = platform() === "Claude"
      ? ['a[href^="/chat/"]']
      : ['a[href^="/c/"]'];
    const seen = new Set();
    return [...document.querySelectorAll(selectors.join(","))].filter(a => {
      const href = a.getAttribute("href");
      if (!href || seen.has(href)) return false;
      seen.add(href);
      return true;
    }).map(a => ({ title: (a.innerText || a.textContent || "Untitled chat").trim(), href: a.href }));
  }

  function modal(title, body) {
    document.getElementById(APP_ID + "-modal")?.remove();
    const wrap = document.createElement("div");
    wrap.id = APP_ID + "-modal";
    wrap.innerHTML = `
      <div class="acus-backdrop">
        <div class="acus-modal">
          <div class="acus-head"><strong>${title}</strong><button class="acus-close">×</button></div>
          <div class="acus-body"></div>
        </div>
      </div>`;
    wrap.querySelector(".acus-body").append(body);
    wrap.querySelector(".acus-close").onclick = () => wrap.remove();
    wrap.querySelector(".acus-backdrop").onclick = e => { if (e.target === e.currentTarget) wrap.remove(); };
    document.body.append(wrap);
  }

  function searchChats() {
    const box = document.createElement("div");
    box.innerHTML = '<input class="acus-input" placeholder="Search loaded chat titles..."><div class="acus-results"></div>';
    const input = box.querySelector("input");
    const results = box.querySelector(".acus-results");
    const chats = getChatLinks();
    const render = () => {
      const q = input.value.toLowerCase().trim();
      const matches = chats.filter(c => !q || c.title.toLowerCase().includes(q));
      results.innerHTML = "";
      const count = document.createElement("div");
      count.className = "acus-muted";
      count.textContent = `${matches.length} of ${chats.length} loaded chats`;
      results.append(count);
      matches.slice(0, 250).forEach(c => {
        const a = document.createElement("a");
        a.className = "acus-row";
        a.href = c.href;
        a.textContent = c.title;
        results.append(a);
      });
    };
    input.oninput = render;
    render();
    modal("Search Chats", box);
    setTimeout(() => input.focus(), 50);
  }

  function promptLibrary() {
    const box = document.createElement("div");
    box.innerHTML = `
      <div class="acus-prompt-form">
        <input class="acus-input acus-title" placeholder="Prompt name">
        <textarea class="acus-input acus-text" placeholder="Prompt text"></textarea>
        <button class="acus-primary acus-save">Save prompt</button>
      </div>
      <div class="acus-prompts"></div>`;
    const render = () => {
      const list = box.querySelector(".acus-prompts");
      list.innerHTML = "";
      const prompts = loadPrompts();
      if (!prompts.length) {
        list.innerHTML = '<div class="acus-muted">No saved prompts yet.</div>';
        return;
      }
      prompts.forEach((p, i) => {
        const row = document.createElement("div");
        row.className = "acus-prompt";
        const name = document.createElement("strong");
        name.textContent = p.name;
        const actions = document.createElement("div");
        const copy = document.createElement("button");
        copy.textContent = "Copy";
        copy.onclick = () => navigator.clipboard.writeText(p.text);
        const del = document.createElement("button");
        del.textContent = "Delete";
        del.onclick = () => {
          const next = loadPrompts();
          next.splice(i, 1);
          savePrompts(next);
          render();
        };
        actions.append(copy, del);
        row.append(name, actions);
        const text = document.createElement("div");
        text.className = "acus-muted";
        text.textContent = p.text.length > 160 ? p.text.slice(0, 160) + "…" : p.text;
        row.append(text);
        list.append(row);
      });
    };
    box.querySelector(".acus-save").onclick = () => {
      const name = box.querySelector(".acus-title").value.trim();
      const text = box.querySelector(".acus-text").value.trim();
      if (!name || !text) return;
      const prompts = loadPrompts();
      prompts.unshift({ name, text });
      savePrompts(prompts);
      box.querySelector(".acus-title").value = "";
      box.querySelector(".acus-text").value = "";
      render();
    };
    render();
    modal("Prompt Library", box);
  }

  function archiveInfo() {
    const box = document.createElement("div");
    box.innerHTML = '<div class="acus-muted">Bulk Archive is the next feature being built. It will let you review and select chats before any archive action occurs.</div>';
    modal("Bulk Archive", box);
  }

  function openMenu() {
    const box = document.createElement("div");
    box.className = "acus-menu";
    [["🔎 Search Chats", searchChats], ["📦 Bulk Archive", archiveInfo], ["📚 Prompt Library", promptLibrary]].forEach(([label, fn]) => {
      const b = document.createElement("button");
      b.className = "acus-menu-btn";
      b.textContent = label;
      b.onclick = fn;
      box.append(b);
    });
    modal("AI Tools · " + platform(), box);
  }

  function ensureLauncherDock() {
    let dock = document.getElementById("ai-userscript-launcher-dock");
    if (!dock) {
      dock = document.createElement("div");
      dock.id = "ai-userscript-launcher-dock";
      dock.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483646;display:flex;flex-direction:row-reverse;align-items:center;gap:10px;pointer-events:none;";
      document.body.append(dock);
    }
    return dock;
  }

  function inject() {
    if (document.getElementById(APP_ID + "-launcher")) return;
    const style = document.createElement("style");
    style.textContent = `
      #${APP_ID}-launcher{border:1px solid rgba(128,128,128,.35);border-radius:14px;padding:10px 14px;background:#171717;color:#fff;font:600 14px system-ui;box-shadow:0 8px 30px rgba(0,0,0,.22);cursor:pointer;pointer-events:auto}
      .acus-backdrop{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px}
      .acus-modal{width:min(680px,95vw);max-height:82vh;overflow:auto;background:#181818;color:#f5f5f5;border:1px solid #444;border-radius:18px;font:14px system-ui;box-shadow:0 24px 80px rgba(0,0,0,.45)}
      .acus-head{position:sticky;top:0;background:#181818;display:flex;justify-content:space-between;align-items:center;padding:16px 18px;border-bottom:1px solid #333}
      .acus-head button,.acus-prompt button,.acus-menu-btn{background:#2b2b2b;color:#fff;border:1px solid #444;border-radius:10px;padding:8px 11px;cursor:pointer}
      .acus-close{font-size:20px}.acus-body{padding:16px}.acus-menu{display:grid;gap:10px}.acus-menu-btn{text-align:left;padding:14px}
      .acus-input{box-sizing:border-box;width:100%;background:#222;color:#fff;border:1px solid #444;border-radius:10px;padding:10px;margin-bottom:10px}
      textarea.acus-input{min-height:110px;resize:vertical}.acus-results{display:grid;gap:5px}.acus-row{color:#eee;text-decoration:none;padding:9px;border-radius:9px}.acus-row:hover{background:#2b2b2b}
      .acus-muted{color:#aaa;margin:8px 0}.acus-prompt-form{margin-bottom:18px}.acus-primary{margin-bottom:8px}.acus-prompt{border-top:1px solid #333;padding:12px 0}.acus-prompt>div:first-of-type{display:flex;gap:6px}
    `;
    document.head.append(style);
    const btn = document.createElement("button");
    btn.id = APP_ID + "-launcher";
    btn.textContent = "🧰 AI Tools";
    btn.onclick = openMenu;
    ensureLauncherDock().append(btn);
  }

  inject();
  new MutationObserver(inject).observe(document.documentElement, { childList: true, subtree: true });
})();