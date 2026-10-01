const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

// Load the actual helpers without starting the userscript's DOM bootstrap.
const source = fs.readFileSync(require('node:path').join(__dirname, '../ai_client_utility_suite.user.js'), 'utf8');
const context = vm.createContext({
  location: { hostname: 'chatgpt.com' }, GM_getValue: () => '',
  document: {}, console, TextEncoder, TextDecoder,
});
vm.runInContext(source.slice(0, source.lastIndexOf('  cachedHistory = loadPersistentChatCache();')) +
  'this.helpers = { shortcutChord, normalizeShortcuts, shortcutLabel, parseDateInput, parseExposedDate, localDateKey, parseSidebarDateRange, chatMatchesDateRange, chatIsBeforeDate, mergeChats, numberChats, parseNumberRange, chatMatchesNumberRange, sortNumberedChats, chatMatchesView, runChatBatch, utilityContains, normalizePrompts, templateFields, fillTemplate, normalizeSettings, setChatLocked, isChatLocked, archiveChat, deleteChat, revisePrompt, promptSnapshot, formatText, coachPrompt, spellingSuggestions, applySpellingCorrections, rankSpellingChoices, contextualWordChoices, spellingFeatures, rememberSpellingChoice, validChatHref, normalizeView, toggleBookmark, loadBookmarks, snapshotText, exportFilename, crc32, zipFiles, backupFiles, domMessageText }; })();', context);
const h = context.helpers;
const day = value => h.parseDateInput(value);

test('shortcut assignments reject duplicate keys, reserved keys, and invalid stored records', () => {
  const shortcut = { id: 'one', code: 'KeyC', kind: 'tool', target: 'coach' };
  const normalized = h.normalizeShortcuts([shortcut, { ...shortcut, id: 'duplicate' }, { ...shortcut, id: 'menu', code: 'KeyK' }, { ...shortcut, id: 'bare', code: 'Enter' }, { ...shortcut, id: 'bad', code: 'KeyB', kind: 'script' }, { id: 'disabled', code: 'Digit2', kind: 'prompt', target: 'prompt-id', enabled: false }, null]);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].enabled, true);
  assert.equal(normalized[1].enabled, false);
  assert.equal(h.shortcutLabel(normalized[1].code), 'Alt + Shift + 2');
  assert.equal(h.normalizeShortcuts({ code: 'KeyC' }).length, 0);
});

test('keyboard shortcut chords exclude ordinary typing and extra modifiers', () => {
  const event = { code: 'KeyC', altKey: true, shiftKey: true, ctrlKey: false, metaKey: false };
  assert.equal(h.shortcutChord(event), 'KeyC');
  assert.equal(h.shortcutChord({ ...event, code: 'Digit3' }), 'Digit3');
  for (const change of [{ altKey: false }, { shiftKey: false }, { ctrlKey: true }, { metaKey: true }, { code: 'ArrowLeft' }]) assert.equal(h.shortcutChord({ ...event, ...change }), '');
});

test('prompt revisions preserve identity, limit history, and keep restored wording recoverable', () => {
  let prompt = h.normalizePrompts([{ name: 'Prompt', text: 'Original' }])[0];
  const originalId = prompt.id;
  for (let i = 0; i < 55; i++) prompt = h.revisePrompt(prompt, { ...prompt, text: `Version ${i}` }, i + 1);
  assert.equal(prompt.id, originalId);
  assert.equal(prompt.history.length, 50);
  const restored = h.revisePrompt(prompt, { ...prompt, ...h.promptSnapshot(prompt.history[0]) }, 60);
  assert.equal(restored.history.at(-1).text, 'Version 54');
  const roundTrip = h.normalizePrompts(JSON.parse(JSON.stringify([restored])))[0];
  assert.equal(roundTrip.id, originalId);
  assert.equal(roundTrip.history.length, 50);
  assert.equal(h.revisePrompt(roundTrip, { ...roundTrip, folder: 'Other' }).history.length, 50);
});

test('text formatting removes Markdown outside code while preserving code spacing', () => {
  const input = '# Heading\r\n\r\n**Bold** [link](https://example.com)   \r\n```js\r\n  const s = "**literal**";  \r\n```';
  const plain = h.formatText(input, 'plain');
  assert.match(plain, /^Heading/);
  assert.match(plain, /Bold link \(https:\/\/example.com\)/);
  assert.match(plain, /  const s = "\*\*literal\*\*";  /);
  assert.doesNotMatch(plain, /```/);
  assert.match(h.formatText(input), /```js\n  const s = "\*\*literal\*\*";  \n```/);
});

test('prompt coaching uses supplied details without inventing context or sending content', () => {
  const reviewed = h.coachPrompt('can you make it better', { context: 'For new readers', format: 'numbered steps', constraints: 'Under 200 words' });
  assert.match(reviewed.rewrite, /^Task:\nPlease make it better/);
  assert.match(reviewed.rewrite, /For new readers/);
  assert.match(reviewed.rewrite, /Under 200 words/);
  assert.match(reviewed.rewrite, /numbered steps/);
  assert.ok(reviewed.tips.some(tip => tip.includes('concrete example')));
  assert.doesNotMatch(h.coachPrompt('Explain trees').rewrite, /Context:|Requirements:/);
});

test('spelling review skips protected content and applies only selected occurrences', () => {
  const input = 'teh adress Teh Alice {{teh}} `teh` https://example.com/teh person@teh.com /teh/file teh.js some_teh teh2 caféteh\n```js\nteh\n```\nteh';
  const suggestions = h.spellingSuggestions(input);
  assert.deepEqual(Array.from(suggestions, item => item.word), ['teh', 'adress', 'Teh', 'teh']);
  const corrected = h.applySpellingCorrections(input, [suggestions[1]]);
  assert.equal(corrected, input.replace('adress', 'address'));
  assert.equal(h.applySpellingCorrections('changed', suggestions), 'changed');
  assert.equal(h.spellingSuggestions('```js\nteh').length, 0);
  assert.equal(h.spellingSuggestions('{{teh').length, 0);
});

test('full dictionary suggests words beyond the typo list and accepts valid vocabulary', () => {
  assert.equal(h.spellingSuggestions('photosynthesis magnificent architecture').length, 0);
  const suggestions = h.spellingSuggestions('magnifisent architecturre');
  assert.ok(suggestions.some(item => item.choices.includes('magnificent')));
  assert.ok(suggestions.some(item => item.choices.includes('architecture')));
  assert.equal(h.spellingSuggestions('Teh')[0].automatic, false);
});

test('proper names remain valid and gaming context ranks Fortnite with alternatives', () => {
  assert.equal(h.spellingSuggestions('fortnite Minecraft Roblox').length, 0);
  const ranked = h.rankSpellingChoices('fortnigt', ['fortnight', 'fortnite'], 'Help with battle royale skins in this game');
  assert.equal(ranked.choices[0], 'Fortnite');
  assert.ok(ranked.choices.includes('fortnight'));
  assert.equal(ranked.contextual, true);
  const typo = h.spellingSuggestions('play fortnigt battle royale').find(item => item.word === 'fortnigt');
  assert.equal(typo.choices[0], 'Fortnite');
});

test('chosen corrections learn hashed context rather than full prompts', () => {
  const store = new Map(), previousGet = context.GM_getValue, previousSet = context.GM_setValue;
  context.GM_getValue = (key, fallback) => store.get(key) ?? fallback;
  context.GM_setValue = (key, value) => store.set(key, value);
  try {
    h.rememberSpellingChoice('ther', 'their', 'project team owns code');
    const memory = JSON.parse(store.get('aiClientUtilitySuite.spellingMemory'));
    assert.equal(memory[0].replacement, 'their');
    assert.ok(memory[0].features.every(feature => feature.startsWith('prompt_')));
    assert.equal(h.rankSpellingChoices('ther', ['there', 'their'], 'team owns project code', memory).choices[0], 'their');
  } finally { context.GM_getValue = previousGet; context.GM_setValue = previousSet; }
});

test('word-choice checks flag valid spellings for review without automatic replacement', () => {
  for (const [text, intended] of [['I defiantly want to join', 'definitely'], ['I want to loose weight', 'lose'], ['Decide weather or not to go', 'whether'], ['This is better then before', 'than'], ['their are two options', 'there']]) {
    const item = h.spellingSuggestions(text).find(item => item.wordChoice);
    assert.ok(item, text);
    assert.equal(item.choices[0], intended);
    assert.equal(item.automatic, false);
    assert.ok(item.choices.includes(item.word));
  }
  assert.equal(h.spellingSuggestions('The loose screw rattles').length, 0);
  assert.equal(h.spellingSuggestions('I defiantly refused to obey').length, 0);
  assert.equal(h.spellingSuggestions('your right hand').length, 0);
});

test('bookmarks are separate from locks and reject unsafe paths', () => {
  const store = new Map(), previous = context.GM_getValue;
  context.GM_getValue = (key, fallback) => store.get(key) ?? fallback;
  context.GM_setValue = (key, value) => store.set(key, value);
  const chat = { href: '/c/bookmark', title: 'Important' };
  assert.equal(h.toggleBookmark(chat), true);
  assert.equal(h.loadBookmarks().length, 1);
  assert.equal(h.isChatLocked(chat), false);
  assert.equal(h.toggleBookmark(chat), false);
  assert.equal(h.loadBookmarks().length, 0);
  for (const href of ['javascript:alert(1)', '//example.com', '/c/../../file', '/settings']) assert.equal(h.validChatHref(href), false);
  context.GM_getValue = previous; delete context.GM_setValue;
});

test('saved views contain presentation settings rather than chat selections', () => {
  const view = h.normalizeView({ name: ' Work ', query: 'work', sort: 'oldest', view: 'unprotected', selected: ['/c/one'] });
  assert.equal(view.name, 'Work'); assert.equal(view.query, 'work');
  assert.equal(view.sort, 'oldest'); assert.equal(view.view, 'unprotected');
  assert.equal(Object.hasOwn(view, 'selected'), false);
});

test('conversation files and ZIP manifest state incomplete coverage and pending captures', () => {
  const snapshot = { title: 'Code', source: 'https://chatgpt.com/c/code', capturedAt: '2026-09-30T00:00:00Z', complete: false, coverage: 'Loaded messages only', messages: [{ role: 'user', text: 'Question', markdown: 'Question' }, { role: 'assistant', text: 'const x = 1;', markdown: '```js\nconst x = 1;\n```' }] };
  assert.match(h.snapshotText(snapshot, 'md'), /```js\nconst x = 1;\n```/);
  assert.match(h.snapshotText(snapshot, 'txt'), /const x = 1;/);
  assert.equal(JSON.parse(h.snapshotText(snapshot, 'json')).complete, false);
  const files = h.backupFiles({ captured: [snapshot], failed: [], targets: [{ href: '/c/pending' }], cursor: 0 }, 'md');
  const manifest = JSON.parse(files.find(file => file.name === 'manifest.json').text);
  assert.equal(manifest.complete, false); assert.equal(manifest.pending.length, 1);
  assert.equal(manifest.conversations[0].messageCount, 2);
  assert.doesNotMatch(h.exportFilename('../CON:<test>', 0, 'md'), /[<>:"/\\]/);
});

test('ZIP files use valid CRCs, UTF8 names, and matching directory offsets', () => {
  assert.equal(h.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const files = [{ name: 'Résumé.md', text: 'First' }, { name: 'index.md', text: 'Second' }];
  const bytes = h.zipFiles(files), view = new DataView(bytes.buffer);
  let offset = 0;
  for (const file of files) {
    assert.equal(view.getUint32(offset, true), 0x04034b50);
    const size = view.getUint32(offset + 18, true), nameLength = view.getUint16(offset + 26, true);
    assert.equal(new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLength)), file.name);
    assert.equal(new TextDecoder().decode(bytes.slice(offset + 30 + nameLength, offset + 30 + nameLength + size)), file.text);
    offset += 30 + nameLength + size;
  }
  assert.equal(view.getUint32(offset, true), 0x02014b50);
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
  assert.equal(view.getUint32(bytes.length - 6, true), offset);
  assert.equal(view.getUint16(bytes.length - 12, true), files.length);
});

test('DOM code serialization uses a fence longer than code backticks', () => {
  const code = { textContent: 'x = "```";\n  next();', className: 'language-js' };
  const node = { nodeType: 1, tagName: 'PRE', getAttribute: () => null, querySelector: () => code };
  assert.match(h.domMessageText(node), /````js\nx = "```";\n  next\(\);\n````/);
  assert.equal(h.domMessageText(node, true), '\nx = "```";\n  next();\n');
});

test('templates deduplicate field names and substitute multiline values literally', () => {
  const text = 'Explain {{ topic }} at {{level}}. Repeat {{topic}}.';
  assert.equal(h.templateFields(text).join(','), 'topic,level');
  assert.equal(h.fillTemplate(text, { topic: 'Line one\n$& <tag>', level: 'beginner' }), 'Explain Line one\n$& <tag> at beginner. Repeat Line one\n$& <tag>.');
  assert.equal(h.fillTemplate('{{missing}}', {}), '{{missing}}');
});

test('legacy prompts remain usable and pack metadata survives normalization', () => {
  const legacy = h.normalizePrompts([{ name: 'Old', text: 'Plain prompt' }])[0];
  assert.equal(legacy.text, 'Plain prompt');
  assert.equal(legacy.folder, '');
  assert.equal(legacy.favorite, false);
  const packed = h.normalizePrompts([{ name: 'Template', text: '{{topic}}', folder: 'Work', favorite: true, defaults: { topic: 'Testing', removed: 'discard' } }])[0];
  const restored = h.normalizePrompts(JSON.parse(JSON.stringify([packed])))[0];
  assert.equal(restored.folder, 'Work');
  assert.equal(restored.favorite, true);
  assert.equal(restored.defaults.topic, 'Testing');
  assert.equal(Object.hasOwn(restored.defaults, 'removed'), false);
});

test('template fields with object property names stay ordinary text values', () => {
  const values = Object.fromEntries([['__proto__', 'value'], ['constructor', 'other']]);
  assert.equal(h.fillTemplate('{{__proto__}} {{constructor}}', values), 'value other');
  const prompt = h.normalizePrompts([{ name: 'Safe', text: '{{__proto__}}', defaults: values }])[0];
  assert.equal(Object.hasOwn(prompt.defaults, '__proto__'), true);
  assert.equal(prompt.defaults.__proto__, 'value');
});

test('settings validate imported storage and retain sensible defaults', () => {
  const settings = h.normalizeSettings({ theme: 'invalid', textSize: 'huge', sort: 'oldest', cleanerView: 'selected' });
  assert.equal(settings.theme, 'auto');
  assert.equal(settings.fontSize, 14);
  assert.equal(h.normalizeSettings({ textSize: 'large' }).fontSize, 16);
  assert.equal(h.normalizeSettings({ fontSize: 19 }).fontSize, 19);
  assert.equal(h.normalizeSettings({ fontSize: 100 }).fontSize, 24);
  assert.equal(h.normalizeSettings({ fontSize: 5 }).fontSize, 12);
  assert.equal(h.normalizeSettings({ fontSize: 'invalid' }).fontSize, 14);
  assert.equal(settings.sort, 'oldest');
  assert.equal(settings.cleanerView, 'all');
});

test('chat locks persist per client and exclude numeric and suggested selections', async () => {
  const values = new Map();
  const previousGet = context.GM_getValue;
  context.GM_getValue = (key, fallback) => values.get(key) ?? fallback;
  context.GM_setValue = (key, value) => values.set(key, value);
  const chat = { href: '/c/one', title: 'Work', chatNumber: 1, likelyPersonal: true, locked: true };
  h.setChatLocked(chat, true);
  assert.equal(h.isChatLocked(chat), true);
  await assert.rejects(h.archiveChat(chat), /locked/);
  await assert.rejects(h.deleteChat(chat), /locked/);
  assert.equal(h.chatMatchesNumberRange(chat, { start: 1, end: 2 }), false);
  assert.equal(h.chatMatchesView(chat, false, '', 'suggested'), false);
  assert.equal(h.chatMatchesView(chat, false, '', 'unprotected'), false);
  context.location.hostname = 'claude.ai';
  assert.equal(h.isChatLocked(chat), false);
  context.location.hostname = 'chatgpt.com';
  h.setChatLocked(chat, false);
  assert.equal(h.isChatLocked(chat), false);
  context.GM_getValue = previousGet;
  delete context.GM_setValue;
});

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
