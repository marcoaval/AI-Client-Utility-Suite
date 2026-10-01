# AI Client Utility Suite

A standalone userscript that adds quality of life tools to ChatGPT and Claude.

## Features

### Search Chats
Search indexed sidebar history by loading older sidebar entries, then returning the sidebar to recent chats.

### Chat Cleaner
Review indexed sidebar history, use suggested and protected title filters, and archive or delete selected conversations after confirmation. Archive is the initial action; choose **Delete permanently** in the action selector to delete chats.

Search loaded titles and use **Show chats** to view all chats, selected chats, suggested chats, or hide protected chats. **Select visible chats** and **Deselect visible chats** affect only chats matching the current search and view, including rows below the scroll position. Hidden selections remain selected and appear in **Review selected** before an action.

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
Choose light, dark, or page appearance, a letter size from 12 to 24 pixels, a default chat order, and a default cleaner view. The size slider previews the settings screen immediately; choose **Save settings** to apply it to future suite windows, including Chat Cleaner. Existing Standard and Large preferences become 14 and 16 pixels. Each settings or library screen includes a back arrow. Settings and prompts are shared across clients; chat locks and history are separate.

### Prompt history and writing tools

Prompt edits and changes to template defaults keep up to 50 earlier versions. **History** compares an earlier version with the current one and lets you restore it while retaining the version you replaced. Library exports include this history.

**Prompt Coach** reviews a pasted request or, when you choose **Use current chat draft**, the client composer. Suggestions and clarity tips update as you type. The rewrite organizes the task, supplied context, requirements, and answer format into clear sections. Manually edited suggestions stay intact until you choose **Update suggestion** and confirm replacement. **Improve wording** in the prompt editor returns the rewrite to the editor for review. This is a local checklist and formatting tool, not a model evaluation or a guarantee of better answers. It never sends a message automatically.

**Text tools** clean spacing and blank lines, convert common Markdown formatting to plain text, and display word and character counts. Fenced code keeps its internal spacing. Preview the result before copying.

Prompt Coach uses a bundled full English dictionary and nspell engine locally, without sending text to a server or downloading a dictionary while you type. Common typos and lowercase words with a single candidate are corrected after a space, punctuation, or leaving a field. Other misspellings show replacement choices beneath the spelling controls; select a spelling or **Ignore this word** for the current coach session. Capitalized words offer suggestions without automatic replacement. Use **Undo last spelling correction** or disable automatic corrections when needed. Code in backticks, links, addresses, paths, identifiers, and template fields are protected. Up to 40 flagged words per field are shown at a time, and words longer than 48 characters are skipped. This English checker cannot guarantee the intended spelling of names, specialist terms, or every word. Browser spellcheck remains available. See **THIRD_PARTY_LICENSES.txt** for dependency licenses.

Spelling suggestions now use the whole request and optional details, repeated vocabulary, gaming cues, and choices you previously made. Known names such as Fortnite, Minecraft, Roblox, GitHub, and Tampermonkey remain valid. In gaming context, a nearby misspelling can favor Fortnite while still offering other spellings. Context-based automatic corrections keep alternative buttons beneath the controls. Choose **Remember as a name…** for unfamiliar names. It opens **Correct name spelling**, where you can enter the intended spelling and capitalization before choosing **Save name and spelling**. Saving remembers the name, updates the selected occurrence, and learns the original spelling as a possible alias. **Cancel** saves nothing. Use **Undo last spelling correction** to reverse the text change, or **Clear learned spellings and names** to reset personal learning. Up to 200 chosen corrections and 200 names are stored locally, with hashed context features rather than full prompts. This ranking uses local heuristics and can guess incorrectly; review the suggestion and use Undo when needed.

The coach also checks common wrong-word patterns even when the word is spelled correctly, such as **defiantly want → definitely want**, **loose weight → lose weight**, and **better then → better than**. These are review-only suggestions with an explanation and **Keep original word**, never automatic replacements. **Teach a word choice** lets you enter the word in your prompt and the word you intended; the saved preference can suggest a change in similar wording. These checks run entirely offline using phrase rules and remembered choices. They do not understand every sentence and can miss or misread meanings.

### Bookmarks, saved views, and shortcuts


Use the star beside a cleaner row or **Chat bookmarks** to save a conversation link. Bookmarks are separate from locks and do not protect a chat from cleanup. Both are stored separately for each client.

**Saved cleaner views** remember a title search, view filter, and sorting choice. They do not save selections or number ranges. Applying a view preserves the current selection, including chats hidden by that view.

The tools menu groups tools into Chats, Writing, and Preferences, with search across all groups. Open **Shortcuts → Create shortcut** to assign **Alt + Shift** plus a letter or number to a tool or saved prompt. Choose the key from the list or press it in the capture field, then save. Shortcuts can be edited, disabled, or deleted. Duplicate keys are rejected, and **Alt + Shift + K** is reserved for the searchable shortcut menu. Assignments stay local and survive refreshes. Disable all keyboard shortcuts in Settings if needed. Some combinations may be reserved by the browser or operating system. Prompt shortcuts open a preview and never send a message automatically.

### Conversation export

Choose conversations in **Conversation export**, or use **Export selected** in Chat Cleaner. Capture opens each selected chat and waits for its loaded messages to settle, allowing up to 90 seconds per chat. Pause and resume are available; failed captures can be retried. If navigation reloads the page, reopen the tool and choose **Resume draft**.

Review captured messages as Markdown, plain text, or JSON before downloading one conversation or a ZIP containing conversation files, an index, and a coverage manifest. Code blocks retain their spacing.

These are snapshots of loaded message content, not complete account backups. Unloaded messages, alternate branches, attachment files, and unsupported content may be missing. Every export explicitly reports incomplete coverage. Load older messages in the client when needed. Client layout changes can prevent capture.

The resumable export draft stores captured conversation text locally until replaced or cleared with **Clear export draft**. Download any draft you want to retain before replacing it.

### Bulk Archive
Load the full chat history, filter conversations by title, select the chats you want, and archive multiple conversations in one confirmed batch.

## Install

If the toolbox is missing or a feature fails, see the [troubleshooting guide](TROUBLESHOOTING.md). When the toolbox opens, **Preferences → Troubleshooting** provides problem guides and a support summary with no chat content.

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

Version 2.7.0 adds a shortcut manager for assigning keyboard shortcuts to tools and saved prompts, alongside offline word-choice checks, field explanations, clearer cleaner selection labels, adjustable letter sizing, troubleshooting, conversation exports, prompt history, bookmarks, and saved views.

## Privacy

Chosen spelling corrections, remembered names, hashed spelling context features, prompts, earlier prompt versions, template defaults, settings, bookmarks, saved views, chat locks, cached sidebar metadata, and captured export drafts are stored locally through Tampermonkey's userscript storage. The userscript does not send this saved content to an external server. Prompt and conversation exports can contain personal text; share only the files you intend to share. The prompt coach and text tools process text locally.

## License

This project is source-available for personal, educational, and other non-commercial use. Commercial use, resale, paid licensing, or inclusion in a paid product or service requires permission from the copyright holder. See `LICENSE` for the full terms.
