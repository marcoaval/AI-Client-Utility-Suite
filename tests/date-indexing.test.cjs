const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

// Load the actual helpers without starting the userscript's DOM bootstrap.
const source = fs.readFileSync(require('node:path').join(__dirname, '../ai_client_utility_suite.user.js'), 'utf8');
const context = vm.createContext({
  location: { hostname: 'chatgpt.com' }, GM_getValue: () => '',
  document: {}, console,
});
vm.runInContext(source.slice(0, source.lastIndexOf('  cachedHistory = loadPersistentChatCache();')) +
  'this.helpers = { parseDateInput, parseExposedDate, localDateKey, parseSidebarDateRange, chatMatchesDateRange, chatIsBeforeDate, mergeChats }; })();', context);
const h = context.helpers;
const day = value => h.parseDateInput(value);

test('invalid and absent exposed dates remain unknown', () => {
  for (const value of ['', undefined, 'Unknown date', 'September', '2026-02-30', '2026-13-01', '2026-02-30T12:00:00Z']) {
    assert.equal(h.parseExposedDate(value), null);
  }
});

test('calendar date values preserve their local calendar day', () => {
  assert.equal(h.localDateKey(h.parseExposedDate('2026-09-30')), '2026-09-30');
  assert.equal(h.parseExposedDate('2026-09-30T12:00:00Z').getTime(),
    new Date(2026, 8, 30).getTime());
});

test('exact dates match inclusive range and cutoff boundaries', () => {
  const chat = { dateLabel: '2026-09-30', dateStart: '2026-09-30', dateEnd: '2026-09-30' };
  assert.equal(h.chatMatchesDateRange(chat, day('2026-09-30'), day('2026-09-30')), true);
  assert.equal(h.chatMatchesDateRange(chat, day('2026-09-01'), day('2026-09-29')), false);
  assert.equal(h.chatIsBeforeDate(chat, day('2026-09-30')), true);
  assert.equal(h.chatIsBeforeDate(chat, day('2026-09-29')), false);
});

test('month groups do not select chats outside a narrow requested range', () => {
  const chat = { dateLabel: 'September 2026', dateStart: '2026-09-01', dateEnd: '2026-09-30' };
  assert.equal(h.chatMatchesDateRange(chat, day('2026-09-15'), day('2026-09-15')), false);
  assert.equal(h.chatMatchesDateRange(chat, day('2026-09-01'), day('2026-09-30')), true);
  assert.equal(h.chatIsBeforeDate(chat, day('2026-09-15')), false);
});

test('cached relative dates use their saved range rather than today', () => {
  const chat = { dateLabel: 'Today', dateStart: '2020-01-01', dateEnd: '2020-01-01' };
  assert.equal(h.chatMatchesDateRange(chat, day('2020-01-01'), day('2020-01-01')), true);
});

test('unknown dates cannot be selected by date', () => {
  const chat = { dateLabel: 'Unknown date' };
  assert.equal(h.chatMatchesDateRange(chat, day('2000-01-01'), day('2030-12-31')), false);
  assert.equal(h.chatIsBeforeDate(chat, day('2030-12-31')), false);
});

test('merging deduplicates and preserves exact dates while refreshing titles', () => {
  const chats = new Map();
  h.mergeChats(chats, [{ href: '/c/one', title: 'Original', dateLabel: '2026-09-30', dateStart: '2026-09-30', dateEnd: '2026-09-30' }]);
  h.mergeChats(chats, [{ href: '/c/one', title: 'Renamed', dateLabel: 'September 2026', dateStart: '2026-09-01', dateEnd: '2026-09-30' }]);
  assert.equal(chats.size, 1);
  assert.equal(chats.get('/c/one').title, 'Renamed');
  assert.equal(chats.get('/c/one').dateLabel, '2026-09-30');
  assert.equal(chats.get('/c/one').dateStart, '2026-09-30');
  h.mergeChats(chats, [{ href: '/c/one', title: 'Renamed', dateLabel: 'Unknown date' }]);
  assert.equal(chats.get('/c/one').dateStart, '2026-09-30');
  assert.equal(chats.get('/c/one').dateLabel, '2026-09-30');
});
