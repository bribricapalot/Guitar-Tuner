# Guitar-Tuner
Holy prompt engineered


## Starten

FRETLY hat ein kleines Backend in Node.js (ohne externe Pakete). Es speichert hochgeladene
Songs und pro Song die eigenen Griffe, Timeline-Clips und Spuren.

```bash
node server/server.js
```

Danach im Browser **http://localhost:3000** öffnen.

Die Library fasst höchstens 100 Songs. Die Daten liegen in `server/data/` (Audio-Dateien + `db.json`) und werden nicht ins Repo eingecheckt.
Öffnest du `index.html` direkt per Doppelklick, läuft die App im Offline-Modus ohne Speichern.

### API

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/tracks` | Alle Songs |
| POST | `/api/tracks` | Song hochladen (Body = Audio-Datei, Header `X-File-Name`) |
| GET | `/api/tracks/:id/audio` | Audio abspielen (mit Range-Support) |
| PUT | `/api/tracks/:id/state` | Griffe, Timeline und Spuren speichern |
| PATCH | `/api/tracks/:id` | Song umbenennen (JSON `{ "title": "…" }`) |
| DELETE | `/api/tracks/:id` | Song löschen |
