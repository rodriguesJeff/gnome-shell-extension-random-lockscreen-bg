# Random Lock Screen Background

**English** · [Português](README.pt-BR.md)

A GNOME Shell extension that puts a blurred picture behind the lock screen, and can
**change it on every unlock**, using a random image from a folder or a random photo from
Unsplash.

This is a fork of [Lock screen background](https://github.com/sunwxg/gnome-shell-extension-unlockDialogBackground)
by Xiaoguang Wang (sun.wxg). The background and blur code comes from that extension.
This fork adds the picture sources.

![Blurred lock screen background](screenshot.gif)

## Features

| Picture source | What it does |
|---|---|
| **Single picture** | Always the same picture, like the original extension. |
| **Random from folder** | Picks a random image from a folder (optionally including subfolders) and never repeats the current one. |
| **Random from Unsplash** | Downloads a new random photo, sized to your screen. You can narrow it down to a collection, a search, a photographer or a topic. |

- The next picture is prepared **right after you unlock**. The lock screen shows up
  instantly and still works offline.
- If anything goes wrong (empty folder, no network, invalid key), the previous picture
  stays and the error appears in the preferences window.
- Blur radius and brightness are adjustable, and the preferences window shows a preview
  of the next picture plus a *Pick a new picture now* button.

## Requirements

- GNOME Shell **51**

## Installation

```bash
git clone https://github.com/rodriguesJeff/gnome-shell-extension-unlockDialogBackground.git
cd gnome-shell-extension-unlockDialogBackground
./install.sh
```

`install.sh` links the extension into `~/.local/share/gnome-shell/extensions/`, so a
`git pull` updates it. The first time it runs, it also copies your blur and picture
settings from the original extension. If you prefer a plain copy, run `make install`.

Then:

1. **Log out and log back in.** On Wayland, GNOME Shell only detects new extensions
   at login. Locking the screen is not enough.
2. Enable it, and disable the original extension if you have it (the two conflict):
   ```bash
   gnome-extensions disable unlockDialogBackground@sun.wxg@gmail.com
   gnome-extensions enable random-lockscreen-bg@jeff
   ```
3. Open the preferences:
   ```bash
   gnome-extensions prefs random-lockscreen-bg@jeff
   ```

## Using Unsplash

The **Unsplash link or search terms** field accepts:

| Input | Photos from |
|---|---|
| `https://unsplash.com/collections/317099/...` | a collection |
| `https://unsplash.com/s/photos/night-sky` | a search |
| `https://unsplash.com/@username` | a photographer |
| `https://unsplash.com/t/nature` | a topic |
| `mountains snow` | plain search terms |
| *(empty)* | anything |
| any other image URL, e.g. `https://picsum.photos/3840/2160` | that URL |

The old `source.unsplash.com` service has been shut down, so Unsplash now requires a free
**Access Key**:

1. Go to <https://unsplash.com/oauth/applications> and create a *New Application*.
2. Copy the **Access Key** (not the Secret key).
3. Paste it into the preferences and press Enter or ✓ to save.

The free demo tier allows 50 requests per hour. The extension makes one request per
unlock, which is plenty. Without a key, it falls back to random photos from
[picsum.photos](https://picsum.photos), which also come from Unsplash.

Downloaded photos are stored in `~/.cache/random-lockscreen-bg@jeff/`, and only the most
recent ones are kept (10 by default).

## How it works

- `extension.js` replaces the lock screen's background creation (`UnlockDialog`) with a
  version that draws its own picture and applies `Shell.BlurEffect`. It also listens to
  `Main.screenShield`'s `locked-changed` signal and asks for a new picture on every
  unlock.
- `imageProvider.js` picks the next picture according to the selected source. All file
  and network I/O is asynchronous, so the shell never freezes. When it has a new picture,
  it writes its path to the `picture-uri` setting.
- `backgroundNew.js` watches `picture-uri` and reloads the background.
- `prefs.js` is the GTK4/libadwaita preferences window. It only reads and writes
  GSettings, which is how it talks to the extension running inside the shell.

All settings live under `/org/gnome/shell/extensions/random-lockscreen-bg/`:

```bash
dconf dump /org/gnome/shell/extensions/random-lockscreen-bg/
```

## Troubleshooting

- **"Extension does not exist" right after installing**: log out and back in.
- **The picture doesn't change**: check the *Last error* row in the preferences, or watch
  the logs:
  ```bash
  journalctl -f -o cat /usr/bin/gnome-shell | grep random-lockscreen
  ```

## Uninstall

```bash
gnome-extensions disable random-lockscreen-bg@jeff
rm ~/.local/share/gnome-shell/extensions/random-lockscreen-bg@jeff
dconf reset -f /org/gnome/shell/extensions/random-lockscreen-bg/
rm -rf ~/.cache/random-lockscreen-bg@jeff
```

## Credits and license

- Original extension: [sunwxg/gnome-shell-extension-unlockDialogBackground](https://github.com/sunwxg/gnome-shell-extension-unlockDialogBackground),
  © 2018 Xiaoguang Wang.
- Random picture sources: Jefferson Souza.
- Photos: [Unsplash](https://unsplash.com) and [Lorem Picsum](https://picsum.photos).

Released under the [MIT License](LICENSE), like the original.
