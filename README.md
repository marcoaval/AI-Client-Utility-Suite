# AI Client Utility Suite

A standalone userscript that adds quality of life tools to ChatGPT and Claude.

## Features

### Search Chats
Search across the full chat history by automatically loading older sidebar entries, then returning the sidebar to recent chats.

### Chat Cleaner
Review the full chat history, use suggested and protected title filters, manually select conversations, and delete selected chats only after confirmation.

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

## Project status

Early development. Version 0.4.2 combines full-history search, bulk archiving, Chat Cleaner, and the shared Prompt Library in one userscript.

## Privacy

Prompt Library data is stored locally through Tampermonkey's userscript storage. The userscript does not send saved prompts to an external server.

## Roadmap

- Prompt categories and search
- Favorites and pinning
- Additional organization tools

## License

This project is source-available for personal, educational, and other non-commercial use. Commercial use, resale, paid licensing, or inclusion in a paid product or service requires permission from the copyright holder. See `LICENSE` for the full terms.
