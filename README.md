# AI Client Utility Suite

A standalone userscript that adds quality of life tools to ChatGPT and Claude.

## Features

### Search Chats
Search the chat titles currently loaded in the sidebar from one interface.

### Prompt Library
Save reusable prompts locally in your browser and copy them when needed.

### Bulk Archive
Planned for the next release. The goal is to provide a review-first workflow so chats are never archived without explicit selection.

## Install

1. Install Tampermonkey.
2. Open `ai_client_utility_suite.user.js` on GitHub.
3. Open the Raw version of the file and install it with Tampermonkey.
4. Visit ChatGPT or Claude and use the **🧰 AI Tools** button.

## Supported clients

- ChatGPT
- Claude

## Project status

Early development. Version 0.1.0 establishes the shared interface and first utility modules.

## Privacy

Prompt Library data is stored locally in the browser using localStorage. The userscript does not send saved prompts to an external server.

## Roadmap

- Full-history loading for Search Chats
- Bulk chat archiving with review and selection
- Prompt categories and search
- Favorites and pinning
- Additional organization tools

## License

See `LICENSE`.
