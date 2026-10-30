// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-
//
// Picks the next lock screen picture and writes it to picture-uri / picture-uri-dark,
// which backgroundNew.js reads. The next picture is always prepared *after* unlocking,
// so the lock screen never has to wait for disk scans or network downloads.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff', '.gif', '.avif', '.heic', '.jxl'];
const UNSPLASH_API = 'https://api.unsplash.com';
const FALLBACK_URL = 'https://picsum.photos/%W/%H';
const USER_AGENT = 'random-lockscreen-bg GNOME Shell extension';

Gio._promisify(Gio.File.prototype, 'enumerate_children_async');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');
Gio._promisify(Soup.Session.prototype, 'send_and_read_async');

/**
 * Turns whatever the user typed into an Unsplash API request.
 *
 * Supported:
 *   https://unsplash.com/collections/<id>/<name>  -> photos from that collection
 *   https://unsplash.com/s/photos/<terms>         -> search terms
 *   https://unsplash.com/@<user>                  -> photos by that user
 *   https://unsplash.com/t/<topic>                -> topic (as search terms)
 *   plain text                                    -> search terms
 *   any other http(s) URL                         -> direct image URL (e.g. picsum.photos)
 *
 * @param {string} input
 * @returns {{kind: 'api', params: object} | {kind: 'direct', url: string}}
 */
export function parseUnsplashInput(input) {
    input = (input ?? '').trim();
    if (!input)
        return {kind: 'api', params: {}};

    if (!/^https?:\/\//i.test(input))
        return {kind: 'api', params: {query: input}};

    let uri;
    try {
        uri = GLib.Uri.parse(input, GLib.UriFlags.NONE);
    } catch {
        return {kind: 'direct', url: input};
    }

    const host = (uri.get_host() ?? '').toLowerCase();
    if (host !== 'unsplash.com' && host !== 'www.unsplash.com')
        return {kind: 'direct', url: input};

    const parts = uri.get_path().split('/').filter(p => p).map(p => decodeURIComponent(p));

    if (parts[0] === 'collections' && parts[1])
        return {kind: 'api', params: {collections: parts[1]}};
    if (parts[0] === 's' && parts[2])
        return {kind: 'api', params: {query: parts[2].replace(/-/g, ' ')}};
    if (parts[0] === 't' && parts[1])
        return {kind: 'api', params: {query: parts[1].replace(/-/g, ' ')}};
    if (parts[0]?.startsWith('@'))
        return {kind: 'api', params: {username: parts[0].slice(1)}};

    return {kind: 'api', params: {}};
}

function expandHome(path) {
    path = (path ?? '').trim();
    return path === '~' || path.startsWith('~/') ? GLib.get_home_dir() + path.slice(1) : path;
}

export class ImageProvider {
    constructor(settings, uuid) {
        this._settings = settings;
        this._cancellable = new Gio.Cancellable();
        this._busy = false;
        this._pending = false;
        this._session = new Soup.Session({user_agent: USER_AGENT, timeout: 30});
        this._cacheDir = Gio.File.new_for_path(
            GLib.build_filenamev([GLib.get_user_cache_dir(), uuid]));

        this._settingsIds = [
            'source-mode', 'single-picture', 'folder-path', 'folder-recursive',
            'unsplash-url', 'unsplash-access-key', 'request-next',
        ].map(key => this._settings.connect(`changed::${key}`, () => this.next()));
    }

    destroy() {
        this._cancellable.cancel();
        this._settingsIds.forEach(id => this._settings.disconnect(id));
        this._settingsIds = [];
        this._session.abort();
        this._session = null;
    }

    /**
     * Prepares the picture for the next time the lock screen is shown.
     */
    async next() {
        // A settings change while busy must not be lost: run once more when done.
        if (this._busy) {
            this._pending = true;
            return;
        }
        this._busy = true;
        this._pending = false;

        try {
            this._warning = '';
            const path = await this._pick();
            if (path && !this._cancellable.is_cancelled()) {
                this._setPicture(path);
                this._setError(this._warning);
            }
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                console.warn(`[random-lockscreen-bg] ${e.message}`);
                this._setError(e.message);
            }
        } finally {
            this._busy = false;
        }

        if (this._pending && !this._cancellable.is_cancelled())
            this.next();
    }

    async _pick() {
        switch (this._settings.get_string('source-mode')) {
        case 'folder':
            return this._pickFromFolder();
        case 'unsplash':
            return this._pickFromUnsplash();
        default:
            return expandHome(this._settings.get_string('single-picture')) || null;
        }
    }

    _setPicture(path) {
        if (this._settings.get_string('picture-uri') === path &&
            this._settings.get_string('picture-uri-dark') === path)
            return;

        // backgroundNew.js watches these keys and coalesces the reload in an idle callback.
        this._settings.set_string('picture-uri', path);
        this._settings.set_string('picture-uri-dark', path);
    }

    _setError(message) {
        if (this._settings.get_string('last-error') !== message)
            this._settings.set_string('last-error', message);
    }

    // ----- folder -----

    async _pickFromFolder() {
        const folderPath = expandHome(this._settings.get_string('folder-path'));
        if (!folderPath)
            throw new Error('No folder selected');

        const recursive = this._settings.get_boolean('folder-recursive');
        const images = await this._listImages(Gio.File.new_for_path(folderPath), recursive, 0);
        if (images.length === 0)
            throw new Error(`No pictures found in ${folderPath}`);

        return this._randomOtherThanCurrent(images);
    }

    async _listImages(dir, recursive, depth) {
        const result = [];
        const enumerator = await dir.enumerate_children_async(
            'standard::name,standard::type,standard::is-hidden',
            Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_LOW, this._cancellable);

        let infos;
        while ((infos = await enumerator.next_files_async(100, GLib.PRIORITY_LOW, this._cancellable)).length) {
            for (const info of infos) {
                if (info.get_is_hidden())
                    continue;

                const child = dir.get_child(info.get_name());
                const type = info.get_file_type();
                if (type === Gio.FileType.DIRECTORY) {
                    if (recursive && depth < 8)
                        result.push(...await this._listImages(child, recursive, depth + 1));
                } else if (IMAGE_EXTENSIONS.some(ext => info.get_name().toLowerCase().endsWith(ext))) {
                    result.push(child.get_path());
                }
            }
        }
        enumerator.close(null);
        return result;
    }

    _randomOtherThanCurrent(paths) {
        const current = this._settings.get_string('picture-uri');
        const candidates = paths.length > 1 ? paths.filter(p => p !== current) : paths;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    // ----- unsplash -----

    async _pickFromUnsplash() {
        const {width, height} = this._screenSize();
        const target = parseUnsplashInput(this._settings.get_string('unsplash-url'));
        const accessKey = this._settings.get_string('unsplash-access-key').trim();

        let imageUrl, name;
        if (target.kind === 'direct') {
            imageUrl = target.url;
            name = 'url';
        } else if (accessKey) {
            const photo = await this._getJson(this._apiUrl('/photos/random', {
                ...target.params,
                orientation: 'landscape',
                content_filter: 'high',
            }), accessKey);

            imageUrl = `${photo.urls.raw}&w=${width}&h=${height}&fit=crop&crop=entropy&fm=jpg&q=85`;
            name = `unsplash-${photo.id}`;

            // Required by the Unsplash API guidelines when a photo is used.
            if (photo.links?.download_location)
                this._getJson(photo.links.download_location, accessKey).catch(() => {});
        } else {
            imageUrl = FALLBACK_URL.replace('%W', width).replace('%H', height);
            name = 'picsum';
            if (Object.keys(target.params).length)
                this._warning = 'Unsplash links need an Access Key; using random photos from picsum.photos instead';
        }

        const bytes = await this._getBytes(imageUrl);
        const path = await this._saveToCache(name, bytes);
        this._trimCache(path);
        return path;
    }

    _screenSize() {
        const monitor = Main.layoutManager.primaryMonitor;
        const scale = monitor?.geometry_scale ?? 1;
        return {
            width: Math.round((monitor?.width ?? 1920) * scale),
            height: Math.round((monitor?.height ?? 1080) * scale),
        };
    }

    _apiUrl(path, params) {
        const query = Object.entries(params)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
        return `${UNSPLASH_API}${path}?${query}`;
    }

    async _send(url, accessKey = null) {
        const message = Soup.Message.new('GET', url);
        if (!message)
            throw new Error(`Invalid URL: ${url}`);
        if (accessKey) {
            message.request_headers.append('Authorization', `Client-ID ${accessKey}`);
            message.request_headers.append('Accept-Version', 'v1');
        }

        const bytes = await this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, this._cancellable);
        const status = message.get_status();
        if (status !== Soup.Status.OK) {
            let detail = message.get_reason_phrase();
            try {
                detail = JSON.parse(new TextDecoder().decode(bytes.get_data())).errors?.join(', ') ?? detail;
            } catch {}
            throw new Error(`HTTP ${status} from ${GLib.Uri.parse(url, GLib.UriFlags.NONE).get_host()}: ${detail}`);
        }
        return {message, bytes};
    }

    async _getJson(url, accessKey) {
        const {bytes} = await this._send(url, accessKey);
        return JSON.parse(new TextDecoder().decode(bytes.get_data()));
    }

    async _getBytes(url) {
        const {message, bytes} = await this._send(url);
        const type = message.response_headers.get_content_type()[0] ?? '';
        if (!type.startsWith('image/'))
            throw new Error(`URL did not return an image (${type || 'unknown type'})`);
        return bytes;
    }

    async _saveToCache(name, bytes) {
        try {
            this._cacheDir.make_directory_with_parents(null);
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                throw e;
        }

        // Unique name so the shell's texture cache never serves an old picture.
        const file = this._cacheDir.get_child(`${name}-${GLib.get_real_time()}.jpg`);
        await file.replace_contents_bytes_async(bytes, null, false,
            Gio.FileCreateFlags.REPLACE_DESTINATION, this._cancellable);
        return file.get_path();
    }

    _trimCache(keepPath) {
        const keep = this._settings.get_int('cache-size');
        const current = this._settings.get_string('picture-uri');
        try {
            const enumerator = this._cacheDir.enumerate_children(
                'standard::name,time::modified,time::modified-usec', Gio.FileQueryInfoFlags.NONE, null);
            const files = [];
            let info;
            while ((info = enumerator.next_file(null)))
                files.push({file: this._cacheDir.get_child(info.get_name()), time: info.get_modification_date_time().to_unix_usec()});
            enumerator.close(null);

            files.sort((a, b) => b.time - a.time)
                .slice(keep)
                .filter(({file}) => ![keepPath, current].includes(file.get_path()))
                .forEach(({file}) => file.delete(null));
        } catch (e) {
            console.warn(`[random-lockscreen-bg] could not trim cache: ${e.message}`);
        }
    }
}
