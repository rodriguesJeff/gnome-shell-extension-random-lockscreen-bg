import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class RandomLockscreenBackgroundPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({ title: 'Change background' });
        page.add(group);
        window.add(page);
        window.set_default_size(550, 650);

        const blurRow = new Adw.ActionRow({ title: 'Adjust Radius' });
        const blurAdjustment = new Gtk.Adjustment({
            lower: 0,
            'step-increment': 1,
            'page-increment': 5,
            upper: 100,
        });
        settings.bind('radius', blurAdjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        const blurScale = new Gtk.Scale({
            hexpand: true,
            'draw-value': true,
            'value-pos': 'left',
            'can-focus': true,
            digits: 0,
            valign: Gtk.Align.CENTER,
            adjustment: blurAdjustment,
        });
        blurRow.add_suffix(blurScale);
        group.add(blurRow);

        const brightnessRow = new Adw.ActionRow({ title: 'Adjust Brightness' });
        const brightnessAdjustment = new Gtk.Adjustment({
            lower: 0,
            'step-increment': 0.05,
            'page-increment': 0.1,
            upper: 1,
        });
        settings.bind('brightness', brightnessAdjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        const brightnessScale = new Gtk.Scale({
            hexpand: true,
            'draw-value': true,
            'value-pos': 'left',
            'can-focus': true,
            digits: 2,
            valign: Gtk.Align.CENTER,
            adjustment: brightnessAdjustment,
        });
        brightnessRow.add_suffix(brightnessScale);
        group.add(brightnessRow);

        const pictureRow = new Adw.EntryRow({ title: 'Picture' });
        const browseButton = new Gtk.Button({
            icon_name: 'document-open-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: 'Browse',
        });
        browseButton.connect('clicked', () => this._choosePicture(window, pictureRow));
        pictureRow.add_suffix(browseButton);

        const preview = new Gtk.Picture({
            content_fit: Gtk.ContentFit.CONTAIN,
            can_shrink: true,
            vexpand: true,
            height_request: 250,
        });

        const updatePreview = () => {
            const path = pictureRow.get_text();
            preview.set_filename(GLib.file_test(path, GLib.FileTest.EXISTS) ? path : null);
        };

        pictureRow.set_text(settings.get_string('picture-uri-dark'));
        pictureRow.connect('changed', () => {
            const text = pictureRow.get_text();
            settings.set_string('picture-uri', text);
            settings.set_string('picture-uri-dark', text);
            updatePreview();
        });
        group.add(pictureRow);
        group.add(preview);

        updatePreview();
    }

    _choosePicture(window, pictureRow) {
        const dialog = new Gtk.FileDialog({ title: 'Select File' });
        const filter = new Gtk.FileFilter();
        filter.add_pixbuf_formats();
        dialog.default_filter = filter;

        dialog.open(window, null, (dialog, result) => {
            try {
                const file = dialog.open_finish(result);
                const path = file?.get_path();
                if (path)
                    pictureRow.set_text(path);
            } catch (e) {
                if (!e.matches(Gtk.DialogError, Gtk.DialogError.DISMISSED))
                    logError(e);
            }
        });
    }
}
