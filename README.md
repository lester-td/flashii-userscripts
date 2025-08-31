# Flashii Chat Userscripts
_A collection of scripts to extend chat functionality_
_Please have Greasemonkey/Tampermonkey installed first_
---

## Better Quotes & Delete Button

### Delete Functionality
- **Shift+Click** the timestamp of your own message to delete it.  
- **Hover** your own message to reveal an `x` button for deletion.  
- If not needed, the delete functionality can be disabled by setting the `enableDelete` constant variable to `false`.

### Quote Functionality
- Wraps highlighted chat text with `[quote]` BBCode when the quote button is clicked.  
- **Quote Previews** show full quoted messages.  
- **Prepending**: Selected messages are prepended to your message input (without cluttering the input box).  
  - Triggered by **quote button** or **message timestamp**.  
- **Jump-to/Highlight**: Clicking the quoted message timestamp or button will jump to and highlight the quoted message.  

### Additional Notes
- Quoted messages use **relative time** (auto-updating as you type/send).  
- CSS variables from the chat are reused, so styling matches existing chat themes.  
- Choose between **buttons** or **clickable timestamps** by toggling the `showButtons` constant variable.  

![Preview](docs/better-quotes-del.png)

[![Download](docs/better-quotes-del-dl.png)](https://patchii.net/lester/flashii-chat-userscripts/raw/branch/trunk/better-quotes-n-delete.user.js "Download")

---

## File Upload Progress Bar
- Adds a theme-fitting progress bar for file uploads, displayed on the formatting bar.  
- Multiple uploads are shown as a combined progress for better visibility.

![Preview](docs/progress-bar.png)

[![Download](docs/progress-bar-dl.png)](https://patchii.net/lester/flashii-chat-userscripts/raw/branch/trunk/file-upload-progress-bar.user.js "Download")