# Troubleshooting

## AI Tools does not appear

1. Open **chatgpt.com** or **claude.ai** in a normal browser tab. The script matches those domains only. Browser side panels may behave differently.
2. Make sure Tampermonkey is installed and enabled, and **AI Client Utility Suite** is enabled in its dashboard.
3. Allow Tampermonkey access to the site in your browser's extension settings. For Opera, open `opera://extensions`. Enable **Allow User Scripts** if available, or **Developer Mode** as directed by Tampermonkey. See the [official permission guide](https://www.tampermonkey.net/faq.php?locale=en&q=Q209).
4. Refresh the page after changing permissions. A private window may require separate extension permission; try a normal window first.
5. Click Tampermonkey while viewing the site. If the suite is not listed, check installation, site access, and the address. If it is listed as enabled, a startup error or another extension may be involved.
6. Try **Alt + Shift + K** if the suite shortcut is enabled. Temporarily disable other userscripts on this site to check for conflicts, then restore them.
7. Update the suite and browser. If the problem continues, report it with the details below.

An in-app troubleshooting screen cannot open when the browser prevents the script from running. This guide remains available without the toolbox.

## Browser permission setup

Enable Tampermonkey and the suite in its dashboard first. Setting names vary by browser version. Follow any permission prompt shown by Tampermonkey and refresh the affected site after making changes. Permission problems are one possible cause; an enabled script can also fail during startup.

### Chrome

Open `chrome://extensions` → **Tampermonkey → Details**. Enable **Allow User Scripts** if shown, or **Developer Mode** as directed by Tampermonkey. Under **Site access**, allow `chatgpt.com` or `claude.ai`. For incognito windows, also enable **Allow in incognito**.

### Edge

Open `edge://extensions` → **Tampermonkey → Details**. Allow access to the affected site. Enable **Allow User Scripts** if offered, or **Developer Mode** if Tampermonkey requests it. InPrivate windows need separate permission.

### Brave

Open `brave://extensions` → **Tampermonkey → Details**. Allow site access and enable **Allow User Scripts** if shown, or **Developer Mode** as directed by Tampermonkey. Private windows need separate permission.

### Opera and Opera GX

Open `opera://extensions` and expand Tampermonkey's details. Allow access to the affected site. Enable **Allow User Scripts** if offered, or **Developer Mode** as directed by Tampermonkey. If **Allow access to search page results** is shown and the script fails after following a search result, check that permission too. Private windows need separate permission.

### Vivaldi and other Chromium browsers

In Vivaldi, open `vivaldi://extensions`. In other browsers, use the Extensions manager. Open Tampermonkey's details, allow site access, and enable **Allow User Scripts** if offered, or **Developer Mode** if requested. Private windows may need separate permission. See [Tampermonkey's Chromium permission guide](https://www.tampermonkey.net/faq.php?locale=en&q=Q209).

### Firefox

Open `about:addons` → **Extensions → Tampermonkey**. Enable the extension, review its **Permissions** tab, and allow required website access. For private windows, select **Allow** under **Run in Private Windows** in its details. Chrome's **Allow User Scripts** and **Developer Mode** instructions do not apply to Firefox. See [Firefox's private window instructions](https://support.mozilla.org/en-US/kb/extensions-private-browsing).

### Safari on Mac

Open **Safari → Settings → Extensions** and enable Tampermonkey. Open its website permissions and allow the affected site. If using a private window, allow the extension in Private Browsing when that option is available. Chrome's Developer Mode instructions do not apply. See [Apple's extension permission guide](https://support.apple.com/en-gb/102343).

### Mobile browsers and managed computers

These are desktop setup instructions, not a guarantee that every browser supports the suite. Mobile browsers vary in userscript extension support. Use a compatible manager supporting this script's Tampermonkey storage APIs. A browser without compatible extension support cannot run the toolbox just by changing permissions. Work or school policies can block userscripts; contact the administrator when settings are locked.

## Missing chats or slow loading

Open the sidebar and wait for the client to finish loading before using **Refresh history** in Chat Cleaner. The index includes sidebar entries the client makes available and may be incomplete. Chat numbers reflect indexed sidebar order, not verified creation dates.

Conversation capture waits up to 90 seconds per chat. Pause and resume when the connection improves, or retry failed captures. If the page reloads, reopen **Conversation export** and choose **Resume draft**. Captured drafts remain local until replaced or cleared.

Exports contain loaded messages only. Earlier messages, alternate branches, attachments, and unsupported content may be missing, even when a capture succeeds.

## Failed actions

Read the failure message and finish or close any native client confirmation. Check whether the conversation is locked. Confirm that the original conversation still exists before retrying deletion. A changed client layout can break action discovery; update the suite and refresh before trying again.

## Missing saved data

Check the browser profile and userscript manager. Local storage does not automatically move to another computer. Import a Prompt Library backup if available. Bookmarks, locks, history, and export drafts are separate for each client. Export the library before clearing extension data or reinstalling Tampermonkey.

## Reporting a problem

If the toolbox opens, choose **Preferences → Troubleshooting**, refresh the page checks, and copy the support summary. It excludes chat titles, messages, prompts, and conversation addresses. Storage checks test reading only; they do not verify writes or extension permissions.

Include:

- Browser name and version, operating system, and Tampermonkey version.
- Suite version and whether Tampermonkey lists it as enabled on the affected page.
- Whether the page is a normal tab, private window, or browser side panel.
- What you clicked, what you expected, and what happened, including the exact error if available.
- Whether the problem persists after refreshing and temporarily disabling other userscripts.

Review the summary and any screenshot before sharing personal information. [Report a problem on GitHub](https://github.com/marcoaval/AI-Client-Utility-Suite/issues/new).
