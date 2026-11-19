# Smart AutoComplete (Chrome Extension v2.1.0)

> **Supercharged text field autocomplete with instant shortcode expanders, deterministic inline ghost text, 1-click tab-to-tab data transfer, domain pause controls, strict privacy filtering, and 100% local storage. Zero AI, zero latency, maximum precision.**

---

## ⚡ The Problem Solved

Chrome's default autofill is frustrating:
1. **It forgets frequently typed handles and usernames** like `xCONFLiCTiONx` because modern Single Page Applications (Discord, Reddit, gaming sites, search bars) don't use legacy form submission POSTs.
2. **It shows irrelevant suggestions** in the wrong fields (e.g. suggesting random handles in email or password fields).
3. **Deleting wrong entries is tedious or impossible** in Chrome's native dropdown.
4. **It ignores dark mode** on many sites and lacks customizable controls.
5. **It lacks text expansion**: Typing your handle, email, or full address in comment boxes or rich-text editors still requires repetitive manual typing.

**Smart AutoComplete fixes all of this.**

---

## ✨ Features

- **Pre-Configured Favorite Handle:** `xCONFLiCTiONx` is pre-seeded and pinned so you never have to type it out from scratch again.
- **⚡ Instant Shortcodes / Text Expander (Inspired by Text Blaze & TextExpander):**
  - Type any shortcode starting with `/` in any input, textarea, or rich-text editor (Discord, Reddit, Slack, Gmail) and it expands instantly!
  - Built-in shortcuts:
    - `/handle` → Expands to your favorite handle (`xCONFLiCTiONx` or saved username)
    - `/email` → Expands to your primary email
    - `/phone` → Expands to your saved cell phone
    - `/name` → Expands to your full name
    - `/addr` → Expands to formatted full address (`Street, City, State Zip`)
    - `/date` → Expands to today's date (`YYYY-MM-DD`)
    - `/time` → Expands to current local time
    - `/shrug` → Expands to `¯\_(ツ)_/¯`
  - Fully customizable: add your own custom snippets in **Options → Text Expanders & Snippets**.
  - Strictly blocked in password fields.
- **👻 Deterministic Inline Ghost Text (Tab to Complete):**
  - When typing the first 2-3 letters of your handle (e.g., `xco`), a subtle dark-glassmorphism ghost badge appears: `[Tab ⇥ complete: NFLiCTiONx]`.
  - Press `Tab` or `ArrowRight` to complete it instantly!
  - 100% rule-based and local (zero AI, zero network calls, 0ms latency).
- **🌐 1-Click Domain Pause & Rules (Inspired by Lightning Autofill):**
  - Need to temporarily silence the extension on a complex internal company portal or sensitive site?
  - Click the extension icon and toggle the domain from **Active** to **Paused**. The extension instantly suspends all listeners and dropdowns for that domain.
- **🛡️ Advanced SPA Quiet-Window Mutation Engine:**
  - Modern React, Next.js, and Vue forms often render inputs inside popups or modal checkout wizards 300ms–1000ms after user clicks.
  - Smart AutoComplete's debounced quiet-window MutationObserver catches dynamic forms seamlessly without causing CPU lag or duplicate fills.
- **Instant Inline Deletion (`✕`):** Every suggestion row in the dropdown has a direct delete button (`✕`). You can also press `Shift + Delete` while navigating with arrow keys to instantly purge any unwanted entry right from the dropdown!
- **Sleek Dark Theme:** Obsidian & Indigo glassmorphism dropdown rendered inside an isolated Shadow DOM so host website styles never break it.
- **42-Field Semantic Recognition Engine:**
  - 🔒 **Password Fields:** **Strictly excluded.** Never suggests, never monitors, never logs.
  - ✉️ **Email Fields:** Only suggests email addresses—never handles like `xCONFLiCTiONx`.
  - 👤 **Usernames / Handles:** Prioritizes your pinned handles in username and general search/text inputs.
  - 📍 **Addresses & 📞 Phones:** Contextually suggested in address and phone inputs.
  - ⚡ **Smart Page-Load Threshold (>2 Fields):** Page-load auto-fill only triggers automatically when there are **more than 2 text boxes to input matching values** (e.g. multi-field sign-up pages or checkout forms). On single or 2-field login pages, automatic loading on page load is bypassed so your password manager can handle credentials without interference, while keeping your handle readily available via dropdown or sign-up forms.
  - Reads standard HTML5 `autocomplete` tokens, ARIA labels, and enclosing field headers.
- **100% Local Storage & Zero AI:**
  - All data is stored purely on your local machine in `chrome.storage.local`.
  - Zero cloud backups, zero remote sync, zero tracking, and zero generative AI guessing.
- **Google Chrome Autofill Importer:**
  - Built-in **1-Click Profile Harvester** (`options.html`): click the standard form inputs, select your profile from Chrome's autofill popup, and the harvester automatically captures and organizes your addresses, emails, and phone numbers into your local extension database.
- **Bulk Text / CSV & JSON Importer:** Paste contact text or export/import complete local JSON backups.
- **Keyboard Navigation:**
  - `↑` / `↓`: Navigate suggestions with visual glow highlight.
  - `Enter`: Fill suggestion (dispatches proper `input` and `change` events for React, Vue, Angular, and vanilla JS).
  - `✕` or `Shift + Delete`: Delete highlighted suggestion on the spot.
  - `Tab`: Complete inline ghost suggestion.
  - `Esc`: Dismiss dropdown / ghost text.

---

## 🚀 Installation (Load Unpacked)

1. Open Google Chrome and navigate to:
   ```
   chrome://extensions/
   ```
2. Enable **Developer mode** using the toggle switch in the upper-right corner.
3. Click the **Load unpacked** button in the upper-left corner.
4. Select the project folder:
   ```
   e:\Smart AutoComplete
   ```
5. The extension is now active on all websites! Pin the extension icon to your Chrome toolbar for quick access.

---

## 📥 How to Import Your Browser Autofill (Emails, Phones, Addresses)

Chrome does not provide an open background API to read your browser autofill database directly for security reasons. We built two convenient ways to import it:

### Method 1: The Interactive Profile Harvester
1. Click the **Smart AutoComplete** icon in your toolbar, or open the options page.
2. Under the **Master Autofill Profile** tab, click into any input field.
3. When Chrome's native autofill popup appears with your saved profiles, click your saved profile.
4. All populated fields (Name, Email, Phone, Street, City, State, Zip, Country) are instantly populated into the form.
5. Click **"Save Master Profile"** — all entries are saved locally to your browser database!

### Method 2: Bulk Paste / CSV Importer
1. In the Options dashboard, switch to the **"📋 Text / CSV Importer"** tab.
2. Paste any contact list, addresses, or CSV data.
3. The built-in scanner automatically extracts valid emails, phone numbers, and street addresses into your database.

---

## 🎮 Everyday Usage

- **Instant Shortcodes:** Type `/handle` in any input, textarea, or chat box (Discord, Reddit, Slack, Gmail) to instantly expand `xCONFLiCTiONx`. Type `/email`, `/phone`, `/addr`, or `/date` anytime!
- **Ghost Text (Tab to Complete):** Start typing a handle or email (e.g. `xco`) and hit `Tab` or `ArrowRight` to complete the rest with zero effort.
- **Focusing a clearly identified field:** Matching pinned entries appear immediately in a sleek dark dropdown. Generic text fields wait until you type two characters.
- **Typing characters:** Suggestions filter in real time with matched text highlighted.
- **Deleting an entry:** Click the `✕` on the suggestion row or press `Shift + Delete`. It disappears immediately without closing the dropdown.
- **1-Click Domain Pause:** Click the popup toggle to pause the extension on any specific domain with one click.
- **Options & Management:** Right-click the extension icon → **Options** to view the full database, customize shortcodes, manage paused sites, or export/import JSON.

---

## 💾 Local File Backup & JSON Export

Smart AutoComplete does not sync or back up anything to the cloud. All data is kept 100% on your machine.
- **Offline File Backups (.json):** In the **Local Backup & JSON** tab, click **"⬇️ Download Backup File (.json)"** to save a timestamped JSON file to your computer.
- **Restoring from File:** Click **"📁 Upload & Restore File (.json)"** anytime to import your saved entries.
- **Chrome Autofill:** Smart AutoComplete leaves each page's `autocomplete` attributes and Chrome's native autofill behavior unchanged. Use the **Inline suggestions** toggle if you want to pause this extension's dropdown.

---

## 🔒 Security & Privacy

- All autocomplete data is stored 100% locally in your browser storage (`chrome.storage.local`).
- Zero cloud backups, zero remote sync, and no third-party servers or external trackers.
- Offline `.json` backup files are stored entirely on your local machine under your control.

