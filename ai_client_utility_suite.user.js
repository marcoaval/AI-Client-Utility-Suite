// ==UserScript==
// @name         AI Client Utility Suite
// @namespace    https://github.com/marcoaval/AI-Client-Utility-Suite
// @version      0.3.0
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

  function forgetChat(href) {
    cachedHistory?.delete(href);
  }

  function findChatLink(href) {
    return chatLinkElements().find(link => (link.getAttribute("href") || "") === href) || null;
  }

  function visible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function elementText(element) {
    return `${element?.textContent || ""} ${element?.getAttribute?.("aria-label") || ""} ${element?.getAttribute?.("title") || ""}`
      .trim()
      .toLowerCase();
  }

  function utilityContains(element) {
    return Boolean(document.getElementById(APP_ID + "-modal")?.contains(element));
  }

  function rowCandidates(link) {
    const candidates = [];
    let node = link;

    for (let depth = 0; node && depth < 9; depth++, node = node.parentElement) {
      candidates.push(node);
    }

    return candidates;
  }

  function getChatRow(link) {
    return rowCandidates(link).find(node => node.querySelector?.("button")) ||
      link.closest("li") ||
      link.closest('[role="listitem"]') ||
      link.closest("[data-testid]") ||
      link.parentElement;
  }

  function fireHover(element) {
    for (const type of ["pointerover", "mouseover", "mouseenter"]) {
      element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
    }
  }

  function menuButtonFromRow(row) {
    const buttons = [...row.querySelectorAll("button")].filter(visible);
    const labeled = buttons.find(button => /more|menu|option|action|conversation/.test(elementText(button)));
    if (labeled) return labeled;

    const symbol = buttons.find(button => /⋮|⋯|\.\.\./.test(button.textContent || ""));
    if (symbol) return symbol;

    const rowRect = row.getBoundingClientRect();
    const rightSide = buttons
      .map(button => ({ button, rect: button.getBoundingClientRect() }))
      .filter(item => item.rect.left >= rowRect.left + rowRect.width * 0.55)
      .sort((a, b) => b.rect.right - a.rect.right);

    return rightSide[0]?.button || buttons.at(-1) || null;
  }

  function globalMenuButtonNearRow(row) {
    const rowRect = row.getBoundingClientRect();
    const buttons = [...document.querySelectorAll("button")].filter(visible);

    return buttons.find(button => {
      const rect = button.getBoundingClientRect();
      const nearVertical = rect.top <= rowRect.bottom + 8 && rect.bottom >= rowRect.top - 8;
      const nearHorizontal = rect.left >= rowRect.left + rowRect.width * 0.55 && rect.right <= rowRect.right + 80;
      return nearVertical && nearHorizontal && /more|menu|option|action|conversation|⋮|⋯/.test(elementText(button));
    }) || null;
  }

  async function waitFor(getter, timeout = 2500, interval = 80) {
    const end = Date.now() + timeout;

    while (Date.now() < end) {
      const value = getter();
      if (value) return value;
      await sleep(interval);
    }

    return null;
  }

  function activate(element) {
    const rect = element.getBoundingClientRect();
    const options = {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    };

    try {
      element.dispatchEvent(new PointerEvent("pointerdown", options));
      element.dispatchEvent(new MouseEvent("mousedown", options));
      element.dispatchEvent(new PointerEvent("pointerup", { ...options, buttons: 0 }));
      element.dispatchEvent(new MouseEvent("mouseup", { ...options, buttons: 0 }));
    } catch {
      element.dispatchEvent(new MouseEvent("mousedown", options));
      element.dispatchEvent(new MouseEvent("mouseup", { ...options, buttons: 0 }));
    }

    element.click();
  }

  async function locateChatLink(href) {
    let link = findChatLink(href);
    if (link) return link;

    const containers = scrollContainersForChats();
    for (const container of containers) {
      const start = container.scrollTop;
      const step = Math.max(180, Math.floor(container.clientHeight * 0.72));

      container.scrollTop = 0;
      await sleep(120);

      let stableAtBottom = 0;
      while (stableAtBottom < 3) {
        link = findChatLink(href);
        if (link) return link;

        const max = Math.max(0, container.scrollHeight - container.clientHeight);
        const next = Math.min(container.scrollTop + step, max);
        container.scrollTop = next;
        await sleep(140);

        const currentMax = Math.max(0, container.scrollHeight - container.clientHeight);
        if (container.scrollTop >= currentMax - 4) stableAtBottom++;
        else stableAtBottom = 0;
      }

      container.scrollTop = start;
      await sleep(80);
    }

    return null;
  }

  async function openChatMenu(chat) {
    const link = await locateChatLink(chat.href);
    if (!link) throw new Error("Could not locate this chat in the sidebar.");

    const row = getChatRow(link);
    if (!row) throw new Error("Could not locate this chat row.");

    row.scrollIntoView({ block: "nearest" });
    fireHover(row);
    fireHover(link);
    await sleep(400);

    const menuButton = await waitFor(() => menuButtonFromRow(row) || globalMenuButtonNearRow(row), 3000, 80);
    if (!menuButton) throw new Error("Could not find the chat options button.");

    activate(menuButton);
    await sleep(300);
  }

  function actionableAncestor(element) {
    let node = element;

    for (let depth = 0; node && depth < 7; depth++, node = node.parentElement) {
      if (utilityContains(node)) return null;

      const role = (node.getAttribute?.("role") || "").toLowerCase();
      const tag = node.tagName;
      const slot = (node.getAttribute?.("data-slot") || "").toLowerCase();

      if (
        tag === "BUTTON" ||
        tag === "A" ||
        role === "menuitem" ||
        role === "option" ||
        role === "button" ||
        node.hasAttribute?.("tabindex") ||
        slot.includes("menu") ||
        slot.includes("dropdown")
      ) {
        return node;
      }
    }

    return element.parentElement || element;
  }

  function archiveActions(root = document.body) {
    const selectors = [
      "button",
      '[role="button"]',
      '[role="menuitem"]',
      '[role="option"]',
      '[data-testid*="archive"]',
      '[aria-label*="archive" i]'
    ].join(",");

    return [...root.querySelectorAll(selectors)]
      .filter(element => visible(element) && !utilityContains(element))
      .filter(element => /archive/.test(elementText(element)))
      .map(element => actionableAncestor(element))
      .filter(Boolean);
  }

  function menuArchiveAction() {
    const candidates = [...new Set(archiveActions())];

    return candidates.find(element =>
      element.closest('[role="menu"], [role="menuitem"], [data-radix-menu-content], [data-slot*="menu"], [data-slot*="dropdown"]')
    ) || candidates.find(element => !element.closest('[role="dialog"], [role="alertdialog"]')) || null;
  }

  function confirmationArchiveAction() {
    const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')]
      .filter(visible)
      .filter(dialog => !utilityContains(dialog));

    for (const dialog of dialogs) {
      const candidates = [...new Set(archiveActions(dialog))];
      const exact = candidates.find(element => elementText(element) === "archive");
      if (exact) return exact;
      if (candidates.length) return candidates.at(-1);
    }

    return null;
  }

  async function archiveChat(chat) {
    await openChatMenu(chat);

    const archiveAction = await waitFor(menuArchiveAction, 3000, 80);
    if (!archiveAction) throw new Error("The chat menu opened, but the Archive command was not found.");

    activate(archiveAction);
    await sleep(300);

    const confirmButton = await waitFor(confirmationArchiveAction, 900, 100);
    if (confirmButton) {
      activate(confirmButton);
    }

    const removed = await waitFor(() => !findChatLink(chat.href), 5000, 120);
    if (!removed) throw new Error("Archive was selected, but the chat remained visible in the sidebar.");

    forgetChat(chat.href);
    await sleep(200);
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

  async function bulkArchive() {
    const box = document.createElement("div");
    box.innerHTML = `
      <div class="acus-status">Loading full chat history...</div>
      <input class="acus-input acus-archive-search" placeholder="Filter chat titles..." disabled>
      <div class="acus-archive-toolbar">
        <button class="acus-secondary acus-select-visible" disabled>Select all visible</button>
        <button class="acus-secondary acus-deselect" disabled>Deselect all</button>
        <span class="acus-archive-count">0 selected</span>
      </div>
      <div class="acus-archive-list"></div>
      <div class="acus-archive-footer">
        <span class="acus-archive-progress">Nothing is archived until you confirm.</span>
        <button class="acus-archive-submit" disabled>Archive selected</button>
      </div>`;

    const status = box.querySelector(".acus-status");
    const search = box.querySelector(".acus-archive-search");
    const list = box.querySelector(".acus-archive-list");
    const selectVisible = box.querySelector(".acus-select-visible");
    const deselect = box.querySelector(".acus-deselect");
    const count = box.querySelector(".acus-archive-count");
    const progress = box.querySelector(".acus-archive-progress");
    const submit = box.querySelector(".acus-archive-submit");

    modal("Bulk Archive", box);

    let chats;
    if (cachedHistory) {
      chats = rememberChats(getChatLinks());
      status.textContent = `${chats.length} chats loaded`;
    } else {
      chats = await loadAllChats((loaded, loading) => {
        status.textContent = loading ? `Loading chat history (${loaded})...` : `${loaded} chats loaded`;
      });
      chats = rememberChats(chats);
    }

    const selected = new Set();

    const matchingChats = () => {
      const query = search.value.toLowerCase().trim();
      return chats.filter(chat => !query || chat.title.toLowerCase().includes(query));
    };

    const refreshControls = () => {
      count.textContent = `${selected.size} selected`;
      submit.disabled = selected.size === 0;
      submit.textContent = selected.size ? `Archive selected (${selected.size})` : "Archive selected";
    };

    const render = () => {
      list.replaceChildren();
      const matches = matchingChats();

      const summary = document.createElement("div");
      summary.className = "acus-muted";
      summary.textContent = `${matches.length} of ${chats.length} chats shown`;
      list.append(summary);

      for (const chat of matches) {
        const row = document.createElement("label");
        row.className = "acus-archive-row";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = selected.has(chat.href);
        checkbox.onchange = () => {
          if (checkbox.checked) selected.add(chat.href);
          else selected.delete(chat.href);
          row.classList.toggle("acus-selected", checkbox.checked);
          refreshControls();
        };

        const title = document.createElement("span");
        title.textContent = chat.title;

        row.classList.toggle("acus-selected", checkbox.checked);
        row.append(checkbox, title);
        list.append(row);
      }

      if (!matches.length) {
        const empty = document.createElement("div");
        empty.className = "acus-muted";
        empty.textContent = "No chats match this filter.";
        list.append(empty);
      }
    };

    search.disabled = false;
    selectVisible.disabled = false;
    deselect.disabled = false;

    search.oninput = render;
    selectVisible.onclick = () => {
      for (const chat of matchingChats()) selected.add(chat.href);
      render();
      refreshControls();
    };

    deselect.onclick = () => {
      selected.clear();
      render();
      refreshControls();
    };

    submit.onclick = async () => {
      const chosen = chats.filter(chat => selected.has(chat.href));
      if (!chosen.length) return;

      const confirmed = confirm(`Archive ${chosen.length} selected ${platform()} chat${chosen.length === 1 ? "" : "s"}?`);
      if (!confirmed) return;

      search.disabled = true;
      selectVisible.disabled = true;
      deselect.disabled = true;
      submit.disabled = true;

      let archived = 0;
      let failed = 0;
      let lastError = "";

      for (const chat of chosen) {
        progress.textContent = `Archiving ${archived + failed + 1} of ${chosen.length}: ${chat.title}`;

        try {
          await archiveChat(chat);
          archived++;
          selected.delete(chat.href);
        } catch (error) {
          failed++;
          lastError = error instanceof Error ? error.message : String(error);
          console.error("[AI Client Utility Suite]", chat.title, error);
        }
      }

      chats = cachedHistory ? [...cachedHistory.values()] : chats.filter(chat => !selected.has(chat.href));

      if (failed) {
        progress.textContent = `${archived} archived, ${failed} failed. ${lastError}`;
        progress.classList.add("acus-error");
      } else {
        progress.textContent = `${archived} chat${archived === 1 ? "" : "s"} archived successfully.`;
        progress.classList.remove("acus-error");
      }

      search.disabled = false;
      selectVisible.disabled = false;
      deselect.disabled = false;
      render();
      refreshControls();

      for (const container of scrollContainersForChats()) {
        container.scrollTop = 0;
      }
    };

    render();
    refreshControls();
    search.focus();
  }

  function openMenu() {
    const box = document.createElement("div");
    box.className = "acus-menu";
    [["🔎 Search Chats", searchChats], ["📦 Bulk Archive", bulkArchive], ["📚 Prompt Library", promptLibrary]].forEach(([label, fn]) => {
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
      #${APP_ID}-launcher{display:inline-flex;align-items:center;gap:7px;min-height:38px;padding:8px 13px;border:1px solid rgba(128,128,128,.45);border-radius:999px;color:#f5f5f5;background:#181818;box-shadow:0 8px 30px rgba(0,0,0,.18);font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:12px;font-weight:750;letter-spacing:-.01em;cursor:pointer;pointer-events:auto;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease}
      #${APP_ID}-launcher:hover{transform:translateY(-1px);border-color:#666;box-shadow:0 10px 34px rgba(0,0,0,.24)}
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
      .acus-archive-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}.acus-archive-toolbar button,.acus-archive-submit{background:#2b2b2b;color:#fff;border:1px solid #444;border-radius:10px;padding:8px 11px;cursor:pointer}.acus-archive-toolbar button:disabled,.acus-archive-submit:disabled{opacity:.5;cursor:not-allowed}.acus-archive-count{color:#aaa;margin-left:auto}.acus-archive-list{max-height:430px;overflow:auto;border:1px solid #333;border-radius:12px;padding:8px}.acus-archive-row{display:flex;align-items:center;gap:10px;padding:10px;border-radius:9px;cursor:pointer}.acus-archive-row:hover,.acus-archive-row.acus-selected{background:#2b2b2b}.acus-archive-row input{flex:0 0 auto}.acus-archive-row span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.acus-archive-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px}.acus-archive-progress{color:#aaa;min-width:0}
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