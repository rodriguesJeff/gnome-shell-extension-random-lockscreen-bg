#!/usr/bin/env bash
# Installs the extension from this checkout via a symlink, so `git pull` updates it
# (changes take effect after logging out and back in), and copies the blur and
# picture settings from the original "Lock screen background" extension once.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
UUID="random-lockscreen-bg@jeff"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"
OLD_PATH="/org/gnome/shell/extensions/unlock-dialog-background/"
NEW_PATH="/org/gnome/shell/extensions/random-lockscreen-bg/"

glib-compile-schemas "$SRC/$UUID/schemas"
mkdir -p "$(dirname "$DEST")"
if [ -e "$DEST" ] && [ ! -L "$DEST" ]; then
    echo "$DEST already exists and is not a symlink; remove it first." >&2
    exit 1
fi
ln -sfn "$SRC/$UUID" "$DEST"
echo "Linked $DEST -> $SRC/$UUID"

# Migrate settings once from the original extension.
if command -v dconf >/dev/null && [ -z "$(dconf list "$NEW_PATH")" ]; then
    for key in radius brightness; do
        val="$(dconf read "${OLD_PATH}${key}")"
        [ -n "$val" ] && dconf write "${NEW_PATH}${key}" "$val"
    done
    pic="$(dconf read "${OLD_PATH}picture-uri-dark")"
    [ -n "$pic" ] && dconf write "${NEW_PATH}single-picture" "$pic"
    echo "Copied settings from the original extension (if any)"
fi

cat <<MSG

Done. Next steps:
  1. Log out and back in (on Wayland GNOME Shell only detects new extensions at login).
  2. gnome-extensions disable unlockDialogBackground@sun.wxg@gmail.com   # if installed
     gnome-extensions enable  $UUID
  3. gnome-extensions prefs   $UUID
MSG
