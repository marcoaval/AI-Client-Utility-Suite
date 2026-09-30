# AI Client Utility Suite

A standalone userscript that adds quality of life tools to ChatGPT and Claude.

## Features

### Search Chats
Search across the full chat history by automatically loading older sidebar entries, then returning the sidebar to recent chats.

### Chat Cleaner
Review the full chat history, use suggested and protected title filters, manually select conversations, and delete selected chats only after confirmation.

Search loaded titles and use **Show chats** to view all chats, selected chats, suggested chats, or hide protected chats. **Select shown** and **Deselect shown** affect only the visible list. Hidden selections remain selected and appear in **Review selected** before deletion.

Cleanup displays progress and failure details. **Stop after current chat** lets the current deletion finish and leaves unprocessed chats selected. **Retry failed** asks for confirmation and retries only failed chats that remain selected. Uncheck any chat you want to keep. Successful deletions are removed from the list. A failed attempt may already have reached the site's confirmation step, so check the failure details and remaining sidebar chats before retrying.

### Cached history and dates
Click **AI Tools** to open the tools menu directly. History is loaded through the sidebar and cached for later use. The suite does not open or index ChatGPT's native Search chats.

Chat Cleaner numbers the indexed chats **#1 through #N**, starting at the oldest end of the indexed sidebar list. Enter **From chat number** and **To chat number**, then click **Select number range** to select an inclusive range, such as 1–50. Protected chats are skipped; individual checkboxes remain available. Review the selection before confirming deletion.

Use the **Organize chats** bar to choose **Newest first** or **Oldest first**. Newest first is the default and your choice is saved. Sorting changes the display order without changing chat numbers, selected chats, or range boundaries.

Each tool has a **←** back button to return to AI Tools. Inside Chat Cleaner, the arrow returns from Manage filters or Review selected to the chat list first, keeping your selections.

Numbers describe indexed sidebar positions, not verified creation dates. ChatGPT can reorder chats by recent activity. Numbers may change when history is refreshed, chats are added, or chats are removed. Use **Refresh history** to rebuild the list from the sidebar before choosing a range. Known dates remain visible as optional information; unknown-date labels are hidden.

### Prompt Library
Save reusable prompts in Tampermonkey storage so the same library is available on both ChatGPT and Claude. Prompts can also be exported to and imported from a JSON backup.

### Bulk Archive
Load the full chat history, filter conversations by title, select the chats you want, and archive multiple conversations in one confirmed batch.

## Install

1. Install Tampermonkey.
2. Open `ai_client_utility_suite.user.js` on GitHub.
3. Open the Raw version of the file and install it with Tampermonkey.
4. Visit ChatGPT or Claude and use the **🧰 AI Tools** button.

## Updating

Tampermonkey can update the userscript automatically because the script includes update and download URLs that point to the latest version in this repository.

To check for an update manually:

1. Open the Tampermonkey dashboard.
2. Find **AI Client Utility Suite** in the installed scripts list.
3. Open the script.
4. Use Tampermonkey's **Check for updates** option.
5. If a newer version is available, install the update and refresh ChatGPT or Claude.

You can also update manually by opening `ai_client_utility_suite.user.js` on GitHub, opening the Raw version, and allowing Tampermonkey to replace the installed version.

Your saved Prompt Library data and cleaner filter settings are stored separately from the script code, so normal script updates should not remove them.

## Supported clients

- ChatGPT
- Claude

## Development checks

Run `node --check ai_client_utility_suite.user.js` and `node --test tests/date-indexing.test.cjs` with Node.js to check syntax and date/cache regression cases.

## Project status

Early development. Version 0.6.0 adds cleaner search, view filters, cleanup progress, cancellation between chats, and failed deletion retries alongside sidebar search, numbered ranges, bulk archiving, and the shared Prompt Library.

## Privacy

Prompt Library data is stored locally through Tampermonkey's userscript storage. The userscript does not send saved prompts to an external server.

## Roadmap

- Prompt categories and search
- Favorites and pinning
- Additional organization tools

## License

This project is source-available for personal, educational, and other non-commercial use. Commercial use, resale, paid licensing, or inclusion in a paid product or service requires permission from the copyright holder. See `LICENSE` for the full terms.
