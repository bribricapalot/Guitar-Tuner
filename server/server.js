// FRETLY Backend
// Speichert hochgeladene Songs (Audio-Dateien) und den Zustand pro Song
// (eigene Griffe, Timeline-Clips, Spuren). Keine externen Pakete nötig.
//
// Start:  node server/server.js   →   http://localhost:3000

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const AUDIO_DIR = path.join(DATA_DIR, 'audio');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const MAX_UPLOAD = 100 * 1024 * 1024; // 100 MB
const MAX_JSON = 1024 * 1024; // 1 MB
const MAX_TRACKS = 100; // höchstens 100 Songs in der Library

// Nur diese Frontend-Dateien werden ausgeliefert
const STATIC_FILES = {
    '/': 'index.html',
    '/index.html': 'index.html',
    '/script.js': 'script.js',
    '/style.css': 'style.css'
};

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.webm': 'audio/webm'
};

// ---------- Datenbank (einfache JSON-Datei) ----------

[DATA_DIR, AUDIO_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

let db = { tracks: [] };
if (fs.existsSync(DB_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        console.error('db.json ist beschädigt, starte mit leerer Library.');
    }
}

function saveDb() {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_FILE);
}

function findTrack(id) {
    return db.tracks.filter(t => t.id === id)[0];
}

function publicTrack(t) {
    return {
        id: t.id,
        name: t.name,
        title: t.title,
        createdAt: t.createdAt,
        url: '/api/tracks/' + t.id + '/audio',
        state: t.state || null
    };
}

// ---------- Hilfsfunktionen ----------

function sendJson(res, status, body) {
    const data = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(data)
    });
    res.end(data);
}

function readBody(req, limit, cb) {
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on('data', c => {
        if (failed) return;
        size += c.length;
        if (size > limit) {
            failed = true;
            cb(new Error('too large'));
            req.resume();
            return;
        }
        chunks.push(c);
    });
    req.on('end', () => {
        if (!failed) cb(null, Buffer.concat(chunks));
    });
    req.on('error', err => {
        if (!failed) {
            failed = true;
            cb(err);
        }
    });
}

function serveFile(req, res, file, type) {
    fs.stat(file, (err, stat) => {
        if (err) return sendJson(res, 404, { error: 'Nicht gefunden' });

        // Range-Requests, damit man im Audio-Player springen kann
        const range = req.headers.range;
        const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
        if (m && (m[1] || m[2])) {
            let start = m[1] ? parseInt(m[1], 10) : stat.size - parseInt(m[2], 10);
            let end = m[1] && m[2] ? parseInt(m[2], 10) : stat.size - 1;
            start = Math.max(0, start);
            end = Math.min(end, stat.size - 1);
            if (start > end) {
                res.writeHead(416, { 'Content-Range': 'bytes */' + stat.size });
                return res.end();
            }
            res.writeHead(206, {
                'Content-Type': type,
                'Content-Length': end - start + 1,
                'Content-Range': 'bytes ' + start + '-' + end + '/' + stat.size,
                'Accept-Ranges': 'bytes'
            });
            return fs.createReadStream(file, { start, end }).pipe(res);
        }

        res.writeHead(200, {
            'Content-Type': type,
            'Content-Length': stat.size,
            'Accept-Ranges': 'bytes'
        });
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(file).pipe(res);
    });
}

// ---------- API ----------

function handleApi(req, res, parts) {
    // parts: ['tracks', ':id', 'audio' | 'state']
    if (parts[0] !== 'tracks') return sendJson(res, 404, { error: 'Unbekannte Route' });
    const id = parts[1];
    const sub = parts[2];

    // GET /api/tracks
    if (!id && req.method === 'GET') {
        return sendJson(res, 200, db.tracks.map(publicTrack));
    }

    // POST /api/tracks  (Body = Audio-Datei, Name im Header X-File-Name)
    if (!id && req.method === 'POST') {
        if (db.tracks.length >= MAX_TRACKS) {
            req.resume();
            return sendJson(res, 409, { error: 'Die Library ist voll (' + MAX_TRACKS + ' Songs). Lösche zuerst einen Song.' });
        }
        let name = 'audio';
        try {
            name = decodeURIComponent(req.headers['x-file-name'] || 'audio');
        } catch (e) {}
        name = path.basename(name).slice(0, 200);
        const ext = path.extname(name).toLowerCase();
        if (!MIME[ext] || MIME[ext].indexOf('audio/') !== 0) {
            req.resume();
            return sendJson(res, 400, { error: 'Nur Audio-Dateien erlaubt (mp3, wav, ogg, m4a, aac, flac, webm).' });
        }
        return readBody(req, MAX_UPLOAD, (err, buf) => {
            if (err) return sendJson(res, 413, { error: 'Datei ist zu groß (max. 100 MB).' });
            if (!buf.length) return sendJson(res, 400, { error: 'Leere Datei.' });
            const newId = crypto.randomBytes(8).toString('hex');
            const file = newId + ext;
            fs.writeFile(path.join(AUDIO_DIR, file), buf, err2 => {
                if (err2) return sendJson(res, 500, { error: 'Speichern fehlgeschlagen.' });
                const track = {
                    id: newId,
                    name,
                    title: name.replace(/\.[^.]+$/, ''),
                    file,
                    createdAt: new Date().toISOString(),
                    state: null
                };
                db.tracks.push(track);
                saveDb();
                sendJson(res, 201, publicTrack(track));
            });
        });
    }

    const track = findTrack(id);
    if (!track) return sendJson(res, 404, { error: 'Song nicht gefunden' });

    // GET /api/tracks/:id/audio
    if (sub === 'audio' && (req.method === 'GET' || req.method === 'HEAD')) {
        const ext = path.extname(track.file).toLowerCase();
        return serveFile(req, res, path.join(AUDIO_DIR, track.file), MIME[ext] || 'application/octet-stream');
    }

    // PUT /api/tracks/:id/state  (JSON: Griffe, Timeline, Spuren)
    if (sub === 'state' && req.method === 'PUT') {
        return readBody(req, MAX_JSON, (err, buf) => {
            if (err) return sendJson(res, 413, { error: 'Zustand ist zu groß.' });
            let state;
            try {
                state = JSON.parse(buf.toString('utf8'));
            } catch (e) {
                return sendJson(res, 400, { error: 'Ungültiges JSON.' });
            }
            track.state = state;
            saveDb();
            sendJson(res, 200, publicTrack(track));
        });
    }

    // PATCH /api/tracks/:id  (JSON: { title }) – Song umbenennen, Dateiendung bleibt
    if (!sub && req.method === 'PATCH') {
        return readBody(req, MAX_JSON, (err, buf) => {
            if (err) return sendJson(res, 413, { error: 'Anfrage ist zu groß.' });
            let body;
            try {
                body = JSON.parse(buf.toString('utf8'));
            } catch (e) {
                return sendJson(res, 400, { error: 'Ungültiges JSON.' });
            }
            const title = typeof body.title === 'string' ? body.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 150) : '';
            if (!title) return sendJson(res, 400, { error: 'Bitte einen Namen eingeben.' });
            track.title = title;
            track.name = title + path.extname(track.name);
            saveDb();
            sendJson(res, 200, publicTrack(track));
        });
    }

    // DELETE /api/tracks/:id
    if (!sub && req.method === 'DELETE') {
        db.tracks = db.tracks.filter(t => t.id !== track.id);
        saveDb();
        fs.unlink(path.join(AUDIO_DIR, track.file), () => {});
        return sendJson(res, 200, { ok: true });
    }

    sendJson(res, 405, { error: 'Methode nicht erlaubt' });
}

// ---------- Server ----------

const server = http.createServer((req, res) => {
    const pathname = url.parse(req.url).pathname;

    if (pathname.indexOf('/api/') === 0) {
        const parts = pathname.slice(5).split('/').filter(Boolean);
        try {
            return handleApi(req, res, parts);
        } catch (e) {
            console.error(e);
            return sendJson(res, 500, { error: 'Serverfehler' });
        }
    }

    const file = STATIC_FILES[pathname];
    if (file && (req.method === 'GET' || req.method === 'HEAD')) {
        return serveFile(req, res, path.join(ROOT, file), MIME[path.extname(file)]);
    }

    sendJson(res, 404, { error: 'Nicht gefunden' });
});

server.listen(PORT, () => {
    console.log('FRETLY läuft auf http://localhost:' + PORT);
});
