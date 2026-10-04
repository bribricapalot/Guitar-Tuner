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

// Audio & WaveSurfer Player
let wave;
const audio = document.getElementById('audio');
let loopOn = false, loopStart = 0, loopEnd = 0;

try {
    wave = WaveSurfer.create({
        container: '#waveform',
        waveColor: '#78856e',
        progressColor: '#ddff63',
        cursorColor: '#ff6844',
        height: 82,
        barWidth: 2,
        barGap: 2,
        normalize: true
    });
    wave.on('click', () => {
        if (audio.src) audio.currentTime = wave.getCurrentTime();
    });
} catch (e) {}

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
    let u = URL.createObjectURL(f);
    audio.src = u;
    wave && wave.load(u);
    document.getElementById('trackTitle').textContent = f.name.replace(/\.[^.]+$/, '');
    document.getElementById('editorName').textContent = f.name;
    document.getElementById('trackList').innerHTML = '<div class="track active"><span class="disc">▶</span><span>' + f.name + '</span></div>';
};

document.getElementById('speed').oninput = e => audio.playbackRate = e.target.value;
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

// Chord Library Data & Selection
const names = {
    C: ['C Major', 'C · E · G', '8%', '18%', '112px', '88px', '64px'],
    Dm: ['D minor', 'D · F · A', '18%', '27%', '88px', '112px', '64px'],
    Em: ['E minor', 'E · G · B', '14%', '20%', '88px', '64px', '40px'],
    F: ['F Major', 'F · A · C', '11%', '20%', '112px', '88px', '64px'],
    G: ['G Major', 'G · B · D', '20%', '31%', '112px', '88px', '40px'],
    Am: ['A minor', 'A · C · E', '13%', '22%', '88px', '64px', '40px']
};

document.querySelectorAll('#chords button').forEach(b => b.onclick = () => {
    document.querySelectorAll('#chords button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    let d = names[b.textContent] || [b.textContent, 'Chord tones', '8%', '18%', '112px', '88px', '64px'];
    document.getElementById('chordName').textContent = d[0];
    document.getElementById('chordInfo').innerHTML = d[1] + '<br>Open position · 3 fingers';
    let ns = document.querySelectorAll('#finderBoard .note');
    ns[0].style.left = d[2];
    ns[1].style.left = d[3];
    ns[0].style.top = d[4];
    ns[1].style.top = d[5];
    ns[2].style.top = d[6];
});

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
    let edit = false, finger = 1;

    const bar = document.createElement('div');
    bar.className = 'editbar';
    bar.innerHTML = '<button id="editToggle">✦ GRIFF BEARBEITEN</button><span id="fingerPicker" hidden><button class="finger-choice active" data-finger="1">1</button><button class="finger-choice" data-finger="2">2</button><button class="finger-choice" data-finger="3">3</button><button class="finger-choice" data-finger="4">4</button></span><button id="deleteLast" title="Letzten Punkt löschen">↶</button><button id="clearNotes" title="Alle eigenen Punkte löschen">⌫</button>';
    stage.parentElement.appendChild(bar);

    const hint = document.createElement('div');
    hint.className = 'edit-hint';
    hint.textContent = 'AUF EINEN BUND KLICKEN, UM EINEN FINGER ZU SETZEN';
    hint.hidden = true;
    stage.appendChild(hint);

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

    board.addEventListener('click', e => {
        if (!edit || e.target.classList.contains('note')) return;
        // Bildschirm-Koordinaten in Griffbrett-Koordinaten umrechnen (Zoom, Rahmen, Spiegelung)
        let r = board.getBoundingClientRect();
        let z = +board.dataset.zoom || 1;
        let border = board.clientLeft;
        let lx = (e.clientX - r.left) / z - border;
        let ly = (e.clientY - r.top) / z - border;
        let x = lx / board.clientWidth * 100;
        if (board.classList.contains('mirrored')) x = 100 - x;
        let stringIndex = Math.max(0, Math.min(5, Math.round((ly - 16) / 24)));
        addBoardNote({ x: Math.max(0, Math.min(100, x)), y: 16 + stringIndex * 24, text: finger, custom: true });
    });

    // Erstellt einen Finger-Punkt auf dem Library-Griffbrett (auch beim Laden eines gespeicherten Songs)
    function addBoardNote(d) {
        let n = document.createElement(d.custom ? 'button' : 'span');
        n.className = 'note' + (d.custom ? ' custom' : '') + (d.root ? ' root' : '');
        n.textContent = d.text;
        n.style.left = d.x + '%';
        n.style.top = d.y + 'px';
        if (d.custom) n.title = 'Klicken zum Löschen';
        n.onclick = ev => {
            if (edit) {
                ev.stopPropagation();
                n.remove();
            }
        };
        board.appendChild(n);
    }
    window.addBoardNote = addBoardNote;

    document.getElementById('deleteLast').onclick = () => {
        let n = board.querySelectorAll('.custom');
        n[n.length - 1]?.remove();
    };
    document.getElementById('clearNotes').onclick = () => board.querySelectorAll('.custom').forEach(n => n.remove());

    // Dynamic Generator for Extended Chords Dictionary
    const roots = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
    const types = ['', 'm', '7', 'maj7', 'm7', 'sus2', 'sus4', 'dim', 'aug', '6', '9', 'add9'];
    const chordList = document.getElementById('chords');
    chordList.innerHTML = '';
    const data = {};

    roots.forEach((root, ri) => types.forEach((type, ti) => {
        let n = root + type;
        data[n] = [
            root + (type ? type : ' Major'),
            type === 'm' ? 'minor triad' : type === 'dim' ? 'diminished triad' : type === 'aug' ? 'augmented triad' : type === 'sus2' || type === 'sus4' ? 'suspended chord' : type || 'major triad',
            8 + ((ri * 7 + ti * 5) % 30),
            18 + ((ri * 5 + ti * 3) % 31),
            [112, 88, 64, 40][(ri + ti) % 4],
            [112, 88, 64, 40][(ri + ti + 1) % 4],
            [112, 88, 64, 40][(ri + ti + 2) % 4]
        ];
        let b = document.createElement('button');
        b.textContent = n;
        if (n === 'C') b.className = 'active';
        b.onclick = () => select(n, b);
        chordList.appendChild(b);
    }));

    function select(n, b) {
        chordList.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
        let d = data[n];
        let ns = document.querySelectorAll('#finderBoard .note');
        document.getElementById('chordName').textContent = d[0];
        document.getElementById('chordInfo').innerHTML = d[1] + '<br>Griffbrett-Position · 3 Finger';
        ns[0].style.left = d[2] + '%';
        ns[1].style.left = d[3] + '%';
        ns[0].style.top = d[4] + 'px';
        ns[1].style.top = d[5] + 'px';
        ns[2].style.top = d[6] + 'px';
    }

    document.getElementById('search').oninput = e => {
        let q = e.target.value.toLowerCase();
        chordList.querySelectorAll('button').forEach(b => b.hidden = !b.textContent.toLowerCase().includes(q));
    };
})();

// Fret Numbers and Multi-track Mixer Controls
const mixer = (() => {
    const board = document.getElementById('board');
    board.querySelectorAll('.note:not(.custom)').forEach(n => n.addEventListener('click', e => {
        if (board.classList.contains('editing')) {
            e.stopPropagation();
            n.remove();
        }
    }));

    for (let i = 1; i <= 12; i++) {
        let l = document.createElement('span');
        l.className = 'fret-no';
        l.textContent = i;
        l.style.left = (7.7 + (i - 1) * 7.45) + '%';
        board.appendChild(l);
    }

    const upload = document.getElementById('audioUpload');
    const tools = document.createElement('div');
    tools.className = 'track-tools';
    tools.innerHTML = '<button id="addTrack">+ SPUR</button><button id="addChordTrack">+ AKKORD-SPUR</button>';
    upload.parentElement.insertAdjacentElement('afterend', tools);

    const stack = document.createElement('div');
    stack.className = 'track-stack';
    stack.id = 'trackStack';
    document.querySelector('.workspace').appendChild(stack);

    function add(label, removable = true) {
        let row = document.createElement('div');
        row.className = 'mix-track';
        row.dataset.label = label;
        let no = document.createElement('b');
        no.textContent = String(stack.children.length + 1).padStart(2, '0');
        row.append(no, ' ' + label);
        if (removable) {
            let del = document.createElement('button');
            del.title = 'Spur löschen';
            del.textContent = '×';
            del.onclick = () => row.remove();
            row.append(del);
        }
        stack.appendChild(row);
    }

    function render(labels) {
        stack.innerHTML = '';
        labels.forEach((l, i) => add(l, i > 0));
    }

    render(['Guitar · C / Am']);

    // Offline-Variante: Spur nur im Browser (wird im Server-Modus unten ersetzt)
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
                audio.src = u;
                wave && wave.load(u);
                document.getElementById('trackTitle').textContent = f.name.replace(/\.[^.]+$/, '');
                document.getElementById('editorName').textContent = f.name;
            };
            document.getElementById('trackList').appendChild(item);
            add(f.name.replace(/\.[^.]+$/, ''));
        };
        pick.click();
    };

    document.getElementById('addChordTrack').onclick = () => {
        let c = prompt('Akkorde für diese Spur (z. B. Am · F · C · G):', 'Am · F · C · G');
        if (c) add('Chords · ' + c);
    };

    return {
        stack,
        add,
        render,
        serialize: () => [...stack.children].map(r => r.dataset.label)
    };
})();

// Interactive Timeline, Layers and Zooming Controls
const timeline = (() => {
    const wavebox = document.querySelector('.wavebox');
    document.getElementById('waveform').style.height = '60px';

    const actions = document.createElement('div');
    actions.className = 'clip-actions';
    actions.innerHTML = '<button id="addAudioLayer">+ AUDIO-SPUR</button><button id="addChordClip">+ AKKORD</button>';
    document.querySelector('.controls').appendChild(actions);

    const tl = document.createElement('div');
    tl.className = 'timeline';
    tl.innerHTML = '<div class="ruler">0:00 0:05 0:10 0:15 0:20 0:25 0:30 0:35</div>';
    wavebox.appendChild(tl);

    function bind(c) {
        let m, sx, sl, sw;
        c.onpointerdown = e => {
            e.stopPropagation();
            m = e.target.classList.contains('left') ? 'l' : e.target.classList.contains('right') ? 'r' : 'm';
            sx = e.clientX;
            sl = parseFloat(c.style.left);
            sw = parseFloat(c.style.width);
            c.setPointerCapture(e.pointerId);
        };

        c.onpointermove = e => {
            if (!m) return;
            let d = (e.clientX - sx) / tl.clientWidth * 100;
            if (m === 'm') c.style.left = Math.max(14, Math.min(96 - sw, sl + d)) + '%';
            if (m === 'r') c.style.width = Math.max(5, Math.min(82, sw + d)) + '%';
            if (m === 'l') {
                let w = Math.max(5, sw - d);
                c.style.left = Math.max(14, sl + (sw - w)) + '%';
                c.style.width = w + '%';
            }
        };

        c.onpointerup = () => m = null;
    }

    // Wenn der Original-Track getrimmt wird, werden die Akkord-Clips mitgekürzt
    function bindTrimSync(original) {
        let trimBefore;

        original.addEventListener('pointerdown', () => {
            trimBefore = {
                left: parseFloat(original.style.left),
                width: parseFloat(original.style.width)
            };
        });

        original.addEventListener('pointerup', () => {
            if (!trimBefore) return;
            let nl = parseFloat(original.style.left);
            let nw = parseFloat(original.style.width);

            tl.querySelectorAll('.timeline-row .clip:not(.audio-clip)').forEach(c => {
                let l = parseFloat(c.style.left);
                let w = parseFloat(c.style.width);
                let a = (l - trimBefore.left) / trimBefore.width;
                let b = (l + w - trimBefore.left) / trimBefore.width;
                let cl = Math.max(nl, nl + Math.max(0, a) * nw);
                let cr = Math.min(nl + nw, nl + Math.min(1, b) * nw);

                if (cr <= cl) c.remove();
                else {
                    c.style.left = cl + '%';
                    c.style.width = Math.max(5, cr - cl) + '%';
                }
            });
            trimBefore = null;
        });
    }

    function makeClip(d) {
        let c = document.createElement('span');
        c.className = 'clip' + (d.audio ? ' audio-clip' : '');
        c.style.left = d.left + '%';
        c.style.width = d.width + '%';
        c.append(handle('left'), d.label, handle('right'));
        bind(c);
        return c;
    }

    function handle(side) {
        let h = document.createElement('i');
        h.className = 'handle ' + side;
        return h;
    }

    function makeRow(d) {
        let row = document.createElement('div');
        row.className = 'timeline-row';
        let title = document.createElement('span');
        title.className = 'row-title';
        title.textContent = d.title;
        row.append(title);
        if (d.addLane) {
            let b = document.createElement('button');
            b.className = 'add-lane';
            b.textContent = '+ Clip hinzufügen';
            b.onclick = () => chord(row);
            row.append(b);
        }
        d.clips.forEach(c => row.append(makeClip(c)));
        tl.append(row);
        return row;
    }

    function render(rows) {
        tl.querySelectorAll('.timeline-row').forEach(r => r.remove());
        rows.forEach(makeRow);
        let original = tl.querySelector('.timeline-row .audio-clip');
        if (original) bindTrimSync(original);
    }

    function serialize() {
        return [...tl.querySelectorAll('.timeline-row')].map(row => ({
            title: row.querySelector('.row-title').textContent,
            addLane: !!row.querySelector('.add-lane'),
            clips: [...row.querySelectorAll('.clip')].map(c => ({
                label: c.textContent,
                left: parseFloat(c.style.left),
                width: parseFloat(c.style.width),
                audio: c.classList.contains('audio-clip')
            }))
        }));
    }

    function chord(row) {
        let x = prompt('Akkord oder Akkordfolge:', 'Dm · G · C · Am');
        if (!x) return;
        row.append(makeClip({ label: x, left: 30, width: 25 }));
    }

    render([
        { title: 'ORIGINAL AUDIO', clips: [{ label: 'Original Track', left: 17, width: 58, audio: true }] },
        { title: 'AKKORDE 01', clips: [{ label: 'C · Am · F · G', left: 27, width: 35 }] },
        { title: 'AKKORDE 02', addLane: true, clips: [] }
    ]);

    document.getElementById('addChordClip').onclick = () => chord(tl.querySelectorAll('.timeline-row')[1]);

    document.getElementById('addAudioLayer').onclick = () => {
        let f = document.createElement('input');
        f.type = 'file';
        f.accept = 'audio/*';
        f.onchange = e => {
            let file = e.target.files[0];
            if (!file) return;
            makeRow({ title: 'AUDIO-SPUR', clips: [{ label: file.name, left: 22, width: 40, audio: true }] });
        };
        f.click();
    };

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

    return { el: tl, render, serialize };
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
            notes: [...board.querySelectorAll('.note')].map(n => ({
                x: parseFloat(n.style.left),
                y: parseFloat(n.style.top),
                text: n.textContent,
                root: n.classList.contains('root'),
                custom: n.classList.contains('custom')
            })),
            timeline: timeline.serialize(),
            mix: mixer.serialize()
        };
    }

    const defaultState = collectState();

    function applyState(s) {
        board.querySelectorAll('.note').forEach(n => n.remove());
        s.notes.forEach(addBoardNote);
        timeline.render(s.timeline);
        mixer.render(s.mix);
        observer.takeRecords(); // Laden selbst soll kein Speichern auslösen
    }

    function showTrack(name, url) {
        audio.src = url;
        wave && wave.load(url);
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
        // Zoom/Spiegelung ändern nur die Ansicht, nicht den Song
        if (records.some(r => !(r.type === 'attributes' && r.target === board))) scheduleSave();
    });

    // ---- Song-Liste ----
    function renderList() {
        trackList.innerHTML = '';
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
            let disc = document.createElement('span');
            disc.className = 'disc';
            disc.textContent = '▶';
            let name = document.createElement('span');
            name.className = 'track-label';
            name.textContent = t.name;
            let del = document.createElement('button');
            del.className = 'track-delete';
            del.title = 'Song löschen';
            del.textContent = '×';
            del.onclick = e => {
                e.stopPropagation();
                removeTrack(t);
            };
            item.append(disc, name, del);
            item.onclick = () => select(t);
            trackList.append(item);
        });
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
                    audio.removeAttribute('src');
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
        document.getElementById('addTrack').onclick = () => pickFile(f => upload(f).then(t => {
            mixer.add(t.title);
            renderList();
        }).catch(() => {}));

        observer.observe(board, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
        observer.observe(timeline.el, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
        observer.observe(mixer.stack, { childList: true });
        window.addEventListener('pagehide', () => saveTimer && saveNow());

        if (tracks.length) select(tracks[0]);
        else renderList();
    }).catch(() => {
        setNotice('Server nicht erreichbar – Songs werden nicht gespeichert.');
    });
})();
