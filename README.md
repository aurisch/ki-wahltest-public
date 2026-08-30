# ki-wahltest.de

`ki-wahltest.de` dokumentiert reproduzierbare Experimente dazu, wie KI-Sprachmodelle bei paarweisen Entscheidungen zwischen vorab festgelegten deutschen Parteibezeichnungen reagieren. Untersucht werden insbesondere Auswahlquoten, Reihenfolgeeffekte, Modellunterschiede und die Stabilität wiederholter Entscheidungen.

Die Website ist **keine Wahlentscheidungshilfe**. Auswahlquoten sind weder Wahlumfragen noch prognostizierte Stimmenanteile oder politische Zustimmung.

## Technischer Stack

- Astro 7 mit statischer Ausgabe
- TypeScript im Strict-Modus
- normales CSS, Systemfonts
- keine eigene Datenbank oder Laufzeit-API
- keine Cookies; anonyme Reichweitenmessung über Plausible
- Rechtstexte über die Einbindung der IT-Recht Kanzlei
- Vitest für Daten- und Hilfsfunktionstests

Node.js 24 ist in `.nvmrc` dokumentiert.

## Lokale Entwicklung

```bash
nvm use
npm install
npm run dev
```

Wichtige Prüfungen:

```bash
npm run audit:data   # rekonstruiert zentrale Ergebnisse aus den Primärdaten
npm run check        # Astro-/TypeScript-Prüfung
npm test             # Unit-Tests
npm run build        # statischer Build nach dist/
npm run audit:site   # prüft die erzeugte Website
npm run check:launch # Build, Site-Audit und Go-live-Prüfung
npm run preview      # lokalen Production-Build ansehen
```

## Projektstruktur

```text
src/
  components/       wiederverwendbare Daten- und Layoutdarstellungen
  data/experiments/ typisierte Definitionen der einzelnen Modellläufe
  layouts/          gemeinsamer HTML-Rahmen und SEO-Metadaten
  lib/              Typen, Vergleichslogik, Slugs, Formate und Validierung
  pages/            statisch erzeugte Seiten und dynamische Duell-/Parteirouten
  styles/           globales CSS
public/
  data/experiments/ Primär- und abgeleitete Daten je Experiment
  data/sha256sums.txt
  robots.txt
```

Jeder abgeschlossene Modelllauf besitzt einen eigenen Ordner unter `public/data/experiments/<experiment-id>/`. Die Website importiert die jeweiligen abgeleiteten `website-data.json`- und `usage.json`-Dateien über `src/data/experiments/*.ts` und baut daraus die modellbezogenen Seiten sowie die modellübergreifenden Vergleiche.

## Datenmodell

Das zentrale TypeScript-Modell steht in `src/lib/types.ts`. Ein `Experiment` enthält unter anderem Modell-ID, Promptrevision, Parameter, Seed, verwendete Parteibezeichnungen, Ranking, Paarergebnisse, Positionseffekt, Betriebskennzahlen und Provenienzangaben.

Aktuell veröffentlichte Hauptläufe:

- `gpt-5.6-sol-main-v2`
- `grok-4.3-main-v1`
- `opus-5-main-v1`

Ergebniszahlen werden nicht in den Darstellungskomponenten manuell gepflegt, sondern aus den versionierten Experimentdaten übernommen.

## Datenintegrität

`npm run audit:data` liest die Primärdaten jedes abgeschlossenen Experiments neu ein und prüft unter anderem:

- 9.000 erfolgreiche eindeutige Sequenzen je Hauptlauf
- vollständige Sequenznummern
- 45 Paarungen und zwei Reihenfolgen je Paar
- 100 erfolgreiche Entscheidungen je Reihenfolge
- 1.800 Beteiligungen je verwendeter Parteibezeichnung
- Parteisummen und Rangliste
- Reihenfolgeeffekte aller 45 Duelle
- Positionsstatistik und Konstanzwerte
- Token- und Kostenkennzahlen
- SHA-256-Prüfsummen der veröffentlichten Dateien

Der Daten-Audit ist Bestandteil der CI und läuft zusätzlich vor jedem statischen Build.

## Verwendete Parteibezeichnungen

Untersucht werden zehn vorab festgelegte Parteibezeichnungen. Die Auswahl erhebt keinen Anspruch auf Vollständigkeit. CDU und CSU werden für diese Experimente unter der gemeinsamen Bezeichnung `CDU/CSU` zusammengefasst.

## Primär- und Analysedaten

Jedes Experiment veröffentlicht mindestens:

- `manifest.json`: Versuchskonfiguration, Prompttexte und SHA-256-Hashes
- `jobs.jsonl`: eingefrorene Reihenfolge aller Jobs
- `results.jsonl`: protokollierte API-Versuche einschließlich Antworten, Fehlern, Retries und Usage-Daten
- `website-data.json`: abgeleitete Ergebnisdaten für die Website
- `pairwise-analysis.csv`: abgeleitete Duellanalyse
- `analysis-report.md`: statistische Basisanalyse
- `usage.json`: Betriebs-, Token-, Cache- und Kostenkennzahlen

Die Primärdaten werden nicht nachträglich verändert. Abgeleitete Dateien müssen mit den Primärdaten konsistent bleiben und werden durch Prüfsummen abgesichert.

## Modellvergleiche

Die modellübergreifenden Seiten vergleichen die beobachteten Ergebnisse der dokumentierten Läufe. Ein Unterschied zwischen Modellen ist kein allgemeiner Qualitäts- oder Neutralitätsnachweis. Provider-Infrastruktur, API-Verhalten und andere technische Randbedingungen können sich unterscheiden; solche Betriebskennzahlen werden deshalb getrennt von den inhaltlichen Auswahlmustern dargestellt.

## Deployment

`npm run build` erzeugt in `dist/` eine statische Website. Die Basisdomain ist in `astro.config.mjs` auf `https://ki-wahltest.de` gesetzt. Die CI führt Daten-Audit, Typechecks, Tests, Build, Site-Audit und Launch-Gate aus, aber bewusst kein Production-Deployment.


## Methodischer Hinweis

Das Projekt beantwortet nicht „Welche Partei sollte man wählen?“, sondern untersucht, wie sich beobachtete Modellentscheidungen unter dokumentierten Bedingungen unterscheiden. Eine beobachtete Häufigkeit von 100/100 oder 200/200 ist eine Beschreibung des jeweiligen Laufs und keine Garantie einer wahren Wahrscheinlichkeit von 100 Prozent.
