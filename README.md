# AI Client Utility Suite

A standalone userscript that adds quality of life tools to ChatGPT and Claude.

## Features

### Search Chats
Search across the full chat history by automatically loading older sidebar entries, then returning the sidebar to recent chats.

### Prompt Library
Save reusable prompts in Tampermonkey storage so the same library is available on both ChatGPT and Claude. Prompts can also be exported to and imported from a JSON backup.

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

Early development. Version 0.2.0 adds full-history search, shared prompt storage across supported clients, prompt import/export, and prompt-library layout improvements.

## Privacy

Prompt Library data is stored locally through Tampermonkey's userscript storage. The userscript does not send saved prompts to an external server.

## Roadmap

- Bulk chat archiving with review and selection
- Prompt categories and search
- Favorites and pinning
- Additional organization tools

## License

This project is source-available for personal, educational, and other non-commercial use. Commercial use, resale, paid licensing, or inclusion in a paid product or service requires permission from the copyright holder. See `LICENSE` for the full terms.
