const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../ai_client_utility_suite.user.js'), 'utf8');

function harness() {
  let now = 0;
  const state = { links: [], containers: [], onTick: () => {}, dialog: false, deleted: [], current: null, confirm: null };
  const storage = new Map();
  const context = vm.createContext({
    location: { hostname: 'chatgpt.com' }, console, Event,
    Date: class extends Date { static now() { return now; } },
    GM_getValue: (key, fallback) => storage.get(key) ?? fallback,
    GM_setValue: (key, value) => storage.set(key, value),
    document: { querySelectorAll: () => state.links, getElementById: () => null },
    tick: milliseconds => { now += milliseconds; state.onTick(milliseconds, now); },
    setTimeout: (resolve, milliseconds) => { now += milliseconds; state.onTick(milliseconds, now); resolve(); },
    containers: () => state.containers,
    nativeChats: () => state.links.map(link => ({ href: link.getAttribute('href'), title: link.getAttribute('href') })),
    nativeMenu: async chat => {
      assert.ok(await context.helpers.locateChatLink(chat.href), `Located ${chat.href} before opening its menu`);
      state.current = chat;
    },
    deleteCommand: () => ({ click() { state.dialog = true; } }),
    confirmation: () => state.dialog ? { click() {
      if (state.confirm) return state.confirm();
      state.links = state.links.filter(link => link.getAttribute('href') !== state.current.href);
      state.deleted.push(state.current.href);
      state.dialog = false;
    } } : null,
  });
  vm.runInContext(source.slice(0, source.lastIndexOf('  cachedHistory = loadPersistentChatCache();')) + `
    scrollContainersForChats = containers;
    getChatLinks = nativeChats;
    openChatMenu = nativeMenu;
    menuDeleteAction = deleteCommand;
    confirmationDeleteAction = confirmation;
    confirmationArchiveAction = () => null;
    activate = element => element.click();
    this.helpers = { locateChatLink, loadAllChats, rememberChats, chatLinkElements, deleteChat, runChatBatch, numberChats, parseNumberRange, chatMatchesNumberRange };
  })();`, context);
  state.h = context.helpers;
  state.storage = storage;
  state.link = href => ({ getAttribute: name => name === 'href' ? href : null });
  state.container = () => ({
    isConnected: true, scrollTop: 0, scrollHeight: 200, clientHeight: 200, events: 0,
    dispatchEvent(event) { assert.equal(event.type, 'scroll'); this.events++; },
  });
  return state;
}

test('older chat lookup waits for lazy history and dispatches scroll at the bottom', async () => {
  const s = harness();
  const container = s.container();
  s.containers = [container];
  s.onTick = (_, now) => {
    if (now >= 1200 && container.events >= 2) s.links = [s.link('/c/old')];
  };
  assert.equal((await s.h.locateChatLink('/c/old')).getAttribute('href'), '/c/old');
  assert.ok(container.events >= 2);
});

test('lookup follows replacement sidebar containers during loading', async () => {
  const s = harness();
  const first = s.container(), second = s.container();
  s.containers = [first];
  s.onTick = (_, now) => {
    if (now >= 500) { first.isConnected = false; s.containers = [second]; }
    if (second.events >= 2) s.links = [s.link('/c/old')];
  };
  assert.ok(await s.h.locateChatLink('/c/old'));
  assert.ok(second.events >= 2);
});

test('lookup scans the entire growing history without a 330-row or total-time cutoff', async () => {
  const s = harness();
  const container = s.container();
  s.containers = [container];
  let pages = 0;
  s.onTick = () => {
    if (container.scrollTop < container.scrollHeight - container.clientHeight) return;
    pages++;
    s.links.push(s.link(pages === 450 ? '/c/oldest' : `/c/page-${pages}`));
    container.scrollHeight += 200;
  };
  assert.equal((await s.h.locateChatLink('/c/oldest')).getAttribute('href'), '/c/oldest');
  assert.equal(pages, 450);
});

test('history count includes all lazy pages beyond the former 500-pass scan cutoff', async () => {
  const s = harness();
  const container = s.container();
  s.containers = [container];
  let pages = 0;
  s.onTick = () => {
    if (pages >= 600 || container.scrollTop < container.scrollHeight - container.clientHeight) return;
    pages++;
    s.links.push(s.link(`/c/page-${pages}`));
    container.scrollHeight += 220;
  };
  const chats = await s.h.loadAllChats();
  assert.equal(chats.length, 600);
  const scan = JSON.parse(s.storage.get('aiClientUtilitySuite.historyScan.chatgpt'));
  assert.equal(scan.reachedEnd, true);
  assert.equal(scan.count, 600);
  const numbered = s.h.numberChats(chats);
  assert.equal(s.h.parseNumberRange('1', String(numbered.length), numbered.length).end, 600);
  assert.equal(s.h.parseNumberRange('1', '601', numbered.length), null);
});

test('completed scans replace stale counts while incremental loads preserve cached history', () => {
  const s = harness();
  const old = Array.from({ length: 850 }, (_, i) => ({ href: `/c/${i}`, title: `Chat ${i}` }));
  assert.equal(s.h.rememberChats(old).length, 850);
  assert.equal(s.h.rememberChats(old.slice(0, 330)).length, 850);
  assert.equal(s.h.rememberChats(old.slice(0, 330), true).length, 330);
  const next = s.h.rememberChats([...old.slice(0, 330), { href: '/c/new' }], true);
  assert.equal(next.length, 331);
  assert.equal(s.h.parseNumberRange('1', '331', next.length).end, 331);
  assert.equal(s.h.parseNumberRange('1', '332', next.length), null);
});

test('1–330 selection deletes every target after searching beyond the initial sidebar page', async () => {
  const s = harness();
  const chats = s.h.numberChats(Array.from({ length: 400 }, (_, i) => ({ href: `/c/${400 - i}` })));
  const range = s.h.parseNumberRange('1', '330', chats.length);
  const selected = chats.filter(chat => s.h.chatMatchesNumberRange(chat, range));
  assert.equal(selected.length, 330);
  const container = s.container();
  s.containers = [container];
  let loaded = false;
  s.links = chats.slice(-20).map(chat => s.link(chat.href));
  s.onTick = () => {
    if (!loaded && container.events >= 4) {
      loaded = true;
      s.links = chats.map(chat => s.link(chat.href));
      container.scrollHeight = 4000;
    }
  };
  const result = await s.h.runChatBatch(selected, s.h.deleteChat, () => false, () => {});
  assert.equal(result.completed.length, 330);
  assert.equal(result.failed.length, 0);
  assert.equal(result.pending.length, 0);
  assert.equal(s.deleted.length, 330);
  assert.equal(s.links.length, 70);
  assert.ok(s.links.every(link => Number(link.getAttribute('href').split('/').at(-1)) > 330));
});

test('an open confirmation prevents false success and leaves later chats pending', async () => {
  const s = harness();
  const chats = [{ href: '/c/one' }, { href: '/c/two' }, { href: '/c/three' }];
  s.links = chats.map(chat => s.link(chat.href));
  // A virtualized row can disappear while the native delete dialog is still open.
  s.confirm = () => { s.links = s.links.filter(link => link.getAttribute('href') !== s.current.href); };
  const result = await s.h.runChatBatch(chats, s.h.deleteChat, () => false, () => {});
  assert.equal(result.completed.length, 0);
  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0].message, /confirmation is still open/);
  assert.equal(result.pending.length, 2);
  assert.equal(s.deleted.length, 0);
});

test('a slow delete waits for confirmation dismissal before counting success', async () => {
  const s = harness();
  const chat = { href: '/c/one' };
  s.links = [s.link(chat.href)];
  let confirming = false;
  s.confirm = () => { confirming = true; s.links = []; };
  s.onTick = (_, now) => { if (confirming && now >= 8000) s.dialog = false; };
  await s.h.deleteChat(chat);
  assert.equal(s.dialog, false);
});

test('suite conversation links are excluded from native sidebar lookup', () => {
  const s = harness();
  const native = s.link('/c/one'), suite = s.link('/c/one');
  s.links = [suite, native];
  // Use a fresh context to exercise the production containment checks.
  const context = vm.createContext({ location: { hostname: 'chatgpt.com' }, GM_getValue: () => '', document: {
    querySelectorAll: () => s.links,
    getElementById: id => id === 'vanick-cleaner-overlay' ? { contains: node => node === suite } : null,
  } });
  vm.runInContext(source.slice(0, source.lastIndexOf('  cachedHistory = loadPersistentChatCache();')) +
    'this.links = chatLinkElements(); })();', context);
  assert.deepEqual(Array.from(context.links), [native]);
});
