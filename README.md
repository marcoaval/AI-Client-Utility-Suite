# AI Client Utility Suite

A standalone userscript that adds quality of life tools to ChatGPT and Claude.

## Features

### Search Chats
Search indexed sidebar history by loading older sidebar entries, then returning the sidebar to recent chats.

### Chat Cleaner
Review indexed sidebar history, use suggested and protected title filters, and archive or delete selected conversations after confirmation. Archive is the initial action; choose **Delete permanently** in the action selector to delete chats.

Search loaded titles and use **Show chats** to view all chats, selected chats, suggested chats, or hide protected chats. **Select shown** and **Deselect shown** affect only the visible list. Hidden selections remain selected and appear in **Review selected** before an action.

Cleanup displays progress and failure details. **Stop after current chat** lets the current action finish and leaves unprocessed chats selected. Retry asks for confirmation and includes only failed chats that remain selected, using the original archive or delete action. Uncheck any chat you want to keep. Successful chats leave the list. A failed attempt may already have reached the site's confirmation step; close an unfinished confirmation before retrying.

Use **Lock** beside a chat to prevent the suite from selecting, archiving, or deleting it. **Unlock** makes it available again. Locks are stored separately for ChatGPT and Claude and remain after a history refresh. Keyword protection skips automatic suggestions and ranges but allows manual selection; an individual lock blocks all suite cleanup actions. Locks do not restrict actions taken directly in the client.

### Cached history and dates
Click **AI Tools** to open the tools menu directly. History is loaded through the sidebar and cached for later use. The suite does not open or index ChatGPT's native Search chats.

Chat Cleaner numbers the indexed chats **#1 through #N**, starting at the oldest end of the indexed sidebar list. Expand **Select a number range**, enter **From chat number** and **To chat number**, then click **Select number range** to select an inclusive range, such as 1–50. Protected and locked chats are skipped. Review the selection before confirming an action.

Use **Organize chats** beside search to choose **Newest first** or **Oldest first**. Newest first is the initial default and your choice is saved. Sorting changes the display order without changing chat numbers, selected chats, or range boundaries. The coverage notice shows how many chats are indexed and when the sidebar was last scanned. It does not guarantee that every account chat has loaded.

Each tool has a **←** back button to return to AI Tools. Inside Chat Cleaner, the arrow returns from Manage filters or Review selected to the chat list first, keeping your selections.

Numbers describe indexed sidebar positions, not verified creation dates. ChatGPT can reorder chats by recent activity. Numbers may change when history is refreshed, chats are added, or chats are removed. Use **Refresh history** to rebuild the list from the sidebar before choosing a range. Known dates remain visible as optional information; unknown-date labels are hidden.

### Prompt Library
Save reusable prompts in Tampermonkey storage so the same library is available on both ChatGPT and Claude. Prompts can also be exported to and imported from a JSON backup.

Choose **New prompt** to save a plain prompt or a template such as `Explain {{topic}} for someone at {{experience level}}.` **Fill template** opens labeled fields, allows multiline values, and previews the finished prompt before copying. Repeated field names share one value. **Save these values as defaults** remembers values for later use. Prompts are copied for review and are not automatically sent.

Use folders, favorites, and search to organize the library. **Edit** updates prompt text and its folder. **Export library** backs up all prompts, folders, favorites, and defaults. Selecting a folder changes this to **Export folder** to create a reusable pack. Import accepts both current packs and older plain prompt exports and merges them with existing prompts. Duplicate name and text pairs keep the existing library entry. Exported defaults may contain personal text you entered.

### Settings
Choose light, dark, or page appearance, standard or large text, a default chat order, and a default cleaner view. Preferences apply to suite windows, and each settings or library screen includes a back arrow. Settings and prompts are shared across clients; chat locks and history are separate.

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

Run `node --check ai_client_utility_suite.user.js` and `node --test tests/date-indexing.test.cjs` with Node.js to check syntax, templates, prompt compatibility, locks, settings, cleanup batches, and history regression cases.

## Project status

Version 1.0.0 includes prompt templates, library folders and favorites, individual chat locks, cleaner archiving, appearance settings, and history coverage alongside search, numbered ranges, cleanup progress, and retries.

## Privacy

Prompts, template defaults, settings, chat locks, and cached sidebar metadata are stored locally through Tampermonkey's userscript storage. The userscript does not send saved prompts to an external server.

## Roadmap

- Prompt version history
- Markdown and plain text formatting tools
- Local writing statistics

## License

This project is source-available for personal, educational, and other non-commercial use. Commercial use, resale, paid licensing, or inclusion in a paid product or service requires permission from the copyright holder. See `LICENSE` for the full terms.
