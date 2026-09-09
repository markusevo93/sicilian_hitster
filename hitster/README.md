# Hitstermin

Ein Hitster-Klon ohne Karten/QR-Codes: Songs kommen aus einer CSV-Liste,
Wiedergabe läuft über deinen Spotify-Account auf einem beliebigen aktiven Gerät
(z.B. dein Handy mit offener Spotify-App).

## 1. Spotify Developer App anlegen

1. Gehe zu https://developer.spotify.com/dashboard und logge dich mit deinem
   (Family-)Premium-Account ein.
2. "Create app" klicken. Name/Beschreibung frei wählbar.
3. Als **Redirect URI** die URL eintragen, unter der du diese Seite später
   aufrufst (siehe Schritt 2/3 unten) — z.B.:
   - `https://DEINNAME.github.io/hitster/index.html` (GitHub Pages)
   - `http://127.0.0.1:5500/index.html` (lokaler Test)
4. Unter "Settings" die **Client ID** kopieren.

## 2. Client ID eintragen

In `app.js` ganz oben:

```js
CLIENT_ID: 'DEINE_SPOTIFY_CLIENT_ID',
```

durch deine echte Client ID ersetzen.

## 3. Hosten

**Option A — GitHub Pages (empfohlen für Handy-Nutzung):**
1. Neues GitHub-Repo erstellen, diesen Ordner hochladen.
2. Unter Settings → Pages → Branch "main" aktivieren.
3. Die resultierende URL (z.B. `https://deinname.github.io/hitster/`) als
   Redirect URI im Spotify Dashboard eintragen (mit `index.html` am Ende,
   je nachdem was der Browser tatsächlich in der Adresszeile zeigt).
4. Auf dem Handy im Chrome-Browser öffnen → Menü → "Zum Startbildschirm
   hinzufügen". Läuft danach wie eine App im Vollbild.

**Option B — Lokal testen (Desktop):**
```
cd hitster
python3 -m http.server 5500
```
Dann `http://127.0.0.1:5500` öffnen.

## 4. Songliste

CSV mit Semikolon, Kopfzeile wird ignoriert:

```
titel;interpret;jahr
Bohemian Rhapsody;Queen;1975
```

Optional eine vierte Spalte `spotify_id` (die ID aus einem Spotify-Track-Link,
z.B. `4u7EnebtmKWzUH433cf5Qv`), falls die automatische Suche mal danebenliegt.
Ohne diese Spalte wird der Song per Titel+Interpret gesucht.

Beispiel liegt in `beispiel-songs.csv`.

## Ablauf im Spiel

1. Gerät auswählen (Spotify muss dort geöffnet/aktiv sein).
2. "Runde starten" → zufälliger Song spielt automatisch, 60 Sekunden Timer,
   Vinyl dreht sich.
3. Nach Ablauf stoppt die Wiedergabe automatisch (oder manuell per Button).
4. "Karte aufdecken" zeigt Jahr/Titel/Interpret.
5. Spieler schreiben ihre Jahres-Schätzung vorher auf Papier — die App
   entscheidet nicht, wer gewinnt, das macht ihr am Tisch.
6. "Nächste Runde" für den nächsten Song.

Songs werden nicht doppelt gezogen, bis die Liste einmal komplett durch ist.
