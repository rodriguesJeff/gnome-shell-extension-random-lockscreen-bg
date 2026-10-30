import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const MODES = ['single', 'folder', 'unsplash'];
const MODE_LABELS = ['Single picture', 'Random from folder', 'Random from Unsplash'];

export default class RandomLockscreenBackgroundPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings;

        const page = new Adw.PreferencesPage();
        window.add(page);
        window.set_default_size(600, 820);

        page.add(this._blurGroup(settings));
        page.add(this._sourceGroup(window, settings));
        page.add(this._previewGroup(settings));
    }

    _blurGroup(settings) {
        const group = new Adw.PreferencesGroup({title: 'Blur'});

        group.add(this._scaleRow(settings, 'Adjust Radius', 'radius', 0, 100, 1, 5, 0));
        group.add(this._scaleRow(settings, 'Adjust Brightness', 'brightness', 0, 1, 0.05, 0.1, 2));
        return group;
    }

    _scaleRow(settings, title, key, lower, upper, step, pageStep, digits) {
        const row = new Adw.ActionRow({title});
        const adjustment = new Gtk.Adjustment({
            lower,
            upper,
            'step-increment': step,
            'page-increment': pageStep,
        });
        settings.bind(key, adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        row.add_suffix(new Gtk.Scale({
            hexpand: true,
            'draw-value': true,
            'value-pos': 'left',
            digits,
            valign: Gtk.Align.CENTER,
            adjustment,
        }));
        return row;
    }

    _sourceGroup(window, settings) {
        const group = new Adw.PreferencesGroup({
            title: 'Picture source',
            description: 'In random modes a new picture is prepared every time you unlock, ready for the next lock.',
        });

        const modeRow = new Adw.ComboRow({
            title: 'Source',
            model: Gtk.StringList.new(MODE_LABELS),
        });
        modeRow.set_selected(Math.max(0, MODES.indexOf(settings.get_string('source-mode'))));
        modeRow.connect('notify::selected', () => settings.set_string('source-mode', MODES[modeRow.selected]));
        group.add(modeRow);

        // single
        const singleRow = this._pathRow(window, settings, 'single-picture', 'Picture', false);

        // folder
        const folderRow = this._pathRow(window, settings, 'folder-path', 'Folder', true);
        const recursiveRow = new Adw.SwitchRow({title: 'Include subfolders'});
        settings.bind('folder-recursive', recursiveRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        // unsplash
        const urlRow = new Adw.EntryRow({title: 'Unsplash link or search terms'});
        urlRow.set_text(settings.get_string('unsplash-url'));
        urlRow.set_show_apply_button(true);
        urlRow.connect('apply', () => settings.set_string('unsplash-url', urlRow.get_text().trim()));

        const keyRow = new Adw.PasswordEntryRow({title: 'Unsplash Access Key'});
        keyRow.set_text(settings.get_string('unsplash-access-key'));
        keyRow.set_show_apply_button(true);
        keyRow.connect('apply', () => settings.set_string('unsplash-access-key', keyRow.get_text().trim()));

        const helpRow = new Adw.ActionRow({
            title: 'How to use',
            subtitle:
                'Paste a link such as unsplash.com/collections/…, unsplash.com/s/photos/…, ' +
                'unsplash.com/@user, or just type words like “mountains night”. ' +
                'Unsplash requires a free Access Key (unsplash.com/developers → New Application). ' +
                'Without a key, random photos from picsum.photos are used. ' +
                'Any other direct image URL also works.',
            subtitle_lines: 0,
        });
        const devButton = new Gtk.LinkButton({
            label: 'Get key',
            uri: 'https://unsplash.com/oauth/applications',
            valign: Gtk.Align.CENTER,
        });
        helpRow.add_suffix(devButton);

        const cacheRow = new Adw.SpinRow({
            title: 'Downloaded pictures to keep',
            adjustment: new Gtk.Adjustment({lower: 1, upper: 100, 'step-increment': 1}),
        });
        settings.bind('cache-size', cacheRow, 'value', Gio.SettingsBindFlags.DEFAULT);

        const nextRow = new Adw.ButtonRow({title: 'Pick a new picture now'});
        nextRow.connect('activated', () => settings.set_int('request-next', settings.get_int('request-next') + 1));

        const errorRow = new Adw.ActionRow({title: 'Last error', subtitle_lines: 0, css_classes: ['error']});
        const updateError = () => {
            const message = settings.get_string('last-error');
            errorRow.subtitle = GLib.markup_escape_text(message, -1);
            errorRow.visible = message !== '';
        };
        settings.connect('changed::last-error', updateError);
        updateError();

        const rowsByMode = {
            single: [singleRow],
            folder: [folderRow, recursiveRow, nextRow],
            unsplash: [urlRow, keyRow, helpRow, cacheRow, nextRow],
        };
        const allRows = [...new Set(Object.values(rowsByMode).flat())];
        allRows.forEach(row => group.add(row));
        group.add(errorRow);

        const updateVisible = () => {
            const visible = rowsByMode[settings.get_string('source-mode')] ?? [];
            allRows.forEach(row => (row.visible = visible.includes(row)));
        };
        settings.connect('changed::source-mode', updateVisible);
        updateVisible();

        return group;
    }

    _pathRow(window, settings, key, title, selectFolder) {
        const row = new Adw.EntryRow({title});
        row.set_text(settings.get_string(key));
        row.connect('changed', () => settings.set_string(key, row.get_text()));

        const button = new Gtk.Button({
            icon_name: selectFolder ? 'folder-open-symbolic' : 'document-open-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: 'Browse',
        });
        button.connect('clicked', () => this._choose(window, row, selectFolder));
        row.add_suffix(button);
        return row;
    }

    _previewGroup(settings) {
        const group = new Adw.PreferencesGroup({title: 'Next lock screen picture'});
        const preview = new Gtk.Picture({
            content_fit: Gtk.ContentFit.COVER,
            can_shrink: true,
            height_request: 260,
        });
        const label = new Gtk.Label({
            ellipsize: 3, // Pango.EllipsizeMode.END
            css_classes: ['dim-label', 'caption'],
            margin_top: 6,
        });

        const update = () => {
            const path = settings.get_string('picture-uri');
            const exists = GLib.file_test(path, GLib.FileTest.EXISTS);
            preview.set_filename(exists ? path : null);
            label.label = exists ? path : 'No picture yet';
        };
        settings.connect('changed::picture-uri', update);
        update();

        group.add(preview);
        group.add(label);
        return group;
    }

    _choose(window, row, selectFolder) {
        const dialog = new Gtk.FileDialog({title: selectFolder ? 'Select Folder' : 'Select File'});
        const current = row.get_text();
        if (current && GLib.file_test(current, GLib.FileTest.EXISTS))
            dialog.initial_file = Gio.File.new_for_path(current);

        if (!selectFolder) {
            const filter = new Gtk.FileFilter();
            filter.add_pixbuf_formats();
            dialog.default_filter = filter;
        }

        const open = selectFolder ? 'select_folder' : 'open';
        dialog[open](window, null, (d, result) => {
            try {
                const path = d[`${open}_finish`](result)?.get_path();
                if (path)
                    row.set_text(path);
            } catch (e) {
                if (!e.matches(Gtk.DialogError, Gtk.DialogError.DISMISSED))
                    logError(e);
            }
        });
    }
}
