// ==UserScript==
// @name         AI Client Utility Suite
// @namespace    https://github.com/marcoaval/AI-Client-Utility-Suite
// @version      0.2.0
// @description  Quality of life tools for ChatGPT and Claude.
// @author       marcoaval
// @match        https://chatgpt.com/*
// @match        https://claude.ai/*
// @grant        GM_getValue
// @grant        GM_setValue
// @updateURL    https://raw.githubusercontent.com/marcoaval/AI-Client-Utility-Suite/main/ai_client_utility_suite.user.js
// @downloadURL  https://raw.githubusercontent.com/marcoaval/AI-Client-Utility-Suite/main/ai_client_utility_suite.user.js
// ==/UserScript==

(() => {
  "use strict";

  const APP_ID = "ai-client-utility-suite";
  const STORAGE_KEY = "aiClientUtilitySuite.prompts";
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let cachedHistory = null;

  const platform = () => location.hostname.includes("claude.ai") ? "Claude" : "ChatGPT";

  function normalizePrompts(values) {
    if (!Array.isArray(values)) return [];
    const seen = new Set();
    const prompts = [];

    for (const value of values) {
      const name = String(value?.name || "").trim();
      const text = String(value?.text || "").trim();
      if (!name || !text) continue;

      const key = `${name}\n${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      prompts.push({ name, text });
    }

    return prompts;
  }

  function loadPrompts() {
    let shared = [];

    try {
      const stored = GM_getValue(STORAGE_KEY, "[]");
      shared = normalizePrompts(typeof stored === "string" ? JSON.parse(stored) : stored);
    } catch {
      shared = [];
    }

    try {
      const legacy = normalizePrompts(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
      if (legacy.length) {
        shared = normalizePrompts([...shared, ...legacy]);
        GM_setValue(STORAGE_KEY, JSON.stringify(shared));
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}

    return shared;
  }

  function savePrompts(prompts) {
    GM_setValue(STORAGE_KEY, JSON.stringify(normalizePrompts(prompts)));
  }

  function chatLinkElements() {
    const selector = platform() === "Claude" ? 'a[href^="/chat/"]' : 'a[href^="/c/"]';
    return [...document.querySelectorAll(selector)];
  }

  function getChatLinks() {
    const seen = new Set();
    const chats = [];

    for (const link of chatLinkElements()) {
      const href = link.getAttribute("href") || "";
      if (!href || seen.has(href)) continue;

      const title = (
        link.getAttribute("aria-label") ||
        link.getAttribute("title") ||
        link.innerText ||
        link.textContent ||
        "Untitled chat"
      ).replace(/\s+/g, " ").trim();

      if (!title) continue;
      seen.add(href);
      chats.push({ href, url: link.href, title });
    }

    return chats;
  }

  function mergeChats(target, chats) {
    for (const chat of chats) {
      if (!target.has(chat.href)) target.set(chat.href, chat);
    }
  }

  function scrollContainersForChats() {
    const candidates = new Set();

    for (const link of chatLinkElements()) {
      let node = link.parentElement;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 20) {
          candidates.add(node);
        }
        node = node.parentElement;
      }
    }

    for (const node of document.querySelectorAll('nav, aside, [role="navigation"]')) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 20) {
        candidates.add(node);
      }

      for (const child of node.querySelectorAll("*")) {
        const childStyle = getComputedStyle(child);
        if (/(auto|scroll)/.test(childStyle.overflowY) && child.scrollHeight > child.clientHeight + 20) {
          candidates.add(child);
        }
      }
    }

    return [...candidates].sort((a, b) => b.scrollHeight - a.scrollHeight);
  }

  async function loadAllChats(onProgress) {
    const collected = new Map();
    mergeChats(collected, getChatLinks());

    const containers = scrollContainersForChats();
    if (!containers.length) {
      onProgress?.(collected.size, false);
      return [...collected.values()];
    }

    for (const container of containers) {
      const step = Math.max(220, Math.floor(container.clientHeight * 0.8));
      let stableAtBottom = 0;
      let lastCount = collected.size;
      let lastMax = Math.max(0, container.scrollHeight - container.clientHeight);

      while (stableAtBottom < 4) {
        const max = Math.max(0, container.scrollHeight - container.clientHeight);
        container.scrollTop = Math.min(container.scrollTop + step, max);
        await sleep(180);

        mergeChats(collected, getChatLinks());
        onProgress?.(collected.size, true);

        const currentMax = Math.max(0, container.scrollHeight - container.clientHeight);
        const atBottom = container.scrollTop >= currentMax - 4;
        const grew = collected.size > lastCount || currentMax > lastMax + 4;

        if (atBottom && !grew) {
          stableAtBottom++;
          await sleep(220);
        } else {
          stableAtBottom = 0;
        }

        lastCount = collected.size;
        lastMax = currentMax;
      }
    }

    for (const container of containers) {
      container.scrollTop = 0;
    }

    await sleep(120);
    onProgress?.(collected.size, false);
    return [...collected.values()];
  }

  function rememberChats(chats) {
    if (!cachedHistory) cachedHistory = new Map();
    mergeChats(cachedHistory, chats);
    return [...cachedHistory.values()];
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

  async function searchChats() {
    const box = document.createElement("div");
    box.innerHTML = '<div class="acus-status">Loading full chat history...</div><input class="acus-input" placeholder="Search chat titles..." disabled><div class="acus-results"></div>';
    const input = box.querySelector("input");
    const results = box.querySelector(".acus-results");
    const status = box.querySelector(".acus-status");
    modal("Search Chats", box);

    let chats;
    if (cachedHistory) {
      chats = rememberChats(getChatLinks());
      status.textContent = `${chats.length} chats indexed`;
    } else {
      chats = await loadAllChats((count, loading) => {
        status.textContent = loading ? `Loading chat history (${count})...` : `${count} chats indexed`;
      });
      chats = rememberChats(chats);
    }

    input.disabled = false;

    const render = () => {
      const q = input.value.toLowerCase().trim();
      const matches = chats.filter(c => !q || c.title.toLowerCase().includes(q));
      results.innerHTML = "";

      const count = document.createElement("div");
      count.className = "acus-muted";
      count.textContent = `${matches.length} of ${chats.length} chats`;
      results.append(count);

      matches.forEach(c => {
        const a = document.createElement("a");
        a.className = "acus-row";
        a.href = c.url || c.href;
        a.textContent = c.title;
        results.append(a);
      });
    };

    input.oninput = render;
    render();
    input.focus();
  }

  function exportPrompts() {
    const prompts = loadPrompts();
    const payload = JSON.stringify({
      format: "ai-client-utility-suite-prompts",
      version: 1,
      exportedAt: new Date().toISOString(),
      prompts
    }, null, 2);

    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ai-client-utility-suite-prompts.json";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function importPrompts(onComplete) {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = ".json,application/json";

    picker.onchange = async () => {
      const file = picker.files?.[0];
      if (!file) return;

      try {
        const parsed = JSON.parse(await file.text());
        const imported = normalizePrompts(Array.isArray(parsed) ? parsed : parsed?.prompts);
        if (!imported.length) throw new Error("No valid prompts found");

        const merged = normalizePrompts([...loadPrompts(), ...imported]);
        savePrompts(merged);
        onComplete?.(`Imported ${imported.length} prompt${imported.length === 1 ? "" : "s"}.`);
      } catch {
        onComplete?.("Import failed. Select a valid prompt export file.", true);
      }
    };

    picker.click();
  }

  function promptLibrary() {
    const box = document.createElement("div");
    box.innerHTML = `
      <div class="acus-library-tools">
        <button class="acus-secondary acus-export">Export prompts</button>
        <button class="acus-secondary acus-import">Import prompts</button>
        <span class="acus-library-status"></span>
      </div>
      <div class="acus-prompt-form">
        <input class="acus-input acus-title" placeholder="Prompt name">
        <textarea class="acus-input acus-text" placeholder="Prompt text"></textarea>
        <button class="acus-primary acus-save">Save prompt</button>
      </div>
      <div class="acus-prompts"></div>`;

    const status = box.querySelector(".acus-library-status");
    const setStatus = (message, isError = false) => {
      status.textContent = message;
      status.className = isError ? "acus-library-status acus-error" : "acus-library-status";
    };

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
        actions.className = "acus-prompt-actions";

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

        const text = document.createElement("div");
        text.className = "acus-muted";
        text.textContent = p.text.length > 160 ? p.text.slice(0, 160) + "…" : p.text;

        row.append(name, actions, text);
        list.append(row);
      });
    };

    box.querySelector(".acus-save").onclick = () => {
      const name = box.querySelector(".acus-title").value.trim();
      const text = box.querySelector(".acus-text").value.trim();
      if (!name || !text) return;

      savePrompts([{ name, text }, ...loadPrompts()]);
      box.querySelector(".acus-title").value = "";
      box.querySelector(".acus-text").value = "";
      setStatus("Prompt saved.");
      render();
    };

    box.querySelector(".acus-export").onclick = () => {
      exportPrompts();
      setStatus("Prompt export downloaded.");
    };

    box.querySelector(".acus-import").onclick = () => {
      importPrompts((message, isError) => {
        setStatus(message, isError);
        if (!isError) render();
      });
    };

    render();
    modal("Prompt Library", box);
  }

  function archiveInfo() {
    const box = document.createElement("div");
    box.innerHTML = '<div class="acus-muted">Bulk Archive is planned with a review-first workflow so chats are not archived without explicit selection.</div>';
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
      .acus-head button,.acus-prompt button,.acus-menu-btn,.acus-library-tools button{background:#2b2b2b;color:#fff;border:1px solid #444;border-radius:10px;padding:8px 11px;cursor:pointer}
      .acus-close{font-size:20px}.acus-body{padding:16px}.acus-menu{display:grid;gap:10px}.acus-menu-btn{text-align:left;padding:14px}
      .acus-input{box-sizing:border-box;width:100%;background:#222;color:#fff;border:1px solid #444;border-radius:10px;padding:10px;margin-bottom:10px}
      .acus-input:disabled{opacity:.55;cursor:wait}
      textarea.acus-input{min-height:110px;resize:vertical}.acus-results{display:grid;gap:5px}.acus-row{color:#eee;text-decoration:none;padding:9px;border-radius:9px}.acus-row:hover{background:#2b2b2b}
      .acus-status{margin-bottom:10px;color:#bbb}.acus-muted{color:#aaa;margin:8px 0}.acus-prompt-form{margin-bottom:18px}.acus-primary{margin-bottom:8px}
      .acus-prompt{border-top:1px solid #333;padding:14px 0}.acus-prompt strong{display:block;margin-bottom:9px}.acus-prompt-actions{display:flex;gap:7px;margin-bottom:9px}
      .acus-library-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:16px}.acus-library-status{color:#aaa}.acus-error{color:#ff8585}
    `;
    document.head.append(style);

    const btn = document.createElement("button");
    btn.id = APP_ID + "-launcher";
    btn.textContent = "🧰 AI Tools";
    btn.onclick = openMenu;
    ensureLauncherDock().append(btn);
  }

  loadPrompts();
  inject();
  new MutationObserver(inject).observe(document.documentElement, { childList: true, subtree: true });
})();