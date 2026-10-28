# Hotstar Desktop

browser extention to allow using hotstar desktop using just a hotstar mobile subscription

## Install

1. Download and extract [hotstar-desktop-extension.zip](hotstar-desktop-extension.zip).
2. Open `chrome://extensions`, enable **Developer mode**, and select **Load unpacked**.
3. Choose the extracted folder containing `manifest.json`.
4. Open Hotstar and turn on the switch in the extension popup.

To update, replace the extracted files, reload the extension, and refresh the Hotstar tab.

## How it works

When enabled, the extension uses browser network rules to modify GET and POST requests from the selected tab to specific Hotstar API endpoints. It sets:

- **Platform and app headers:** identify the mobile app and its build and schema versions.
- **Client header:** supplies the app version and a fixed Google Pixel 8 device profile.
- **User-Agent:** identifies the Hotstar mobile app and its version.

The rules apply only to the selected tab while enabled. The extension uses your existing browser login; the headers do not guarantee how Hotstar identifies the browser.
