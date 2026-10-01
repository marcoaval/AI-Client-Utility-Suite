// ==UserScript==
// @name         AI Client Utility Suite
// @namespace    https://github.com/marcoaval/AI-Client-Utility-Suite
// @version      2.1.2
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
  const CHAT_CACHE_KEY = "aiClientUtilitySuite.chatCache";
  const CHAT_SORT_KEY = "aiClientUtilitySuite.chatSort";
  const SETTINGS_KEY = "aiClientUtilitySuite.settings";
  const LOCKS_KEY = "aiClientUtilitySuite.lockedChats";
  const SCAN_KEY = "aiClientUtilitySuite.historyScan";
  const BOOKMARK_KEY = 'aiClientUtilitySuite.bookmarks';
  const VIEW_KEY = 'aiClientUtilitySuite.cleanerViews';
  const EXPORT_KEY = 'aiClientUtilitySuite.exportDraft';
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
  let libraryView = { query: '', folder: '', favorites: false };
  let menuGroup = 'Chats';
  let paletteQuery = '';
  let exportRunning = false;
  let exportStopped = false;

  const platform = () => location.hostname.includes("claude.ai") ? "Claude" : "ChatGPT";

  function readStored(key, fallback) {
    try {
      const value = GM_getValue(key, fallback);
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch { return fallback; }
  }

  function normalizeSettings(value) {
    return {
      theme: ['auto', 'light', 'dark'].includes(value?.theme) ? value.theme : 'auto',
      textSize: ['standard', 'large'].includes(value?.textSize) ? value.textSize : 'standard',
      sort: value?.sort === 'oldest' ? 'oldest' : 'newest',
      cleanerView: ['all', 'unprotected', 'suggested'].includes(value?.cleanerView) ? value.cleanerView : 'all',
      shortcutEnabled: value?.shortcutEnabled !== false
    };
  }

  function loadSettings() {
    return normalizeSettings(readStored(SETTINGS_KEY, { sort: GM_getValue(CHAT_SORT_KEY, 'newest') }));
  }

  function lockedChats() {
    const saved = readStored(`${LOCKS_KEY}.${platform().toLowerCase()}`, []);
    return new Set(Array.isArray(saved) ? saved.filter(value => typeof value === 'string') : []);
  }

  function isChatLocked(chat) { return lockedChats().has(chat.href); }

  function setChatLocked(chat, locked) {
    const saved = lockedChats();
    if (locked) saved.add(chat.href);
    else saved.delete(chat.href);
    GM_setValue(`${LOCKS_KEY}.${platform().toLowerCase()}`, JSON.stringify([...saved]));
  }

  function historyCoverage(count) {
    const scan = readStored(`${SCAN_KEY}.${platform().toLowerCase()}`, null);
    const date = scan?.at && new Date(scan.at);
    const stamp = date && Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Not refreshed yet';
    return `${count} indexed chats · Last sidebar scan: ${stamp}.${scan && !scan.reachedEnd ? ' Sidebar scan may be incomplete.' : ''} Only chats found in the sidebar are included.`;
  }

  function recordHistoryScan(count, reachedEnd) {
    GM_setValue(`${SCAN_KEY}.${platform().toLowerCase()}`, JSON.stringify({ at: Date.now(), count, reachedEnd }));
  }

  function cacheStorageKey() {
    return `${CHAT_CACHE_KEY}.${platform().toLowerCase()}`;
  }

  function loadPersistentChatCache() {
    try {
      const raw = GM_getValue(cacheStorageKey(), "");
      if (!raw) return null;

      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!Array.isArray(parsed?.chats)) return null;

      return new Map(parsed.chats.map(chat => [chat.href, chat]));
    } catch {
      return null;
    }
  }

  function savePersistentChatCache() {
    if (!cachedHistory) return;
    GM_setValue(cacheStorageKey(), JSON.stringify({
      savedAt: Date.now(),
      chats: [...cachedHistory.values()]
    }));
  }

  function clearPersistentChatCache() {
    cachedHistory = null;
    GM_setValue(cacheStorageKey(), "");
  }

  function normalizePrompts(values) {
    if (!Array.isArray(values)) return [];
    const seen = new Set();
    const prompts = [];
    const ids = new Set();

    for (const value of values) {
      const name = String(value?.name || "").trim();
      const text = String(value?.text || "").trim();
      if (!name || !text) continue;

      const key = `${name}\n${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const fields = templateFields(text);
      const defaults = Object.fromEntries(fields.map(field => [field, typeof value?.defaults?.[field] === 'string' ? value.defaults[field] : '']));
      let id = typeof value?.id === 'string' && value.id ? value.id : promptId(key);
      if (ids.has(id)) id = promptId(key);
      while (ids.has(id)) id += '_';
      ids.add(id);
      const history = Array.isArray(value?.history) ? value.history.filter(item => typeof item?.name === 'string' && typeof item?.text === 'string' && Number.isFinite(item?.at)).slice(-50).map(item => ({
        name: item.name, text: item.text, defaults: Object.fromEntries(templateFields(item.text).map(field => [field, typeof item.defaults?.[field] === 'string' ? item.defaults[field] : ''])), at: item.at
      })) : [];
      prompts.push({ id, name, text, folder: String(value?.folder || '').trim(), favorite: value?.favorite === true, defaults, history });
    }

    return prompts;
  }

  function promptId(text) {
    let hash = 2166136261, other = 5381;
    for (const character of text) { hash = Math.imul(hash ^ character.codePointAt(0), 16777619); other = Math.imul(other, 33) ^ character.codePointAt(0); }
    return `prompt_${(hash >>> 0).toString(16)}_${(other >>> 0).toString(16)}`;
  }

  function promptSnapshot(prompt) { return { name: prompt.name, text: prompt.text, defaults: prompt.defaults || {} }; }

  function revisePrompt(previous, next, at = Date.now()) {
    if (!previous) return next;
    const changed = JSON.stringify(promptSnapshot(previous)) !== JSON.stringify(promptSnapshot(next));
    return { ...next, id: previous.id, history: changed ? [...(previous.history || []), { ...promptSnapshot(previous), at }].slice(-50) : previous.history || [] };
  }

  function clientKey(key) { return `${key}.${platform().toLowerCase()}`; }
  function validChatHref(href) { return typeof href === 'string' && /^\/(c|chat)\/[a-zA-Z0-9_-]+\/?$/.test(href); }
  function loadBookmarks() {
    const saved = readStored(clientKey(BOOKMARK_KEY), []);
    return Array.isArray(saved) ? saved.filter(item => validChatHref(item?.href) && typeof item?.title === 'string') : [];
  }
  function toggleBookmark(chat) {
    const saved = loadBookmarks();
    const found = saved.some(item => item.href === chat.href);
    GM_setValue(clientKey(BOOKMARK_KEY), JSON.stringify(found ? saved.filter(item => item.href !== chat.href) : [...saved, { href: chat.href, title: chat.title, at: Date.now() }]));
    return !found;
  }
  function normalizeView(value) {
    return { name: String(value?.name || '').trim(), query: String(value?.query || ''), view: ['all', 'selected', 'unprotected', 'suggested'].includes(value?.view) ? value.view : 'all', sort: value?.sort === 'oldest' ? 'oldest' : 'newest' };
  }
  function loadViews() {
    const values = readStored(clientKey(VIEW_KEY), []);
    return Array.isArray(values) ? values.map(normalizeView).filter(view => view.name) : [];
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

  function templateFields(text) {
    return [...new Set([...String(text).matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map(match => match[1].trim()).filter(Boolean))];
  }

  function fillTemplate(text, values) {
    return String(text).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, key) =>
      Object.hasOwn(values, key.trim()) ? String(values[key.trim()]) : match);
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
    return { ...classifyForCleaner(chat, activeFilters), locked: isChatLocked(chat) };
  }

  function chatLinkElements() {
    const selector = platform() === "Claude" ? 'a[href^="/chat/"]' : 'a[href^="/c/"]';
    return [...document.querySelectorAll(selector)];
  }

  function inferChatDateLabel(link, boundary = document.body) {
    const datePattern = /^(today|yesterday|previous 7 days|previous 30 days|last 7 days|last 30 days|this week|last week|january|february|march|april|may|june|july|august|september|october|november|december|\d{4}|[a-z]+ \d{4})$/i;

    let node = link;
    for (let depth = 0; node && node !== boundary && depth < 8; depth++, node = node.parentElement) {
      let sibling = node.previousElementSibling;
      let checked = 0;

      while (sibling && checked < 8) {
        const text = (sibling.textContent || "").replace(/\s+/g, " ").trim();
        if (text && text.length <= 40 && datePattern.test(text)) return text;
        sibling = sibling.previousElementSibling;
        checked++;
      }

      const parent = node.parentElement;
      if (parent) {
        for (const child of [...parent.children].slice(0, 8)) {
          if (child === node) break;
          const text = (child.textContent || "").replace(/\s+/g, " ").trim();
          if (text && text.length <= 40 && datePattern.test(text)) return text;
        }
      }
    }

    return "Unknown date";
  }

  function getChatLinks(root = document) {
    const seen = new Set();
    const chats = [];

    const selector = platform() === "Claude" ? 'a[href^="/chat/"]' : 'a[href^="/c/"]';
    for (const link of root.querySelectorAll(selector)) {
      if (link.closest('[role="dialog"], .acus-backdrop, #vanick-cleaner-overlay')) continue;
      const href = link.getAttribute("href") || "";
      if (!href || seen.has(href)) continue;

      const titleNode = link.querySelector('[data-testid="conversation-title"], h3, h4');
      const title = (
        titleNode?.textContent ||
        link.getAttribute("aria-label") ||
        link.getAttribute("title") ||
        link.innerText ||
        link.textContent ||
        "Untitled chat"
      ).replace(/\s+/g, " ").trim();

      if (!title) continue;
      seen.add(href);
      const boundary = root === document ? document.body : root;
      const parentRow = link.parentElement;
      const row = link.closest('[role="option"], li') ||
        (parentRow && parentRow !== boundary && parentRow.querySelectorAll(selector).length === 1 ? parentRow : link);
      const time = row.querySelector('time[datetime]');
      const exactDay = parseExposedDate(time?.getAttribute('datetime'));
      const dateLabel = exactDay ? localDateKey(exactDay) : inferChatDateLabel(link, boundary);
      const range = exactDay ? { start: exactDay, end: exactDay } : parseSidebarDateRange(dateLabel);
      chats.push({ href, url: link.href, title, dateLabel,
        ...(range ? { dateStart: localDateKey(range.start), dateEnd: localDateKey(range.end) } : {})
      });
    }

    return chats;
  }

  function mergeChats(target, chats) {
    for (const chat of chats) {
      const existing = target.get(chat.href);
      if (!existing) {
        target.set(chat.href, chat);
        continue;
      }

      target.set(chat.href, {
        ...existing,
        ...chat,
        // A coarse or unknown sidebar group must not replace an exact date.
        dateLabel: chat.dateLabel && chat.dateLabel !== "Unknown date"
          ? chat.dateLabel
          : (existing.dateLabel || "Unknown date"),
        ...(existing.dateStart && existing.dateStart === existing.dateEnd && chat.dateStart !== chat.dateEnd
          ? { dateStart: existing.dateStart, dateEnd: existing.dateEnd, dateLabel: existing.dateLabel } : {})
      });
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

    let containers = scrollContainersForChats();
    if (!containers.length) {
      recordHistoryScan(collected.size, false);
      onProgress?.(collected.size, false);
      return [...collected.values()];
    }

    for (const container of containers) {
      container.scrollTop = 0;
      container.dispatchEvent(new Event("scroll", { bubbles: true }));
    }

    await sleep(180);
    collected.clear();
    mergeChats(collected, getChatLinks());

    let stablePasses = 0;
    let lastCount = collected.size;
    let lastHeight = 0;
    let safety = 0;

    while (stablePasses < 10 && safety < 500) {
      safety++;
      containers = scrollContainersForChats();
      const container = containers[0];
      if (!container) break;

      const max = Math.max(0, container.scrollHeight - container.clientHeight);
      const step = Math.max(220, Math.floor(container.clientHeight * 0.72));
      const next = Math.min(container.scrollTop + step, max);

      container.scrollTop = next;
      container.dispatchEvent(new Event("scroll", { bubbles: true }));
      await sleep(250);

      mergeChats(collected, getChatLinks());
      onProgress?.(collected.size, true);

      const refreshedContainers = scrollContainersForChats();
      const refreshed = refreshedContainers[0] || container;
      const refreshedMax = Math.max(0, refreshed.scrollHeight - refreshed.clientHeight);
      const atBottom = refreshed.scrollTop >= refreshedMax - 6;
      const height = refreshed.scrollHeight;
      const grew = collected.size > lastCount || height > lastHeight + 4;

      if (atBottom) {
        refreshed.scrollTop = refreshedMax;
        refreshed.dispatchEvent(new Event("scroll", { bubbles: true }));
        await sleep(420);
        mergeChats(collected, getChatLinks());

        const afterWaitContainers = scrollContainersForChats();
        const afterWait = afterWaitContainers[0] || refreshed;
        const afterHeight = afterWait.scrollHeight;
        const afterMax = Math.max(0, afterHeight - afterWait.clientHeight);
        const grewAfterWait = collected.size > lastCount || afterHeight > height + 4;

        if (grew || grewAfterWait) {
          stablePasses = 0;
        } else if (afterWait.scrollTop >= afterMax - 6) {
          stablePasses++;
        } else {
          stablePasses = 0;
        }

        lastHeight = afterHeight;
      } else {
        stablePasses = 0;
        lastHeight = height;
      }

      lastCount = collected.size;
    }

    for (const container of scrollContainersForChats()) {
      container.scrollTop = 0;
      container.dispatchEvent(new Event("scroll", { bubbles: true }));
    }

    await sleep(150);
    mergeChats(collected, getChatLinks());
    onProgress?.(collected.size, false);
    recordHistoryScan(collected.size, stablePasses >= 10);
    return [...collected.values()];
  }

  function rememberChats(chats) {
    if (!cachedHistory) cachedHistory = new Map();
    mergeChats(cachedHistory, chats);
    const ordered = new Map();
    for (const chat of chats) ordered.set(chat.href, cachedHistory.get(chat.href));
    for (const [href, chat] of cachedHistory) if (!ordered.has(href)) ordered.set(href, chat);
    cachedHistory = ordered;
    savePersistentChatCache();
    return [...cachedHistory.values()];
  }

  function forgetChat(href) {
    cachedHistory?.delete(href);
    savePersistentChatCache();
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
    return Boolean(document.getElementById(APP_ID + "-modal")?.contains(element) ||
      document.getElementById('vanick-cleaner-overlay')?.contains(element));
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
    if (isChatLocked(chat)) throw new Error('This chat is locked. Unlock it in Chat Cleaner first.');
    if (confirmationDeleteAction() || confirmationArchiveAction()) throw new Error('Close the existing chat confirmation before retrying.');
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
    if (isChatLocked(chat)) throw new Error('This chat is locked. Unlock it in Chat Cleaner first.');
    if (confirmationDeleteAction() || confirmationArchiveAction()) throw new Error('Close the existing chat confirmation before retrying.');
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

  function modal(title, body, onBack = openMenu, backLabel = 'Back to AI Tools') {
    document.getElementById(APP_ID + "-modal")?.remove();
    const wrap = document.createElement("div");
    wrap.id = APP_ID + "-modal";
    wrap.innerHTML = `
      <div class="acus-backdrop">
        <div class="acus-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
          <div class="acus-head"><button class="acus-back" aria-label="${escapeHtml(backLabel)}">←</button><strong>${escapeHtml(title)}</strong><button class="acus-close" aria-label="Close">×</button></div>
          <div class="acus-body"></div>
        </div>
      </div>`;
    wrap.querySelector(".acus-body").append(body);
    applyAppearance(wrap.querySelector('.acus-modal'));
    const back = wrap.querySelector('.acus-back');
    back.hidden = !onBack;
    back.onclick = () => { if (exportRunning) return; wrap.remove(); onBack?.(); };
    const dismiss = () => { if (exportRunning) return; wrap.remove(); document.getElementById(APP_ID + '-launcher')?.focus(); };
    wrap.querySelector(".acus-close").onclick = dismiss;
    wrap.querySelector(".acus-backdrop").onclick = e => { if (e.target === e.currentTarget) dismiss(); };
    document.body.append(wrap);
    wrap.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (exportRunning) return;
        wrap.remove();
        document.getElementById(APP_ID + '-launcher')?.focus();
      }
      if (event.key === 'Tab') {
        const controls = [...wrap.querySelectorAll('button,input,textarea,select,a[href]')].filter(element => !element.disabled && visible(element));
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    wrap.querySelector('button:not([hidden])')?.focus();
    return wrap;
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

    if (!box.isConnected) return;
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

  function exportPrompts(prompts = loadPrompts()) {
    const payload = JSON.stringify({
      format: "ai-client-utility-suite-prompts",
      version: 3,
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

  function promptLibrary(message = '') {
    const box = document.createElement('div');
    box.innerHTML = `
      <div class="acus-library-tools"><button class="acus-export">Export library</button><button class="acus-import">Import library</button><button class="acus-add acus-primary">New prompt</button></div>
      <p class="acus-muted">Save a prompt, or use {{field name}} to make a fillable template. Your library is shared across both clients.</p>
      <label class="acus-field">Search library<input class="acus-input acus-search" type="search" placeholder="Search names or prompt text"></label>
      <div class="acus-library-tools"><label class="acus-field">Folder<select class="acus-input acus-folder-filter"></select></label><label class="acus-check"><input class="acus-favorites" type="checkbox"> Favorites only</label></div>
      <p class="acus-library-status" role="status"></p><div class="acus-prompts"></div>`;
    const status = box.querySelector('.acus-library-status');
    const setStatus = (message, isError = false) => { status.textContent = message; status.classList.toggle('acus-error', isError); };
    const search = box.querySelector('.acus-search');
    const folderFilter = box.querySelector('.acus-folder-filter');
    const favorites = box.querySelector('.acus-favorites');
    search.value = libraryView.query;
    favorites.checked = libraryView.favorites;
    let initialFolder = libraryView.folder;
    const render = () => {
      const prompts = loadPrompts();
      const selectedFolder = initialFolder ?? folderFilter.value;
      initialFolder = null;
      folderFilter.replaceChildren();
      for (const folder of ['', ...new Set(prompts.map(p => p.folder).filter(Boolean))]) {
        const option = document.createElement('option'); option.value = folder; option.textContent = folder || 'All folders'; folderFilter.append(option);
      }
      folderFilter.value = selectedFolder;
      if (folderFilter.selectedIndex < 0) folderFilter.value = '';
      box.querySelector('.acus-export').textContent = folderFilter.value ? 'Export folder' : 'Export library';
      const list = box.querySelector('.acus-prompts');
      list.replaceChildren();
      const query = search.value.trim().toLowerCase();
      libraryView = { query: search.value, folder: folderFilter.value, favorites: favorites.checked };
      const matches = prompts.map((prompt, index) => ({ prompt, index })).filter(({ prompt: p }) =>
        (!query || `${p.name}\n${p.text}`.toLowerCase().includes(query)) && (!folderFilter.value || p.folder === folderFilter.value) && (!favorites.checked || p.favorite));
      matches.sort((a, b) => Number(b.prompt.favorite) - Number(a.prompt.favorite));
      if (!matches.length) {
        const empty = document.createElement('p'); empty.className = 'acus-muted';
        empty.textContent = prompts.length ? 'No prompts match. Change the folder or clear your search.' : 'Your library is empty. Choose New prompt to save your first one.';
        list.append(empty);
      }
      for (const { prompt: p, index } of matches) {
        const row = document.createElement('div'); row.className = 'acus-prompt';
        const name = document.createElement('strong'); name.textContent = p.name;
        const detail = document.createElement('p'); detail.className = 'acus-muted';
        const fields = templateFields(p.text);
        detail.textContent = `${p.folder || 'Unfiled'} · ${fields.length ? `${fields.length} template field${fields.length === 1 ? '' : 's'}` : 'Ready to copy'}`;
        const preview = document.createElement('p'); preview.className = 'acus-muted'; preview.textContent = p.text.length > 160 ? p.text.slice(0, 160) + '…' : p.text;
        const actions = document.createElement('div'); actions.className = 'acus-prompt-actions';
        const use = button(fields.length ? 'Fill template' : 'Copy prompt'); use.className = 'acus-primary';
        use.onclick = () => fields.length ? promptTemplate(p, index, () => promptLibrary()) : copyText(p.text, setStatus);
        const favorite = button(p.favorite ? '★ Favorited' : '☆ Favorite');
        favorite.setAttribute('aria-pressed', String(p.favorite));
        favorite.onclick = () => { const next = loadPrompts(); next[index].favorite = !next[index].favorite; savePrompts(next); render(); };
        const edit = button('Edit'); edit.onclick = () => promptEditor(p, index);
        const history = button(`History (${p.history.length})`); history.disabled = !p.history.length;
        history.onclick = () => promptHistory(p.id);
        const del = button('Delete');
        del.onclick = () => {
          if (!confirm(`Delete the saved prompt "${p.name}"?`)) return;
          const next = loadPrompts(); next.splice(index, 1); savePrompts(next); render(); setStatus('Prompt deleted.');
        };
        actions.append(use, favorite, edit, history, del);
        row.append(name, detail, preview, actions); list.append(row);
      }
    };
    search.oninput = render; folderFilter.onchange = render; favorites.onchange = render;
    box.querySelector('.acus-add').onclick = () => promptEditor();
    box.querySelector('.acus-export').onclick = () => {
      exportPrompts(loadPrompts().filter(p => !folderFilter.value || p.folder === folderFilter.value));
      setStatus(folderFilter.value ? 'Folder pack downloaded, including template defaults.' : 'Library export downloaded, including folders, favorites, and template defaults.');
    };
    box.querySelector('.acus-import').onclick = () => importPrompts((message, isError) => { setStatus(message, isError); if (!isError) render(); });
    render(); setStatus(typeof message === 'string' ? message : ''); modal('Prompt Library', box);
  }

  async function copyText(text, setStatus) {
    try { await navigator.clipboard.writeText(text); setStatus('Copied to clipboard.'); }
    catch { setStatus('Copy failed. Select and copy the preview text manually.', true); }
  }

  function promptEditor(prompt = { name: '', text: '', folder: '', favorite: false, defaults: {} }, index = null) {
    const box = document.createElement('div');
    box.innerHTML = `<p class="acus-muted">Use {{topic}} or another field name wherever you want a fillable value. Repeated fields use the same value.</p>
      <label class="acus-field">Prompt name<input class="acus-input acus-title" required></label>
      <label class="acus-field">Folder<input class="acus-input acus-folder" placeholder="Optional, for example Work" list="acus-folders"></label><datalist id="acus-folders"></datalist>
      <label class="acus-field">Prompt text<textarea class="acus-input acus-text" required placeholder="Explain {{topic}} for someone at {{experience level}}."></textarea></label>
      <label class="acus-check"><input class="acus-favorite" type="checkbox"> Add to favorites</label>
      <p class="acus-muted acus-field-count"></p><div class="acus-prompt-actions"><button class="acus-save acus-primary">Save prompt</button><button class="acus-preview">Preview template</button><button class="acus-coach">Improve wording</button></div><p class="acus-library-status" role="status"></p>`;
    const name = box.querySelector('.acus-title'), text = box.querySelector('.acus-text'), folder = box.querySelector('.acus-folder'), favorite = box.querySelector('.acus-favorite');
    name.value = prompt.name; text.value = prompt.text; folder.value = prompt.folder || ''; favorite.checked = prompt.favorite;
    for (const value of new Set(loadPrompts().map(p => p.folder).filter(Boolean))) { const option = document.createElement('option'); option.value = value; box.querySelector('datalist').append(option); }
    const status = box.querySelector('.acus-library-status');
    const draft = () => ({ ...prompt, name: name.value.trim(), text: text.value.trim(), folder: folder.value.trim(), favorite: favorite.checked });
    const update = () => { const count = templateFields(text.value).length; box.querySelector('.acus-field-count').textContent = count ? `${count} fillable field${count === 1 ? '' : 's'} detected. Values can span multiple lines.` : 'No template fields. This prompt will copy as written.'; };
    text.oninput = update; update();
    box.querySelector('.acus-save').onclick = () => {
      const value = draft();
      if (!value.name || !value.text) { status.textContent = 'Enter a name and prompt text before saving.'; (!value.name ? name : text).focus(); return; }
      const next = loadPrompts(); if (index === null) next.unshift(value); else next[index] = revisePrompt(next[index], value);
      savePrompts(next);
      libraryView = { query: '', folder: value.folder, favorites: false };
      promptLibrary('Prompt saved.');
    };
    box.querySelector('.acus-preview').onclick = () => {
      const value = draft();
      if (!value.text) { status.textContent = 'Enter prompt text to preview.'; text.focus(); return; }
      promptTemplate(value, null, () => { modal(index === null ? 'New prompt' : 'Edit prompt', box, promptLibrary, 'Back to Prompt Library'); });
    };
    box.querySelector('.acus-coach').onclick = () => promptCoach(text.value, revised => {
      text.value = revised; update();
      modal(index === null ? 'New prompt' : 'Edit prompt', box, promptLibrary, 'Back to Prompt Library');
    }, () => modal(index === null ? 'New prompt' : 'Edit prompt', box, promptLibrary, 'Back to Prompt Library'));
    modal(index === null ? 'New prompt' : 'Edit prompt', box, promptLibrary, 'Back to Prompt Library'); name.focus();
  }

  function promptTemplate(prompt, index, onBack) {
    const box = document.createElement('div');
    const intro = document.createElement('p'); intro.className = 'acus-muted'; intro.textContent = 'Fill in the fields, check the finished prompt, then copy it into your chat.'; box.append(intro);
    const inputs = {};
    for (const key of templateFields(prompt.text)) {
      const label = document.createElement('label'); label.className = 'acus-field'; label.textContent = key;
      const input = document.createElement('textarea'); input.className = 'acus-input acus-template-value'; input.value = prompt.defaults?.[key] || ''; input.rows = 2;
      Object.defineProperty(inputs, key, { value: input, enumerable: true }); label.append(input); box.append(label);
    }
    const previewLabel = document.createElement('label'); previewLabel.className = 'acus-field'; previewLabel.textContent = 'Finished prompt';
    const preview = document.createElement('textarea'); preview.className = 'acus-input'; preview.readOnly = true; previewLabel.append(preview); box.append(previewLabel);
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.className = 'acus-library-status';
    const actions = document.createElement('div'); actions.className = 'acus-prompt-actions';
    const copy = button('Copy finished prompt'); copy.className = 'acus-primary';
    const values = () => Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value]));
    const update = () => { preview.value = fillTemplate(prompt.text, values()); copy.disabled = Object.values(inputs).some(input => !input.value.trim()); status.textContent = copy.disabled ? 'Fill every field to copy the finished prompt.' : 'Ready to copy.'; };
    for (const input of Object.values(inputs)) input.oninput = update;
    copy.onclick = () => copyText(preview.value, (message, error) => { status.textContent = message; status.classList.toggle('acus-error', !!error); });
    actions.append(copy);
    if (index !== null) {
      const save = button('Save these values as defaults');
      save.onclick = () => { const next = loadPrompts(); next[index] = revisePrompt(next[index], { ...next[index], defaults: values() }); savePrompts(next); status.textContent = 'Default values saved for this template.'; };
      actions.append(save);
    }
    box.append(actions, status); update();
    modal(prompt.name || 'Template preview', box, onBack, 'Back to previous screen'); Object.values(inputs)[0]?.focus();
  }

  function promptHistory(id) {
    const prompt = loadPrompts().find(item => item.id === id);
    if (!prompt) return promptLibrary('Prompt no longer exists.');
    const box = document.createElement('div');
    box.innerHTML = '<p class="acus-muted">Compare earlier wording with the current prompt. Restoring also saves the current version. Up to 50 previous versions are kept.</p><label class="acus-field">Saved version<select class="acus-input"></select></label><div class="acus-compare"><label class="acus-field">Current prompt<textarea class="acus-input acus-current" readonly></textarea></label><label class="acus-field">Earlier prompt<textarea class="acus-input acus-earlier" readonly></textarea></label></div><p class="acus-muted acus-history-detail"></p><button class="acus-primary">Restore this version</button>';
    const select = box.querySelector('select');
    [...prompt.history].reverse().forEach((version, offset) => { const option = document.createElement('option'); option.value = String(prompt.history.length - offset - 1); option.textContent = `${new Date(version.at).toLocaleString()} · ${version.name}`; select.append(option); });
    box.querySelector('.acus-current').value = prompt.text;
    const render = () => {
      const version = prompt.history[Number(select.value)];
      box.querySelector('.acus-earlier').value = version?.text || '';
      box.querySelector('.acus-history-detail').textContent = version ? `Earlier name: ${version.name}. Template defaults are restored too; folders and favorites stay unchanged.` : 'No earlier versions.';
      box.querySelector('button').disabled = !version;
    };
    select.onchange = render;
    box.querySelector('button').onclick = () => {
      const previous = prompt.history[Number(select.value)];
      if (!previous || !confirm('Restore this prompt version? The current version will remain in history.')) return;
      const next = loadPrompts(), index = next.findIndex(item => item.id === id);
      if (index < 0) return promptLibrary('Prompt no longer exists.');
      next[index] = revisePrompt(next[index], { ...next[index], ...promptSnapshot(previous) });
      savePrompts(next); promptLibrary('Prompt version restored.');
    };
    render(); modal('Prompt history', box, promptLibrary, 'Back to Prompt Library');
  }

  function formatText(text, mode = 'cleanup') {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    let fence = null;
    const output = [];
    for (let line of lines) {
      const marker = line.match(/^\s*(`{3,}|~{3,})/);
      if (marker && (!fence || marker[1][0] === fence[0] && marker[1].length >= fence.length)) {
        fence = fence ? null : marker[1];
        if (mode !== 'plain') output.push(line);
        continue;
      }
      if (!fence) {
        line = line.replace(/[ \t]+$/g, '');
        if (mode === 'plain') line = line.replace(/^\s{0,3}#{1,6}\s+/, '').replace(/^\s*>\s?/, '')
          .replace(/!?\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)').replace(/(`+)(.*?)\1/g, '$2')
          .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => a || b).replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '$1');
        if (!line && output.at(-1) === '' && output.at(-2) === '') continue;
      }
      output.push(line);
    }
    while (output[0] === '') output.shift();
    while (output.at(-1) === '') output.pop();
    return output.join('\n');
  }

  function coachPrompt(text, options = {}) {
    const original = String(text).trim();
    const tips = [];
    if (!original) return { tips: ['Enter your request first.'], rewrite: '' };
    if (original.split(/\s+/).length < 12 && !options.context) tips.push('Add the goal or a little background so the request has a clear scope.');
    if (/\b(better|good|nice|fix it|this thing|that thing)\b/i.test(original)) tips.push('Explain what “better” or “fixed” would look like, using a concrete example.');
    if (!options.format && !/\b(bullets?|table|steps?|json|markdown|paragraphs?|examples?|summary)\b/i.test(original)) tips.push('Choose an answer format if you have a preference.');
    if (!options.context && !/\b(because|for|context|background|audience|goal)\b/i.test(original)) tips.push('Include relevant context or who the answer is for.');
    let request = original.replace(/^i (?:was wondering|wonder) if you (?:could|can)\s+/i, 'Please ').replace(/^can you (?:please )?/i, 'Please ');
    if (/^[a-z]/.test(request)) request = request[0].toUpperCase() + request.slice(1);
    const parts = [request];
    if (options.context?.trim()) parts.push(`Context:\n${options.context.trim()}`);
    if (options.constraints?.trim()) parts.push(`Requirements:\n${options.constraints.trim()}`);
    if (options.format) parts.push(`Please respond with ${options.format}.`);
    if (options.clarify) parts.push('If an essential detail is missing, ask a brief clarifying question first.');
    return { tips: tips.length ? tips : ['The request has a useful starting structure. Check the details and intended meaning before using it.'], rewrite: parts.join('\n\n') };
  }

  function currentDraft() {
    const controls = [...document.querySelectorAll('#prompt-textarea,textarea,[contenteditable="true"][role="textbox"],[contenteditable="true"].ProseMirror')].filter(node => visible(node) && !utilityContains(node));
    const input = controls.find(node => node.id === 'prompt-textarea') || controls[0];
    return input ? (input.value ?? input.innerText ?? '').trim() : '';
  }

  function promptCoach(initial = '', onUse = null, onBack = openMenu) {
    const box = document.createElement('div');
    box.innerHTML = `<p class="acus-muted">A local writing checklist, not a model score. Add the details that matter, then review the suggested wording. Nothing is sent automatically.</p>
      <button class="acus-draft">Use current chat draft</button><label class="acus-field">Your request<textarea class="acus-input acus-request"></textarea></label>
      <details><summary>Optional details</summary><label class="acus-field">Context or audience<textarea class="acus-input acus-context"></textarea></label><label class="acus-field">Requirements or limits<textarea class="acus-input acus-constraints"></textarea></label><label class="acus-field">Answer format<select class="acus-input acus-format"><option value="">Keep unspecified</option><option value="concise bullet points">Concise bullets</option><option value="numbered steps">Steps</option><option value="an explanation with examples">Explanation with examples</option><option value="a comparison table">Comparison table</option></select></label><label class="acus-check"><input type="checkbox" class="acus-clarify"> Ask for clarification when essential details are missing</label></details>
      <button class="acus-primary acus-review">Review wording</button><ul class="acus-tips"></ul><label class="acus-field">Editable suggestion<textarea class="acus-input acus-rewrite"></textarea></label><div class="acus-prompt-actions"><button class="acus-copy">Copy suggestion</button><button class="acus-use acus-primary">Use in prompt editor</button></div><p class="acus-library-status" role="status"></p>`;
    const request = box.querySelector('.acus-request'), rewrite = box.querySelector('.acus-rewrite'), status = box.querySelector('[role="status"]');
    request.value = typeof initial === 'string' ? initial : '';
    const review = () => {
      const result = coachPrompt(request.value, { context: box.querySelector('.acus-context').value, constraints: box.querySelector('.acus-constraints').value, format: box.querySelector('.acus-format').value, clarify: box.querySelector('.acus-clarify').checked });
      box.querySelector('.acus-tips').replaceChildren();
      result.tips.forEach(tip => { const li = document.createElement('li'); li.textContent = tip; box.querySelector('.acus-tips').append(li); });
      rewrite.value = result.rewrite;
      box.querySelector('.acus-copy').disabled = !result.rewrite;
      box.querySelector('.acus-use').disabled = !result.rewrite;
    };
    box.querySelector('.acus-draft').onclick = () => { const draft = currentDraft(); if (draft) { request.value = draft; review(); status.textContent = 'Draft copied locally for review. Your chat draft is unchanged.'; } else status.textContent = 'No supported chat draft was found. Paste your request above.'; };
    box.querySelector('.acus-review').onclick = review;
    rewrite.oninput = () => { box.querySelector('.acus-copy').disabled = !rewrite.value.trim(); box.querySelector('.acus-use').disabled = !rewrite.value.trim(); };
    box.querySelector('.acus-copy').onclick = () => copyText(rewrite.value, message => { status.textContent = message; });
    box.querySelector('.acus-use').hidden = !onUse;
    box.querySelector('.acus-use').onclick = () => onUse?.(rewrite.value);
    review(); modal('Prompt Coach', box, onBack, 'Back to previous screen'); request.focus();
  }

  function textTools() {
    const box = document.createElement('div');
    box.innerHTML = '<p class="acus-muted">Format pasted text locally. Code inside fenced blocks keeps its spacing.</p><label class="acus-field">Original text<textarea class="acus-input acus-original"></textarea></label><label class="acus-field">Formatting<select class="acus-input"><option value="cleanup">Clean spacing and blank lines</option><option value="plain">Markdown to plain text</option></select></label><label class="acus-field">Preview<textarea class="acus-input acus-result" readonly></textarea></label><p class="acus-muted acus-count"></p><button class="acus-primary">Copy result</button><p role="status"></p>';
    const original = box.querySelector('.acus-original'), result = box.querySelector('.acus-result'), mode = box.querySelector('select');
    const render = () => { result.value = formatText(original.value, mode.value); box.querySelector('.acus-count').textContent = `${result.value.trim() ? result.value.trim().split(/\s+/).length : 0} space separated words · ${[...result.value].length} characters`; box.querySelector('button').disabled = !result.value; };
    original.oninput = render; mode.onchange = render;
    box.querySelector('button').onclick = () => copyText(result.value, message => { box.querySelector('[role="status"]').textContent = message; });
    render(); modal('Text tools', box); original.focus();
  }

  function bookmarkedChats() {
    const box = document.createElement('div');
    const intro = document.createElement('p'); intro.className = 'acus-muted'; intro.textContent = 'Bookmarks help you find conversations. Locks control cleanup separately.';
    const add = button('Bookmark current chat');
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    const list = document.createElement('div'); box.append(intro, add, status, list);
    const render = () => {
      list.replaceChildren();
      for (const bookmark of loadBookmarks()) {
        const row = document.createElement('div'); row.className = 'acus-prompt-actions';
        const link = document.createElement('a'); link.className = 'acus-row'; link.href = bookmark.href; link.textContent = bookmark.title;
        const remove = button('Remove bookmark'); remove.onclick = () => { toggleBookmark(bookmark); render(); };
        row.append(link, remove); list.append(row);
      }
      if (!list.children.length) list.textContent = 'No bookmarks yet. Bookmark the current chat or use the star in Chat Cleaner.';
      add.disabled = !validChatHref(location.pathname);
    };
    add.onclick = () => {
      const chat = cachedHistory?.get(location.pathname) || getChatLinks().find(item => item.href === location.pathname) || { href: location.pathname, title: document.title || 'Current conversation' };
      if (!loadBookmarks().some(item => item.href === chat.href)) toggleBookmark(chat);
      status.textContent = 'Chat bookmarked.'; render();
    };
    render(); modal('Chat bookmarks', box);
  }

  function detectDarkMode() {
    const preference = loadSettings().theme;
    if (preference !== 'auto') return preference === 'dark';
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
      muted: '#c4cfdd',
      subtle: '#71717a',
      accent: '#2563eb',
      accentSoft: 'rgba(147,164,255,.13)',
      accentBorder: 'rgba(147,164,255,.34)',
      danger: '#b91c1c',
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
      muted: '#475569',
      subtle: '#a1a1aa',
      accent: '#1d4ed8',
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

  function applyAppearance(panel) {
    const theme = cleanerTheme();
    for (const [key, value] of Object.entries(theme)) panel.style.setProperty(`--acus-${key}`, value);
    panel.dataset.textSize = loadSettings().textSize;
  }

  function settingsScreen() {
    const box = document.createElement('div');
    const settings = loadSettings();
    const intro = document.createElement('p');
    intro.className = 'acus-muted';
    intro.textContent = 'Make the suite comfortable to read and choose how Chat Cleaner opens.';
    box.append(intro);
    const choices = {};
    for (const [key, label, options] of [
      ['theme', 'Appearance', [['auto', 'Match the page'], ['light', 'Light'], ['dark', 'Dark']]],
      ['textSize', 'Text size', [['standard', 'Standard'], ['large', 'Large']]],
      ['sort', 'Default chat order', [['newest', 'Newest first'], ['oldest', 'Oldest first']]],
      ['cleanerView', 'Default cleaner view', [['all', 'All chats'], ['unprotected', 'Hide protected'], ['suggested', 'Suggested only']]]
    ]) {
      const field = document.createElement('label');
      field.className = 'acus-field';
      field.textContent = label;
      const select = document.createElement('select');
      select.className = 'acus-input';
      for (const [value, text] of options) { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); }
      select.value = settings[key];
      choices[key] = select;
      field.append(select);
      box.append(field);
    }
    const save = button('Save settings');
    const shortcutLabel = document.createElement('label'); shortcutLabel.className = 'acus-check';
    const shortcut = document.createElement('input'); shortcut.type = 'checkbox'; shortcut.checked = settings.shortcutEnabled;
    shortcutLabel.append(shortcut, document.createTextNode('Enable Alt + Shift + K for shortcuts')); box.append(shortcutLabel);
    save.className = 'acus-primary';
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    save.onclick = () => {
      const next = normalizeSettings({ ...Object.fromEntries(Object.entries(choices).map(([key, select]) => [key, select.value])), shortcutEnabled: shortcut.checked });
      GM_setValue(SETTINGS_KEY, JSON.stringify(next));
      GM_setValue(CHAT_SORT_KEY, next.sort);
      applyAppearance(box.closest('.acus-modal'));
      status.textContent = 'Settings saved. New tool windows will use these preferences.';
    };
    box.append(save, status);
    modal('Settings', box);
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function parseSidebarDateRange(label) {
    const value = String(label || "").trim().toLowerCase();
    const today = startOfDay(new Date());
    const currentYear = today.getFullYear();
    const exactDay = parseExposedDate(value);
    if (exactDay) return { start: exactDay, end: exactDay };

    if (value === "today") return { start: today, end: today };
    if (value === "yesterday") {
      const day = addDays(today, -1);
      return { start: day, end: day };
    }
    if (value === "previous 7 days" || value === "last 7 days") {
      return { start: addDays(today, -7), end: addDays(today, -2) };
    }
    if (value === "previous 30 days" || value === "last 30 days") {
      return { start: addDays(today, -30), end: addDays(today, -8) };
    }
    if (value === "this week") {
      const start = addDays(today, -today.getDay());
      return { start, end: today };
    }
    if (value === "last week") {
      const thisWeek = addDays(today, -today.getDay());
      return { start: addDays(thisWeek, -7), end: addDays(thisWeek, -1) };
    }

    const months = [
      "january","february","march","april","may","june",
      "july","august","september","october","november","december"
    ];

    const monthMatch = value.match(/^([a-z]+)(?:\s+(\d{4}))?$/);
    if (monthMatch && months.includes(monthMatch[1])) {
      const month = months.indexOf(monthMatch[1]);
      let year = monthMatch[2] ? Number(monthMatch[2]) : currentYear;

      if (!monthMatch[2] && month > today.getMonth()) year--;

      return {
        start: new Date(year, month, 1),
        end: new Date(year, month + 1, 0)
      };
    }

    if (/^\d{4}$/.test(value)) {
      const year = Number(value);
      return {
        start: new Date(year, 0, 1),
        end: new Date(year, 11, 31)
      };
    }

    return null;
  }

  function parseDateInput(value) {
    if (!value) return null;
    const parts = value.split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.getFullYear() === parts[0] && date.getMonth() === parts[1] - 1 && date.getDate() === parts[2] ? date : null;
  }

  function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function parseExposedDate(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return null;
    if (!parseDateInput(value.slice(0, 10))) return null;
    if (value.length === 10) return parseDateInput(value);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : startOfDay(date);
  }

  function chatDateRange(chat) {
    const start = parseExposedDate(chat.dateStart);
    const end = parseExposedDate(chat.dateEnd);
    return start && end && start <= end ? { start, end } : parseSidebarDateRange(chat.dateLabel);
  }

  function chatMatchesDateRange(chat, startDate, endDate) {
    const range = chatDateRange(chat);
    if (!range) return false;
    return range.start >= startDate && range.end <= endDate;
  }

  function chatIsBeforeDate(chat, cutoff) {
    const range = chatDateRange(chat);
    if (!range) return false;
    return range.end <= cutoff;
  }

  function numberChats(chats) {
    const unique = [...new Map(chats.map(chat => [chat.href, chat])).values()];
    return unique.reverse().map((chat, index) => ({ ...chat, chatNumber: index + 1 }));
  }

  function parseNumberRange(from, to, total) {
    if (!/^\d+$/.test(String(from)) || !/^\d+$/.test(String(to))) return null;
    const first = Number(from);
    const last = Number(to);
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 1 || last < 1 || first > total || last > total) return null;
    return { start: Math.min(first, last), end: Math.max(first, last) };
  }

  function chatMatchesNumberRange(chat, range) {
    return Boolean(range && !chat.locked && !chat.protectedMatches?.length && chat.chatNumber >= range.start && chat.chatNumber <= range.end);
  }

  function sortNumberedChats(chats, order) {
    return [...chats].sort((a, b) => order === 'oldest' ? a.chatNumber - b.chatNumber : b.chatNumber - a.chatNumber);
  }

  function chatMatchesView(chat, selected, query, view) {
    if (!String(chat.title || '').toLowerCase().includes(query.trim().toLowerCase())) return false;
    if (view === 'selected') return selected;
    if (view === 'unprotected') return !chat.locked && !chat.protectedMatches?.length;
    if (view === 'suggested') return !chat.locked && !!chat.likelyPersonal;
    return true;
  }

  async function runChatBatch(items, action, isStopped, onProgress) {
    const result = { completed: [], failed: [], pending: [] };
    for (let index = 0; index < items.length; index++) {
      if (isStopped()) {
        result.pending = items.slice(index);
        break;
      }
      const item = items[index];
      onProgress(index, items.length, item);
      try {
        await action(item);
        result.completed.push(item);
      } catch (error) {
        result.failed.push({ item, message: error instanceof Error ? error.message : String(error) });
      }
    }
    return result;
  }

  function makeOverlay(chats, selectedHrefs = new Set(), viewState = {}) {
    chats = numberChats(chats);
    document.getElementById('vanick-cleaner-overlay')?.remove();

    const current = platform();
    let sortOrder = GM_getValue(CHAT_SORT_KEY, 'newest') === 'oldest' ? 'oldest' : 'newest';
    const displayChats = () => sortNumberedChats(chats, sortOrder);
    const theme = cleanerTheme();
    const overlay = document.createElement('div');
    overlay.id = 'vanick-cleaner-overlay';
    overlay.dataset.textSize = loadSettings().textSize;
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
      #vanick-cleaner-overlay [hidden]{display:none!important}
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
      #vanick-cleaner-overlay .vc-date-controls{display:grid;grid-template-columns:minmax(100px,1fr) minmax(100px,1fr) auto;gap:7px;align-items:center;padding:10px 24px;border-bottom:1px solid var(--vc-border);background:var(--vc-panel)}
      #vanick-cleaner-overlay .vc-date-controls .vc-input{width:100%}
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
      #vanick-cleaner-overlay .vc-status[data-state="error"]{color:var(--vc-text);font-weight:700}
      #vanick-cleaner-overlay .vc-status[data-state="success"]{color:var(--vc-success)}
      #vanick-cleaner-overlay .vc-footer-actions{display:flex;gap:8px;margin-left:auto}
      #vanick-cleaner-overlay .vc-button{min-height:34px;padding:7px 11px;border-radius:9px;border:1px solid var(--vc-border);color:var(--vc-text);background:var(--vc-surface);font:inherit;font-size:11.5px;line-height:1;font-weight:700;cursor:pointer;transition:background .15s ease,border-color .15s ease,transform .1s ease,opacity .15s ease}
      #vanick-cleaner-overlay .vc-button:hover:not(:disabled){background:var(--vc-surface-hover);border-color:var(--vc-border-strong)}
      #vanick-cleaner-overlay .vc-button:active:not(:disabled){transform:translateY(1px)}
      #vanick-cleaner-overlay .vc-button:disabled{opacity:.45;cursor:not-allowed}
      #vanick-cleaner-overlay .vc-button-danger{color:#fff;border-color:var(--vc-danger);background:var(--vc-danger)}
      #vanick-cleaner-overlay .vc-button-danger:hover:not(:disabled){border-color:var(--vc-danger-hover);background:var(--vc-danger-hover)}
      #vanick-cleaner-overlay .vc-button-accent{color:#fff;border-color:var(--vc-accent);background:var(--vc-accent)}
      #vanick-cleaner-overlay .vc-panel{border:2px solid var(--vc-border-strong);overflow:auto}
      #vanick-cleaner-overlay .vc-header{background:linear-gradient(120deg,var(--vc-accent-soft),var(--vc-panel));border-bottom:2px solid var(--vc-accent-border);padding:18px 20px}
      #vanick-cleaner-overlay .vc-brand{flex:1}
      #vanick-cleaner-overlay .vc-icon-button{width:42px;height:42px;color:var(--vc-text);background:var(--vc-surface);border:1px solid var(--vc-border-strong);font-size:24px}
      #vanick-cleaner-overlay .vc-button{min-height:42px;padding:10px 14px;font-size:13px;border-color:var(--vc-border-strong);box-shadow:0 1px 2px #0001}
      #vanick-cleaner-overlay .vc-button-accent:hover:not(:disabled){color:#fff;background:#1e40af;border-color:#1e40af}
      #vanick-cleaner-overlay .vc-button:focus-visible,#vanick-cleaner-overlay .vc-icon-button:focus-visible,#vanick-cleaner-overlay .vc-chip-remove:focus-visible{outline:3px solid var(--vc-accent);outline-offset:3px}
      #vanick-cleaner-overlay .vc-input{height:42px;font-size:13px;border-color:var(--vc-border-strong)}
      #vanick-cleaner-overlay .vc-summary{color:var(--vc-text);font-size:14px;background:var(--vc-accent-soft);padding:8px 12px;border-radius:8px}
      #vanick-cleaner-overlay .vc-date-controls{gap:10px;padding:16px 20px;background:var(--vc-accent-soft);border-top:1px solid var(--vc-accent-border);border-bottom:1px solid var(--vc-accent-border)}
      #vanick-cleaner-overlay .vc-field{display:grid;gap:6px;font-size:12px;font-weight:700;color:var(--vc-text)}
      #vanick-cleaner-overlay .vc-date-controls>.vc-button{align-self:end}
      #vanick-cleaner-overlay .vc-row{grid-template-columns:24px minmax(0,1fr) auto;padding:14px;border-color:var(--vc-border-strong)}
      #vanick-cleaner-overlay .vc-lock{font-size:12px;min-height:38px;padding:8px}
      #vanick-cleaner-overlay .vc-row.vc-selected{border:2px solid var(--vc-accent);padding:13px;background:var(--vc-accent-soft);box-shadow:inset 4px 0 var(--vc-accent)}
      #vanick-cleaner-overlay .vc-checkbox{width:21px;height:21px}
      #vanick-cleaner-overlay .vc-chat-title{font-size:14px}
      #vanick-cleaner-overlay .vc-detail{font-size:12px}
      #vanick-cleaner-overlay .vc-footer{border-top:2px solid var(--vc-border-strong);background:var(--vc-surface)}
      #vanick-cleaner-overlay .vc-footer>div:first-child{flex-basis:100%!important}
      #vanick-cleaner-overlay .vc-footer-actions{width:100%;align-items:end;justify-content:flex-end;flex-wrap:wrap}
      #vanick-cleaner-overlay .vc-footer-actions>.vc-field{margin-right:auto}
      #vanick-cleaner-overlay[data-text-size="large"] .vc-button,#vanick-cleaner-overlay[data-text-size="large"] .vc-input,#vanick-cleaner-overlay[data-text-size="large"] .vc-chat-title{font-size:16px}
      #vanick-cleaner-overlay[data-text-size="large"] .vc-detail,#vanick-cleaner-overlay[data-text-size="large"] .vc-subtitle,#vanick-cleaner-overlay[data-text-size="large"] .vc-field,#vanick-cleaner-overlay[data-text-size="large"] .vc-status{font-size:14px}
      #vanick-cleaner-overlay .vc-status{font-size:12px;color:var(--vc-text)}
      #vanick-cleaner-overlay .vc-action-group{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:8px;border:1px solid var(--vc-border);border-radius:10px}
      #vanick-cleaner-overlay .vc-action-label{font-size:11px;font-weight:750;color:var(--vc-muted);width:100%}
      #vanick-cleaner-overlay .vc-panel{max-height:calc(100vh - 48px);overflow:hidden}
      #vanick-cleaner-overlay .vc-header,#vanick-cleaner-overlay .vc-toolbar,#vanick-cleaner-overlay .vc-date-controls,#vanick-cleaner-overlay .vc-footer{flex-shrink:0}
      #vanick-cleaner-overlay .vc-list-wrap,#vanick-cleaner-overlay .vc-filter-manager,#vanick-cleaner-overlay .vc-selection-review{flex:1;min-height:100px}
      #vanick-cleaner-overlay .vc-toolbar:has(.vc-toolbar-actions){display:block;padding:10px 20px}
      #vanick-cleaner-overlay .vc-toolbar-actions{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:8px;margin-top:8px}
      #vanick-cleaner-overlay .vc-action-group{gap:6px}
      #vanick-cleaner-overlay .vc-action-group .vc-button{padding:8px 10px;font-size:12px;min-height:38px}
      @media(max-width:640px),(max-height:800px){#vanick-cleaner-overlay .vc-panel{overflow:auto;max-height:calc(100vh - 48px)}#vanick-cleaner-overlay .vc-header{position:sticky;top:0;z-index:2;background:var(--vc-panel)}#vanick-cleaner-overlay .vc-footer{position:sticky;bottom:0;z-index:2}#vanick-cleaner-overlay .vc-list-wrap,#vanick-cleaner-overlay .vc-filter-manager,#vanick-cleaner-overlay .vc-selection-review{flex:none;max-height:320px;overflow:auto}#vanick-cleaner-overlay .vc-toolbar{padding:10px 16px}}
      @media(max-width:640px){#vanick-cleaner-overlay .vc-toolbar-actions{grid-template-columns:1fr}#vanick-cleaner-overlay .vc-date-controls>.vc-button{grid-column:1/-1}#vanick-cleaner-overlay .vc-footer-actions{flex-wrap:wrap}}
      @media (max-width:640px){#vanick-cleaner-overlay{padding:10px}#vanick-cleaner-overlay .vc-date-controls{grid-template-columns:1fr 1fr}#vanick-cleaner-overlay .vc-panel{max-height:92vh;border-radius:16px}#vanick-cleaner-overlay .vc-header{padding:18px 16px 14px}#vanick-cleaner-overlay .vc-toolbar{padding:10px 16px}#vanick-cleaner-overlay .vc-list-wrap,#vanick-cleaner-overlay .vc-filter-manager,#vanick-cleaner-overlay .vc-selection-review{padding:10px}#vanick-cleaner-overlay .vc-filter-grid{grid-template-columns:1fr}#vanick-cleaner-overlay .vc-footer{padding:12px}#vanick-cleaner-overlay .vc-chat-head{align-items:flex-start}#vanick-cleaner-overlay .vc-chat-title{white-space:normal}}
      #vanick-cleaner-overlay .vc-range{flex-shrink:0;border-bottom:1px solid var(--vc-border)}
      #vanick-cleaner-overlay .vc-range>summary{padding:12px 20px;min-height:44px;color:var(--vc-text);font-size:13px;font-weight:700;cursor:pointer;background:var(--vc-accent-soft)}
      #vanick-cleaner-overlay .vc-range>summary:focus-visible{outline:3px solid var(--vc-accent);outline-offset:-3px}
      #vanick-cleaner-overlay[data-text-size="large"] .vc-button,#vanick-cleaner-overlay[data-text-size="large"] .vc-input,#vanick-cleaner-overlay[data-text-size="large"] .vc-chat-title{font-size:16px}
    `;
    overlay.appendChild(style);

    const panel = document.createElement('div');
    panel.className = 'vc-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Chat Cleaner');

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
      <div class="vc-subtitle">Select chats, review the list, then choose Archive or Delete. Lock anything you want to keep.</div>
    `;

    brand.append(icon, headingText);

    const closeIcon = document.createElement('button');
    closeIcon.type = 'button';
    closeIcon.className = 'vc-icon-button';
    closeIcon.setAttribute('aria-label', 'Close');
    closeIcon.textContent = '×';
    closeIcon.onclick = () => overlay.remove();

    const backIcon = document.createElement('button');
    backIcon.type = 'button';
    backIcon.className = 'vc-icon-button';
    backIcon.setAttribute('aria-label', 'Back to AI Tools');
    backIcon.textContent = '←';
    backIcon.onclick = () => {
      if (filterMode) {
        makeOverlay((cachedHistory ? [...cachedHistory.values()] : uniqueChats()).map(classify), new Set(rows.filter(item => item.checkbox.checked).map(item => item.chat.href)));
      } else if (selectionMode) {
        manageFilters.hidden = false;
        showChatList();
      } else {
        overlay.remove();
        openMenu();
      }
    };
    header.append(backIcon, brand, closeIcon);
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
    let running = false;
    let stopRequested = false;
    let failedItems = [];
    let failedKind = 'delete';

    const viewControls = document.createElement('div');
    viewControls.className = 'vc-toolbar';
    const titleSearch = document.createElement('input');
    titleSearch.value = viewState.query || '';
    titleSearch.type = 'search';
    titleSearch.className = 'vc-input';
    titleSearch.placeholder = 'Search loaded chat titles';
    titleSearch.setAttribute('aria-label', 'Search cleaner chats');
    const viewFilter = document.createElement('select');
    viewFilter.className = 'vc-input';
    viewFilter.setAttribute('aria-label', 'Show chats');
    for (const [value, label] of [['all', 'All chats'], ['selected', 'Selected only'], ['unprotected', 'Hide protected'], ['suggested', 'Suggested only']]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      viewFilter.append(option);
    }
    viewFilter.value = viewState.view || loadSettings().cleanerView;
    const viewCount = document.createElement('span');
    viewCount.className = 'vc-subtitle';
    viewCount.setAttribute('aria-live', 'polite');
    const viewEmpty = document.createElement('div');
    viewEmpty.className = 'vc-empty';
    viewEmpty.textContent = 'No chats match. Clear the search or change the filter.';
    viewEmpty.hidden = true;
    const searchField = document.createElement('label');
    searchField.className = 'vc-field';
    searchField.style.flex = '1';
    searchField.textContent = 'Search titles';
    searchField.append(titleSearch);
    const viewField = document.createElement('label');
    viewField.className = 'vc-field';
    viewField.textContent = 'Show chats';
    viewField.append(viewFilter);
    viewControls.append(searchField, viewField, viewCount);

    function refreshView() {
      let shown = 0;
      for (const item of rows) {
        const matches = !item.removed && chatMatchesView(item.chat, item.checkbox.checked, titleSearch.value, viewFilter.value);
        item.row.hidden = !matches;
        if (matches) shown++;
      }
      const hiddenSelected = rows.filter(item => !item.removed && item.row.hidden && item.checkbox.checked).length;
      viewCount.textContent = `${shown} shown${hiddenSelected ? ` · ${hiddenSelected} selected outside this view` : ''}`;
      viewEmpty.hidden = shown > 0 || !chats.length;
    }
    titleSearch.oninput = refreshView;
    viewFilter.onchange = refreshView;

    function refreshSelection() {
      updateBackLabel();
      refreshView();
      const selected = rows.filter(item => item.checkbox.checked).length;
      exportSelected.disabled = selected === 0;
      coverage.textContent = historyCoverage(rows.filter(item => !item.removed).length);
      summary.textContent = filterMode ? `${activeFilters.suggested.length} suggested filters · ${activeFilters.protected.length} protected filters` : `${rows.filter(item => !item.removed).length} loaded · ${selected} selected`;
      for (const item of rows) item.row.classList.toggle('vc-selected', item.checkbox.checked);
      if (remove) {
        const verb = cleanupAction.value === 'archive' ? 'Archive' : 'Delete';
        remove.textContent = selected ? `${verb} selected (${selected})` : `${verb} selected`;
        remove.className = cleanupAction.value === 'archive' ? 'vc-button vc-button-accent' : 'vc-button vc-button-danger';
        remove.disabled = selected === 0;
      }
      if (reviewSelected && !selectionMode) {
        reviewSelected.textContent = selected ? `Review selected (${selected})` : 'Review selected';
        reviewSelected.disabled = selected === 0;
      }
      retry.disabled = !failedItems.some(item => !item.removed && item.checkbox.checked);
    }

    for (const chat of displayChats()) {
      const row = document.createElement('label');
      row.className = 'vc-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'vc-checkbox';
      checkbox.setAttribute('aria-label', `Chat #${chat.chatNumber}: ${chat.title}`);
      checkbox.checked = !chat.locked && selectedHrefs.has(chat.href);
      checkbox.disabled = chat.locked;
      checkbox.addEventListener('change', refreshSelection);

      const info = document.createElement('div');
      info.style.minWidth = '0';

      const detailParts = [];
      if (chat.matches.length) detailParts.push(`Matched: ${chat.matches.join(', ')}`);
      else detailParts.push('No suggested cleanup filter match');
      if (chat.protectedMatches.length) detailParts.push(`Protected: ${chat.protectedMatches.join(', ')}`);
      const savedDate = chat.dateStart && chat.dateEnd
        ? (chat.dateStart === chat.dateEnd ? chat.dateStart : `${chat.dateStart} to ${chat.dateEnd}`)
        : (chat.dateLabel || 'Unknown date');
      if (savedDate !== 'Unknown date') detailParts.push(`Date: ${savedDate}`);

      const statusClass = chat.locked || chat.protectedMatches.length ? 'vc-pill-protected' : chat.likelyPersonal ? 'vc-pill-personal' : 'vc-pill-review';
      const statusText = chat.locked ? 'Locked' : chat.protectedMatches.length ? 'Protected' : chat.likelyPersonal ? 'Suggested' : 'Review';

      info.innerHTML = `<div class="vc-chat-head"><div class="vc-chat-title">#${chat.chatNumber} · ${escapeHtml(chat.title)}</div><span class="vc-pill ${statusClass}">${statusText}</span></div><div class="vc-detail">${escapeHtml(detailParts.join(' · '))}</div>`;

      row.append(checkbox, info);
      const lock = button(chat.locked ? '🔒 Unlock' : '🔓 Lock');
      lock.classList.add('vc-lock');
      lock.setAttribute('aria-label', `${chat.locked ? 'Unlock' : 'Lock'} ${chat.title}`);
      lock.setAttribute('aria-pressed', String(chat.locked));
      lock.onclick = event => {
        event.preventDefault();
        chat.locked = !chat.locked;
        setChatLocked(chat, chat.locked);
        checkbox.disabled = chat.locked;
        if (chat.locked) checkbox.checked = false;
        lock.textContent = chat.locked ? '🔒 Unlock' : '🔓 Lock';
        lock.setAttribute('aria-label', `${chat.locked ? 'Unlock' : 'Lock'} ${chat.title}`);
        lock.setAttribute('aria-pressed', String(chat.locked));
        const pill = info.querySelector('.vc-pill');
        pill.textContent = chat.locked ? 'Locked' : chat.protectedMatches.length ? 'Protected' : chat.likelyPersonal ? 'Suggested' : 'Review';
        pill.className = `vc-pill ${chat.locked || chat.protectedMatches.length ? 'vc-pill-protected' : chat.likelyPersonal ? 'vc-pill-personal' : 'vc-pill-review'}`;
        refreshSelection();
      };
      const rowActions = document.createElement('div'); rowActions.className = 'vc-row-actions';
      const bookmark = button(loadBookmarks().some(item => item.href === chat.href) ? '★' : '☆');
      bookmark.setAttribute('aria-label', `Bookmark ${chat.title}`);
      bookmark.setAttribute('aria-pressed', String(loadBookmarks().some(item => item.href === chat.href)));
      bookmark.onclick = event => { event.preventDefault(); const saved = toggleBookmark(chat); bookmark.textContent = saved ? '★' : '☆'; bookmark.setAttribute('aria-pressed', String(saved)); };
      rowActions.append(lock, bookmark); row.append(rowActions);
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
    listWrap.append(viewEmpty);

    const reviewSelected = button('Review selected', 'accent');

    function renderSelectedReview() {
      selectionReview.replaceChildren();

      const head = document.createElement('div');
      head.className = 'vc-selection-head';
      head.innerHTML = '<div><div class="vc-selection-title">Selected chats</div><div class="vc-selection-text">These chats will be included in the action you choose below. Uncheck anything you want to keep.</div></div>';
      selectionReview.appendChild(head);

      const selectedRows = [...rows.filter(item => item.checkbox.checked)].sort((a, b) =>
        sortOrder === 'oldest' ? a.chat.chatNumber - b.chat.chatNumber : b.chat.chatNumber - a.chat.chatNumber);
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
        info.innerHTML = `<div class="vc-chat-head"><div class="vc-chat-title">#${item.chat.chatNumber} · ${escapeHtml(item.chat.title)}</div><span class="vc-pill vc-pill-personal">Selected</span></div>`;

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
      viewControls.hidden = false;
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
      viewControls.hidden = true;
      selectionReview.hidden = false;
      if (footer) footer.hidden = false;
      selectSuggested.hidden = true;
      selectAll.hidden = true;
      deselectAll.hidden = true;
      manageFilters.hidden = true;
      reviewSelected.hidden = false;
      reviewSelected.textContent = '← Back to chats';
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
      rows.forEach(item => { item.checkbox.checked = !item.removed && !item.chat.locked && item.chat.likelyPersonal; });
      refreshSelection();
      if (rows.some(item => item.checkbox.checked)) showSelectedReview();
    };

    const selectAll = button('Select shown', 'secondary');
    selectAll.onclick = () => {
      rows.forEach(item => { if (!item.row.hidden && !item.removed && !item.chat.locked) item.checkbox.checked = true; });
      refreshSelection();
    };

    const deselectAll = button('Deselect shown', 'secondary');
    deselectAll.onclick = () => {
      rows.forEach(item => { if (!item.row.hidden) item.checkbox.checked = false; });
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
        makeOverlay(chatsToShow.map(classify), new Set(rows.filter(item => item.checkbox.checked).map(item => item.chat.href)));
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
      viewControls.hidden = filterMode;
      if (footer) footer.hidden = filterMode;
      selectSuggested.hidden = filterMode;
      selectAll.hidden = filterMode;
      deselectAll.hidden = filterMode;
      reviewSelected.hidden = filterMode;
      manageFilters.textContent = filterMode ? '← Back to chats' : 'Manage filters';

      if (filterMode) renderFilterManager();
      else {
        const chatsToShow = cachedHistory ? rememberChats(uniqueChats()) : uniqueChats();
        makeOverlay(chatsToShow.map(classify), new Set(rows.filter(item => item.checkbox.checked).map(item => item.chat.href)));
      }

      refreshSelection();
    };

    const numberControls = document.createElement('div');
    numberControls.className = 'vc-date-controls';
    const fromNumber = document.createElement('input');
    const toNumber = document.createElement('input');
    for (const input of [fromNumber, toNumber]) {
      input.type = 'number';
      input.min = '1';
      input.max = String(chats.length);
      input.step = '1';
      input.className = 'vc-input';
      input.disabled = !chats.length;
    }
    fromNumber.placeholder = 'From chat #';
    fromNumber.value = viewState.from || '';
    toNumber.value = viewState.to || '';
    fromNumber.setAttribute('aria-label', 'From chat number');
    toNumber.placeholder = 'To chat #';
    toNumber.setAttribute('aria-label', 'To chat number');
    const selectNumberRange = button('Select number range', 'accent');
    selectNumberRange.disabled = true;
    const refreshNumberRange = () => {
      selectNumberRange.disabled = !parseNumberRange(fromNumber.value, toNumber.value, chats.length);
    };
    fromNumber.oninput = refreshNumberRange;
    toNumber.oninput = refreshNumberRange;
    selectNumberRange.onclick = () => {
      const range = parseNumberRange(fromNumber.value, toNumber.value, chats.length);
      if (!range) return;
      rows.forEach(item => {
        item.checkbox.checked = !item.removed && chatMatchesNumberRange(item.chat, range);
      });
      refreshSelection();
      if (selectionMode) renderSelectedReview();
    };
    const numberHint = document.createElement('div');
    numberHint.className = 'vc-subtitle';
    numberHint.style.cssText = 'grid-column:1/-1;max-width:none';
    numberHint.textContent = 'Numbers stay the same when sorting. Ranges skip protected and locked chats.';
    numberHint.title = 'Chat #1 is at the oldest end of sidebar order. Refreshing history can change numbers.';
    const fromField = document.createElement('label');
    fromField.className = 'vc-field';
    fromField.textContent = 'From chat number';
    fromField.append(fromNumber);
    const toField = document.createElement('label');
    toField.className = 'vc-field';
    toField.textContent = 'To chat number';
    toField.append(toNumber);
    numberControls.append(fromField, toField, selectNumberRange, numberHint);

    const refreshHistory = button('Refresh history', 'secondary');
    refreshHistory.onclick = async () => {
      overlay.remove();
      clearPersistentChatCache();
      await chatCleaner(true);
    };

    const selectionActions = document.createElement('div');
    selectionActions.className = 'vc-action-group';
    const selectionLabel = document.createElement('span');
    selectionLabel.className = 'vc-action-label';
    selectionLabel.textContent = 'Select and review';
    selectionActions.append(selectionLabel, selectSuggested, selectAll, deselectAll, reviewSelected);
    const historyActions = document.createElement('div');
    historyActions.className = 'vc-action-group';
    const historyLabel = document.createElement('span');
    historyLabel.className = 'vc-action-label';
    historyLabel.textContent = 'History and filters';
    historyActions.append(historyLabel, manageFilters, refreshHistory);
    toolbarActions.append(selectionActions, historyActions);
    toolbar.append(summary, toolbarActions);
    const exportSelected = button('Export selected', 'secondary');
    exportSelected.onclick = () => {
      const chosen = rows.filter(item => item.checkbox.checked && !item.removed).map(item => item.chat);
      const selected = new Set(chosen.map(chat => chat.href));
      const state = { query: titleSearch.value, view: viewFilter.value, from: fromNumber.value, to: toNumber.value, rangeOpen: rangeSection.open, action: cleanupAction.value };
      const remaining = rows.filter(item => !item.removed).sort((a, b) => b.chat.chatNumber - a.chat.chatNumber).map(item => item.chat);
      overlay.remove();
      conversationExports(chosen, () => makeOverlay(remaining.map(classify), selected, state));
    };
    selectionActions.append(exportSelected);
    const sortBar = document.createElement('div');
    sortBar.className = 'vc-field';
    const sortLabel = document.createElement('label');
    sortLabel.textContent = 'Organize chats';
    sortLabel.htmlFor = 'vc-chat-sort';
    const sortSelect = document.createElement('select');
    sortSelect.id = 'vc-chat-sort';
    sortSelect.className = 'vc-input';
    for (const [value, label] of [['newest', 'Newest first'], ['oldest', 'Oldest first']]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      sortSelect.append(option);
    }
    sortSelect.value = sortOrder;
    sortSelect.onchange = () => {
      sortOrder = sortSelect.value === 'oldest' ? 'oldest' : 'newest';
      GM_setValue(CHAT_SORT_KEY, sortOrder);
      GM_setValue(SETTINGS_KEY, JSON.stringify({ ...loadSettings(), sort: sortOrder }));
      const orderedRows = [...rows].sort((a, b) => sortOrder === 'oldest' ? a.chat.chatNumber - b.chat.chatNumber : b.chat.chatNumber - a.chat.chatNumber);
      for (const item of orderedRows) list.append(item.row);
      if (selectionMode) renderSelectedReview();
    };
    sortBar.append(sortLabel, sortSelect);
    viewControls.append(sortBar);
    const savedViews = document.createElement('details'); savedViews.className = 'vc-range';
    const savedTitle = document.createElement('summary'); savedTitle.textContent = 'Saved cleaner views';
    const savedBody = document.createElement('div'); savedBody.className = 'vc-toolbar';
    const viewName = document.createElement('input'); viewName.className = 'vc-input'; viewName.placeholder = 'Name this view'; viewName.setAttribute('aria-label', 'View name');
    const savedSelect = document.createElement('select'); savedSelect.className = 'vc-input'; savedSelect.setAttribute('aria-label', 'Saved view');
    const saveView = button('Save current view'), deleteView = button('Delete saved view');
    const viewStatus = document.createElement('span'); viewStatus.className = 'vc-subtitle'; viewStatus.setAttribute('role', 'status');
    const renderViews = () => { savedSelect.replaceChildren(); const blank = document.createElement('option'); blank.value = ''; blank.textContent = 'Choose a saved view'; savedSelect.append(blank); loadViews().forEach(view => { const option = document.createElement('option'); option.value = view.name; option.textContent = view.name; savedSelect.append(option); }); deleteView.disabled = true; };
    saveView.onclick = () => {
      const value = normalizeView({ name: viewName.value, query: titleSearch.value, view: viewFilter.value, sort: sortOrder });
      if (!value.name) { viewStatus.textContent = 'Enter a view name.'; return; }
      GM_setValue(clientKey(VIEW_KEY), JSON.stringify([...loadViews().filter(item => item.name !== value.name), value])); renderViews(); viewStatus.textContent = 'View saved. Chat selections and number ranges are not saved.';
    };
    savedSelect.onchange = () => {
      const value = loadViews().find(item => item.name === savedSelect.value); deleteView.disabled = !value;
      if (!value) return;
      titleSearch.value = value.query; viewFilter.value = value.view; sortSelect.value = value.sort; sortSelect.onchange(); refreshSelection();
      viewName.value = value.name; viewStatus.textContent = 'View loaded. Your selection is unchanged.';
    };
    deleteView.onclick = () => {
      if (!savedSelect.value || !confirm('Delete this saved view? Chats are not affected.')) return;
      GM_setValue(clientKey(VIEW_KEY), JSON.stringify(loadViews().filter(item => item.name !== savedSelect.value))); renderViews(); viewStatus.textContent = 'Saved view deleted.';
    };
    renderViews(); savedBody.append(viewName, saveView, savedSelect, deleteView, viewStatus); savedViews.append(savedTitle, savedBody);
    const coverage = document.createElement('div');
    coverage.className = 'vc-coverage vc-subtitle';
    coverage.style.cssText = 'padding:8px 20px;flex-shrink:0';
    coverage.textContent = historyCoverage(chats.length);
    panel.append(coverage);
    const rangeSection = document.createElement('details');
    rangeSection.className = 'vc-range';
    rangeSection.open = !!viewState.rangeOpen;
    const rangeLabel = document.createElement('summary');
    rangeLabel.textContent = 'Select a number range';
    rangeSection.append(rangeLabel, numberControls);
    panel.append(rangeSection);
    panel.append(toolbar, viewControls, savedViews, listWrap, filterManager, selectionReview);

    footer = document.createElement('div');
    footer.className = 'vc-footer';

    const status = document.createElement('div');
    status.className = 'vc-status';
    status.setAttribute('role', 'status');
    status.textContent = 'Choose Archive to keep chats recoverable, or Delete to remove them permanently.';

    const footerActions = document.createElement('div');
    footerActions.className = 'vc-footer-actions';
    const cleanupField = document.createElement('label');
    cleanupField.className = 'vc-field';
    cleanupField.textContent = 'Selected chat action';
    const cleanupAction = document.createElement('select');
    cleanupAction.className = 'vc-input';
    cleanupAction.setAttribute('aria-label', 'Selected chat action');
    for (const [value, text] of [['archive', 'Archive'], ['delete', 'Delete permanently']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = text; cleanupAction.append(option);
    }
    cleanupAction.onchange = refreshSelection;
    if (viewState.action === 'delete') cleanupAction.value = 'delete';
    cleanupField.append(cleanupAction);

    const close = button('Cancel', 'secondary');
    close.onclick = () => overlay.remove();

    const stop = button('Stop after current chat', 'secondary');
    stop.hidden = true;
    stop.onclick = () => {
      stopRequested = true;
      stop.disabled = true;
      status.textContent = 'Stopping after the current chat finishes. Remaining chats will stay selected.';
    };
    const retry = button('Retry failed', 'accent');
    retry.hidden = true;
    const failureList = document.createElement('div');
    failureList.className = 'vc-detail';
    failureList.style.cssText = 'max-height:90px;overflow:auto;white-space:pre-wrap';
    failureList.hidden = true;
    const progress = document.createElement('progress');
    progress.setAttribute('aria-label', 'Cleanup progress');
    progress.style.cssText = 'width:100%;accent-color:var(--vc-accent)';
    progress.hidden = true;
    const statusBlock = document.createElement('div');
    statusBlock.style.cssText = 'flex:1;min-width:0';
    statusBlock.append(status, progress, failureList);

    remove = button('Delete selected', 'danger');
    async function cleanupSelection(selected, kind = cleanupAction.value) {
      if (running) return;
      selected = selected.filter(item => !item.removed && !isChatLocked(item.chat));
      if (!selected.length) {
        status.dataset.state = 'error';
        status.textContent = 'Nothing selected.';
        return;
      }

      const verb = kind === 'archive' ? 'Archive' : 'Delete';
      const completedVerb = kind === 'archive' ? 'archived' : 'deleted';
      const confirmed = confirm(`${verb} ${selected.length} selected ${current} chat(s)?\n\n${kind === 'archive' ? 'Archived chats are kept rather than permanently deleted.' : 'This cannot be undone.'}`);
      if (!confirmed) return;

      running = true;
      overlay.dataset.running = 'true';
      stopRequested = false;
      stop.hidden = false;
      stop.disabled = false;
      retry.hidden = true;
      failureList.hidden = true;
      progress.hidden = false;
      progress.max = selected.length;
      progress.value = 0;
      const controls = [...panel.querySelectorAll('button,input,select')].filter(control => control !== stop);
      const previousDisabled = controls.map(control => control.disabled);
      for (const control of controls) control.disabled = true;
      status.dataset.state = '';
      const result = await runChatBatch(selected, async item => {
        await (kind === 'archive' ? archiveChat(item.chat) : deleteChat(item.chat));
        forgetChat(item.chat.href);
        item.removed = true;
        item.checkbox.checked = false;
      }, () => stopRequested, (index, total, item) => {
        progress.value = index;
        status.textContent = `${index} of ${total} processed · ${kind === 'archive' ? 'Archiving' : 'Deleting'} ${item.chat.title}`;
      });
      progress.value = result.completed.length + result.failed.length;
      failedItems = result.failed.map(failure => failure.item);
      failedKind = kind;
      retry.textContent = kind === 'archive' ? 'Retry failed archives' : 'Retry failed deletions';
      failureList.replaceChildren();
      for (const failure of result.failed) {
        failure.item.row.style.borderColor = 'var(--vc-danger)';
        const detail = document.createElement('div');
        detail.textContent = `${failure.item.chat.title}: ${failure.message}`;
        failureList.append(detail);
      }
      failureList.hidden = !result.failed.length;
      retry.hidden = !result.failed.length;
      const counts = `${result.completed.length} ${completedVerb} · ${result.failed.length} failed · ${result.pending.length} remaining`;
      if (result.failed.length) {
        status.dataset.state = 'error';
        status.textContent = counts;
      } else {
        status.dataset.state = 'success';
        status.textContent = result.pending.length ? `Stopped. ${counts}` : counts;
      }
      running = false;
      delete overlay.dataset.running;
      stop.hidden = true;
      controls.forEach((control, index) => { control.disabled = previousDisabled[index]; });
      retry.disabled = false;
      refreshNumberRange();
      refreshSelection();
      if (selectionMode) renderSelectedReview();
    }
    remove.onclick = () => cleanupSelection(rows.filter(item => item.checkbox.checked));
    retry.onclick = () => cleanupSelection(failedItems.filter(item => item.checkbox.checked), failedKind);

    footerActions.append(cleanupField, stop, retry, close, remove);
    footer.append(statusBlock, footerActions);
    panel.appendChild(footer);

    overlay.appendChild(panel);
    overlay.addEventListener('click', event => {
      if (event.target === overlay && !running) overlay.remove();
    });
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !running) {
        overlay.remove();
        document.getElementById(APP_ID + '-launcher')?.focus();
      }
      if (event.key === 'Tab') {
        const controls = [...panel.querySelectorAll('button,input,select,summary')].filter(element => !element.disabled && visible(element));
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });

    document.body.appendChild(overlay);
    function updateBackLabel() {
      backIcon.setAttribute('aria-label', filterMode || selectionMode ? 'Back to chats' : 'Back to AI Tools');
    }
    updateBackLabel();
    refreshNumberRange();
    refreshSelection();
    backIcon.focus();
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


  async function chatCleaner(forceRefresh = false) {
    activeFilters = loadFilters();
    document.getElementById(APP_ID + "-modal")?.remove();

    if (!forceRefresh && cachedHistory?.size) {
      const chats = rememberChats(getChatLinks());
      makeOverlay(chats.map(classify));
      return;
    }

    const loading = document.createElement("div");
    loading.innerHTML = '<div class="acus-status">Loading full chat history...</div>';
    modal("Chat Cleaner", loading);
    const status = loading.querySelector(".acus-status");

    const scannedChats = await loadAllChats((count, isLoading) => {
      status.textContent = isLoading ? `Loading chat history (${count})...` : `${count} chats loaded`;
    });

    const chats = rememberChats(scannedChats);
    if (!loading.isConnected) return;
    document.getElementById(APP_ID + "-modal")?.remove();
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
        checkbox.disabled = isChatLocked(chat);
        checkbox.checked = selected.has(chat.href);
        checkbox.onchange = () => {
          if (checkbox.checked) selected.add(chat.href);
          else selected.delete(chat.href);
          row.classList.toggle("acus-selected", checkbox.checked);
          refreshControls();
        };

        const title = document.createElement("span");
        title.textContent = `${isChatLocked(chat) ? '🔒 Locked · ' : ''}${chat.title}`;

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
      for (const chat of matchingChats()) if (!isChatLocked(chat)) selected.add(chat.href);
      render();
      refreshControls();
    };

    deselect.onclick = () => {
      selected.clear();
      render();
      refreshControls();
    };

    submit.onclick = async () => {
      const chosen = chats.filter(chat => selected.has(chat.href) && !isChatLocked(chat));
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

  function domMessageText(node, plain = false) {
    if (node.nodeType === 3) return plain ? node.textContent : node.textContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/([\\`*_[\]])/g, '\\$1');
    if (node.nodeType !== 1 || ['BUTTON', 'SVG', 'SCRIPT', 'STYLE', 'NOSCRIPT'].includes(node.tagName) || node.getAttribute('aria-hidden') === 'true') return '';
    const children = () => [...node.childNodes].map(child => domMessageText(child, plain)).join('');
    const tag = node.tagName;
    if (tag === 'BR') return '\n';
    if (tag === 'PRE') {
      const code = node.querySelector('code') || node;
      const text = code.textContent;
      if (plain) return `\n${text}\n`;
      const runs = [...text.matchAll(/`+/g)].map(match => match[0].length);
      const fence = '`'.repeat(Math.max(3, ...runs.map(length => length + 1)));
      const language = (code.className || '').match(/(?:language|lang)-([a-zA-Z0-9_+-]+)/)?.[1] || '';
      return `\n\n${fence}${language}\n${text}\n${fence}\n\n`;
    }
    if (tag === 'CODE') {
      if (plain) return node.textContent;
      const fence = '`'.repeat(Math.max(1, ...[...node.textContent.matchAll(/`+/g)].map(match => match[0].length + 1)));
      return `${fence} ${node.textContent} ${fence}`;
    }
    if (tag === 'IMG') return `[Image: ${node.getAttribute('alt') || 'attachment'}]`;
    if (tag === 'A') {
      const label = children(), href = node.getAttribute('href') || '';
      if (!/^https?:\/\//i.test(href)) return label;
      return plain ? `${label} (${href})` : `[${label}](${href.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29')})`;
    }
    if (tag === 'UL' || tag === 'OL') return '\n' + [...node.children].filter(child => child.tagName === 'LI').map((child, index) => `${tag === 'OL' ? `${index + 1}.` : '-'} ${domMessageText(child, plain).trim()}\n`).join('') + '\n';
    if (tag === 'TABLE') {
      const rows = [...node.querySelectorAll('tr')].map(row => [...row.children].map(cell => domMessageText(cell, plain).trim().replace(/\|/g, '\\|')));
      return '\n\n' + rows.map((cells, index) => '| ' + cells.join(' | ') + ' |\n' + (!plain && index === 0 ? '| ' + cells.map(() => '---').join(' | ') + ' |\n' : '')).join('') + '\n';
    }
    const text = children();
    if (/^H[1-6]$/.test(tag)) return `\n\n${plain ? '' : '#'.repeat(Number(tag[1])) + ' '}${text}\n\n`;
    if (tag === 'STRONG' || tag === 'B') return plain ? text : `**${text}**`;
    if (tag === 'EM' || tag === 'I') return plain ? text : `*${text}*`;
    if (tag === 'BLOCKQUOTE') return '\n\n' + (plain ? text : text.trim().split('\n').map(line => '> ' + line).join('\n')) + '\n\n';
    return ['P', 'DIV', 'ARTICLE', 'SECTION', 'LI'].includes(tag) ? `\n${text}\n` : text;
  }

  function conversationNodes() {
    const root = document.querySelector('main,[role="main"]');
    if (!root) return [];
    let nodes = [...root.querySelectorAll('[data-message-author-role], [data-testid="user-message"], [data-testid="assistant-message"]')];
    if (!nodes.length && platform() === 'Claude') nodes = [...root.querySelectorAll('[data-is-streaming],.font-claude-message,.font-claude-response')];
    nodes = nodes.filter(node => !utilityContains(node) && visible(node));
    return nodes.filter(node => !nodes.some(other => other !== node && other.contains(node)));
  }

  function messageRole(node) {
    const role = node.getAttribute('data-message-author-role');
    if (['user', 'assistant', 'system', 'tool'].includes(role)) return role;
    if (node.getAttribute('data-testid') === 'user-message') return 'user';
    if (node.getAttribute('data-testid') === 'assistant-message' || node.hasAttribute('data-is-streaming') || node.classList.contains('font-claude-response')) return 'assistant';
    return 'unknown';
  }

  function conversationSignature() {
    return promptId(conversationNodes().map(node => `${node.getAttribute('data-message-id') || node.id}|${messageRole(node)}|${node.textContent}`).join('\n'));
  }

  function captureConversation(chat) {
    const nodes = conversationNodes();
    if (!nodes.length) throw new Error('No supported loaded messages were found. Open the conversation and load its messages first.');
    const messages = nodes.map(node => {
      const clone = node.cloneNode(true);
      clone.querySelectorAll('button,svg,script,style,[aria-hidden="true"]').forEach(element => element.remove());
      const content = clone;
      return { role: messageRole(node), text: domMessageText(content, true).replace(/^\n+|\n+$/g, ''), markdown: domMessageText(content).replace(/^\n+|\n+$/g, '') };
    }).filter(message => message.text.trim());
    if (!messages.length) throw new Error('Loaded messages contained no exportable text.');
    return { title: chat.title, href: chat.href, source: location.origin + chat.href, client: platform(), capturedAt: new Date().toISOString(), complete: false, coverage: 'Loaded messages only. Earlier unloaded messages, alternate branches, and attachment files are not included.', messages };
  }

  async function waitForConversation(chat, before, sameRoute, status) {
    let previous = '', stable = 0;
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      if (exportStopped) throw new Error('Export paused.');
      const matches = location.pathname.replace(/\/$/, '') === chat.href.replace(/\/$/, '');
      const nodes = matches ? conversationNodes() : [];
      const signature = nodes.length ? conversationSignature() : '';
      const streaming = [...document.querySelectorAll('[data-is-streaming="true"],button[data-testid="stop-button"]')].some(node => !utilityContains(node) && visible(node));
      if (signature && (sameRoute || signature !== before) && !streaming) stable = signature === previous ? stable + 1 : 0;
      else stable = 0;
      if (stable >= 5) return;
      previous = signature;
      status.textContent = `Waiting for loaded messages: ${chat.title}. Slower connections can take up to 90 seconds.`;
      await sleep(400);
    }
    throw new Error('Messages did not settle or could not be distinguished from the previous conversation. Try opening this chat manually and exporting it again.');
  }

  function snapshotText(snapshot, format) {
    if (format === 'json') return JSON.stringify(snapshot, null, 2);
    const title = snapshot.title.replace(/[\r\n]+/g, ' ');
    const header = `${format === 'md' ? '# ' : ''}${title}\n\nSource: ${snapshot.source}\nCaptured: ${snapshot.capturedAt}\nCoverage: ${snapshot.coverage}\n\n`;
    return header + snapshot.messages.map(message => `${format === 'md' ? '## ' : ''}${message.role[0].toUpperCase() + message.role.slice(1)}\n\n${format === 'md' ? message.markdown : message.text}\n`).join('\n');
  }

  function exportFilename(title, index, extension) {
    let base = [...String(title).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')].slice(0, 80).join('').replace(/[ .]+$/g, '').trim() || 'Conversation';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) base = 'Chat_' + base;
    return `${String(index + 1).padStart(4, '0')}_${base}.${extension}`;
  }

  function crc32(bytes) {
    if (!crc32.table) crc32.table = Array.from({ length: 256 }, (_, value) => { let item = value; for (let bit = 0; bit < 8; bit++) item = (item >>> 1) ^ ((item & 1) ? 0xedb88320 : 0); return item >>> 0; });
    let crc = 0xffffffff;
    for (const byte of bytes) crc = (crc >>> 8) ^ crc32.table[(crc ^ byte) & 0xff];
    return (crc ^ 0xffffffff) >>> 0;
  }

  function zipFiles(files) {
    if (files.length > 65535) throw new Error('Too many files for this ZIP format.');
    const encoder = new TextEncoder(), chunks = [], directory = [];
    let offset = 0, directorySize = 0;
    for (const file of files) {
      const name = encoder.encode(file.name), data = typeof file.text === 'string' ? encoder.encode(file.text) : file.bytes;
      if (name.length > 65535 || !data || data.length > 0xffffffff) throw new Error('A ZIP entry is too large.');
      const crc = crc32(data), header = new Uint8Array(30), view = new DataView(header.buffer);
      view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true); view.setUint16(12, 33, true);
      view.setUint32(14, crc, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true); view.setUint16(26, name.length, true);
      chunks.push(header, name, data);
      const central = new Uint8Array(46), cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true); cv.setUint16(14, 33, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
      directory.push(central, name); directorySize += central.length + name.length; offset += header.length + name.length + data.length;
      if (offset + directorySize > 0xffffffff) throw new Error('This ZIP would exceed the supported archive size. Export fewer conversations.');
    }
    const end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, directorySize, true); ev.setUint32(16, offset, true);
    const result = new Uint8Array(offset + directorySize + end.length);
    let position = 0; for (const chunk of [...chunks, ...directory, end]) { result.set(chunk, position); position += chunk.length; }
    return result;
  }

  function backupFiles(job, format) {
    const entries = job.captured.map((snapshot, index) => ({ name: exportFilename(snapshot.title, index, format), text: snapshotText(snapshot, format) }));
    const manifest = { format: 'ai-client-utility-suite-conversations', version: 1, complete: false, coverage: 'Loaded message snapshots, not a complete account backup.', conversations: job.captured.map((snapshot, index) => ({ title: snapshot.title, source: snapshot.source, capturedAt: snapshot.capturedAt, messageCount: snapshot.messages.length, complete: false, file: entries[index].name })), failed: job.failed, pending: job.targets.slice(job.cursor) };
    entries.push({ name: 'manifest.json', text: JSON.stringify(manifest, null, 2) });
    entries.push({ name: 'index.md', text: '# Conversation export\n\nLoaded messages only. Check each conversation before using this export as a backup.\n\n' + manifest.conversations.map(item => `- [${item.title.replace(/[\[\]\r\n]/g, ' ')}](${encodeURIComponent(item.file)}) · ${item.messageCount} messages · incomplete coverage`).join('\n') });
    return entries;
  }

  function downloadFile(data, name, type = 'text/plain;charset=utf-8') {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function conversationExports(initial = [], onBack = openMenu) {
    if (!Array.isArray(initial)) initial = [];
    const stored = readStored(clientKey(EXPORT_KEY), null);
    let job = stored?.version === 1 && Array.isArray(stored.targets) && Array.isArray(stored.captured) && Array.isArray(stored.failed) ? stored : null;
    if (job) job.targets = job.targets.filter(chat => validChatHref(chat.href));
    const chats = [...new Map([...(cachedHistory ? [...cachedHistory.values()] : getChatLinks()), ...initial].filter(chat => validChatHref(chat.href)).map(chat => [chat.href, chat])).values()];
    if (validChatHref(location.pathname) && !chats.some(chat => chat.href === location.pathname)) chats.unshift({ href: location.pathname, title: document.title || 'Current conversation' });
    const selected = new Set(initial.map(chat => chat.href));
    if (!initial.length && validChatHref(location.pathname)) selected.add(location.pathname);
    const box = document.createElement('div');
    box.innerHTML = `<p class="acus-muted">Exports capture loaded message text and code. They may omit unloaded messages, alternate branches, attachments, or unsupported content. Every file is marked as incomplete coverage. Open and load older messages in the client when needed.</p><p class="acus-muted">Capture opens each selected chat. Captured text stays in a local draft until cleared or replaced. If the page reloads, reopen this tool and choose Resume draft.</p>
      <details open class="acus-export-picker"><summary>Choose conversations</summary><label class="acus-field">Filter titles<input type="search" class="acus-input acus-filter"></label><div class="acus-prompt-actions"><button class="acus-select">Select shown</button><button class="acus-clear">Deselect all</button></div><div class="acus-export-list"></div></details>
      <div class="acus-prompt-actions"><button class="acus-start acus-primary">Capture selected</button><button class="acus-resume">Resume draft</button><button class="acus-retry">Retry failed captures</button><button class="acus-stop" hidden>Pause export</button><button class="acus-discard">Clear export draft</button></div><p class="acus-status" role="status"></p>
      <section class="acus-export-review" hidden><h3>Review captured messages</h3><label class="acus-field">Conversation<select class="acus-input acus-snapshot"></select></label><label class="acus-field">File format<select class="acus-input acus-format"><option value="md">Markdown</option><option value="txt">Plain text</option><option value="json">JSON</option></select></label><label class="acus-field">Loaded messages preview<textarea class="acus-input acus-preview" readonly></textarea></label><div class="acus-prompt-actions"><button class="acus-download acus-primary">Download this conversation</button><button class="acus-zip">Download ZIP with index</button></div></section>`;
    const status = box.querySelector('[role="status"]'), filter = box.querySelector('.acus-filter'), list = box.querySelector('.acus-export-list'), snapshotSelect = box.querySelector('.acus-snapshot'), format = box.querySelector('.acus-format');
    const save = () => GM_setValue(clientKey(EXPORT_KEY), job ? JSON.stringify(job) : '');
    const preview = () => { const snapshot = job?.captured[Number(snapshotSelect.value)]; box.querySelector('.acus-preview').value = snapshot ? snapshotText(snapshot, format.value) : ''; };
    const render = () => {
      list.replaceChildren();
      for (const chat of chats.filter(item => item.title.toLowerCase().includes(filter.value.trim().toLowerCase()))) {
        const row = document.createElement('label'); row.className = 'acus-archive-row';
        const check = document.createElement('input'); check.type = 'checkbox'; check.checked = selected.has(chat.href); check.onchange = () => { if (check.checked) selected.add(chat.href); else selected.delete(chat.href); render(); };
        const title = document.createElement('span'); title.textContent = chat.title; row.append(check, title); list.append(row);
      }
      box.querySelector('.acus-start').disabled = !selected.size; box.querySelector('.acus-start').textContent = `Capture selected (${selected.size})`;
      box.querySelector('.acus-resume').hidden = !job || job.cursor >= job.targets.length;
      box.querySelector('.acus-retry').hidden = !job?.failed.length;
      box.querySelector('.acus-discard').hidden = !job;
      box.querySelector('.acus-export-review').hidden = !job?.captured.length;
      snapshotSelect.replaceChildren();
      job?.captured.forEach((snapshot, index) => { const option = document.createElement('option'); option.value = String(index); option.textContent = `${snapshot.title} · ${snapshot.messages.length} loaded messages`; snapshotSelect.append(option); });
      preview();
      if (job) status.textContent = `${job.captured.length} captured · ${job.failed.length} failed · ${Math.max(0, job.targets.length - job.cursor)} pending. Review coverage before downloading.`;
    };
    const run = async () => {
      if (!job || exportRunning) return;
      exportRunning = true; exportStopped = false; box.querySelector('.acus-stop').hidden = false;
      const modalRoot = box.closest('.acus-modal');
      for (const control of modalRoot.querySelectorAll('button,input,select,textarea')) if (!control.classList.contains('acus-stop')) control.disabled = true;
      try {
        for (; job.cursor < job.targets.length;) {
          if (exportStopped || !box.isConnected) break;
          const chat = job.targets[job.cursor], before = conversationSignature(), sameRoute = location.pathname.replace(/\/$/, '') === chat.href.replace(/\/$/, '');
          save();
          try {
            status.textContent = `Opening ${job.cursor + 1} of ${job.targets.length}: ${chat.title}`;
            if (!sameRoute) { const link = await locateChatLink(chat.href); if (!link) throw new Error('Chat is not available in the sidebar. Open it manually before retrying.'); activate(link); }
            await waitForConversation(chat, before, sameRoute, status);
            const snapshot = captureConversation(chat);
            job.captured = [...job.captured.filter(item => item.href !== chat.href), snapshot];
          } catch (error) {
            if (exportStopped || !box.isConnected) break;
            job.failed.push({ chat, message: error instanceof Error ? error.message : String(error) });
          }
          job.cursor++; save();
        }
      } finally {
        exportRunning = false; box.querySelector('.acus-stop').hidden = true;
        for (const control of modalRoot.querySelectorAll('button,input,select,textarea')) control.disabled = false;
        save(); render();
        if (exportStopped) status.textContent = 'Export paused. Captured messages are kept in the local draft; resume when ready.';
        if (job.failed.length) {
          const failures = document.createElement('p'); failures.className = 'acus-muted'; failures.textContent = job.failed.map(failure => `${failure.chat.title}: ${failure.message}`).join('\n'); status.append(failures);
        }
      }
    };
    filter.oninput = render;
    box.querySelector('.acus-select').onclick = () => { chats.filter(chat => chat.title.toLowerCase().includes(filter.value.trim().toLowerCase())).forEach(chat => selected.add(chat.href)); render(); };
    box.querySelector('.acus-clear').onclick = () => { selected.clear(); render(); };
    box.querySelector('.acus-start').onclick = () => {
      if (job?.captured.length && !confirm('Replace the local export draft with a new capture batch? Download the current draft first if you want to keep it.')) return;
      job = { version: 1, targets: chats.filter(chat => selected.has(chat.href)).map(chat => ({ href: chat.href, title: chat.title })), cursor: 0, captured: [], failed: [] }; save(); run();
    };
    box.querySelector('.acus-resume').onclick = run;
    box.querySelector('.acus-retry').onclick = () => { job.targets = job.failed.map(failure => failure.chat); job.failed = []; job.cursor = 0; save(); run(); };
    box.querySelector('.acus-stop').onclick = () => { exportStopped = true; status.textContent = 'Pausing export…'; };
    box.querySelector('.acus-discard').onclick = () => { if (!confirm('Clear the local export draft? Original conversations are not changed.')) return; job = null; save(); render(); status.textContent = 'Export draft cleared.'; };
    snapshotSelect.onchange = preview; format.onchange = preview;
    box.querySelector('.acus-download').onclick = () => { const snapshot = job.captured[Number(snapshotSelect.value)]; downloadFile(snapshotText(snapshot, format.value), exportFilename(snapshot.title, Number(snapshotSelect.value), format.value), format.value === 'json' ? 'application/json' : 'text/plain;charset=utf-8'); status.textContent = 'Loaded message snapshot downloaded.'; };
    box.querySelector('.acus-zip').onclick = () => { try { downloadFile(zipFiles(backupFiles(job, format.value)), 'conversation_export.zip', 'application/zip'); status.textContent = 'ZIP downloaded with coverage information and an index.'; } catch (error) { status.textContent = error.message; } };
    render(); modal('Conversation export', box, onBack, 'Back to previous screen');
  }

  function toolCatalog() {
    return [
      { group: 'Chats', name: '🔎 Search Chats', description: 'Find conversations by title', run: searchChats },
      { group: 'Chats', name: '🧹 Chat Cleaner', description: 'Search, bookmark, lock, export, and clean up', run: () => chatCleaner(false) },
      { group: 'Chats', name: '📦 Bulk Archive', description: 'Archive selected sidebar conversations', run: bulkArchive },
      { group: 'Chats', name: '★ Chat bookmarks', description: 'Quick access to important conversations', run: bookmarkedChats },
      { group: 'Chats', name: '⇩ Conversation export', description: 'Preview loaded messages and download files or a ZIP', run: conversationExports },
      { group: 'Writing', name: '📚 Prompt Library', description: 'Templates, favorites, folders, and version history', run: () => promptLibrary() },
      { group: 'Writing', name: '✎ Prompt Coach', description: 'Review your request and refine its wording locally', run: () => promptCoach() },
      { group: 'Writing', name: '↔ Text tools', description: 'Clean spacing, convert Markdown, and count words', run: textTools },
      { group: 'Preferences', name: '⚙ Settings', description: 'Appearance, cleaner defaults, and shortcuts', run: settingsScreen },
      { group: 'Preferences', name: '⌨ Shortcuts', description: 'Find tools and prompts with Alt + Shift + K', run: shortcutPalette },
      { group: 'Preferences', name: '? Troubleshooting', description: 'Missing buttons, browser setup, loading, and support checks', run: troubleshooting }
    ];
  }

  function troubleshooting() {
    const box = document.createElement('div');
    box.innerHTML = `<p class="acus-muted">Choose the problem below. Checks describe this page; they cannot inspect extension permissions or prove that every client feature works.</p>
      <details open><summary>AI Tools button is missing</summary><ol class="acus-tips"><li>Open chatgpt.com or claude.ai in a normal browser tab. Other domains and browser side panels may not run the script.</li><li>Open Tampermonkey and check that both the extension and AI Client Utility Suite are enabled. Install the latest script if it is missing from the dashboard.</li><li>In your browser's extension settings, allow Tampermonkey access to this site. Follow the Browser permission setup section below for your browser.</li><li>Refresh the page after changing permissions. Private windows may need separate extension permission.</li><li>If Tampermonkey lists the suite as enabled on this page but the button is still missing, try Alt + Shift + K if the suite shortcut is enabled. Temporarily disable other userscripts on this site to check for conflicts, then restore them.</li></ol><p><a href="https://www.tampermonkey.net/faq.php?locale=en&q=Q209" target="_blank" rel="noopener noreferrer">Tampermonkey userscript permission guide</a></p></details>
      <details><summary>Browser permission setup</summary><p>First enable Tampermonkey and the suite in its dashboard. Then follow your browser below. Setting names vary by version; follow any permission prompt shown by Tampermonkey and refresh the site afterward.</p>
      <h4>Chrome</h4><p>Open chrome://extensions → Tampermonkey → Details. Enable Allow User Scripts if shown, or Developer Mode as directed by Tampermonkey. Under Site access, allow chatgpt.com or claude.ai. For an incognito window, also enable Allow in incognito.</p>
      <h4>Edge</h4><p>Open edge://extensions → Tampermonkey → Details. Allow access to the affected site. Enable Allow User Scripts if offered, or Developer Mode if Tampermonkey requests it. InPrivate windows need separate permission.</p>
      <h4>Brave</h4><p>Open brave://extensions → Tampermonkey → Details. Allow site access and enable Allow User Scripts if shown, or Developer Mode as directed by Tampermonkey. Private windows need separate permission.</p>
      <h4>Opera and Opera GX</h4><p>Open opera://extensions and expand Tampermonkey's details. Allow access to the site and enable Allow User Scripts if offered, or Developer Mode as directed by Tampermonkey. If Allow access to search page results is shown and the script fails after following a search result, check that permission too. Private windows need separate permission.</p>
      <h4>Vivaldi and other Chromium browsers</h4><p>In Vivaldi, open vivaldi://extensions. In other browsers, use the Extensions manager. Open Tampermonkey's details, allow site access, and enable Allow User Scripts if offered, or Developer Mode if requested. Private windows may need separate permission.</p>
      <h4>Firefox</h4><p>Open about:addons → Extensions → Tampermonkey. Enable the extension, review its Permissions tab, and allow any required website access. For private windows, select Allow under Run in Private Windows in its details. Chrome's Allow User Scripts and Developer Mode instructions do not apply to Firefox.</p>
      <h4>Safari on Mac</h4><p>Open Safari → Settings → Extensions and enable Tampermonkey. Open its website permissions and allow the affected site. If using a private window, allow the extension in Private Browsing when that option is available. Chrome's Developer Mode instructions do not apply.</p>
      <h4>Mobile browsers and managed computers</h4><p>These are desktop setup instructions, not a guarantee of support in every browser. Mobile browsers vary in userscript extension support. Use a manager that supports this script's Tampermonkey storage APIs. If your browser has no compatible extension support, changing permissions will not enable the toolbox. Work or school policies may prevent userscripts; contact the administrator when settings are locked.</p></details>
      <details><summary>Chats are missing or loading slowly</summary><p>The suite indexes sidebar entries that the client makes available. Open the sidebar, wait for the page to finish loading, and use Refresh history in Chat Cleaner. Cached history may be incomplete. Chat numbers follow indexed sidebar order and are not verified creation dates.</p><p>For exports, wait for the conversation to load. Capture waits up to 90 seconds per chat. Pause and resume the draft when the connection improves, or retry failed captures. After a page reload, reopen Conversation export and choose Resume draft. Exports only include loaded messages.</p></details>
      <details><summary>A button or cleanup action fails</summary><p>Finish or close any native client confirmation first. Check whether the chat is locked, then review the reported failure. Retry only the chats you still want to process. If the client layout changed, install the latest suite update and refresh. Never repeat a delete action without checking whether the original conversation still exists.</p></details>
      <details><summary>Saved prompts or settings seem missing</summary><p>Check that you are using the same browser profile and userscript manager. Storage does not automatically sync between computers. Import a Prompt Library backup if you have one. Bookmarks, locks, history, and export drafts are separate for each client. Export the library before reinstalling the extension or clearing its data.</p></details>
      <h3>Page checks</h3><button class="acus-checks">Refresh checks</button><label class="acus-field">Support summary<textarea class="acus-input acus-report" readonly></textarea></label><button class="acus-copy acus-primary">Copy support summary</button><p role="status"></p><p class="acus-muted">The summary excludes chat titles, messages, prompts, and the current conversation address. Review it before sharing. Browser version and extension permission details must be added manually.</p><p><a href="https://github.com/marcoaval/AI-Client-Utility-Suite/blob/main/TROUBLESHOOTING.md" target="_blank" rel="noopener noreferrer">Open the troubleshooting guide</a> · <a href="https://github.com/marcoaval/AI-Client-Utility-Suite/issues/new" target="_blank" rel="noopener noreferrer">Report a problem</a></p>`;
    const report = box.querySelector('.acus-report');
    const refresh = () => {
      let storage = 'Unavailable';
      try { GM_getValue(SETTINGS_KEY, null); storage = 'Read available (write not tested)'; } catch { storage = 'Read failed'; }
      report.value = [
        'AI Client Utility Suite 2.1.2',
        `Checked: ${new Date().toISOString()}`,
        `Site: ${location.hostname}`,
        `Page load: ${document.readyState}`,
        `Launcher present: ${document.getElementById(APP_ID + '-launcher') ? 'Yes' : 'No'}`,
        `Userscript storage: ${storage}`,
        `Sidebar chats currently detected: ${getChatLinks().length}`,
        `Supported loaded message elements: ${conversationNodes().length}`,
        `Suite shortcut: ${loadSettings().shortcutEnabled ? 'Enabled' : 'Disabled'}`,
        'Extension permissions: Check manually in browser settings'
      ].join('\n');
    };
    box.querySelector('.acus-checks').onclick = refresh;
    box.querySelector('.acus-copy').onclick = () => copyText(report.value, message => { box.querySelector('[role="status"]').textContent = message; });
    modal('Troubleshooting', box); refresh();
  }

  function shortcutPalette() {
    if (exportRunning || document.getElementById('vanick-cleaner-overlay')?.dataset.running === 'true') return;
    document.getElementById('vanick-cleaner-overlay')?.remove();
    const box = document.createElement('div');
    box.innerHTML = '<p class="acus-muted">Alt + Shift + K opens this menu. Search tools or saved prompts. Disable the shortcut in Settings if it conflicts with another app.</p><label class="acus-field">Find a tool or prompt<input class="acus-input" type="search"></label><div class="acus-menu"></div>';
    const search = box.querySelector('input'); search.value = paletteQuery;
    const render = () => {
      paletteQuery = search.value;
      const query = search.value.trim().toLowerCase(), list = box.querySelector('.acus-menu'); list.replaceChildren();
      const entries = [...toolCatalog().filter(tool => !tool.name.includes('Shortcuts')).map(tool => ({ name: tool.name, description: tool.description, run: tool.run })), ...loadPrompts().map((prompt, index) => ({ name: prompt.name, description: `Saved prompt · ${prompt.folder || 'Unfiled'}`, run: () => promptTemplate(prompt, index, shortcutPalette) }))];
      for (const entry of entries.filter(item => `${item.name} ${item.description}`.toLowerCase().includes(query))) {
        const action = button(entry.name); action.className = 'acus-menu-btn'; action.onclick = () => entry.run();
        const detail = document.createElement('span'); detail.textContent = entry.description; action.append(detail); list.append(action);
      }
      if (!list.children.length) list.textContent = 'No tools or prompts match.';
    };
    search.oninput = render; render(); modal('Shortcuts', box); search.focus();
  }

  function openMenu() {
    if (exportRunning || document.getElementById('vanick-cleaner-overlay')?.dataset.running === 'true') return;
    const box = document.createElement("div");
    box.innerHTML = '<label class="acus-field">Find a tool<input type="search" class="acus-input" placeholder="Search every tool"></label><div class="acus-prompt-actions acus-groups"></div><div class="acus-menu acus-tool-grid"></div>';
    const search = box.querySelector('input'), groups = box.querySelector('.acus-groups'), list = box.querySelector('.acus-menu');
    const groupButtons = [];
    for (const group of ['Chats', 'Writing', 'Preferences']) { const tab = button(group); tab.onclick = () => { menuGroup = group; search.value = ''; render(); }; groups.append(tab); groupButtons.push({ tab, group }); }
    function render() {
      list.replaceChildren();
      const query = search.value.trim().toLowerCase();
      for (const { tab, group } of groupButtons) { tab.setAttribute('aria-pressed', String(!query && menuGroup === group)); tab.classList.toggle('acus-primary', !query && menuGroup === group); }
      toolCatalog().filter(tool => query ? `${tool.name} ${tool.description}`.toLowerCase().includes(query) : tool.group === menuGroup).forEach(({ name: label, run: fn, description }) => {
      const b = document.createElement("button");
      b.className = "acus-menu-btn";
      const name = document.createElement('strong');
      name.textContent = label;
      const detail = document.createElement('span');
      detail.textContent = description;
      b.append(name, detail);
      b.onclick = () => fn();
      list.append(b);
      });
      if (!list.children.length) list.textContent = 'No tools match this search.';
    }
    search.oninput = render; render();
    modal("AI Tools · " + platform(), box, null);
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
      .acus-modal{background:#101827;border:1px solid #64748b;box-shadow:0 24px 80px #0008}
      .acus-head{background:#17243b;border-bottom:1px solid #64748b;gap:14px;z-index:1}
      .acus-head strong{flex:1;font-size:18px}
      .acus-modal button{font:600 14px system-ui;min-height:42px;padding:10px 14px;border:1px solid #64748b;border-radius:10px;background:#24334b;color:#f8fafc;cursor:pointer}
      .acus-modal button:hover:not(:disabled){background:#334966;border-color:#93c5fd}
      .acus-modal button:focus-visible,.acus-modal input:focus-visible,.acus-modal textarea:focus-visible{outline:3px solid #60a5fa;outline-offset:3px}
      .acus-modal button:disabled{opacity:.45;cursor:not-allowed}
      .acus-menu-btn{display:grid;gap:7px;width:100%;border-left:4px solid #60a5fa!important;text-align:left;padding:18px!important}
      .acus-menu-btn strong{font-size:16px}.acus-menu-btn span{color:#cbd5e1;font-size:13px;font-weight:400}
      .acus-input{background:#0b1220;border-color:#64748b;color:#f8fafc;font-size:14px}
      .acus-input::placeholder{color:#aebdd0}
      .acus-status,.acus-muted,.acus-library-status,.acus-archive-count,.acus-archive-progress{color:#cbd5e1}
      .acus-modal .acus-primary,.acus-modal .acus-archive-submit:not(:disabled){background:#1d4ed8;border-color:#3b82f6;color:#fff}
      .acus-modal .acus-primary:hover,.acus-modal .acus-archive-submit:not(:disabled):hover{background:#1e40af}
      #${APP_ID}-launcher{background:#1d4ed8;border-color:#60a5fa;color:white;min-height:44px;font-size:14px;padding:10px 17px}
      #${APP_ID}-launcher:hover{background:#1e40af;border-color:#bfdbfe}
      @media(max-width:640px){.acus-backdrop{padding:10px}.acus-modal{max-height:92vh}.acus-library-tools,.acus-archive-footer{flex-wrap:wrap}.acus-archive-progress{width:100%}}
      .acus-modal{background:var(--acus-panel);color:var(--acus-text);border-color:var(--acus-borderStrong)}
      .acus-head{background:var(--acus-surface);border-color:var(--acus-borderStrong)}
      .acus-modal button{background:var(--acus-surface);color:var(--acus-text);border-color:var(--acus-borderStrong)}
      .acus-modal button:hover:not(:disabled){background:var(--acus-surfaceHover);border-color:var(--acus-accent)}
      .acus-modal .acus-input{background:var(--acus-panel);color:var(--acus-text);border-color:var(--acus-borderStrong);font:inherit;min-height:44px}
      .acus-modal .acus-input::placeholder{color:var(--acus-muted)}
      .acus-modal .acus-muted,.acus-modal .acus-status,.acus-modal .acus-library-status,.acus-modal .acus-menu-btn span,.acus-modal .acus-archive-count,.acus-modal .acus-archive-progress{color:var(--acus-muted)}
      .acus-modal .acus-error{color:var(--acus-text);font-weight:700}
      .acus-modal .acus-primary,.acus-modal .acus-archive-submit:not(:disabled){background:var(--acus-accent);color:#fff;border-color:var(--acus-accent)}
      .acus-modal .acus-field{display:grid;gap:7px;font-weight:650;margin:12px 0}
      .acus-modal .acus-field .acus-input{margin:0;font-weight:400}
      .acus-modal .acus-check{display:flex;gap:9px;align-items:center;margin:12px 0}
      .acus-modal .acus-check input{width:20px;height:20px;accent-color:var(--acus-accent)}
      .acus-modal .acus-prompt-actions{flex-wrap:wrap;margin-top:14px;align-items:center}
      .acus-modal .acus-prompt{border-color:var(--acus-borderStrong);padding:18px 0}
      .acus-modal .acus-template-value{min-height:68px}
      .acus-modal .acus-row{color:var(--acus-text)}
      .acus-modal .acus-row:hover,.acus-modal .acus-archive-row:hover,.acus-modal .acus-archive-row.acus-selected{background:var(--acus-surfaceHover)}
      .acus-modal[data-text-size="large"],.acus-modal[data-text-size="large"] button,.acus-modal[data-text-size="large"] .acus-input,.acus-modal[data-text-size="large"] .acus-menu-btn span{font-size:16px}
      .acus-modal .acus-tool-grid,.acus-modal .acus-compare{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .acus-modal .acus-compare textarea,.acus-modal .acus-preview{min-height:220px}
      .acus-modal summary{cursor:pointer;padding:12px 0;min-height:44px;font-weight:650}
      .acus-modal .acus-export-list{max-height:200px;overflow:auto;border:1px solid var(--acus-borderStrong);border-radius:10px}
      .acus-modal .acus-tips{padding-left:24px;line-height:1.6}
      .acus-modal .acus-groups{margin-bottom:16px}
      #vanick-cleaner-overlay .vc-row-actions{display:flex;gap:6px;align-items:center}
      #vanick-cleaner-overlay .vc-row-actions button{padding:8px;font-size:13px}
      @media(max-width:640px){.acus-modal .acus-tool-grid,.acus-modal .acus-compare{grid-template-columns:1fr}#vanick-cleaner-overlay .vc-row-actions{flex-direction:column}}
    `;
    document.head.append(style);

    const btn = document.createElement("button");
    btn.id = APP_ID + "-launcher";
    btn.textContent = "🧰 AI Tools";
    btn.onclick = openMenu;
    ensureLauncherDock().append(btn);
  }

  cachedHistory = loadPersistentChatCache();
  if (cachedHistory) mergeChats(cachedHistory, getChatLinks());
  loadPrompts();
  inject();
  new MutationObserver(inject).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('keydown', event => {
    if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyK' && !event.repeat && loadSettings().shortcutEnabled) {
      if (exportRunning || document.getElementById('vanick-cleaner-overlay')?.dataset.running === 'true') return;
      event.preventDefault(); shortcutPalette();
    }
  });
})();
