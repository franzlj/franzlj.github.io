# CLAUDE.md

Persönliche Website von Franz, ausgeliefert über GitHub Pages (https://franzlj.github.io).
Reines HTML/CSS/JS, kein Build-Schritt, keine Abhängigkeiten. Jeder Push auf `main` wird
automatisch veröffentlicht (Deploy from branch, Root `/`). Änderungen daher per Branch und PR,
nach Git Flow (siehe unten).

## Struktur

```
index.html          Profil-Startseite
style.css           Gemeinsames Stylesheet (Farb-Tokens, Hell/Dunkel, Navigation)
apps/index.html     Übersicht der Mini-Apps
apps/<name>/        Eine Mini-App pro Ordner
assets/tree-stage.js 3D-Drahtgittermodell (Baum) auf der Startseite, Kamera folgt dem Scrollen
vendor/three-<ver>/ three.js, lokal und fest versioniert (kein CDN)
```

## Git Flow

Dauerhafte Branches: `main` (veröffentlicht, jeder Stand ist live) und `develop` (Integration).
Direkte Pushes auf `main` und `develop` gibt es nicht, alles läuft über PRs.

| Zweck | Branch | Startet von | PR-Ziel |
| --- | --- | --- | --- |
| Neue Funktion oder Verbesserung | `feature/<thema>` | `develop` | `develop` |
| Dringender Fix auf der Live-Seite | `hotfix/<thema>` | `main` | `main`, danach nach `develop` |

- Branch-Namen: Kleinbuchstaben und Bindestriche, z. B. `feature/live-activity-studio-timer`.
  Keine anderen Präfixe wie `claude/...`.
- Pro Thema ein Feature-Branch, kleine PRs. Mehrere Mini-Apps nicht in einem Branch mischen.
- Alle PRs per Merge-Commit mergen (siehe Regeln), damit die Feature-Historie sichtbar bleibt.

## Mini-App hinzufügen

1. Ordner `apps/<name>/` anlegen (Kleinbuchstaben, Bindestriche). Einstieg ist `index.html`,
   eigenes CSS/JS daneben (z. B. `app.css`, `app.js`). Vorlage: `apps/live-activities-studio/`.
2. Im `<head>` `../../style.css` einbinden, damit Farben, Schrift und Dark Mode übereinstimmen.
   App-spezifisches CSS nutzt die Tokens `--bg`, `--fg`, `--muted`, `--accent`.
3. Die Navigation aus den anderen Seiten übernehmen, mit relativen Links
   (`../../` = Profil, `../` = Mini-Apps, dort `aria-current="page"`).
4. In `apps/index.html` eine Kachel in `.app-grid` ergänzen (`<li>` mit `a.app-tile`, darin
   `.app-tile-title` und ein Satz in `.app-tile-desc`).

## Regeln

- Nur statische Dateien: kein Build-Tool, kein Framework, kein Server-Code.
- Relative Pfade verwenden, keine absoluten (`/...`).
- Externe Bibliotheken nur, wenn nötig, dann per CDN mit fester Version.
- Keine Secrets oder API-Keys im Code; alles ist öffentlich.
- Daten nur im Browser halten (z. B. `localStorage`), es gibt kein Backend.
- Seiten müssen auf Mobilgeräten funktionieren (Viewport-Meta, kein horizontales Scrollen).
- Sprache der Inhalte: Deutsch.
- PRs immer per Merge-Commit mergen (`--no-ff`, GitHub: „Create a merge commit“), nie Squash oder Rebase.

## Neue Hauptsektion

Weitere Sektion analog zu `apps/` als eigener Ordner mit `index.html` anlegen und den Link in
die `.site-nav` aller Seiten aufnehmen.
