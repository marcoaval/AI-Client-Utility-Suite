# Changelog

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
