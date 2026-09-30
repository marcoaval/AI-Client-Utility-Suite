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
  'this.helpers = { parseDateInput, parseExposedDate, localDateKey, parseSidebarDateRange, chatMatchesDateRange, chatIsBeforeDate, mergeChats, numberChats, parseNumberRange, chatMatchesNumberRange, sortNumberedChats, chatMatchesView, runChatBatch, utilityContains }; })();', context);
const h = context.helpers;
const day = value => h.parseDateInput(value);

test('native action discovery excludes both suite overlays', () => {
  const modalButton = {};
  const cleanerButton = {};
  context.document.getElementById = id => ({ contains: element =>
    id === 'vanick-cleaner-overlay' ? element === cleanerButton : element === modalButton });
  assert.equal(h.utilityContains(modalButton), true);
  assert.equal(h.utilityContains(cleanerButton), true);
  assert.equal(h.utilityContains({}), false);
  delete context.document.getElementById;
});

test('title search combines with selection and protection filters', () => {
  const chat = { title: 'Project NOTES', protectedMatches: ['project'], likelyPersonal: false };
  assert.equal(h.chatMatchesView(chat, false, ' notes ', 'all'), true);
  assert.equal(h.chatMatchesView(chat, false, 'notes', 'selected'), false);
  assert.equal(h.chatMatchesView(chat, true, 'notes', 'selected'), true);
  assert.equal(h.chatMatchesView(chat, true, 'notes', 'unprotected'), false);
  assert.equal(h.chatMatchesView(chat, true, 'other', 'all'), false);
  assert.equal(h.chatMatchesView({ title: 'Notes', likelyPersonal: true }, false, '', 'suggested'), true);
});

test('cleanup awaits the current chat before stopping and preserves remaining items', async () => {
  const calls = [];
  let stopped = false;
  const result = await h.runChatBatch([1, 2, 3], async item => {
    calls.push(item);
    await Promise.resolve();
    stopped = true;
  }, () => stopped, () => {});
  assert.deepEqual(calls, [1]);
  assert.equal(result.completed[0], 1);
  assert.equal(result.pending.join(','), '2,3');
});

test('cleanup reports each failure and retry excludes successful and pending items', async () => {
  const result = await h.runChatBatch([1, 2, 3], async item => {
    if (item === 2) throw new Error('Timed out');
  }, () => false, () => {});
  assert.equal(result.completed.join(','), '1,3');
  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0].message, /Timed out/);
  const calls = [];
  const retry = await h.runChatBatch(result.failed.map(failure => failure.item), async item => calls.push(item), () => false, () => {});
  assert.deepEqual(calls, [2]);
  assert.equal(retry.failed.length, 0);
});

test('display sorting preserves chat numbers and numeric range membership', () => {
  const chats = h.numberChats([{ href: '/c/new' }, { href: '/c/middle' }, { href: '/c/old' }]);
  const newest = h.sortNumberedChats(chats, 'newest');
  assert.equal(newest[0].href, '/c/new');
  assert.equal(newest[0].chatNumber, 3);
  const oldest = h.sortNumberedChats(newest, 'oldest');
  assert.equal(oldest[0].href, '/c/old');
  assert.equal(oldest[0].chatNumber, 1);
  assert.equal(chats[0].href, '/c/old');
  for (const chat of newest) assert.equal(h.chatMatchesNumberRange(chat, { start: 1, end: 2 }), chat.chatNumber <= 2);
});

test('numbers begin at one at the oldest end of indexed sidebar order', () => {
  const input = [{ href: '/c/new', title: 'New' }, { href: '/c/middle' }, { href: '/c/old' }];
  const numbered = h.numberChats(input);
  assert.equal(numbered[0].href, '/c/old');
  assert.equal(numbered[0].chatNumber, 1);
  assert.equal(numbered[2].href, '/c/new');
  assert.equal(numbered[2].chatNumber, 3);
  assert.equal(input[0].href, '/c/new');
  assert.equal(input[0].chatNumber, undefined);
  assert.equal(h.numberChats([...input, input[0]]).length, 3);
  assert.equal(h.numberChats([]).length, 0);
});

test('number ranges validate both bounds and accept reversed inclusive limits', () => {
  const range = h.parseNumberRange('3', '1', 3);
  assert.equal(range.start, 1);
  assert.equal(range.end, 3);
  for (const [from, to] of [['', '2'], ['0', '2'], ['1', '4'], ['1.5', '2'], ['-1', '2'], ['1e1', '2']]) {
    assert.equal(h.parseNumberRange(from, to, 3), null);
  }
  assert.equal(h.parseNumberRange('1', '1', 0), null);
});

test('number selection includes endpoints, works without dates, and skips protected chats', () => {
  const range = h.parseNumberRange('2', '4', 5);
  assert.equal(h.chatMatchesNumberRange({ chatNumber: 2, dateLabel: 'Unknown date' }, range), true);
  assert.equal(h.chatMatchesNumberRange({ chatNumber: 4 }, range), true);
  assert.equal(h.chatMatchesNumberRange({ chatNumber: 1 }, range), false);
  assert.equal(h.chatMatchesNumberRange({ chatNumber: 3, protectedMatches: ['school'] }, range), false);
  assert.equal(h.chatMatchesNumberRange({ chatNumber: 3 }, null), false);
});


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
