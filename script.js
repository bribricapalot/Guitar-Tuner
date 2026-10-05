// Navigation & Views
const views = document.querySelectorAll('.view');
const nav = document.querySelectorAll('.nav button');

function show(id) {
    views.forEach(v => v.classList.toggle('active', v.id === id));
    nav.forEach(b => b.classList.toggle('active', b.dataset.view === id));
    document.getElementById('status').textContent =
        id === 'tuning' ? 'TUNER MODE' :
            id === 'library' ? 'LIBRARY MODE' :
                id === 'finder' ? 'CHORD MODE' : 'READY TO PLAY';
}

nav.forEach(b => b.onclick = () => show(b.dataset.view));
document.querySelectorAll('[data-go]').forEach(e => e.onclick = () => show(e.dataset.go));

// Klick auf das FRETLY-Logo führt zurück ins Studio
const brand = document.querySelector('.brand');
brand.onclick = () => show('home');
brand.onkeydown = e => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        show('home');
    }
};

// Dark Mode: Schalter im Studio unten rechts, Wahl wird im Browser gemerkt
// (ohne gespeicherte Wahl gilt die Einstellung des Systems)
(() => {
    const toggle = document.getElementById('themeToggle');
    function setTheme(dark, remember) {
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
        toggle.setAttribute('aria-checked', dark);
        toggle.querySelector('.theme-icon').textContent = dark ? '☀' : '☾';
        toggle.querySelector('.theme-label').textContent = dark ? 'Light Mode' : 'Dark Mode';
        if (remember) {
            try {
                localStorage.setItem('fretly.theme', dark ? 'dark' : 'light');
            } catch (e) {}
        }
    }
    let saved = null;
    try {
        saved = localStorage.getItem('fretly.theme');
    } catch (e) {}
    setTheme(saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches, false);
    toggle.onclick = () => setTheme(document.documentElement.dataset.theme !== 'dark', true);
})();

// Audio & WaveSurfer Player
let wave;
const audio = document.getElementById('audio');
let loopOn = false, loopStart = 0, loopEnd = 0;

try {
    // Die Wellenform zeigt nur an; abgespielt wird über <audio>. Der orange Strich wird in syncWave() nachgeführt.
    wave = WaveSurfer.create({
        container: '#waveform',
        waveColor: '#78856e',
        progressColor: '#ddff63',
        cursorColor: '#ff6844',
        cursorWidth: 2,
        dragToSeek: true,
        height: 60,
        barWidth: 2,
        barGap: 2,
        normalize: true
    });
    // Klick in die Wellenform springt an diese Stelle
    wave.on('interaction', t => {
        if (audio.src && isFinite(audio.duration)) audio.currentTime = Math.min(t, audio.duration);
    });
    wave.on('ready', () => syncWave());
} catch (e) {}

// Orangen Strich der Wellenform auf die aktuelle Abspielposition setzen
function syncWave() {
    if (wave && wave.getDuration() > 0) wave.setTime(Math.min(audio.currentTime, wave.getDuration()));
}

// Lädt einen Song in Player und Wellenform
function loadSong(url) {
    audio.src = url;
    if (wave) wave.load(url).catch(() => {});
}

const play = document.getElementById('play');
play.onclick = () => {
    if (!audio.src) return;
    audio.paused ? audio.play() : audio.pause();
};

audio.onplay = () => play.textContent = 'Ⅱ';
audio.onpause = () => play.textContent = '▶';
audio.ontimeupdate = () => {
    document.getElementById('time').textContent = fmt(audio.currentTime) + ' / ' + fmt(audio.duration);
    if (loopOn && audio.currentTime >= loopEnd) audio.currentTime = loopStart;
};

function fmt(s) {
    return isFinite(s)
        ? String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0')
        : '00:00';
}

document.getElementById('audioUpload').onchange = e => {
    let f = e.target.files[0];
    if (!f) return;
    loadSong(URL.createObjectURL(f));
    document.getElementById('trackTitle').textContent = f.name.replace(/\.[^.]+$/, '');
    document.getElementById('editorName').textContent = f.name;
    document.getElementById('trackList').innerHTML = '<div class="track active"><span class="disc">▶</span><span></span></div>';
    document.querySelector('#trackList .track span:last-child').textContent = f.name;
};

document.getElementById('speed').oninput = e => audio.playbackRate = e.target.value;

// Lautstärke (wird im Browser gemerkt)
const volume = document.getElementById('volume');
try {
    let v = localStorage.getItem('fretly.volume');
    if (v !== null) volume.value = v;
} catch (e) {}
audio.volume = volume.value;
volume.oninput = () => {
    audio.volume = volume.value;
    try {
        localStorage.setItem('fretly.volume', volume.value);
    } catch (e) {}
};
document.getElementById('pitch').oninput = e => {
    document.getElementById('status').textContent = 'PITCH ' + (e.target.value > 0 ? '+' : '') + e.target.value + ' ST';
};

document.getElementById('loop').onclick = e => {
    loopOn = !loopOn;
    e.target.classList.toggle('on', loopOn);
    if (loopOn) {
        loopStart = audio.currentTime;
        loopEnd = Math.min((audio.duration || 0), loopStart + 8);
    }
    e.target.textContent = loopOn ? 'LOOPING A—B' : 'A—B LOOP';
};

// Statisches 2.5D-Griffbrett: nur Zoom und Linkshänder-Spiegelung verändern es.
// Bei der Spiegelung wird nur das Griffbrett gespiegelt, die Zahlen bleiben lesbar (siehe .mirrored im CSS).
function applyBoardTransform(board) {
    let z = +board.dataset.zoom || 1;
    let mirrored = board.classList.contains('mirrored');
    board.style.transform = 'scale(' + (mirrored ? -z : z) + ', ' + z + ')';
}

document.getElementById('leftHand').onchange = e => {
    let board = document.getElementById('board');
    board.classList.toggle('mirrored', e.target.checked);
    applyBoardTransform(board);
};

// Griffbrett-Geometrie: 15 Bünde, hohe e-Saite oben, tiefe E-Saite unten
const FRETS = 15, FRET_W = 100 / FRETS;
const fretX = f => (f - 0.5) * FRET_W;          // Mitte eines Bundes in %
const stringY = s => 16 + (5 - s) * 24;          // s: 0 = tiefe E … 5 = hohe e (in px)
const stringOf = y => 5 - Math.round((y - 16) / 24);

// Echte Gitarrengriffe: offene Griffe + verschiebbare Barré-Griffe (E-Form / A-Form)
const chordEngine = (() => {
    const ROOTS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
    const TYPES = ['', 'm', '7', 'maj7', 'm7', 'sus2', 'sus4', 'dim', 'aug', '6', '9', 'add9'];
    const TYPE_NAMES = {
        '': 'Dur', m: 'Moll', '7': 'Septakkord', maj7: 'Major 7', m7: 'Moll 7', sus2: 'sus2', sus4: 'sus4',
        dim: 'vermindert', aug: 'übermäßig', '6': 'Sextakkord', '9': 'Nonakkord', add9: 'add9'
    };
    const INTERVALS = {
        '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], sus2: [0, 2, 7],
        sus4: [0, 5, 7], dim: [0, 3, 6], aug: [0, 4, 8], '6': [0, 4, 7, 9], '9': [0, 4, 7, 10, 2], add9: [0, 4, 7, 2]
    };
    const OPEN_PC = [4, 9, 2, 7, 11, 4]; // E A D G B e
    const x = null;

    // Offene Griffe: [Bünde von tiefer E bis hoher e], [Finger] – null = gedämpft, 0 = leere Saite
    const OPEN = {
        'C': [[x, 3, 2, 0, 1, 0], [0, 3, 2, 0, 1, 0]],
        'Cmaj7': [[x, 3, 2, 0, 0, 0], [0, 3, 2, 0, 0, 0]],
        'C7': [[x, 3, 2, 3, 1, 0], [0, 3, 2, 4, 1, 0]],
        'Cadd9': [[x, 3, 2, 0, 3, 0], [0, 2, 1, 0, 3, 0]],
        'Csus2': [[x, 3, 0, 0, 3, 3], [0, 1, 0, 0, 3, 4]],
        'Csus4': [[x, 3, 3, 0, 1, 1], [0, 3, 4, 0, 1, 1]],
        'C6': [[x, 3, 2, 2, 1, 0], [0, 4, 2, 3, 1, 0]],
        'D': [[x, x, 0, 2, 3, 2], [0, 0, 0, 1, 3, 2]],
        'Dm': [[x, x, 0, 2, 3, 1], [0, 0, 0, 2, 3, 1]],
        'D7': [[x, x, 0, 2, 1, 2], [0, 0, 0, 2, 1, 3]],
        'Dmaj7': [[x, x, 0, 2, 2, 2], [0, 0, 0, 1, 1, 1]],
        'Dm7': [[x, x, 0, 2, 1, 1], [0, 0, 0, 2, 1, 1]],
        'Dsus2': [[x, x, 0, 2, 3, 0], [0, 0, 0, 1, 3, 0]],
        'Dsus4': [[x, x, 0, 2, 3, 3], [0, 0, 0, 1, 2, 3]],
        'D6': [[x, x, 0, 2, 0, 2], [0, 0, 0, 1, 0, 2]],
        'E': [[0, 2, 2, 1, 0, 0], [0, 2, 3, 1, 0, 0]],
        'Em': [[0, 2, 2, 0, 0, 0], [0, 2, 3, 0, 0, 0]],
        'E7': [[0, 2, 0, 1, 0, 0], [0, 2, 0, 1, 0, 0]],
        'Emaj7': [[0, 2, 1, 1, 0, 0], [0, 3, 1, 2, 0, 0]],
        'Em7': [[0, 2, 0, 0, 0, 0], [0, 2, 0, 0, 0, 0]],
        'Esus4': [[0, 2, 2, 2, 0, 0], [0, 2, 3, 4, 0, 0]],
        'E6': [[0, 2, 2, 1, 2, 0], [0, 2, 3, 1, 4, 0]],
        'E9': [[0, 2, 0, 1, 0, 2], [0, 2, 0, 1, 0, 3]],
        'Fmaj7': [[x, x, 3, 2, 1, 0], [0, 0, 3, 2, 1, 0]],
        'G': [[3, 2, 0, 0, 0, 3], [2, 1, 0, 0, 0, 3]],
        'G7': [[3, 2, 0, 0, 0, 1], [3, 2, 0, 0, 0, 1]],
        'Gmaj7': [[3, 2, 0, 0, 0, 2], [3, 2, 0, 0, 0, 1]],
        'G6': [[3, 2, 0, 0, 0, 0], [2, 1, 0, 0, 0, 0]],
        'Gsus2': [[3, 0, 0, 0, 3, 3], [2, 0, 0, 0, 3, 4]],
        'Gsus4': [[3, 3, 0, 0, 1, 3], [2, 3, 0, 0, 1, 4]],
        'A': [[x, 0, 2, 2, 2, 0], [0, 0, 1, 2, 3, 0]],
        'Am': [[x, 0, 2, 2, 1, 0], [0, 0, 2, 3, 1, 0]],
        'A7': [[x, 0, 2, 0, 2, 0], [0, 0, 2, 0, 3, 0]],
        'Amaj7': [[x, 0, 2, 1, 2, 0], [0, 0, 2, 1, 3, 0]],
        'Am7': [[x, 0, 2, 0, 1, 0], [0, 0, 2, 0, 1, 0]],
        'Asus2': [[x, 0, 2, 2, 0, 0], [0, 0, 1, 2, 0, 0]],
        'Asus4': [[x, 0, 2, 2, 3, 0], [0, 0, 1, 2, 3, 0]],
        'A6': [[x, 0, 2, 2, 2, 2], [0, 0, 1, 1, 1, 1]],
        'A9': [[x, 0, 2, 4, 2, 3], [0, 0, 1, 3, 2, 4]],
        'Aaug': [[x, 0, 3, 2, 2, 1], [0, 0, 4, 2, 3, 1]],
        'B♭aug': [[x, 1, 0, 3, 3, 2], [0, 1, 0, 3, 4, 2]],
        'B7': [[x, 2, 1, 2, 0, 2], [0, 2, 1, 3, 0, 4]]
    };

    // Verschiebbare Griffe relativ zum Grundton-Bund r
    const E_SHAPE = { // Grundton auf der tiefen E-Saite
        '': [[0, 2, 2, 1, 0, 0], [1, 3, 4, 2, 1, 1]],
        m: [[0, 2, 2, 0, 0, 0], [1, 3, 4, 1, 1, 1]],
        '7': [[0, 2, 0, 1, 0, 0], [1, 3, 1, 2, 1, 1]],
        maj7: [[0, x, 1, 1, 0, x], [1, 0, 3, 4, 2, 0]],
        m7: [[0, 2, 0, 0, 0, 0], [1, 3, 1, 1, 1, 1]],
        sus4: [[0, 2, 2, 2, 0, 0], [1, 2, 3, 4, 1, 1]],
        sus2: [[0, 2, 4, 4, x, x], [1, 2, 3, 4, 0, 0]],
        dim: [[0, 1, 2, 0, x, x], [2, 3, 4, 1, 0, 0]],
        aug: [[0, 3, 2, 1, 1, x], [1, 4, 3, 2, 2, 0]],
        '6': [[0, x, -1, 1, 0, x], [2, 0, 1, 4, 3, 0]],
        '9': [[0, x, 0, -1, 0, x], [2, 0, 3, 1, 4, 0]],
        add9: [[0, 2, 4, 1, 0, 0], [1, 3, 4, 2, 1, 1]]
    };
    const A_SHAPE = { // Grundton auf der A-Saite
        '': [[x, 0, 2, 2, 2, 0], [0, 1, 3, 3, 3, 1]],
        m: [[x, 0, 2, 2, 1, 0], [0, 1, 3, 4, 2, 1]],
        '7': [[x, 0, 2, 0, 2, 0], [0, 1, 3, 1, 4, 1]],
        maj7: [[x, 0, 2, 1, 2, 0], [0, 1, 3, 2, 4, 1]],
        m7: [[x, 0, 2, 0, 1, 0], [0, 1, 3, 1, 2, 1]],
        sus2: [[x, 0, 2, 2, 0, 0], [0, 1, 3, 4, 1, 1]],
        sus4: [[x, 0, 2, 2, 3, 0], [0, 1, 2, 3, 4, 1]],
        dim: [[x, 0, 1, 2, 1, x], [0, 1, 2, 4, 3, 0]],
        aug: [[x, 0, -1, -2, -2, x], [0, 4, 3, 1, 2, 0]],
        '6': [[x, 0, 2, 2, 2, 2], [0, 1, 3, 3, 3, 3]],
        '9': [[x, 0, -1, 0, 0, 0], [0, 2, 1, 3, 3, 3]],
        add9: [[x, 0, 2, 4, 2, 0], [0, 1, 2, 4, 3, 1]]
    };

    function movable(shape, r) {
        let frets = shape[0].map(o => o === null ? null : r + o);
        if (frets.some(f => f !== null && f < 0)) return null;
        let fingers = shape[1].map((f, i) => frets[i] === 0 ? 0 : f);
        return { frets, fingers };
    }

    function voicing(rootPc, type) {
        let key = ROOTS[rootPc] + type;
        if (OPEN[key]) return { frets: OPEN[key][0], fingers: OPEN[key][1] };
        let options = [];
        // Bund des Grundtons auf der E- bzw. A-Saite; passt die Form dort nicht, eine Oktave höher
        let place = (shape, r) => movable(shape, r) || movable(shape, r + 12);
        if (E_SHAPE[type]) options.push(place(E_SHAPE[type], (rootPc - 4 + 12) % 12));
        if (A_SHAPE[type]) options.push(place(A_SHAPE[type], (rootPc - 9 + 12) % 12));
        options = options.filter(Boolean);
        options.sort((a, b) => Math.max(...a.frets.filter(f => f !== null)) - Math.max(...b.frets.filter(f => f !== null)));
        return options[0];
    }

    // Griff → Elemente fürs Griffbrett (Punkte, Barré-Ovale, ○ leer, × gedämpft), optional mit Capo verschoben
    function notesOf(v, rootPc, capo = 0) {
        let out = [];
        let used = new Set();
        // Barré: derselbe Finger auf demselben Bund über mehrere Saiten
        for (let f = 1; f <= 4; f++) {
            let strings = v.fingers.map((g, s) => g === f ? s : -1).filter(s => s >= 0);
            let byFret = {};
            strings.forEach(s => (byFret[v.frets[s]] = byFret[v.frets[s]] || []).push(s));
            Object.keys(byFret).forEach(fret => {
                let ss = byFret[fret];
                if (ss.length < 2 || +fret === 0) return;
                let lo = Math.min(...ss), hi = Math.max(...ss);
                ss.forEach(s => used.add(s));
                out.push({ barre: true, x: fretX(+fret + capo), y1: stringY(hi), y2: stringY(lo), text: String(f) });
            });
        }
        v.frets.forEach((fret, s) => {
            let pc = fret === null ? -1 : (OPEN_PC[s] + fret) % 12;
            if (fret === null) out.push({ muted: true, y: stringY(s) });
            else if (fret === 0) out.push({ open: true, y: stringY(s), root: pc === rootPc });
            else if (!used.has(s)) out.push({ x: fretX(fret + capo), y: stringY(s), text: String(v.fingers[s] || ''), root: pc === rootPc });
        });
        return out;
    }

    function describe(v, rootPc, type) {
        let names = INTERVALS[type].map(i => ROOTS[(rootPc + i) % 12]).join(' · ');
        let fretted = v.frets.filter(f => f);
        let low = fretted.length ? Math.min(...fretted) : 0;
        let hasBarre = notesOf(v, rootPc).some(n => n.barre);
        let where = v.frets.includes(0) ? 'Offene Position' : hasBarre ? 'Barré im ' + low + '. Bund' : 'Ab ' + low + '. Bund';
        return names + '<br>' + where + ' · ' + new Set(v.fingers.filter(Boolean)).size + ' Finger';
    }

    // Akkord suchen (z. B. "am", "C#m", "Bb7", "Hm" → "Am", "C♯m", "B♭7", "Bm")
    const ENHARMONIC = { 'D♯': 'E♭', 'G♯': 'A♭', 'A♯': 'B♭', 'D♭': 'C♯', 'G♭': 'F♯' };
    function find(input) {
        let m = /^\s*([a-hA-H])\s*([#♯b♭]?)\s*(.*?)\s*$/.exec(input || '');
        if (!m) return null;
        let root = m[1].toUpperCase().replace('H', 'B') + (m[2] === '#' || m[2] === '♯' ? '♯' : m[2] ? '♭' : '');
        root = ENHARMONIC[root] || root;
        let rest = m[3];
        let type = TYPES.find(t => t === rest) ?? TYPES.find(t => t.toLowerCase() === rest.toLowerCase());
        if (/^(maj|major|dur)$/i.test(rest)) type = '';
        if (/^(min|minor|moll)$/i.test(rest)) type = 'm';
        let rootPc = ROOTS.indexOf(root);
        if (type === undefined || rootPc < 0) return null;
        let v = voicing(rootPc, type);
        return {
            key: root + type,
            name: root + ' ' + TYPE_NAMES[type],
            info: describe(v, rootPc, type),
            rootPc,
            notes: notesOf(v, rootPc),
            shape: capo => notesOf(v, rootPc, capo)
        };
    }

    return { ROOTS, TYPES, OPEN_PC, find };
})();
window.chordLibrary = chordEngine;

// Ein Element fürs Griffbrett bauen: Fingerpunkt, Barré-Oval, leere (○) oder gedämpfte (×) Saite
function createNoteEl(d) {
    let n = document.createElement(d.custom ? 'button' : 'span');
    n.className = 'note' + (d.custom ? ' custom' : '') + (d.root ? ' root' : '') + (d.barre ? ' barre' : '') +
        (d.open ? ' open-string' : '') + (d.muted ? ' muted-string' : '');
    n.textContent = d.open ? '' : d.muted ? '×' : (d.text ?? '');
    n.style.left = (d.open || d.muted ? -2.6 : d.x) + '%';
    if (d.barre) {
        n.style.top = (d.y1 + d.y2) / 2 + 'px';
        n.style.height = (d.y2 - d.y1 + 26) + 'px';
    } else n.style.top = d.y + 'px';
    n.dataset.note = JSON.stringify(d);
    return n;
}

// Daten eines Elements zurücklesen (für Speichern)
function noteData(n) {
    if (n.dataset.note) {
        try {
            return JSON.parse(n.dataset.note);
        } catch (e) {}
    }
    return {
        x: parseFloat(n.style.left),
        y: parseFloat(n.style.top),
        text: n.textContent,
        root: n.classList.contains('root'),
        custom: n.classList.contains('custom')
    };
}

// Guitar Tuner Functionality (Audio Pitch Detection)
function noteFromFreq(f) {
    let n = Math.round(12 * Math.log2(f / 440) + 69);
    let noteNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
    return {
        name: noteNames[n % 12] + (Math.floor(n / 12) - 1),
        cents: 1200 * Math.log2(f / (440 * Math.pow(2, (n - 69) / 12)))
    };
}

function autoCorrelate(buf, sr) {
    let rms = Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length);
    if (rms < .015) return -1;
    let best = -1, bi = 0;
    for (let lag = 20; lag < Math.min(1000, buf.length / 2); lag++) {
        let c = 0;
        for (let i = 0; i < buf.length - lag; i++) c += buf[i] * buf[i + lag];
        if (c > best) {
            best = c;
            bi = lag;
        }
    }
    return sr / bi;
}

document.getElementById('startTuner').onclick = async () => {
    try {
        let stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        let ctx = new AudioContext();
        let an = ctx.createAnalyser();
        ctx.createMediaStreamSource(stream).connect(an);
        an.fftSize = 2048;
        let data = new Float32Array(an.fftSize);

        document.querySelector('.dot').classList.add('live');
        document.getElementById('status').textContent = 'MIC LIVE';
        document.getElementById('startTuner').textContent = 'MIKROFON AKTIV';

        function tick() {
            an.getFloatTimeDomainData(data);
            let f = autoCorrelate(data, ctx.sampleRate);
            if (f > 65 && f < 400) {
                let n = noteFromFreq(f);
                document.getElementById('detected').textContent = n.name;
                document.getElementById('frequency').textContent = f.toFixed(1) + ' Hz';
                let p = Math.max(0, Math.min(100, 50 + n.cents / 1.2));
                document.getElementById('needle').style.left = p + '%';
                document.getElementById('tuneState').textContent = Math.abs(n.cents) < 8
                    ? 'IN TUNE'
                    : ' ' + (n.cents > 0 ? 'TOO HIGH' : 'TOO LOW') + ' · ' + Math.abs(n.cents).toFixed(0) + ' CENTS';
            }
            requestAnimationFrame(tick);
        }
        tick();
    } catch (err) {
        document.getElementById('frequency').textContent = 'Mikrofonzugriff wurde nicht erlaubt.';
    }
};

// Interactive Fretboard Custom Note Editor
(() => {
    const board = document.getElementById('board');
    const stage = document.getElementById('fretStage');
    let edit = false, finger = 1, barreMode = false;

    const bar = document.createElement('div');
    bar.className = 'editbar';
    bar.innerHTML = '<button id="editToggle">✦ GRIFF BEARBEITEN</button><span id="fingerPicker" hidden><button class="finger-choice active" data-finger="1">1</button><button class="finger-choice" data-finger="2">2</button><button class="finger-choice" data-finger="3">3</button><button class="finger-choice" data-finger="4">4</button><button id="barreTool" class="barre-tool" title="Barré: auf einen Bund drücken und über die Saiten ziehen">▬ BARRÉ</button></span><button id="deleteLast" title="Letzten Punkt löschen">↶</button><button id="clearNotes" title="Alle Punkte löschen">⌫</button>';
    stage.parentElement.appendChild(bar);

    const hint = document.createElement('div');
    hint.className = 'edit-hint';
    hint.hidden = true;
    stage.appendChild(hint);
    const updateHint = () => hint.textContent = barreMode
        ? 'BARRÉ: ÜBER DIE SAITEN ZIEHEN · KLICK AUFS OVAL LÖSCHT'
        : 'KLICK AUF BUND = FINGER · KLICK AUF PUNKT = LÖSCHEN';
    updateHint();

    document.getElementById('editToggle').onclick = () => {
        edit = !edit;
        board.classList.toggle('editing', edit);
        hint.hidden = !edit;
        document.getElementById('fingerPicker').hidden = !edit;
        document.getElementById('editToggle').classList.toggle('edit-on', edit);
    };

    bar.querySelectorAll('[data-finger]').forEach(b => b.onclick = () => {
        finger = +b.dataset.finger;
        bar.querySelectorAll('[data-finger]').forEach(x => x.classList.toggle('active', x === b));
    });

    document.getElementById('barreTool').onclick = () => {
        barreMode = !barreMode;
        document.getElementById('barreTool').classList.toggle('active', barreMode);
        board.classList.toggle('barre-mode', barreMode);
        updateHint();
    };

    // Wohin wird bearbeitet? Ist ein Akkord-Block aktiv, dann sein Griff – sonst die eigenen Punkte des Songs.
    const liveLayer = () => board.classList.contains('live-mode') ? board.querySelector('.live-layer') : null;
    const target = () => liveLayer() || board;
    const changed = (container = target()) => {
        refreshStrings(container);
        if (container === liveLayer()) timeline.commitLive();
    };

    // ○ und × links vom Sattel: × wird gespeichert (Klick schaltet um), ○ ergibt sich automatisch
    // für jede Saite ohne Finger, Barré oder ×. Wird eine gedämpfte Saite gegriffen, fällt das × weg.
    function refreshStrings(container) {
        container.querySelectorAll(':scope > .note.open-string').forEach(n => n.remove());
        let fretted = new Set(), muted = new Set();
        container.querySelectorAll(':scope > .note').forEach(n => {
            let d = noteData(n);
            if (d.muted) muted.add(stringOf(d.y));
            else if (d.barre) for (let s = stringOf(d.y2); s <= stringOf(d.y1); s++) fretted.add(s);
            else fretted.add(stringOf(d.y));
        });
        container.querySelectorAll(':scope > .note.muted-string').forEach(n => {
            let s = stringOf(noteData(n).y);
            if (fretted.has(s)) {
                n.remove();
                muted.delete(s);
            }
        });
        if (!fretted.size && !muted.size) return;
        let rootPc = container.dataset.rootPc === undefined ? -1 : +container.dataset.rootPc;
        for (let s = 0; s < 6; s++) {
            if (!fretted.has(s) && !muted.has(s)) addBoardNote({ open: true, y: stringY(s), root: chordEngine.OPEN_PC[s] === rootPc }, container);
        }
    }
    window.refreshStrings = refreshStrings;

    // Bildschirm-Koordinaten → Bund und Saite (berücksichtigt Zoom, Rahmen und Spiegelung)
    function boardPoint(e) {
        let r = board.getBoundingClientRect();
        let z = +board.dataset.zoom || 1;
        let border = board.clientLeft;
        let x = ((e.clientX - r.left) / z - border) / board.clientWidth * 100;
        if (board.classList.contains('mirrored')) x = 100 - x;
        let ly = (e.clientY - r.top) / z - border;
        let fret = Math.max(1, Math.min(FRETS, Math.ceil(x / FRET_W)));
        let s = 5 - Math.max(0, Math.min(5, Math.round((ly - 16) / 24)));
        return { fret, s };
    }

    board.addEventListener('click', e => {
        if (!edit || barreMode || e.target.closest('.note')) return;
        let p = boardPoint(e);
        addBoardNote({ x: fretX(p.fret), y: stringY(p.s), text: String(finger), custom: true }, target());
        changed();
    });

    // Barré ziehen: Startsaite beim Drücken, Endsaite beim Loslassen
    let barreStart = null;
    board.addEventListener('pointerdown', e => {
        if (!edit || !barreMode || e.target.closest('.note')) return;
        barreStart = boardPoint(e);
        try {
            board.setPointerCapture(e.pointerId);
        } catch (err) {}
    });
    board.addEventListener('pointerup', e => {
        if (!barreStart) return;
        let a = barreStart, b = boardPoint(e);
        barreStart = null;
        let lo = Math.min(a.s, b.s), hi = Math.max(a.s, b.s);
        if (lo === hi) {
            addBoardNote({ x: fretX(a.fret), y: stringY(a.s), text: String(finger), custom: true }, target());
        } else {
            addBoardNote({ barre: true, x: fretX(a.fret), y1: stringY(hi), y2: stringY(lo), text: String(finger), custom: true }, target());
        }
        changed();
    });

    // Erstellt ein Element auf dem Library-Griffbrett (eigene Punkte oder Griff eines Akkord-Blocks).
    // Im Bearbeiten-Modus löscht ein Klick Punkt oder Barré.
    function addBoardNote(d, container = board) {
        let n = createNoteEl(d);
        n.title = d.open ? 'Im Bearbeiten-Modus klicken: Saite dämpfen (×)'
            : d.muted ? 'Im Bearbeiten-Modus klicken: Saite wieder leer (○)'
                : 'Im Bearbeiten-Modus klicken zum Löschen';
        n.onclick = ev => {
            if (!edit) return;
            ev.stopPropagation();
            if (d.open) addBoardNote({ muted: true, y: d.y }, container);
            n.remove();
            changed(container);
        };
        n.onpointerdown = ev => edit && ev.stopPropagation();
        container.appendChild(n);
        return n;
    }
    window.addBoardNote = addBoardNote;

    refreshStrings(board);

    // ↶ löscht den zuletzt gesetzten Punkt, ⌫ alle (beim Akkord-Block: dessen ganzen Griff)
    const editable = () => liveLayer()
        ? [...liveLayer().querySelectorAll('.note:not(.open-string):not(.muted-string)')]
        : [...board.querySelectorAll(':scope > .custom')];
    document.getElementById('deleteLast').onclick = () => {
        let n = editable();
        if (!n.length) return;
        n[n.length - 1].remove();
        changed();
    };
    document.getElementById('clearNotes').onclick = () => {
        editable().forEach(n => n.remove());
        changed();
    };

    // ---------- Chord Finder ----------
    const chordList = document.getElementById('chords');
    const finderBoard = document.getElementById('finderBoard');
    chordList.innerHTML = '';

    chordEngine.ROOTS.forEach(root => chordEngine.TYPES.forEach(type => {
        let n = root + type;
        let b = document.createElement('button');
        b.textContent = n;
        b.onclick = () => select(n, b);
        chordList.appendChild(b);
    }));

    function select(n, b) {
        chordList.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
        let ch = chordEngine.find(n);
        document.getElementById('chordName').textContent = ch.name;
        document.getElementById('chordInfo').innerHTML = ch.info;
        finderBoard.querySelectorAll('.note').forEach(x => x.remove());
        ch.notes.forEach(d => finderBoard.appendChild(createNoteEl(d)));
    }
    select('C', chordList.querySelector('button'));

    document.getElementById('search').oninput = e => {
        let q = e.target.value.toLowerCase();
        chordList.querySelectorAll('button').forEach(b => b.hidden = !b.textContent.toLowerCase().includes(q));
    };
})();

// Bundnummern und Upload-Knopf „+ SPUR“
(() => {
    const board = document.getElementById('board');
    board.querySelectorAll('.note:not(.custom)').forEach(n => n.addEventListener('click', e => {
        if (board.classList.contains('editing')) {
            e.stopPropagation();
            n.remove();
        }
    }));

    for (let i = 1; i <= FRETS; i++) {
        let l = document.createElement('span');
        l.className = 'fret-no';
        l.textContent = i;
        l.style.left = fretX(i) + '%';
        board.appendChild(l);
    }

    const upload = document.getElementById('audioUpload');
    const tools = document.createElement('div');
    tools.className = 'track-tools';
    tools.innerHTML = '<button id="addTrack">+ SPUR</button>';
    upload.parentElement.insertAdjacentElement('afterend', tools);

    // Offline-Variante: Song nur im Browser (wird im Server-Modus unten ersetzt)
    document.getElementById('addTrack').onclick = () => {
        let pick = document.createElement('input');
        pick.type = 'file';
        pick.accept = 'audio/*';
        pick.onchange = e => {
            let f = e.target.files[0];
            if (!f) return;
            let u = URL.createObjectURL(f);
            let item = document.createElement('div');
            item.className = 'track';
            item.innerHTML = '<span class="disc">▶</span><span></span>';
            item.lastChild.textContent = f.name;
            item.onclick = () => {
                loadSong(u);
                document.getElementById('trackTitle').textContent = f.name.replace(/\.[^.]+$/, '');
                document.getElementById('editorName').textContent = f.name;
            };
            document.getElementById('trackList').appendChild(item);
        };
        pick.click();
    };
})();

// Interactive Timeline: Original-Audio, Akkordstreifen und Anschlag-Spur, Capo, Zoom-Controls
const timeline = (() => {
    const wavebox = document.querySelector('.wavebox');
    const board = document.getElementById('board');
    const stage = document.getElementById('fretStage');
    const MIN_LEFT = 14, MAX_RIGHT = 96, MIN_WIDTH = 3, CHORD_WIDTH = 5, EPS = 1e-6;
    const STRIP_TITLE = 'AKKORDSTREIFEN';
    const ARROW = { D: '↓', U: '↑' };

    const actions = document.createElement('div');
    actions.className = 'clip-actions';
    actions.innerHTML = '<button id="addChordClip">+ AKKORD HINZUFÜGEN</button>';
    document.querySelector('.controls').appendChild(actions);

    // Leiste für die Auswahl
    const ctx = document.createElement('div');
    ctx.className = 'tl-context';
    wavebox.appendChild(ctx);

    const tl = document.createElement('div');
    tl.className = 'timeline';
    tl.innerHTML = '<div class="ruler" title="Klicken oder ziehen, um an diese Stelle zu springen">0:00 0:05 0:10 0:15 0:20 0:25 0:30 0:35</div>';
    wavebox.appendChild(tl);

    const playhead = document.createElement('div');
    playhead.className = 'playhead';
    playhead.title = 'Ziehen, um im Song zu springen';
    tl.appendChild(playhead);

    // Anschlag-Spur: zeigt das Muster jedes Akkords (nur Anzeige, gespeichert wird am Akkord-Block)
    const strumRow = document.createElement('div');
    strumRow.className = 'timeline-row strum-row';
    strumRow.innerHTML = '<span class="row-title">ANSCHLAG</span>';
    tl.insertBefore(strumRow, playhead);

    // Griffbrett: Ebene für den Griff des aktuellen Akkords, Akkord-Anzeige, Capo-Balken
    const live = document.createElement('div');
    live.className = 'live-layer';
    board.appendChild(live);
    const badge = document.createElement('div');
    badge.className = 'chord-badge';
    badge.hidden = true;
    stage.appendChild(badge);
    badge.title = 'Klicken, um den Akkord umzubenennen';
    badge.onclick = () => shownClip && editClip(shownClip);
    const capoBar = document.createElement('div');
    capoBar.className = 'capo-bar';
    capoBar.title = 'Capo';
    board.appendChild(capoBar);

    // Links: aktueller Anschlag (immer sichtbar), rechts: Knöpfe für das Anschlagmuster
    const strumNow = document.createElement('div');
    strumNow.className = 'strum-now idle';
    strumNow.innerHTML = '<span class="strum-arrow">·</span><small>ANSCHLAG</small>';
    stage.appendChild(strumNow);
    const strumPad = document.createElement('div');
    strumPad.className = 'strum-pad';
    strumPad.innerHTML = '<small>ANSCHLAG</small><button data-strum="D" title="Abschlag hinzufügen">↓</button><button data-strum="U" title="Aufschlag hinzufügen">↑</button><button data-strum="back" title="Letzten Anschlag löschen">⌫</button><button data-strum="clear" title="Muster löschen">✕</button><span class="strum-pattern"></span>';
    stage.appendChild(strumPad);

    let selRow = null, sel = [], lastClicked = null, clipboard = [], playingClip = null, scrubbing = false;
    let capo = 0, groupLayer = null, lastStrum = null;
    const markers = new WeakMap(); // Akkord-Block → seine Pfeile in der Anschlag-Spur

    // ---------- Hilfen ----------
    const pos = c => ({ left: parseFloat(c.style.left), width: parseFloat(c.style.width) });
    const isAnchored = c => c.dataset.anchor === '1';
    const rows = () => [...tl.querySelectorAll('.timeline-row:not(.strum-row)')];
    const original = () => tl.querySelector('.timeline-row .audio-clip');
    const strip = () => rows().find(r => !r.querySelector('.audio-clip'));
    const isOriginalRow = row => !!row && row !== strip();
    const chordClips = () => strip() ? [...strip().querySelectorAll('.clip')].sort((a, b) => pos(a).left - pos(b).left) : [];
    const labelOf = c => c.querySelector('.clip-label').textContent;
    const chordOf = c => chordEngine.find(labelOf(c));
    const isChord = c => !c.classList.contains('audio-clip');
    const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));

    // ---------- Gruppen & Einheiten ----------
    // Eine Einheit ist ein einzelner Block oder eine ganze Gruppe; Einheiten überlappen nie.
    function groupMembers(c) {
        let g = c.dataset.group;
        return g ? [...c.parentElement.querySelectorAll('.clip')].filter(x => x.dataset.group === g) : [c];
    }

    function makeUnit(els) {
        let ps = els.map(pos);
        let left = Math.min(...ps.map(p => p.left));
        let right = Math.max(...ps.map(p => p.left + p.width));
        return { els, left, width: right - left, anchored: els.some(isAnchored), offsets: ps.map(p => p.left - left) };
    }

    function unitsIn(row, exclude = []) {
        let map = new Map();
        [...row.querySelectorAll('.clip')].forEach(c => {
            if (exclude.includes(c)) return;
            let k = c.dataset.group || c;
            if (!map.has(k)) map.set(k, []);
            map.get(k).push(c);
        });
        return [...map.values()].map(makeUnit).sort((a, b) => a.left - b.left);
    }

    function moveUnit(u, L) {
        u.els.forEach((e, i) => e.style.left = (L + u.offsets[i]) + '%');
    }

    // ---------- Blöcke: Einheiten überlappen nie, verankerte bewegen sich nie ----------
    function layout(start, mode, d) {
        let o = start.self, others = start.others;
        others.forEach(u => moveUnit(u, u.left));

        let right = others.filter(u => u.left >= o.left);
        let left = others.filter(u => u.left < o.left).reverse();

        let maxRight = MAX_RIGHT, pushRight = [];
        for (let u of right) {
            if (u.anchored) { maxRight = u.left; break; }
            pushRight.push(u);
        }
        maxRight -= pushRight.reduce((s, u) => s + u.width, 0);

        let minLeft = MIN_LEFT, pushLeft = [];
        for (let u of left) {
            if (u.anchored) { minLeft = u.left + u.width; break; }
            pushLeft.push(u);
        }
        minLeft += pushLeft.reduce((s, u) => s + u.width, 0);

        let L = o.left, W = o.width;
        if (mode === 'm') {
            L = Math.max(minLeft, Math.min(maxRight - W, o.left + d));
            moveUnit(o, L);
        } else {
            let c = o.els[0];
            if (mode === 'r') {
                W = Math.max(MIN_WIDTH, Math.min(maxRight - L, o.width + d));
            } else {
                let R = o.left + o.width;
                L = Math.max(minLeft, Math.min(R - MIN_WIDTH, o.left + d));
                W = R - L;
            }
            c.style.left = L + '%';
            c.style.width = W + '%';
        }

        let cursor = L + W;
        for (let u of pushRight) {
            if (u.left >= cursor) break;
            moveUnit(u, cursor);
            cursor += u.width;
        }
        cursor = L;
        for (let u of pushLeft) {
            if (u.left + u.width <= cursor) break;
            moveUnit(u, cursor - u.width);
            cursor -= u.width;
        }
    }

    function bind(c) {
        let m, sx, start, moved;
        c.onpointerdown = e => {
            e.stopPropagation();
            moved = false;
            sx = e.clientX;
            m = null;
            let unit = makeUnit(groupMembers(c));
            if (e.ctrlKey || e.metaKey || e.shiftKey || unit.anchored) return; // Mehrfachauswahl oder verankert: nicht bewegen
            m = unit.els.length > 1 ? 'm' : e.target.classList.contains('left') ? 'l' : e.target.classList.contains('right') ? 'r' : 'm';
            start = { self: unit, others: unitsIn(c.parentElement, unit.els) };
            try {
                c.setPointerCapture(e.pointerId);
            } catch (err) {}
        };

        c.onpointermove = e => {
            if (!m) return;
            if (Math.abs(e.clientX - sx) > 3) moved = true;
            if (!moved) return;
            layout(start, m, (e.clientX - sx) / tl.clientWidth * 100);
            updatePlayhead();
        };

        c.onpointerup = e => {
            m = null;
            if (!moved) clickClip(c, e);
        };

        c.ondblclick = () => editClip(c);
    }

    // Wenn der Original-Track getrimmt wird, werden die Akkord-Clips mitgekürzt (Anker bleiben stehen)
    function bindTrimSync(orig) {
        let trimBefore;

        orig.addEventListener('pointerdown', () => {
            trimBefore = pos(orig);
        });

        orig.addEventListener('pointerup', () => {
            if (!trimBefore) return;
            let n = pos(orig);

            chordClips().forEach(c => {
                if (isAnchored(c)) return;
                let p = pos(c);
                let a = (p.left - trimBefore.left) / trimBefore.width;
                let b = (p.left + p.width - trimBefore.left) / trimBefore.width;
                let cl = Math.max(n.left, n.left + Math.max(0, a) * n.width);
                let cr = Math.min(n.left + n.width, n.left + Math.min(1, b) * n.width);

                if (cr <= cl) c.remove();
                else {
                    c.style.left = cl + '%';
                    c.style.width = Math.max(MIN_WIDTH, cr - cl) + '%';
                }
            });
            trimBefore = null;
            updatePlayhead();
        });
    }

    // ---------- Aufbau ----------
    function handle(side) {
        let h = document.createElement('i');
        h.className = 'handle ' + side;
        return h;
    }

    // Jeder Block kann einen eigenen Griff haben (data-notes), sonst gilt der Griff aus der Library
    function customNotes(c) {
        try {
            return c.dataset.notes ? JSON.parse(c.dataset.notes) : null;
        } catch (e) {
            return null;
        }
    }

    function shapeOf(c) {
        let own = customNotes(c);
        if (own) return own;
        let ch = chordOf(c);
        return ch ? ch.shape(capo) : null;
    }

    function markChord(c) {
        if (!isChord(c)) return;
        let ch = chordOf(c), own = !!customNotes(c);
        c.classList.toggle('unknown', !ch && !own);
        c.classList.toggle('own-shape', own);
        c.title = own ? 'Eigener Griff für diesen Block' : ch ? ch.name + ' – Griff aus der Library' : 'Nicht in der Library – kein Griff';
    }

    function makeClip(d) {
        let c = document.createElement('span');
        c.className = 'clip' + (d.audio ? ' audio-clip' : '');
        c.style.left = d.left + '%';
        c.style.width = d.width + '%';
        if (d.anchored) c.dataset.anchor = '1';
        if (d.notes) c.dataset.notes = JSON.stringify(d.notes);
        if (d.strum) c.dataset.strum = d.strum;
        if (d.group) c.dataset.group = d.group;
        let label = document.createElement('span');
        label.className = 'clip-label';
        label.textContent = d.label;
        c.append(handle('left'), label, handle('right'));
        markChord(c);
        bind(c);
        return c;
    }

    function makeRow(title, clips) {
        let row = document.createElement('div');
        row.className = 'timeline-row';
        let t = document.createElement('span');
        t.className = 'row-title';
        t.textContent = title;
        row.append(t);
        clips.forEach(c => row.append(makeClip(c)));
        row.onclick = e => {
            if (e.target.closest('.clip')) return;
            select(row === selRow && !sel.length ? null : row, []);
        };
        tl.insertBefore(row, strumRow);
        return row;
    }

    // Überlappungen auflösen und alles in den sichtbaren Bereich bringen
    function untangle(row) {
        let cs = [...row.querySelectorAll('.clip')].sort((a, b) => pos(a).left - pos(b).left);
        let cursor = MIN_LEFT;
        cs.forEach(c => {
            let p = pos(c);
            if (p.left < cursor) c.style.left = cursor + '%';
            cursor = pos(c).left + p.width;
        });
        if (cursor > MAX_RIGHT) {
            let f = (MAX_RIGHT - MIN_LEFT) / (cursor - MIN_LEFT);
            cs.forEach(c => {
                let p = pos(c);
                c.style.left = (MIN_LEFT + (p.left - MIN_LEFT) * f) + '%';
                c.style.width = Math.max(MIN_WIDTH, p.width * f) + '%';
            });
        }
    }

    // Gruppen-Rahmen und Anschlag-Pfeile neu zeichnen, sobald sich im Akkordstreifen etwas ändert
    const stripObserver = new MutationObserver(records => {
        if (records.some(r => !(groupLayer && groupLayer.contains(r.target)))) decorate();
    });

    function decorate() {
        let row = strip();
        if (!row) return;
        // Gruppen mit nur noch einem Block auflösen
        let count = {};
        chordClips().forEach(c => c.dataset.group && (count[c.dataset.group] = (count[c.dataset.group] || 0) + 1));
        chordClips().forEach(c => c.dataset.group && count[c.dataset.group] < 2 && delete c.dataset.group);

        groupLayer.innerHTML = '';
        unitsIn(row).filter(u => u.els.length > 1).forEach(u => {
            let f = document.createElement('div');
            f.className = 'group-frame' + (u.els.every(c => sel.includes(c)) ? ' selected' : '');
            f.style.left = u.left + '%';
            f.style.width = u.width + '%';
            groupLayer.append(f);
        });

        strumRow.querySelectorAll('.strum-mark').forEach(m => m.remove());
        chordClips().forEach(c => {
            let pattern = c.dataset.strum || '';
            let p = pos(c);
            let list = [...pattern].map((dir, i) => {
                let m = document.createElement('span');
                m.className = 'strum-mark ' + (dir === 'U' ? 'up' : 'down');
                m.textContent = ARROW[dir];
                m.style.left = (p.left + (i + 0.5) * p.width / pattern.length) + '%';
                m.title = labelOf(c) + ' · Anschlag ' + (i + 1);
                m.onclick = () => select(c.parentElement, groupMembers(c).length > 1 ? groupMembers(c) : [c]);
                strumRow.append(m);
                return m;
            });
            markers.set(c, list);
        });
        lastStrum = undefined;
        updateStrumPad();
    }

    function render(data) {
        select(null, []);
        stripObserver.disconnect();
        rows().forEach(r => r.remove());
        // Ältere Speicherstände: mehrere Akkord-Spuren werden zu einem Akkordstreifen zusammengeführt
        let origRow = data.find(r => r.clips.some(c => c.audio));
        let origClip = origRow ? origRow.clips.find(c => c.audio) : { label: 'Original Track', left: 17, width: 58, audio: true };
        let chords = [];
        data.filter(r => !r.clips.some(c => c.audio)).forEach(r => chords.push(...r.clips));
        makeRow('ORIGINAL AUDIO', [origClip]);
        let row = makeRow(STRIP_TITLE, chords.flatMap(splitClip));
        untangle(row);
        groupLayer = document.createElement('div');
        groupLayer.className = 'group-layer';
        row.prepend(groupLayer);
        bindTrimSync(original());
        decorate();
        stripObserver.observe(row, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'data-strum', 'data-group'] });
        playingClip = undefined;
        updatePlayhead();
    }

    function serialize() {
        return rows().map(row => ({
            title: row.querySelector('.row-title').textContent,
            clips: [...row.querySelectorAll('.clip')].map(c => ({
                label: labelOf(c),
                left: parseFloat(c.style.left),
                width: parseFloat(c.style.width),
                audio: !isChord(c),
                anchored: isAnchored(c),
                notes: customNotes(c) || undefined,
                strum: c.dataset.strum || undefined,
                group: c.dataset.group || undefined
            }))
        }));
    }

    // ---------- Auswahl (Klick, Strg+Klick, Shift+Klick; Gruppen wie in PowerPoint) ----------
    function select(row, clips) {
        selRow = row;
        sel = clips.filter(c => c.isConnected);
        rows().forEach(r => r.classList.toggle('selected', r === row));
        tl.querySelectorAll('.clip').forEach(c => c.classList.toggle('selected', sel.includes(c)));
        if (groupLayer) {
            let frames = [...groupLayer.children];
            unitsIn(strip()).filter(u => u.els.length > 1).forEach((u, i) => frames[i] && frames[i].classList.toggle('selected', u.els.every(c => sel.includes(c))));
        }
        renderContext();
        updateStrumPad();
        playingClip = undefined;
        updatePlayhead();
    }

    function clickClip(c, e) {
        let row = c.parentElement;
        if (!isChord(c)) {
            lastClicked = null;
            return select(row, [c]);
        }
        let members = groupMembers(c);
        let same = sel.filter(x => x.parentElement === row && isChord(x));
        if (e && (e.ctrlKey || e.metaKey)) {
            same = members.every(m => same.includes(m)) ? same.filter(x => !members.includes(x)) : [...new Set(same.concat(members))];
        } else if (e && e.shiftKey && lastClicked && lastClicked.parentElement === row) {
            let all = chordClips();
            let a = all.indexOf(lastClicked), b = all.indexOf(c);
            let range = all.slice(Math.min(a, b), Math.max(a, b) + 1);
            same = [...new Set(range.flatMap(groupMembers))];
        } else if (members.length > 1 && sameSet(sel, members)) {
            same = [c]; // zweiter Klick in eine ausgewählte Gruppe: nur dieser Akkord
        } else {
            same = members;
        }
        lastClicked = c;
        select(row, same);
    }

    function button(text, title, fn, cls) {
        let b = document.createElement('button');
        b.textContent = text;
        b.title = title;
        if (cls) b.className = cls;
        b.onclick = fn;
        return b;
    }

    function renderContext() {
        ctx.innerHTML = '';
        let info = document.createElement('span');
        info.className = 'tl-context-info';
        ctx.append(info);

        if (!selRow) {
            info.textContent = 'KLICK = AUSWÄHLEN · STRG/SHIFT + KLICK = MEHRERE · STRG+G = GRUPPIEREN · STRG+C / STRG+V = KOPIEREN / EINFÜGEN';
            return;
        }

        let chords = sel.filter(isChord);
        let paste = button('📋 EINFÜGEN', 'Kopierte Akkorde einfügen (Strg+V)', pasteClips);
        paste.disabled = !clipboard.length;
        let grouped = chords.some(c => c.dataset.group);
        let ungroupBtn = () => button('⊟ GRUPPIERUNG AUFHEBEN', 'Gruppe wieder in einzelne Blöcke trennen (Strg+Shift+G)', () => ungroup(chords));

        if (isOriginalRow(selRow)) {
            info.textContent = 'ORIGINAL AUDIO · ZIEHEN ZUM TRIMMEN';
        } else if (chords.length === 1) {
            let c = chords[0], ch = chordOf(c), own = customNotes(c);
            info.textContent = labelOf(c) + (own ? ' · EIGENER GRIFF' : ch ? ' · ' + ch.name : ' · NICHT IN DER LIBRARY') + (c.dataset.group ? ' · IN GRUPPE' : '');
            let anchored = isAnchored(c);
            let editing = board.classList.contains('editing');
            ctx.append(
                button(editing ? '✓ GRIFF FERTIG' : '✋ GRIFF BEARBEITEN', 'Griff nur für diesen Block auf dem Griffbrett bearbeiten', () => {
                    document.getElementById('editToggle').click();
                }, editing ? 'on' : ''),
                button(anchored ? '⚓ ANKER LÖSEN' : '⚓ VERANKERN', anchored ? 'Wieder verschiebbar machen' : 'Festsetzen: bewegt sich nicht mehr', () => toggleAnchor(chords), anchored ? 'on' : ''),
                button('⧉ KOPIEREN', 'Kopieren (Strg+C)', copyClips),
                paste,
                button('🗑 LÖSCHEN', 'Löschen (Entf)', () => deleteClips(chords), 'danger')
            );
            if (own) ctx.append(button('↺ LIBRARY-GRIFF', 'Eigenen Griff verwerfen und wieder den Griff aus der Library nutzen', () => resetShape(c)));
            if (grouped) ctx.append(ungroupBtn());
        } else if (chords.length > 1) {
            let isOneGroup = grouped && sameSet(chords, groupMembers(chords[0]));
            info.textContent = isOneGroup ? 'GRUPPE · ' + chords.length + ' AKKORDE' : chords.length + ' AKKORDE AUSGEWÄHLT';
            let allAnchored = chords.every(isAnchored);
            if (!isOneGroup) ctx.append(button('▣ GRUPPIEREN', 'Zu einer Gruppe zusammenfassen (Strg+G)', () => group(chords)));
            if (grouped) ctx.append(ungroupBtn());
            ctx.append(
                button('⧉ KOPIEREN', 'Kopieren (Strg+C)', copyClips),
                paste,
                button(allAnchored ? '⚓ ANKER LÖSEN' : '⚓ VERANKERN', 'Alle ausgewählten verankern / lösen', () => toggleAnchor(chords), allAnchored ? 'on' : ''),
                button('🗑 LÖSCHEN', 'Alle ausgewählten löschen (Entf)', () => deleteClips(chords), 'danger')
            );
        } else {
            info.textContent = STRIP_TITLE;
            ctx.append(button('+ AKKORD', 'Akkord hinzufügen', addChord), paste);
        }
        ctx.append(button('✕', 'Auswahl aufheben (Esc)', () => select(null, []), 'ghost'));
    }

    // ---------- Bearbeiten ----------
    // "C · Am · F · G" → ["C", "Am", "F", "G"]: jeder Akkord wird ein eigener Block mit eigenem Griff
    function splitChords(text) {
        return text.split(/\s*[·,;|]\s*|\s+/).filter(Boolean);
    }

    // Ein Clip mit Akkordfolge wird auf seiner Breite in einzelne Blöcke aufgeteilt
    function splitClip(d) {
        let parts = splitChords(d.label);
        if (parts.length < 2) return [Object.assign({}, d, { audio: false })];
        let w = d.width / parts.length;
        return parts.map((label, i) => ({ label: normalize(label), left: d.left + i * w, width: w, anchored: d.anchored, group: d.group }));
    }

    // Bekannte Akkorde werden in der Schreibweise der Library gespeichert (z. B. "c#m" → "C♯m")
    function normalize(text) {
        let ch = chordEngine.find(text);
        return ch ? ch.key : text.trim();
    }

    function editClip(c) {
        if (!isChord(c)) return;
        let x = prompt('Akkord (z. B. Am, G7, C#m).\nMehrere Akkorde (z. B. „C Am F G“) werden in einzelne Blöcke aufgeteilt.', labelOf(c));
        if (x === null || !x.trim()) return;
        let p = pos(c);
        let parts = splitClip({ label: x, left: p.left, width: p.width, anchored: isAnchored(c), group: c.dataset.group });
        if (parts.length === 1) {
            let next = normalize(x);
            if (next !== labelOf(c)) delete c.dataset.notes; // anderer Akkord: eigener Griff passt nicht mehr
            c.querySelector('.clip-label').textContent = next;
            markChord(c);
            select(c.parentElement, [c]);
        } else {
            let made = parts.map(makeClip);
            c.replaceWith(...made);
            lastClicked = made[0];
            select(made[0].parentElement, made);
        }
    }

    function toggleAnchor(list) {
        let anchor = !list.every(isAnchored);
        list.forEach(c => {
            if (anchor) c.dataset.anchor = '1';
            else delete c.dataset.anchor;
        });
        renderContext();
    }

    function deleteClips(list) {
        list.forEach(c => c.remove());
        if (list.includes(lastClicked)) lastClicked = null;
        select(strip(), []);
    }

    function group(list) {
        let id = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        let all = [...new Set(list.flatMap(groupMembers))];
        all.forEach(c => c.dataset.group = id);
        select(strip(), all);
    }

    function ungroup(list) {
        let ids = new Set(list.map(c => c.dataset.group).filter(Boolean));
        let freed = chordClips().filter(c => ids.has(c.dataset.group));
        freed.forEach(c => delete c.dataset.group);
        select(strip(), freed);
    }

    // Wo neue Akkorde hin sollen: hinter die Auswahl, sonst an den Abspiel-Strich
    function insertPoint() {
        let chosen = sel.filter(isChord);
        if (chosen.length) return Math.max(...chosen.flatMap(groupMembers).map(c => pos(c).left + pos(c).width));
        let x = playheadX();
        let hit = unitsIn(strip()).find(u => u.left < x && u.left + u.width > x);
        return hit ? hit.left + hit.width : Math.max(MIN_LEFT, Math.min(MAX_RIGHT, x));
    }

    // Platz für einen Bereich der Breite `span` ab `at` schaffen (folgende Einheiten weiterschieben).
    // Gibt false zurück, wenn ein Anker oder das Ende im Weg ist.
    function makeRoom(at, span) {
        let after = unitsIn(strip()).filter(u => u.left >= at - EPS);
        let limit = MAX_RIGHT, pushable = [];
        for (let u of after) {
            if (u.anchored) { limit = u.left; break; }
            pushable.push(u);
        }
        let cursor = at + span;
        for (let u of pushable) cursor = Math.max(cursor, u.left) + u.width;
        if (cursor > limit + EPS) return false;
        cursor = at + span;
        for (let u of pushable) {
            if (u.left < cursor) moveUnit(u, cursor);
            cursor = Math.max(cursor, u.left) + u.width;
        }
        return true;
    }

    // Erste Stelle ab `from`, an der `span` Platz hat (ggf. durch Schieben).
    // Mit `fallback` wird notfalls auch weiter vorne im Streifen gesucht.
    function placeFor(span, from, fallback) {
        for (let at of fallback ? [from, MIN_LEFT] : [from]) {
            let units = unitsIn(strip());
            let candidates = [at].concat(units.map(u => u.left + u.width).filter(x => x >= at));
            for (let x of candidates) {
                if (unitsIn(strip()).some(u => u.left < x - EPS && u.left + u.width > x + EPS)) continue;
                if (makeRoom(x, span)) return x;
            }
        }
        return null;
    }

    function addChord() {
        let row = strip();
        let x = prompt('Akkord hinzufügen (z. B. Am, G7, C#m – oder mehrere: „C Am F G“).\nIst er in der Library, bekommt er dort den Griff – sonst bleibt der Griff leer.', '');
        if (x === null || !x.trim()) return;
        let parts = splitChords(x);
        let at = placeFor(CHORD_WIDTH * parts.length, insertPoint(), true);
        if (at === null) return alert('Im Akkordstreifen ist kein Platz mehr. Lösche, verkleinere oder löse einen Anker.');
        let made = parts.map((label, i) => makeClip({ label: normalize(label), left: at + i * CHORD_WIDTH, width: CHORD_WIDTH }));
        row.append(...made);
        lastClicked = made[made.length - 1];
        select(row, made);
    }

    // ---------- Kopieren & Einfügen (Gruppen bleiben Gruppen) ----------
    function copyClips() {
        let list = [...new Set(sel.filter(isChord))].sort((a, b) => pos(a).left - pos(b).left);
        if (!list.length) return;
        let start = pos(list[0]).left;
        clipboard = list.map(c => ({
            label: labelOf(c), offset: pos(c).left - start, width: pos(c).width,
            notes: customNotes(c), strum: c.dataset.strum, group: c.dataset.group
        }));
        renderContext();
        flash(list.length === 1 ? '1 AKKORD KOPIERT' : list.length + ' AKKORDE KOPIERT');
    }

    function pasteClips() {
        if (!clipboard.length) return;
        let row = strip();
        let last = clipboard.reduce((a, b) => a.offset + a.width > b.offset + b.width ? a : b);
        let span = last.offset + last.width;
        let at = placeFor(span, insertPoint());
        if (at === null) return alert('Hinter der Auswahl ist nicht genug Platz zum Einfügen. Lösche oder verkleinere Akkorde dahinter oder löse einen Anker.');
        let ids = {};
        let added = clipboard.map(d => {
            let group = d.group ? (ids[d.group] = ids[d.group] || 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)) : undefined;
            let c = makeClip({ label: d.label, left: at + d.offset, width: d.width, notes: d.notes, strum: d.strum, group });
            row.append(c);
            return c;
        });
        lastClicked = added[added.length - 1];
        select(row, added);
    }

    function flash(text) {
        let info = ctx.querySelector('.tl-context-info');
        if (info) info.textContent = text;
    }

    // ---------- Anschlagmuster (↓ ↑ pro Akkord) ----------
    function updateStrumPad() {
        let chords = sel.filter(isChord);
        strumPad.classList.toggle('disabled', !chords.length);
        strumPad.querySelectorAll('button').forEach(b => b.disabled = !chords.length);
        let text = !chords.length ? 'Akkord wählen'
            : chords.length === 1 ? ([...(chords[0].dataset.strum || '')].map(d => ARROW[d]).join('') || 'leer')
                : chords.length + ' Akkorde';
        strumPad.querySelector('.strum-pattern').textContent = text;
    }

    strumPad.querySelectorAll('button').forEach(b => b.onclick = () => {
        let chords = sel.filter(isChord);
        if (!chords.length) return;
        chords.forEach(c => {
            let p = c.dataset.strum || '';
            if (b.dataset.strum === 'back') p = p.slice(0, -1);
            else if (b.dataset.strum === 'clear') p = '';
            else if (p.length < 16) p += b.dataset.strum;
            if (p) c.dataset.strum = p;
            else delete c.dataset.strum;
        });
        updateStrumPad();
    });

    // Links am Griffbrett: aktueller Anschlag unter dem Strich (mit kleiner Animation beim Wechsel)
    function updateStrumNow(c, x) {
        let pattern = c && c.dataset.strum;
        let i = -1;
        if (pattern) {
            let p = pos(c);
            i = Math.min(pattern.length - 1, Math.max(0, Math.floor((x - p.left) / p.width * pattern.length)));
        }
        let key = pattern ? c : null;
        if (lastStrum && lastStrum.c === key && lastStrum.i === i) return;
        if (lastStrum && lastStrum.c) (markers.get(lastStrum.c) || []).forEach(m => m.classList.remove('active'));
        lastStrum = { c: key, i };
        let arrow = strumNow.querySelector('.strum-arrow');
        strumNow.classList.remove('down', 'up', 'hit', 'idle');
        if (!pattern) {
            arrow.textContent = '·';
            strumNow.classList.add('idle');
            return;
        }
        let dir = pattern[i];
        arrow.textContent = ARROW[dir];
        void strumNow.offsetWidth; // Animation neu starten
        strumNow.classList.add(dir === 'U' ? 'up' : 'down', 'hit');
        let m = (markers.get(c) || [])[i];
        if (m) m.classList.add('active');
    }

    // ---------- Capo ----------
    const capoValue = document.getElementById('capoValue');
    function setCapo(n) {
        capo = Math.max(0, Math.min(12, n | 0));
        capoValue.textContent = capo;
        capoBar.style.display = capo ? 'block' : 'none';
        capoBar.style.left = (capo * FRET_W - FRET_W * 0.18) + '%';
        playingClip = undefined;
        updatePlayhead();
    }
    document.getElementById('capoDown').onclick = () => setCapo(capo - 1);
    document.getElementById('capoUp').onclick = () => setCapo(capo + 1);

    // ---------- Tastatur ----------
    document.getElementById('addChordClip').onclick = addChord;
    // Knopf „Griff bearbeiten“ in der Auswahl-Leiste aktuell halten
    document.getElementById('editToggle').addEventListener('click', () => setTimeout(renderContext));

    document.addEventListener('keydown', e => {
        if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
        if (!document.getElementById('library').classList.contains('active')) return;
        let mod = e.ctrlKey || e.metaKey;
        let k = e.key.toLowerCase();
        let chords = sel.filter(isChord);
        if (mod && k === 'g' && e.shiftKey) {
            e.preventDefault();
            if (chords.length) ungroup(chords);
        } else if (mod && k === 'g') {
            e.preventDefault();
            if (chords.length > 1) group(chords);
        } else if (mod && k === 'c' && chords.length) {
            e.preventDefault();
            copyClips();
        } else if (mod && k === 'v' && clipboard.length) {
            e.preventDefault();
            pasteClips();
        } else if (mod && k === 'a' && selRow && !isOriginalRow(selRow)) {
            e.preventDefault();
            select(strip(), chordClips());
        } else if (e.key === 'Escape' && selRow) {
            select(null, []);
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && chords.length) {
            e.preventDefault();
            deleteClips(chords);
        } else if (e.key === 'Enter' && sel.length === 1) {
            editClip(sel[0]);
        }
    });

    // ---------- Abspiel-Strich, Leuchten & Griffwechsel ----------
    // Der Original-Track steht für den ganzen Song: der Strich läuft von seinem Anfang bis zu seinem Ende.
    function playheadX() {
        let orig = original();
        if (!orig) return MIN_LEFT;
        let p = pos(orig);
        let progress = audio.duration ? audio.currentTime / audio.duration : 0;
        return p.left + progress * p.width;
    }

    function updatePlayhead() {
        syncWave();
        if (!original()) {
            playhead.hidden = true;
            return;
        }
        playhead.hidden = false;
        let x = playheadX();
        playhead.style.left = x + '%';
        playhead.style.height = tl.scrollHeight + 'px';

        // Welcher Akkord liegt gerade unter dem Strich?
        let hasAudio = audio.src && isFinite(audio.duration);
        let current = hasAudio ? chordClips().find(c => pos(c).left <= x && x < pos(c).left + pos(c).width) || null : null;
        chordClips().forEach(c => c.classList.toggle('playing', c === current));
        updateStrumNow(current, x);

        // Pausiert: der angeklickte Akkord bleibt auf dem Griffbrett (zum Ansehen/Bearbeiten).
        // Beim Abspielen oder Ziehen des Strichs zeigt es den Akkord unter dem Strich.
        let chosen = sel.filter(isChord);
        let target = audio.paused && !scrubbing && chosen.length === 1 ? chosen[0] : current;
        if (target !== playingClip) {
            playingClip = target;
            showOnBoard(target);
        }
    }

    // Griffbrett zeigt den Griff des aktuellen Akkords (eigene Punkte des Songs sind solange ausgeblendet).
    // Im Bearbeiten-Modus wird genau dieser Griff bearbeitet (siehe commitLive).
    let shownClip = null;
    function showOnBoard(c) {
        shownClip = c;
        live.innerHTML = '';
        board.classList.toggle('live-mode', !!c);
        badge.hidden = !c;
        if (!c) return;
        updateBadge(c);
        let ch = chordOf(c);
        if (ch) live.dataset.rootPc = ch.rootPc;
        else delete live.dataset.rootPc;
        (shapeOf(c) || []).filter(n => !n.open).forEach(n => addBoardNote(n, live));
        refreshStrings(live);
    }

    function updateBadge(c) {
        let ch = chordOf(c), own = customNotes(c);
        badge.textContent = (ch ? ch.key : labelOf(c)) + (own ? ' · eigener Griff' : ch ? '' : ' · kein Griff');
        badge.classList.toggle('unknown', !ch && !own);
    }

    // Wird vom Griffbrett-Editor aufgerufen: aktuellen Griff im angezeigten Block speichern
    function commitLive() {
        if (!shownClip || !shownClip.isConnected) return;
        shownClip.dataset.notes = JSON.stringify([...live.querySelectorAll('.note:not(.open-string)')].map(noteData));
        markChord(shownClip);
        updateBadge(shownClip);
        renderContext();
    }

    function resetShape(c) {
        delete c.dataset.notes;
        markChord(c);
        renderContext();
        if (shownClip === c) showOnBoard(c);
    }

    let raf;
    function loop() {
        updatePlayhead();
        raf = audio.paused ? null : requestAnimationFrame(loop);
    }
    audio.addEventListener('play', () => raf || loop());
    ['timeupdate', 'seeked', 'loadedmetadata', 'emptied', 'pause'].forEach(ev => audio.addEventListener(ev, updatePlayhead));
    window.addEventListener('resize', updatePlayhead);

    // Orangen Strich ziehen (oder ins Lineal klicken/ziehen) springt an diese Stelle im Song
    function seekTo(clientX) {
        let orig = original();
        if (!orig || !isFinite(audio.duration)) return;
        let p = pos(orig);
        let x = (clientX - tl.getBoundingClientRect().left) / tl.clientWidth * 100;
        audio.currentTime = Math.max(0, Math.min(1, (x - p.left) / p.width)) * audio.duration;
        updatePlayhead();
    }

    [playhead, tl.querySelector('.ruler')].forEach(el => {
        el.onpointerdown = e => {
            if (!audio.src) return;
            e.preventDefault();
            e.stopPropagation();
            scrubbing = true;
            tl.classList.add('scrubbing');
            if (sel.length) select(null, []); // ab jetzt zeigt das Griffbrett den Akkord unter dem Strich
            try {
                el.setPointerCapture(e.pointerId);
            } catch (err) {}
            seekTo(e.clientX);
        };
        el.onpointermove = e => scrubbing && seekTo(e.clientX);
        el.onpointerup = el.onpointercancel = () => {
            scrubbing = false;
            tl.classList.remove('scrubbing');
        };
    });

    setCapo(0);
    render([
        { title: 'ORIGINAL AUDIO', clips: [{ label: 'Original Track', left: 17, width: 58, audio: true }] },
        {
            title: STRIP_TITLE,
            clips: ['C', 'Am', 'F', 'G'].map((label, i) => ({ label, left: 27 + i * 8.75, width: 8.75, strum: 'DDUUDU' }))
        }
    ]);

    function zoom(id) {
        let b = document.getElementById(id), z = 1, x = document.createElement('div');
        x.className = 'zoom-box';
        x.innerHTML = '<button>−</button><span class="zoom-value">100%</span><button>+</button>';
        b.parentElement.append(x);

        let a = () => {
            b.dataset.zoom = z;
            applyBoardTransform(b);
            x.querySelector('span').textContent = Math.round(z * 100) + '%';
        };

        x.children[0].onclick = () => {
            z = Math.max(.55, z - .1);
            a();
        };
        x.children[2].onclick = () => {
            z = Math.min(1.7, z + .1);
            a();
        };
    }

    zoom('board');
    zoom('finderBoard');

    // Gehört ein Element nur zur Anzeige (Anschlag-Spur, Gruppen-Rahmen)? Dann muss nicht gespeichert werden.
    function isView(node) {
        let el = node.nodeType === 1 ? node : node.parentElement;
        return !!(el && el.closest('.strum-row, .group-layer'));
    }

    return { el: tl, playhead, live, isView, render, serialize, commitLive, getCapo: () => capo, setCapo };
})();

// Editor-Höhe per Ziehen ändern (nur oben/unten)
(() => {
    const library = document.querySelector('.library');
    const editor = document.getElementById('editor');
    const grip = document.getElementById('editorResize');
    const MIN = 140;
    let startY, startH;

    const maxHeight = () => Math.max(MIN, library.clientHeight - 160);
    const setHeight = h => {
        h = Math.round(Math.max(MIN, Math.min(maxHeight(), h)));
        library.style.setProperty('--editor-h', h + 'px');
        return h;
    };
    const remember = h => {
        try {
            localStorage.setItem('fretly.editorHeight', h);
        } catch (e) {}
    };

    try {
        let saved = +localStorage.getItem('fretly.editorHeight');
        if (saved) library.style.setProperty('--editor-h', saved + 'px');
    } catch (e) {}

    grip.onpointerdown = e => {
        e.preventDefault();
        startY = e.clientY;
        startH = editor.offsetHeight;
        editor.classList.add('resizing');
        grip.setPointerCapture(e.pointerId);
    };
    grip.onpointermove = e => {
        if (startY == null) return;
        setHeight(startH - (e.clientY - startY));
    };
    grip.onpointerup = grip.onpointercancel = () => {
        if (startY == null) return;
        startY = null;
        editor.classList.remove('resizing');
        remember(editor.offsetHeight);
    };
    grip.onkeydown = e => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        remember(setHeight(editor.offsetHeight + (e.key === 'ArrowUp' ? 20 : -20)));
    };
    window.addEventListener('resize', () => {
        if (editor.offsetHeight > maxHeight()) setHeight(maxHeight());
    });
})();

// Library mit Backend: Songs und ihr Zustand (Griffe, Timeline, Spuren) werden auf dem Server gespeichert.
// Wird die Seite ohne Server geöffnet (Doppelklick auf index.html), läuft alles wie bisher nur im Browser.
(() => {
    const board = document.getElementById('board');
    const trackList = document.getElementById('trackList');
    let tracks = [], current = null, saveTimer = null;

    function collectState() {
        return {
            version: 1,
            notes: [...board.querySelectorAll(':scope > .note:not(.open-string)')].map(noteData),
            capo: timeline.getCapo(),
            timeline: timeline.serialize()
        };
    }

    const defaultState = collectState();

    function applyState(s) {
        board.querySelectorAll(':scope > .note').forEach(n => n.remove());
        s.notes.forEach(n => addBoardNote(n));
        refreshStrings(board);
        timeline.setCapo(s.capo || 0);
        timeline.render(s.timeline);
        observer.takeRecords(); // Laden selbst soll kein Speichern auslösen
    }

    function showTrack(name, url) {
        loadSong(url);
        document.getElementById('trackTitle').textContent = name.replace(/\.[^.]+$/, '');
        document.getElementById('editorName').textContent = name;
    }

    function setNotice(text) {
        let el = document.getElementById('libraryNotice');
        if (!el) {
            el = document.createElement('p');
            el.id = 'libraryNotice';
            el.className = 'library-notice';
            trackList.parentElement.insertBefore(el, trackList);
        }
        el.textContent = text;
        el.hidden = !text;
    }

    // ---- Speichern ----
    function saveNow() {
        clearTimeout(saveTimer);
        saveTimer = null;
        if (!current) return;
        current.state = collectState();
        return fetch('/api/tracks/' + current.id + '/state', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(current.state),
            keepalive: true
        }).then(r => {
            if (!r.ok) throw new Error();
            setNotice('');
        }).catch(() => setNotice('Speichern fehlgeschlagen – läuft der Server noch?'));
    }

    function scheduleSave() {
        if (!current) return;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveNow, 700);
    }

    const observer = new MutationObserver(records => {
        // Zoom/Spiegelung, Abspiel-Strich und der live angezeigte Griff ändern nur die Ansicht, nicht den Song
        const viewOnly = r => r.target === timeline.live || timeline.live.contains(r.target) || timeline.isView(r.target) ||
            (r.type === 'attributes' && (r.target === board || r.target === timeline.playhead));
        if (records.some(r => !viewOnly(r))) scheduleSave();
    });

    // ---- Song-Liste (höchstens MAX_TRACKS Songs) ----
    const MAX_TRACKS = 100;
    const count = document.createElement('span');
    count.className = 'library-count';
    document.querySelector('.side h2').append(count);

    function updateCount() {
        let full = tracks.length >= MAX_TRACKS;
        count.textContent = tracks.length + ' / ' + MAX_TRACKS;
        count.classList.toggle('full', full);
        document.querySelector('.upload').classList.toggle('disabled', full);
        document.getElementById('audioUpload').disabled = full;
        document.getElementById('addTrack').disabled = full;
        document.querySelector('.upload').title = full ? 'Die Library ist voll (' + MAX_TRACKS + ' Songs). Lösche zuerst einen Song.' : '';
    }

    function renderList() {
        trackList.innerHTML = '';
        updateCount();
        if (!tracks.length) {
            let empty = document.createElement('p');
            empty.className = 'library-empty';
            empty.textContent = 'Noch keine Songs. Lade oben eine Audio-Datei hoch.';
            trackList.append(empty);
            return;
        }
        tracks.forEach(t => {
            let item = document.createElement('div');
            item.className = 'track' + (t === current ? ' active' : '');

            // Play/Pause direkt in der Liste
            let disc = document.createElement('button');
            disc.className = 'disc';
            disc.dataset.id = t.id;
            disc.onclick = e => {
                e.stopPropagation();
                togglePlay(t);
            };

            let name = document.createElement('span');
            name.className = 'track-label';
            name.textContent = t.name;
            name.title = t.name;

            // ⋮-Menü: Umbenennen / Löschen
            let more = document.createElement('button');
            more.className = 'track-more';
            more.title = 'Mehr';
            more.setAttribute('aria-haspopup', 'menu');
            more.textContent = '⋮';
            more.onclick = e => {
                e.stopPropagation();
                openMenu(item, t);
            };

            item.append(disc, name, more);
            item.onclick = () => select(t);
            trackList.append(item);
        });
        updateDiscs();
    }

    function updateDiscs() {
        trackList.querySelectorAll('.disc[data-id]').forEach(d => {
            let playing = current && d.dataset.id === current.id && !audio.paused;
            d.textContent = playing ? 'Ⅱ' : '▶';
            d.title = playing ? 'Pause' : 'Abspielen';
            d.classList.toggle('playing', !!playing);
        });
    }
    audio.addEventListener('play', updateDiscs);
    audio.addEventListener('pause', updateDiscs);

    function togglePlay(t) {
        if (t !== current) {
            select(t);
            audio.play().catch(() => {});
        } else if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
    }

    let openMenuEl = null;
    function closeMenu() {
        if (openMenuEl) openMenuEl.remove();
        openMenuEl = null;
    }
    document.addEventListener('click', closeMenu);
    document.addEventListener('keydown', e => e.key === 'Escape' && closeMenu());

    function openMenu(item, t) {
        let wasOpen = openMenuEl && openMenuEl.parentElement === item;
        closeMenu();
        if (wasOpen) return;
        let menu = document.createElement('div');
        menu.className = 'track-menu';
        menu.setAttribute('role', 'menu');
        [['✎ Umbenennen', () => renameTrack(t), ''], ['🗑 Löschen', () => removeTrack(t), 'danger']].forEach(([label, fn, cls]) => {
            let b = document.createElement('button');
            b.setAttribute('role', 'menuitem');
            b.className = cls;
            b.textContent = label;
            b.onclick = e => {
                e.stopPropagation();
                closeMenu();
                fn();
            };
            menu.append(b);
        });
        menu.onclick = e => e.stopPropagation();
        item.append(menu);
        openMenuEl = menu;
        menu.querySelector('button').focus();
    }

    function renameTrack(t) {
        let x = prompt('Neuer Name für den Song:', t.title);
        if (x === null || !x.trim() || x.trim() === t.title) return;
        fetch('/api/tracks/' + t.id, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: x.trim() })
        }).then(r => r.json().then(body => {
            if (!r.ok) throw new Error(body.error);
            t.name = body.name;
            t.title = body.title;
            if (t === current) {
                document.getElementById('trackTitle').textContent = t.title;
                document.getElementById('editorName').textContent = t.name;
            }
            renderList();
        })).catch(err => setNotice(err.message || 'Umbenennen fehlgeschlagen.'));
    }

    function select(t) {
        if (t === current) return;
        if (saveTimer) saveNow();
        current = t;
        showTrack(t.name, t.url);
        applyState(t.state || defaultState);
        renderList();
    }

    function upload(file) {
        if (tracks.length >= MAX_TRACKS) {
            setNotice('Die Library ist voll (' + MAX_TRACKS + ' Songs). Lösche zuerst einen Song.');
            return Promise.reject(new Error('full'));
        }
        setNotice('Lade „' + file.name + '“ hoch …');
        return fetch('/api/tracks', {
            method: 'POST',
            headers: {
                'Content-Type': file.type || 'application/octet-stream',
                'X-File-Name': encodeURIComponent(file.name)
            },
            body: file
        }).then(r => r.json().then(body => {
            if (!r.ok) throw new Error(body.error || 'Upload fehlgeschlagen');
            setNotice('');
            tracks.push(body);
            return body;
        })).catch(err => {
            setNotice(err.message || 'Upload fehlgeschlagen');
            throw err;
        });
    }

    function removeTrack(t) {
        if (!confirm('„' + t.name + '“ wirklich aus der Library löschen?')) return;
        fetch('/api/tracks/' + t.id, { method: 'DELETE' }).then(r => {
            if (!r.ok) throw new Error();
            tracks = tracks.filter(x => x !== t);
            if (current === t) {
                clearTimeout(saveTimer);
                saveTimer = null;
                current = null;
                if (tracks.length) select(tracks[0]);
                else {
                    audio.pause();
                    audio.removeAttribute('src');
                    if (wave) wave.empty();
                    applyState(defaultState);
                }
            }
            renderList();
        }).catch(() => setNotice('Löschen fehlgeschlagen.'));
    }

    function pickFile(cb) {
        let pick = document.createElement('input');
        pick.type = 'file';
        pick.accept = 'audio/*';
        pick.onchange = e => e.target.files[0] && cb(e.target.files[0]);
        pick.click();
    }

    // ---- Start: gibt es einen Server? ----
    if (!location.protocol.startsWith('http')) {
        setNotice('Offline-Modus: Songs werden nicht gespeichert. Starte den Server mit „node server/server.js“.');
        return;
    }

    fetch('/api/tracks').then(r => {
        if (!r.ok) throw new Error();
        return r.json();
    }).then(list => {
        tracks = list;

        // Upload-Knöpfe auf den Server umstellen
        document.getElementById('audioUpload').onchange = e => {
            let f = e.target.files[0];
            e.target.value = '';
            if (f) upload(f).then(select).catch(() => {});
        };
        document.getElementById('addTrack').onclick = () => pickFile(f => upload(f).then(() => renderList()).catch(() => {}));

        observer.observe(board, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
        observer.observe(timeline.el, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'data-anchor', 'data-notes', 'data-strum', 'data-group'] });
        window.addEventListener('pagehide', () => saveTimer && saveNow());

        if (tracks.length) select(tracks[0]);
        else renderList();
    }).catch(() => {
        setNotice('Server nicht erreichbar – Songs werden nicht gespeichert.');
    });
})();
