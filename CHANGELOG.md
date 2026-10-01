# Changelog

## 2.1.2

### Improved
- The missing toolbox checklist now refers to the browser permission section instead of repeating Opera-specific instructions.

## 2.1.1

### Improved
- Browser permission instructions in the troubleshooting screen and standalone guide for Chrome, Edge, Brave, Opera, Opera GX, Vivaldi, Firefox, and Safari on Mac.
- Separate guidance for private windows, mobile compatibility, and managed browsers, with browser-specific settings and official help links.

## 2.1.0

### Added
- Troubleshooting screen for missing buttons, browser permissions, slow loading, failed actions, and missing saved data, with a back arrow.
- Refreshable page checks and a copyable support summary excluding chat content and conversation addresses. Checks do not claim to inspect browser permissions or verify storage writes.
- A standalone troubleshooting guide linked from the README so help remains accessible when the script cannot run, including Opera setup instructions.

## 2.0.0

### Added
- Conversation capture with Markdown, plain text, and JSON previews, individual downloads, and ZIP exports with an index and coverage manifest. Captures include loaded messages only and always report incomplete coverage.
- Resumable local export drafts, pause controls, delayed loading checks, and retry for failed captures. Reopen the tool to resume after a page reload.
- Prompt version history with comparison and restore, retaining up to 50 earlier versions. Library backups include version history and remain compatible with older plain prompt imports.
- A local Prompt Coach that checks request clarity and creates an editable rewrite using supplied context, requirements, and answer format. Prompt editor integration requires review before saving or copying.
- Text spacing cleanup, common Markdown to plain text conversion, and word and character counts, with fenced code spacing preserved.
- Chat bookmarks independent of cleanup locks, and saved cleaner views for search, filters, and sorting without changing selections.
- A searchable tool and prompt shortcut menu, opened with Alt + Shift + K and configurable in Settings.

### Improved
- Tools are grouped into Chats, Writing, and Preferences, with search across groups and back arrows for each screen.
- Selected cleaner conversations can be passed to export and returned to the same cleaner view and selection.

### Community
- Thanks to @sam-cre for the library spacing and backup feedback in issues #2 and #3 and organization feedback in issue #5. The grouped tools, expanded backups, bookmarks, and saved views build on those suggestions.

## 1.0.0

### Added
- Fillable Prompt Library templates using `{{field name}}`, with multiline values, repeated fields, a finished preview, and saved defaults.
- Prompt folders, favorites, name and content search, and prompt editing. Library and folder exports include template defaults and organization metadata; existing prompt backups remain supported.
- Individual chat locks saved separately for each client. Locked chats cannot be selected, archived, or deleted by the suite until unlocked.
- Archive selected chats directly from Chat Cleaner, with confirmation, progress, cancellation between chats, and retries that preserve the original action.
- Settings for light, dark, or page appearance, larger text, default chat order, and the initial cleaner view.
- History coverage showing indexed chat count and the last sidebar scan, including when the scan may be incomplete.

### Improved
- Cleaner sorting sits beside search, and number ranges expand when needed to leave more space for conversations.
- Form fields have persistent labels, library actions have clearer wording, and each new screen has a back arrow.
- Dialogs keep keyboard focus within their controls and support Escape to close when cleanup is idle.
- Existing plain prompts and shared Tampermonkey storage continue working after the update.

### Community
- Thanks to @sam-cre for Prompt Library spacing and backup feedback in issues #2 and #3 and chat organization feedback in issue #5. Those suggestions informed the updated library, exports, and cleaner layout.

## 0.6.0

### Added
- Search loaded chat titles inside Chat Cleaner and combine searches with selected, suggested, or unprotected views.
- Select or deselect only shown chats while preserving selections hidden by search and filters.
- Cleanup progress, a stop control that finishes the current chat before stopping, and individual failure details.
- Retry failed deletions after confirmation without repeating successful deletions. Unprocessed chats remain selected.

### Improved
- Deleted chats leave the cleaner list and cannot be selected again in the current view.
- Navigation and selection stay locked during cleanup so the active batch remains visible.

### Community
- Thanks to @sam-cre for the chat organization feedback in issue #5. Search and view filters extend that organization workflow.

## 0.5.9

### Improved
- Stronger button and input contrast, larger click targets, visible keyboard focus, and clearer selected chat styling.
- Blue range and review actions, distinct red delete controls, and grouped selection versus history settings.
- Persistent labels on number fields and plain descriptions on the main tool buttons.
- Brighter navigation controls and a clearer launcher across the suite.

### Community
- Thanks to @sam-cre for the original Prompt Library spacing feedback in issue #2 and chat organization suggestions in issue #5. This update continues improving readability and organization.

## 0.5.8

### Added
- Organize chats bar with Newest first and Oldest first choices. Newest first is the default; the preference is saved.
- Back arrows in Search Chats, Bulk Archive, Prompt Library, and Chat Cleaner. Cleaner subsections return to the chat list before returning to AI Tools.

### Fixed
- Sorting preserves numbers and selections, including in selected chat review. Returning from filter settings keeps selected chats.
- Returning from the loading screen no longer reopens Chat Cleaner after the scan finishes.
- Hidden cleaner subsections stay hidden so the chat list, filter settings, and selection review do not overlap.

### Community
- Thanks to @sam-cre for the original caching and date organization suggestions in issues #4 and #5. Numbered ranges and display sorting build on that organization work.

## 0.5.7

### Added
- Number indexed chats from #1 at the oldest end of sidebar order through #N at the newest end.
- Replace date selection controls with From chat number, To chat number, and inclusive Select number range controls. Invalid ranges stay disabled and protected chats are skipped.
- Show numbers in both the chat list and selected-chat review; hide Unknown date labels.

### Improved
- Keep fresh sidebar observations in sidebar order when updating cached history, and start full scans at the top before assigning positions.
- Explain that sidebar position is not a verified creation date and numbers may change when the index is rebuilt.

### Community
- Thanks to @sam-cre for the original organization suggestion in issue #5. Numbered ranges provide an alternative when dates are unavailable.

## 0.5.6

### Removed
- Removed the ChatGPT native Search integration, automatic launcher scan, background Search indexing, and scan progress popup.

### Changed
- AI Tools opens its menu immediately. Search, cleaner, and archive tools continue using sidebar history and the persistent cache.
- Exclude dialog results from sidebar collection. Existing cache data, date handling, and protected cleaner filters are preserved; Refresh history rebuilds the cache from the sidebar.

## 0.5.5

### Added
- AI Tools automatically opens native ChatGPT Search and scrolls through available results before showing the tools menu.
- A Searching through your chats popup with a live count and Stop and open tools control.

### Improved
- Allow 45 seconds for Search to open or initial results to arrive, wait for loading indicators, and require 15 seconds without new results at the bottom before ending the scan.
- Preserve collected results on cancellation or the three-minute scan timeout and report incomplete coverage. Repeated launcher clicks do not start overlapping scans.
- Preserve an already-open Search dialog and its query; Claude continues opening the tools menu directly.

## 0.5.4

### Changed
- Automatically cache chats and exposed dates whenever ChatGPT's native Search chats dialog is used.
- Removed the separate Index with ChatGPT Search buttons, indexing bar, and Finish indexing step.
- Stop observing results when Search closes and resume automatically when it reopens. Empty results do not create an empty history cache.

## 0.5.3

### Added
- ChatGPT Search-assisted indexing from AI Tools and Chat Cleaner. Search and scroll in the native Search chats dialog to cache exposed conversations and dates.
- Indexing progress and a Finish indexing control; closing Search also saves the collected results and stops indexing.

### Fixed
- Saved calendar ranges for new date-group observations so cached relative dates do not change as time passes.
- Preserve exact dates when subsequent sidebar observations expose only broad date groups.
- Select date ranges only when a chat's entire known date range fits, preventing a narrow range from selecting an entire month group.

### Limitations
- Search coverage and dates depend on the results and date metadata exposed by ChatGPT's interface. Unknown dates remain unknown. Claude retains sidebar indexing.

## 0.5.2

### Fixed
- Reworked date selection so users can select a custom date range instead of choosing a single sidebar date group.
- Added an option to select chats on or before a chosen date.
- Improved full history loading so the scanner keeps checking for newly loaded conversations before deciding it reached the end.

## 0.5.1

### Fixed
- Fixed the Chat Cleaner date selection control not responding clearly when no date was selected.
- The Select date button now stays disabled until a specific date group is chosen and updates to show the selected date.
- Selecting a date now checks the matching chats without unexpectedly switching views.

## 0.5.0

### Added
- Added persistent chat caching so previously loaded chat history can reopen without rescanning the full sidebar every time.
- Added date labels to chats when the client exposes date groups in the sidebar.
- Added date filtering and a Select date control in Chat Cleaner.
- Added a Refresh history control so the cached history can be rebuilt when needed.

### Community
- Thanks to @sam-cre for suggesting chat caching and date based cleaner controls in issues #4 and #5.

## 0.4.2

### Fixed
- Fixed Chat Cleaner full history scanning stopping before reaching older conversations.
- Improved lazy loading detection near the bottom of the sidebar.
- Chat Cleaner now performs a fresh full history scan before opening and returns the sidebar to recent chats when finished.

## 0.4.1

### Fixed
- Restored the original Chat Cleaner interface inside AI Client Utility Suite.
- Restored the original cleaner layout, filter manager, selected chat review, status labels, and styling.

## 0.4.0

### Added
- Integrated Chat Cleaner directly into AI Client Utility Suite.
- Added cleaner filters, protected filters, suggested chat selection, title filtering, and confirmed bulk deletion inside the shared AI Tools menu.
- Reused the suite's full history loading and chat lookup logic so cleaner, search, and archive features work from the same loaded chat history.

### Changed
- Chat Cleaner is now available from the main AI Tools launcher instead of requiring a separate interface.
- Cleaner filter settings are stored with the utility suite so the combined app can manage them from one place.

## 0.3.0

### Added
- Added a working Bulk Archive tool for ChatGPT and Claude.
- Loads the full chat history before showing archive options.
- Lets users filter chat titles, select visible results, deselect everything, and review selections before archiving.
- Requires confirmation before any archive action starts.
- Shows archive progress and reports failures without stopping the full batch.
- Returns the sidebar to recent chats after the archive process finishes.

## 0.2.1

### Improved
- Updated the AI Tools launcher styling to match the Chat Cleaner button more closely when both userscripts are installed.

## 0.2.0

### Added
- Full-history chat search that loads older sidebar conversations before searching and returns the sidebar to the top when loading finishes.
- Shared Prompt Library storage across ChatGPT and Claude using Tampermonkey userscript storage.
- Prompt export to JSON and import from JSON backups.

### Improved
- Added spacing between prompt titles and action buttons in the Prompt Library.
- Existing prompt data stored by earlier versions is migrated into shared userscript storage.

### Community
- Thanks to @sam-cre for reporting the cross-client prompt storage issue, Prompt Library spacing issue, and prompt export/import request in issues #1, #2, and #3.

## 0.1.1

### Improvements
- Added a shared launcher dock for compatibility with other supported userscripts.
- AI Tools and Chat Cleaner now position themselves beside one another instead of overlapping.

## 0.1.0

### Added
- Initial ChatGPT and Claude support.
- Shared AI Tools launcher and interface.
- Search for currently loaded chat titles.
- Local Prompt Library with save, copy, and delete controls.
- Bulk Archive placeholder for the upcoming review-first archive workflow.
