# Changelog

## 0.4.8
- Messages (and therefore photos) are always shown in chronological order, even if the export lists them out of order.

## 0.4.7
- A chat folder that contains a zip (e.g. `Name/Name.zip`) is now read through the inner zip.
- When no chat is found, the error lists what was found in the folder, to make odd exports easy to diagnose.

## 0.4.6
- Opening a folder that holds many chats (no chat file at its top level, one sub-folder or zip per chat) now adds it as a library, one card per chat named after its folder, instead of merging everything into a single chat.

## 0.4.5
- Library folders: the same chat present as both a folder and a zip (or several copies) is shown once, the most recent, with a "+1 copy" note.

## 0.4.4
- Scroll anchoring: the top message stays put while images load or fail, so the view no longer drifts down on its own.

## 0.4.3
- Fix Telegram chats: stray spaces and blank lines in message text made bubbles oversized.
- Fix the view jumping down while scrolling up (images loading above the viewport).

## 0.4.2
- Home redesigned in a macOS Messages style, logo next to the name.
- Back navigation: chevron button and `Cmd+[`.
- GIFs and stickers moved to their own gallery tab.
- Floating date chip and visible day separators.
- `Cmd/Ctrl+F` in-chat search; `Esc` closes only the preview.
- Typography and header fixes.

## 0.1.0
- First release: read WhatsApp and Telegram exports from a folder or zip, without writing to the vault.
