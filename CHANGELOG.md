# Changelog

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
