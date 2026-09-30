// ==UserScript==
// @name         AI Client Utility Suite
// @namespace    https://github.com/marcoaval/AI-Client-Utility-Suite
// @version      0.4.1
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
  const CLEANER_FILTER_KEY = "aiClientUtilitySuite.cleanerFilters";
  const DEFAULT_CLEANER_FILTERS = {
    suggested: [
      "health", "medical", "doctor", "symptom", "injury",
      "relationship", "dating", "family", "personal",
      "pet", "housing", "apartment", "address",
      "job", "work", "membership", "finance",
      "travel", "shopping", "appointment"
    ],
    protected: [
      "class", "course", "syllabus", "assignment", "discussion", "lab",
      "school", "college", "university", "excel", "github",
      "python", "powershell", "bash", "coding", "programming",
      "cybersecurity", "project", "resume", "study"
    ]
  };
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

  function cleanFilterList(values) {
    if (!Array.isArray(values)) return [];
    return [...new Set(values.map(value => String(value || "").trim().toLowerCase()).filter(Boolean))];
  }

  function loadCleanerFilters() {
    try {
      const stored = GM_getValue(CLEANER_FILTER_KEY, "");
      if (!stored) {
        return {
          suggested: [...DEFAULT_CLEANER_FILTERS.suggested],
          protected: [...DEFAULT_CLEANER_FILTERS.protected]
        };
      }

      const parsed = typeof stored === "string" ? JSON.parse(stored) : stored;
      return {
        suggested: cleanFilterList(parsed?.suggested ?? DEFAULT_CLEANER_FILTERS.suggested),
        protected: cleanFilterList(parsed?.protected ?? DEFAULT_CLEANER_FILTERS.protected)
      };
    } catch {
      return {
        suggested: [...DEFAULT_CLEANER_FILTERS.suggested],
        protected: [...DEFAULT_CLEANER_FILTERS.protected]
      };
    }
  }

  function saveCleanerFilters(filters) {
    GM_setValue(CLEANER_FILTER_KEY, JSON.stringify({
      suggested: cleanFilterList(filters.suggested),
      protected: cleanFilterList(filters.protected)
    }));
  }

  function classifyForCleaner(chat, filters) {
    const title = chat.title.toLowerCase();
    const matches = filters.suggested.filter(keyword => title.includes(keyword));
    const protectedMatches = filters.protected.filter(keyword => title.includes(keyword));

    return {
      ...chat,
      matches,
      protectedMatches,
      suggested: matches.length > 0 && protectedMatches.length === 0,
      likelyPersonal: matches.length > 0 && protectedMatches.length === 0
    };
  }

  function defaultFilters() {
    return {
      suggested: [...DEFAULT_CLEANER_FILTERS.suggested],
      protected: [...DEFAULT_CLEANER_FILTERS.protected]
    };
  }

  function loadFilters() {
    return loadCleanerFilters();
  }

  let activeFilters = loadFilters();

  function saveFilters(filters) {
    activeFilters = {
      suggested: cleanFilterList(filters.suggested),
      protected: cleanFilterList(filters.protected)
    };
    saveCleanerFilters(activeFilters);
  }

  function uniqueChats() {
    return getChatLinks();
  }

  function classify(chat) {
    return classifyForCleaner(chat, activeFilters);
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

  function deleteActions(root = document.body) {
    const selectors = [
      "button",
      '[role="button"]',
      '[role="menuitem"]',
      '[role="option"]',
      '[data-testid*="delete"]',
      '[aria-label*="delete" i]'
    ].join(",");

    return [...root.querySelectorAll(selectors)]
      .filter(element => visible(element) && !utilityContains(element))
      .filter(element => /delete/.test(elementText(element)))
      .map(element => actionableAncestor(element))
      .filter(Boolean);
  }

  function menuDeleteAction() {
    const candidates = [...new Set(deleteActions())];

    return candidates.find(element =>
      element.closest('[role="menu"], [role="menuitem"], [data-radix-menu-content], [data-slot*="menu"], [data-slot*="dropdown"]')
    ) || candidates.find(element => !element.closest('[role="dialog"], [role="alertdialog"]')) || null;
  }

  function confirmationDeleteAction() {
    const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')]
      .filter(visible)
      .filter(dialog => !utilityContains(dialog));

    for (const dialog of dialogs) {
      const candidates = [...new Set(deleteActions(dialog))];
      const exact = candidates.find(element => elementText(element) === "delete");
      if (exact) return exact;
      if (candidates.length) return candidates.at(-1);
    }

    return null;
  }

  async function deleteChat(chat) {
    await openChatMenu(chat);

    const deleteAction = await waitFor(menuDeleteAction, 3000, 80);
    if (!deleteAction) throw new Error("The chat menu opened, but the Delete command was not found.");

    activate(deleteAction);

    const confirmButton = await waitFor(confirmationDeleteAction, 5000, 100);
    if (!confirmButton) throw new Error("The Delete command was found, but the confirmation control was not found.");

    activate(confirmButton);

    const removed = await waitFor(() => !findChatLink(chat.href), 5000, 120);
    if (!removed) throw new Error("Delete was confirmed, but the chat remained visible in the sidebar.");

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

  function detectDarkMode() {
    const background = getComputedStyle(document.body).backgroundColor;
    const values = background.match(/[\d.]+/g);

    if (values && values.length >= 3) {
      const [r, g, b] = values.slice(0, 3).map(Number);
      return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
    }

    return window.matchMedia?.('(prefers-color-scheme: dark)').matches || false;
  }

  function cleanerTheme() {
    const dark = detectDarkMode();

    return dark ? {
      panel: '#18181b',
      surface: '#222226',
      surfaceHover: '#29292e',
      border: '#34343a',
      borderStrong: '#45454d',
      text: '#f4f4f5',
      muted: '#a1a1aa',
      subtle: '#71717a',
      accent: '#93a4ff',
      accentSoft: 'rgba(147,164,255,.13)',
      accentBorder: 'rgba(147,164,255,.34)',
      danger: '#f87171',
      dangerHover: '#ef4444',
      dangerSoft: 'rgba(248,113,113,.12)',
      success: '#86efac',
      successSoft: 'rgba(134,239,172,.10)',
      shadow: '0 24px 80px rgba(0,0,0,.48)',
      overlay: 'rgba(8,8,10,.70)'
    } : {
      panel: '#ffffff',
      surface: '#f7f7f8',
      surfaceHover: '#f1f1f3',
      border: '#e4e4e7',
      borderStrong: '#d4d4d8',
      text: '#18181b',
      muted: '#71717a',
      subtle: '#a1a1aa',
      accent: '#5968d9',
      accentSoft: 'rgba(89,104,217,.08)',
      accentBorder: 'rgba(89,104,217,.24)',
      danger: '#dc2626',
      dangerHover: '#b91c1c',
      dangerSoft: 'rgba(220,38,38,.07)',
      success: '#15803d',
      successSoft: 'rgba(21,128,61,.07)',
      shadow: '0 24px 80px rgba(24,24,27,.18)',
      overlay: 'rgba(24,24,27,.48)'
    };
  }

  function makeOverlay(chats) {
    document.getElementById('vanick-cleaner-overlay')?.remove();

    const current = platform();
    const theme = cleanerTheme();
    const overlay = document.createElement('div');
    overlay.id = 'vanick-cleaner-overlay';
    overlay.style.cssText = `
      --vc-panel:${theme.panel};
      --vc-surface:${theme.surface};
      --vc-surface-hover:${theme.surfaceHover};
      --vc-border:${theme.border};
      --vc-border-strong:${theme.borderStrong};
      --vc-text:${theme.text};
      --vc-muted:${theme.muted};
      --vc-subtle:${theme.subtle};
      --vc-accent:${theme.accent};
      --vc-accent-soft:${theme.accentSoft};
      --vc-accent-border:${theme.accentBorder};
      --vc-danger:${theme.danger};
      --vc-danger-hover:${theme.dangerHover};
      --vc-danger-soft:${theme.dangerSoft};
      --vc-success:${theme.success};
      --vc-success-soft:${theme.successSoft};
      position:fixed;
      inset:0;
      z-index:2147483647;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:24px;
      background:${theme.overlay};
      backdrop-filter:blur(8px);
      -webkit-backdrop-filter:blur(8px);
      font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    `;

    const style = document.createElement('style');
    style.textContent = `
      #vanick-cleaner-overlay *{box-sizing:border-box}
      #vanick-cleaner-overlay .vc-panel{width:min(860px,96vw);max-height:min(86vh,900px);display:flex;flex-direction:column;overflow:hidden;color:var(--vc-text);background:var(--vc-panel);border:1px solid var(--vc-border);border-radius:20px;box-shadow:${theme.shadow}}
      #vanick-cleaner-overlay .vc-header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:22px 24px 18px;border-bottom:1px solid var(--vc-border)}
      #vanick-cleaner-overlay .vc-brand{display:flex;align-items:flex-start;gap:13px;min-width:0}
      #vanick-cleaner-overlay .vc-icon{width:42px;height:42px;flex:0 0 auto;display:grid;place-items:center;border:1px solid var(--vc-accent-border);border-radius:12px;background:var(--vc-accent-soft);font-size:20px}
      #vanick-cleaner-overlay .vc-title-row{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:1px 0 4px}
      #vanick-cleaner-overlay .vc-title{font-size:20px;line-height:1.25;font-weight:750;letter-spacing:-.02em}
      #vanick-cleaner-overlay .vc-platform{display:inline-flex;align-items:center;height:22px;padding:0 8px;border:1px solid var(--vc-border);border-radius:999px;color:var(--vc-muted);background:var(--vc-surface);font-size:11px;font-weight:700;letter-spacing:.02em}
      #vanick-cleaner-overlay .vc-subtitle{max-width:650px;color:var(--vc-muted);font-size:12.5px;line-height:1.55}
      #vanick-cleaner-overlay .vc-icon-button{width:34px;height:34px;flex:0 0 auto;display:grid;place-items:center;border:1px solid transparent;border-radius:10px;color:var(--vc-muted);background:transparent;font-size:20px;line-height:1;cursor:pointer;transition:background .15s ease,border-color .15s ease,color .15s ease}
      #vanick-cleaner-overlay .vc-icon-button:hover{color:var(--vc-text);background:var(--vc-surface);border-color:var(--vc-border)}
      #vanick-cleaner-overlay .vc-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 24px;border-bottom:1px solid var(--vc-border);background:var(--vc-panel)}
      #vanick-cleaner-overlay .vc-summary{color:var(--vc-muted);font-size:12px;font-weight:650}
      #vanick-cleaner-overlay .vc-toolbar-actions{display:flex;gap:7px;flex-wrap:wrap}
      #vanick-cleaner-overlay .vc-list-wrap,#vanick-cleaner-overlay .vc-filter-manager,#vanick-cleaner-overlay .vc-selection-review{min-height:120px;overflow:auto;padding:14px 16px 16px;scrollbar-color:var(--vc-border-strong) transparent}
      #vanick-cleaner-overlay .vc-list{display:grid;gap:8px}
      #vanick-cleaner-overlay .vc-row{display:grid;grid-template-columns:24px minmax(0,1fr);gap:10px;align-items:start;padding:12px 13px;border:1px solid var(--vc-border);border-radius:12px;background:var(--vc-surface);cursor:pointer;transition:background .14s ease,border-color .14s ease,transform .14s ease}
      #vanick-cleaner-overlay .vc-row:hover{background:var(--vc-surface-hover);border-color:var(--vc-border-strong)}
      #vanick-cleaner-overlay .vc-row.vc-selected{border-color:var(--vc-accent-border);background:var(--vc-accent-soft)}
      #vanick-cleaner-overlay .vc-checkbox{width:17px;height:17px;margin:2px 0 0;accent-color:var(--vc-accent);cursor:pointer}
      #vanick-cleaner-overlay .vc-chat-head{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0}
      #vanick-cleaner-overlay .vc-chat-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--vc-text);font-size:13.5px;line-height:1.35;font-weight:680}
      #vanick-cleaner-overlay .vc-pill{flex:0 0 auto;display:inline-flex;align-items:center;height:21px;padding:0 7px;border-radius:999px;font-size:10.5px;line-height:1;font-weight:750}
      #vanick-cleaner-overlay .vc-pill-personal{color:var(--vc-accent);border:1px solid var(--vc-accent-border);background:var(--vc-accent-soft)}
      #vanick-cleaner-overlay .vc-pill-protected{color:var(--vc-success);border:1px solid color-mix(in srgb,var(--vc-success) 30%,transparent);background:var(--vc-success-soft)}
      #vanick-cleaner-overlay .vc-pill-review{color:var(--vc-muted);border:1px solid var(--vc-border);background:var(--vc-panel)}
      #vanick-cleaner-overlay .vc-detail{margin-top:4px;color:var(--vc-muted);font-size:11.5px;line-height:1.4}
      #vanick-cleaner-overlay .vc-empty{margin:18px 8px;padding:28px 18px;text-align:center;color:var(--vc-muted);border:1px dashed var(--vc-border-strong);border-radius:14px;background:var(--vc-surface);font-size:13px}
      #vanick-cleaner-overlay .vc-filter-manager{display:grid;gap:12px}
      #vanick-cleaner-overlay .vc-selection-review{display:grid;gap:10px}
      #vanick-cleaner-overlay .vc-selection-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:2px 2px 4px}
      #vanick-cleaner-overlay .vc-selection-title{color:var(--vc-text);font-size:14px;font-weight:750}
      #vanick-cleaner-overlay .vc-selection-text{margin-top:3px;color:var(--vc-muted);font-size:11.5px;line-height:1.5}
      #vanick-cleaner-overlay .vc-filter-intro{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:2px 2px 4px}
      #vanick-cleaner-overlay .vc-filter-intro-title{color:var(--vc-text);font-size:14px;font-weight:750}
      #vanick-cleaner-overlay .vc-filter-intro-text{margin-top:3px;max-width:610px;color:var(--vc-muted);font-size:11.5px;line-height:1.5}
      #vanick-cleaner-overlay .vc-filter-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      #vanick-cleaner-overlay .vc-filter-card{min-width:0;padding:14px;border:1px solid var(--vc-border);border-radius:14px;background:var(--vc-surface)}
      #vanick-cleaner-overlay .vc-filter-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px}
      #vanick-cleaner-overlay .vc-filter-card-title{color:var(--vc-text);font-size:13px;font-weight:750}
      #vanick-cleaner-overlay .vc-filter-count{color:var(--vc-muted);font-size:10.5px;font-weight:700}
      #vanick-cleaner-overlay .vc-filter-description{min-height:34px;margin-bottom:10px;color:var(--vc-muted);font-size:11px;line-height:1.5}
      #vanick-cleaner-overlay .vc-filter-input-row{display:flex;gap:7px;margin-bottom:10px}
      #vanick-cleaner-overlay .vc-input{min-width:0;flex:1 1 auto;height:34px;padding:7px 9px;border:1px solid var(--vc-border);border-radius:9px;outline:none;color:var(--vc-text);background:var(--vc-panel);font:inherit;font-size:11.5px}
      #vanick-cleaner-overlay .vc-input:focus{border-color:var(--vc-accent);box-shadow:0 0 0 3px var(--vc-accent-soft)}
      #vanick-cleaner-overlay .vc-chip-list{display:flex;flex-wrap:wrap;gap:6px;max-height:180px;overflow:auto}
      #vanick-cleaner-overlay .vc-chip{display:inline-flex;align-items:center;gap:5px;min-width:0;max-width:100%;padding:5px 7px 5px 8px;border:1px solid var(--vc-border);border-radius:999px;color:var(--vc-text);background:var(--vc-panel);font-size:10.5px;line-height:1}
      #vanick-cleaner-overlay .vc-chip-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #vanick-cleaner-overlay .vc-chip-remove{width:16px;height:16px;display:grid;place-items:center;flex:0 0 auto;padding:0;border:0;border-radius:999px;color:var(--vc-muted);background:transparent;cursor:pointer;font-size:13px;line-height:1}
      #vanick-cleaner-overlay .vc-chip-remove:hover{color:var(--vc-danger);background:var(--vc-danger-soft)}
      #vanick-cleaner-overlay .vc-footer{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:14px 20px 16px;border-top:1px solid var(--vc-border);background:var(--vc-panel)}
      #vanick-cleaner-overlay .vc-status{flex:1 1 300px;min-height:18px;color:var(--vc-muted);font-size:11.5px;line-height:1.45}
      #vanick-cleaner-overlay .vc-status[data-state="error"]{color:var(--vc-danger)}
      #vanick-cleaner-overlay .vc-status[data-state="success"]{color:var(--vc-success)}
      #vanick-cleaner-overlay .vc-footer-actions{display:flex;gap:8px;margin-left:auto}
      #vanick-cleaner-overlay .vc-button{min-height:34px;padding:7px 11px;border-radius:9px;border:1px solid var(--vc-border);color:var(--vc-text);background:var(--vc-surface);font:inherit;font-size:11.5px;line-height:1;font-weight:700;cursor:pointer;transition:background .15s ease,border-color .15s ease,transform .1s ease,opacity .15s ease}
      #vanick-cleaner-overlay .vc-button:hover:not(:disabled){background:var(--vc-surface-hover);border-color:var(--vc-border-strong)}
      #vanick-cleaner-overlay .vc-button:active:not(:disabled){transform:translateY(1px)}
      #vanick-cleaner-overlay .vc-button:disabled{opacity:.45;cursor:not-allowed}
      #vanick-cleaner-overlay .vc-button-danger{color:#fff;border-color:var(--vc-danger);background:var(--vc-danger)}
      #vanick-cleaner-overlay .vc-button-danger:hover:not(:disabled){border-color:var(--vc-danger-hover);background:var(--vc-danger-hover)}
      #vanick-cleaner-overlay .vc-button-accent{color:#fff;border-color:var(--vc-accent);background:var(--vc-accent)}
      @media (max-width:640px){#vanick-cleaner-overlay{padding:10px}#vanick-cleaner-overlay .vc-panel{max-height:92vh;border-radius:16px}#vanick-cleaner-overlay .vc-header{padding:18px 16px 14px}#vanick-cleaner-overlay .vc-toolbar{padding:10px 16px}#vanick-cleaner-overlay .vc-list-wrap,#vanick-cleaner-overlay .vc-filter-manager,#vanick-cleaner-overlay .vc-selection-review{padding:10px}#vanick-cleaner-overlay .vc-filter-grid{grid-template-columns:1fr}#vanick-cleaner-overlay .vc-footer{padding:12px}#vanick-cleaner-overlay .vc-chat-head{align-items:flex-start}#vanick-cleaner-overlay .vc-chat-title{white-space:normal}}
    `;
    overlay.appendChild(style);

    const panel = document.createElement('div');
    panel.className = 'vc-panel';

    const header = document.createElement('div');
    header.className = 'vc-header';

    const brand = document.createElement('div');
    brand.className = 'vc-brand';

    const icon = document.createElement('div');
    icon.className = 'vc-icon';
    icon.textContent = '🧹';

    const headingText = document.createElement('div');
    headingText.style.minWidth = '0';
    headingText.innerHTML = `
      <div class="vc-title-row"><div class="vc-title">Chat Cleaner</div><span class="vc-platform">${escapeHtml(current)}</span></div>
      <div class="vc-subtitle">Review conversations found across the full scrollable chat history before deleting. Suggested filters can be selected manually, while protected filters prevent automatic selection.</div>
    `;

    brand.append(icon, headingText);

    const closeIcon = document.createElement('button');
    closeIcon.type = 'button';
    closeIcon.className = 'vc-icon-button';
    closeIcon.setAttribute('aria-label', 'Close');
    closeIcon.textContent = '×';
    closeIcon.onclick = () => overlay.remove();

    header.append(brand, closeIcon);
    panel.appendChild(header);

    const toolbar = document.createElement('div');
    toolbar.className = 'vc-toolbar';

    const summary = document.createElement('div');
    summary.className = 'vc-summary';

    const toolbarActions = document.createElement('div');
    toolbarActions.className = 'vc-toolbar-actions';

    const listWrap = document.createElement('div');
    listWrap.className = 'vc-list-wrap';

    const list = document.createElement('div');
    list.className = 'vc-list';

    const filterManager = document.createElement('div');
    filterManager.className = 'vc-filter-manager';
    filterManager.hidden = true;

    const selectionReview = document.createElement('div');
    selectionReview.className = 'vc-selection-review';
    selectionReview.hidden = true;

    const rows = [];
    let remove = null;
    let footer = null;
    let filterMode = false;
    let selectionMode = false;

    function refreshSelection() {
      const selected = rows.filter(item => item.checkbox.checked).length;
      summary.textContent = filterMode ? `${activeFilters.suggested.length} suggested filters · ${activeFilters.protected.length} protected filters` : `${chats.length} loaded · ${selected} selected`;
      for (const item of rows) item.row.classList.toggle('vc-selected', item.checkbox.checked);
      if (remove) {
        remove.textContent = selected ? `Delete selected (${selected})` : 'Delete selected';
        remove.disabled = selected === 0;
      }
      if (reviewSelected && !selectionMode) {
        reviewSelected.textContent = selected ? `Review selected (${selected})` : 'Review selected';
        reviewSelected.disabled = selected === 0;
      }
    }

    for (const chat of chats) {
      const row = document.createElement('label');
      row.className = 'vc-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'vc-checkbox';
      checkbox.checked = false;
      checkbox.addEventListener('change', refreshSelection);

      const info = document.createElement('div');
      info.style.minWidth = '0';

      const detailParts = [];
      if (chat.matches.length) detailParts.push(`Matched: ${chat.matches.join(', ')}`);
      else detailParts.push('No suggested cleanup filter match');
      if (chat.protectedMatches.length) detailParts.push(`Protected: ${chat.protectedMatches.join(', ')}`);

      const statusClass = chat.protectedMatches.length ? 'vc-pill-protected' : chat.likelyPersonal ? 'vc-pill-personal' : 'vc-pill-review';
      const statusText = chat.protectedMatches.length ? 'Protected' : chat.likelyPersonal ? 'Suggested' : 'Review';

      info.innerHTML = `<div class="vc-chat-head"><div class="vc-chat-title">${escapeHtml(chat.title)}</div><span class="vc-pill ${statusClass}">${statusText}</span></div><div class="vc-detail">${escapeHtml(detailParts.join(' · '))}</div>`;

      row.append(checkbox, info);
      list.appendChild(row);
      rows.push({ chat, checkbox, row });
    }

    if (!chats.length) {
      const empty = document.createElement('div');
      empty.className = 'vc-empty';
      empty.textContent = 'No loaded chats were found. Open the sidebar and try again.';
      list.appendChild(empty);
    }

    listWrap.appendChild(list);

    const reviewSelected = button('Review selected', 'secondary');

    function renderSelectedReview() {
      selectionReview.replaceChildren();

      const head = document.createElement('div');
      head.className = 'vc-selection-head';
      head.innerHTML = '<div><div class="vc-selection-title">Selected chats</div><div class="vc-selection-text">Only chats currently selected for deletion are shown here. Uncheck anything you want to keep.</div></div>';
      selectionReview.appendChild(head);

      const selectedRows = rows.filter(item => item.checkbox.checked);
      if (!selectedRows.length) {
        const empty = document.createElement('div');
        empty.className = 'vc-empty';
        empty.textContent = 'No chats are selected.';
        selectionReview.appendChild(empty);
        return;
      }

      const selectedList = document.createElement('div');
      selectedList.className = 'vc-list';

      for (const item of selectedRows) {
        const row = document.createElement('label');
        row.className = 'vc-row vc-selected';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'vc-checkbox';
        checkbox.checked = true;
        checkbox.addEventListener('change', () => {
          item.checkbox.checked = checkbox.checked;
          refreshSelection();
          renderSelectedReview();
        });

        const info = document.createElement('div');
        info.style.minWidth = '0';
        info.innerHTML = `<div class="vc-chat-head"><div class="vc-chat-title">${escapeHtml(item.chat.title)}</div><span class="vc-pill vc-pill-personal">Selected</span></div>`;

        row.append(checkbox, info);
        selectedList.appendChild(row);
      }

      selectionReview.appendChild(selectedList);
    }

    function showChatList() {
      filterMode = false;
      selectionMode = false;
      filterManager.hidden = true;
      selectionReview.hidden = true;
      listWrap.hidden = false;
      if (footer) footer.hidden = false;
      selectSuggested.hidden = false;
      selectAll.hidden = false;
      deselectAll.hidden = false;
      reviewSelected.hidden = false;
      manageFilters.textContent = 'Manage filters';
      refreshSelection();
    }

    function showSelectedReview() {
      filterMode = false;
      selectionMode = true;
      filterManager.hidden = true;
      listWrap.hidden = true;
      selectionReview.hidden = false;
      if (footer) footer.hidden = false;
      selectSuggested.hidden = true;
      selectAll.hidden = true;
      deselectAll.hidden = true;
      manageFilters.hidden = true;
      reviewSelected.hidden = false;
      reviewSelected.textContent = 'Back to chats';
      reviewSelected.disabled = false;
      renderSelectedReview();
      refreshSelection();
    }

    reviewSelected.onclick = () => {
      if (selectionMode) {
        manageFilters.hidden = false;
        showChatList();
      } else {
        showSelectedReview();
      }
    };

    const selectSuggested = button('Select suggested chats', 'secondary');
    selectSuggested.onclick = () => {
      rows.forEach(item => { item.checkbox.checked = item.chat.likelyPersonal; });
      refreshSelection();
      if (rows.some(item => item.checkbox.checked)) showSelectedReview();
    };

    const selectAll = button('Select all', 'secondary');
    selectAll.onclick = () => {
      rows.forEach(item => { item.checkbox.checked = true; });
      refreshSelection();
    };

    const deselectAll = button('Deselect all', 'secondary');
    deselectAll.onclick = () => {
      rows.forEach(item => { item.checkbox.checked = false; });
      refreshSelection();
    };

    const manageFilters = button('Manage filters', 'secondary');

    function renderFilterManager() {
      filterManager.replaceChildren();

      const intro = document.createElement('div');
      intro.className = 'vc-filter-intro';

      const introText = document.createElement('div');
      introText.innerHTML = `<div class="vc-filter-intro-title">Manage title filters</div><div class="vc-filter-intro-text">Add words or phrases without editing the script. Suggested filters preselect matching chats. Protected filters keep matching chats from being preselected.</div>`;

      const reset = button('Reset defaults', 'secondary');
      reset.onclick = () => {
        saveFilters(defaultFilters());
        renderFilterManager();
        refreshSelection();
      };

      intro.append(introText, reset);
      filterManager.appendChild(intro);

      const grid = document.createElement('div');
      grid.className = 'vc-filter-grid';

      function filterCard(type, title, description, placeholder) {
        const card = document.createElement('div');
        card.className = 'vc-filter-card';

        const head = document.createElement('div');
        head.className = 'vc-filter-card-head';
        head.innerHTML = `<div class="vc-filter-card-title">${escapeHtml(title)}</div><div class="vc-filter-count">${activeFilters[type].length}</div>`;

        const descriptionElement = document.createElement('div');
        descriptionElement.className = 'vc-filter-description';
        descriptionElement.textContent = description;

        const inputRow = document.createElement('div');
        inputRow.className = 'vc-filter-input-row';

        const input = document.createElement('input');
        input.className = 'vc-input';
        input.type = 'text';
        input.placeholder = placeholder;
        input.autocomplete = 'off';

        const add = button('Add', 'accent');

        function addValue() {
          const value = normalize(input.value);
          if (!value || activeFilters[type].includes(value)) {
            input.value = '';
            return;
          }
          saveFilters({ ...activeFilters, [type]: [...activeFilters[type], value] });
          renderFilterManager();
          refreshSelection();
        }

        add.onclick = addValue;
        input.addEventListener('keydown', event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            addValue();
          }
        });

        inputRow.append(input, add);

        const chips = document.createElement('div');
        chips.className = 'vc-chip-list';

        for (const value of activeFilters[type]) {
          const chip = document.createElement('div');
          chip.className = 'vc-chip';

          const text = document.createElement('span');
          text.className = 'vc-chip-text';
          text.textContent = value;
          text.title = value;

          const removeChip = document.createElement('button');
          removeChip.type = 'button';
          removeChip.className = 'vc-chip-remove';
          removeChip.setAttribute('aria-label', `Remove ${value}`);
          removeChip.textContent = '×';
          removeChip.onclick = () => {
            saveFilters({ ...activeFilters, [type]: activeFilters[type].filter(item => item !== value) });
            renderFilterManager();
            refreshSelection();
          };

          chip.append(text, removeChip);
          chips.appendChild(chip);
        }

        card.append(head, descriptionElement, inputRow, chips);
        return card;
      }

      grid.append(
        filterCard('suggested', 'Suggested cleanup filters', 'Chats whose titles match these words or phrases are suggested and preselected unless a protected filter also matches.', 'Add a word or phrase'),
        filterCard('protected', 'Protected filters', 'Chats whose titles match these words or phrases stay unselected even when a suggested cleanup filter also matches.', 'Add a word or phrase')
      );

      filterManager.appendChild(grid);

      const doneRow = document.createElement('div');
      doneRow.style.cssText = 'display:flex;justify-content:flex-end;padding-top:2px;';
      const done = button('Done', 'accent');
      done.onclick = () => {
        const chatsToShow = cachedHistory ? rememberChats(uniqueChats()) : uniqueChats();
        makeOverlay(chatsToShow.map(classify));
      };
      doneRow.appendChild(done);
      filterManager.appendChild(doneRow);
    }

    manageFilters.onclick = () => {
      if (selectionMode) {
        manageFilters.hidden = false;
        showChatList();
        return;
      }

      filterMode = !filterMode;
      selectionMode = false;
      filterManager.hidden = !filterMode;
      selectionReview.hidden = true;
      listWrap.hidden = filterMode;
      if (footer) footer.hidden = filterMode;
      selectSuggested.hidden = filterMode;
      selectAll.hidden = filterMode;
      deselectAll.hidden = filterMode;
      reviewSelected.hidden = filterMode;
      manageFilters.textContent = filterMode ? 'Back to chats' : 'Manage filters';

      if (filterMode) renderFilterManager();
      else {
        const chatsToShow = cachedHistory ? rememberChats(uniqueChats()) : uniqueChats();
        makeOverlay(chatsToShow.map(classify));
      }

      refreshSelection();
    };

    toolbarActions.append(manageFilters, reviewSelected, selectSuggested, selectAll, deselectAll);
    toolbar.append(summary, toolbarActions);
    panel.append(toolbar, listWrap, filterManager, selectionReview);

    footer = document.createElement('div');
    footer.className = 'vc-footer';

    const status = document.createElement('div');
    status.className = 'vc-status';
    status.textContent = 'Nothing is deleted until you confirm.';

    const footerActions = document.createElement('div');
    footerActions.className = 'vc-footer-actions';

    const close = button('Cancel', 'secondary');
    close.onclick = () => overlay.remove();

    remove = button('Delete selected', 'danger');
    remove.onclick = async () => {
      const selected = rows.filter(item => item.checkbox.checked);
      if (!selected.length) {
        status.dataset.state = 'error';
        status.textContent = 'Nothing selected.';
        return;
      }

      const confirmed = confirm(`Delete ${selected.length} selected ${current} chat(s)?\n\nThis cannot be undone.`);
      if (!confirmed) return;

      const controls = [remove, close, manageFilters, reviewSelected, selectSuggested, selectAll, deselectAll];
      for (const control of controls) control.disabled = true;

      let deleted = 0;
      let failed = 0;
      let lastError = '';

      status.dataset.state = '';
      for (const item of selected) {
        status.textContent = `Deleting ${deleted + failed + 1} of ${selected.length} · ${item.chat.title}`;
        try {
          await deleteChat(item.chat);
          forgetChat(item.chat.href);
          deleted++;
          item.row.style.opacity = '.38';
          item.checkbox.checked = false;
        } catch (error) {
          failed++;
          lastError = error instanceof Error ? error.message : String(error);
          item.row.style.borderColor = 'var(--vc-danger)';
          console.error('[Chat Cleaner]', item.chat.title, error);
        }
      }

      if (failed) {
        status.dataset.state = 'error';
        status.textContent = `${deleted} deleted · ${failed} failed · ${lastError}`;
      } else {
        status.dataset.state = 'success';
        status.textContent = `${deleted} chat${deleted === 1 ? '' : 's'} deleted successfully.`;
      }

      for (const control of controls) control.disabled = false;
      refreshSelection();
    };

    footerActions.append(close, remove);
    footer.append(status, footerActions);
    panel.appendChild(footer);

    overlay.appendChild(panel);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
    refreshSelection();
  }

  function button(text, variant = 'secondary') {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = text;
    element.className = `vc-button${variant === 'danger' ? ' vc-button-danger' : variant === 'accent' ? ' vc-button-accent' : ''}`;
    return element;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }


  async function chatCleaner() {
    activeFilters = loadFilters();
    document.getElementById(APP_ID + "-modal")?.remove();

    let chats;
    if (cachedHistory) {
      chats = rememberChats(getChatLinks());
    } else {
      const loading = document.createElement("div");
      loading.innerHTML = '<div class="acus-status">Loading full chat history...</div>';
      modal("Chat Cleaner", loading);
      const status = loading.querySelector(".acus-status");

      chats = await loadAllChats((count, isLoading) => {
        status.textContent = isLoading ? `Loading chat history (${count})...` : `${count} chats loaded`;
      });

      chats = rememberChats(chats);
      document.getElementById(APP_ID + "-modal")?.remove();
    }

    makeOverlay(chats.map(classify));
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
    [["🔎 Search Chats", searchChats], ["📦 Bulk Archive", bulkArchive], ["🧹 Chat Cleaner", chatCleaner], ["📚 Prompt Library", promptLibrary]].forEach(([label, fn]) => {
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