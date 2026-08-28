# ki-wahltest.de

`ki-wahltest.de` dokumentiert vollständig beschriebene Experimente dazu, wie Large Language Models bei paarweisen Entscheidungen zwischen vorab festgelegten Parteibezeichnungen reagieren. Untersucht werden insbesondere Reihenfolgeeffekte, Promptvarianten, Modellunterschiede und die Stabilität wiederholter Entscheidungen.

Die Website ist **keine Wahlentscheidungshilfe**. Auswahlquoten sind weder Wahlumfragen noch prognostizierte Stimmenanteile oder politische Zustimmung.

## Technischer Stack

- Astro 7 mit statischer Ausgabe
- TypeScript im Strict-Modus
- normales CSS, Systemfonts
- keine eigene Datenbank oder Laufzeit-API
- keine eigenen Analytics oder Cookies
- Rechtstexte werden über die Einbindung der IT-Recht Kanzlei bereitgestellt
- Vitest für Daten- und Hilfsfunktionstests

Node.js 24 ist in `.nvmrc` dokumentiert.

## Lokale Entwicklung

```bash
nvm use
npm install
npm run dev
```

Astro nennt beim Start die lokale URL. Wichtige Prüfungen:

```bash
npm run audit:data   # rekonstruiert zentrale Ergebnisse aus den Primärdaten
npm run check        # Astro-/TypeScript-Prüfung
npm test             # Unit-Tests
npm run build        # vollständig statischer Build nach dist/
npm run audit:site   # prüft die erzeugte Website
npm run check:launch # Build, Site-Audit und Go-live-Prüfung
npm run preview      # lokalen Production-Build ansehen
```

## Projektstruktur

```text
src/
  components/       wiederverwendbare Daten- und Layoutdarstellungen
  data/experiments/ typisierte Experimentdefinitionen
  layouts/          gemeinsamer HTML-Rahmen und SEO-Metadaten
  lib/              Typen, Slugs, Formate, Suche und Validierung
  pages/            statisch erzeugte Seiten und dynamische Duell-/Parteirouten
  styles/           globales CSS
public/
  data/              veröffentlichte Daten, Manifest und Prüfsummen
  robots.txt
```

Die Website importiert die abgeleiteten Daten aus `public/data/website-data.json`. Die unveränderten Primärdaten des Hauptlaufs liegen versioniert unter `public/data/experiments/gpt-5.6-sol-main-v2/`.

## Datenmodell

Das zentrale TypeScript-Modell steht in `src/lib/types.ts`. Ein `Experiment` enthält unter anderem Modell-ID, Promptrevision, Parameter, Seed, die verwendeten Parteibezeichnungen, Ranking, Paarergebnisse und Provenienzangaben.

`src/data/experiments/gpt56-main-v2.ts` importiert die veröffentlichten Daten und bildet daraus das typisierte Hauptexperiment. Ergebniszahlen werden nicht in den Darstellungskomponenten hartcodiert.

## Datenintegrität

`npm run audit:data` liest die Primärdaten neu ein und prüft unter anderem:

- 9.000 erfolgreiche eindeutige Sequenzen
- vollständige Sequenznummern 1 bis 9000
- 45 Paarungen und zwei Reihenfolgen je Paar
- 100 erfolgreiche Entscheidungen je Reihenfolge
- 1.800 Beteiligungen je verwendeter Parteibezeichnung
- Parteisummen und Rangliste
- Permutationssensitivität aller 45 Duelle
- Positionsstatistik und Konstanzwerte
- SHA-256-Prüfsummen der Primärdateien

Der Daten-Audit ist Bestandteil der CI und läuft zusätzlich vor jedem statischen Build.

## Verwendete Parteibezeichnungen

Im Hauptlauf wurden zehn vorab festgelegte Parteibezeichnungen untersucht. Die Auswahl erhebt keinen Anspruch auf Vollständigkeit. CDU und CSU wurden für dieses Experiment unter der gemeinsamen Bezeichnung `CDU/CSU` zusammengefasst.

## Primärdaten des Hauptlaufs

Die unveränderten Originaldateien liegen unter `public/data/experiments/gpt-5.6-sol-main-v2/`:

- `manifest.json`: Versuchskonfiguration, 90 Prompttexte und deren SHA-256-Hashes
- `jobs.jsonl`: eingefrorene Reihenfolge aller 9.000 Jobs
- `results.jsonl`: protokollierte Versuche einschließlich erfolgreicher Entscheidungen und Retry-/Fehlerzeilen

Die Primärdaten werden nicht nachträglich verändert. Abgeleitete Dateien dürfen neu erzeugt werden, müssen aber mit den Primärdaten konsistent bleiben.

## Modellvergleiche

Ein sauberer Vergleich zweier Modellgenerationen setzt möglichst identische Versuchsbedingungen voraus. Frühere GPT-5.4-Läufe mit anderer Promptfassung werden deshalb nicht als isolierter Modelleffekt des GPT-5.6-Hauptlaufs interpretiert.

## Deployment

`npm run build` erzeugt in `dist/` eine statische Website. Die Basisdomain ist in `astro.config.mjs` auf `https://ki-wahltest.de` gesetzt. Die CI führt Daten-Audit, Typechecks, Tests, Build, Site-Audit und Launch-Gate aus, aber bewusst kein Production-Deployment.

## Methodischer Hinweis

Das Projekt beantwortet nicht „Welche Partei sollte man wählen?“, sondern untersucht, wie sich Modellentscheidungen unter dokumentierten Änderungen der Eingabe unterscheiden. Eine beobachtete Häufigkeit von 100/100 oder 200/200 ist eine Beschreibung dieses Laufs und keine Garantie einer wahren Wahrscheinlichkeit von 100 Prozent.
