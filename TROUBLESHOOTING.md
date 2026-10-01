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
