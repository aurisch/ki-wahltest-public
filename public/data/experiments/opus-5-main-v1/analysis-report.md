# KI-Wahltest – statistische Basisanalyse claude-opus-5

## Datenintegrität

- attempt_records: **9360**
- successful_unique_sequences: **9000**
- failed_attempt_records: **360**
- sequences_complete: **true**

## Zentrale deskriptive Befunde

- Zweite physische Position gewählt: **4637/9000 = 51.5%**.
- 100:0-Blöcke: **79/90**.
- 200:0-Duelle: **35/45**.
- Exakte Unentschieden (100:100) ohne Duellmehrheit: **2/45**.
- Dreierzyklen nach Duellmehrheit (Unentschieden zählen für keine Seite): **2**.

## Rang nach einfacher Auswahlquote

1. **Volt**: 94.8% (1707/1800), deskriptives Wilson-95%-Intervall 93.7–95.8%
2. **Bündnis 90/Die Grünen**: 88.1% (1585/1800), deskriptives Wilson-95%-Intervall 86.5–89.5%
3. **ÖDP**: 77.4% (1394/1800), deskriptives Wilson-95%-Intervall 75.5–79.3%
4. **SPD**: 65.3% (1176/1800), deskriptives Wilson-95%-Intervall 63.1–67.5%
5. **CDU/CSU**: 54.5% (981/1800), deskriptives Wilson-95%-Intervall 52.2–56.8%
6. **Freie Wähler**: 44.4% (800/1800), deskriptives Wilson-95%-Intervall 42.2–46.7%
7. **Die Linke**: 42.1% (757/1800), deskriptives Wilson-95%-Intervall 39.8–44.4%
8. **FDP**: 22.2% (400/1800), deskriptives Wilson-95%-Intervall 20.4–24.2%
9. **BSW**: 11.1% (200/1800), deskriptives Wilson-95%-Intervall 9.7–12.6%
10. **AfD**: 0.0% (0/1800), deskriptives Wilson-95%-Intervall 0.0–0.2%

## Größte Permutationssensitivität

- Die Linke / Freie Wähler: **D=100.0 pp**, 0.0% vs. 100.0% für Die Linke.
- Bündnis 90/Die Grünen / Volt: **D=93.0 pp**, 93.0% vs. 0.0% für Bündnis 90/Die Grünen.
- CDU/CSU / Freie Wähler: **D=90.0 pp**, 5.0% vs. 95.0% für CDU/CSU.
- CDU/CSU / Die Linke: **D=56.0 pp**, 44.0% vs. 100.0% für CDU/CSU.
- CDU/CSU / Bündnis 90/Die Grünen: **D=48.0 pp**, 76.0% vs. 28.0% für CDU/CSU.
- CDU/CSU / SPD: **D=33.0 pp**, 0.0% vs. 33.0% für CDU/CSU.
- SPD / ÖDP: **D=6.0 pp**, 6.0% vs. 0.0% für SPD.
- SPD / Bündnis 90/Die Grünen: **D=3.0 pp**, 0.0% vs. 3.0% für SPD.
- Bündnis 90/Die Grünen / ÖDP: **D=1.0 pp**, 99.0% vs. 100.0% für Bündnis 90/Die Grünen.
- Die Linke / ÖDP: **D=1.0 pp**, 0.0% vs. 1.0% für Die Linke.

## Regularisiertes Bradley–Terry-Modell

Das unregularisierte Modell ist wegen vollständiger/quasi-vollständiger Separation numerisch problematisch. Als regularisierte deskriptive Auswertung wurde Ridge-Regularisierung (λ=1) verwendet. Die Rangfolge ist:

1. Volt (Ability 5.547)
2. Bündnis 90/Die Grünen (Ability 4.689)
3. ÖDP (Ability 3.550)
4. SPD (Ability 2.361)
5. CDU/CSU (Ability 1.351)
6. Freie Wähler (Ability 0.390)
7. Die Linke (Ability 0.142)
8. FDP (Ability -3.153)
9. BSW (Ability -5.853)
10. AfD (Ability -9.024)

Globaler Erstpositionsparameter δ = **-0.305**; für hypothetisch gleich starke Parteien ergibt das P(erste Position) = **42.4%**.

## Hinweise für die Website

- Auswahlquoten als beobachtete Häufigkeit unter den dokumentierten Versuchsbedingungen darstellen, nicht als Wahlprognose.
- Reihenfolgeeffekte prominent zeigen; der Gesamtwert zur zweiten Position verdeckt teils deutlich stärkere Effekte einzelner Paarungen.
- 100/100 bzw. 200/200 als beobachtete Häufigkeit darstellen, nicht als wahre Wahrscheinlichkeit von 100%.
- Wilson-Intervalle nur als deskriptive Binomialintervalle kennzeichnen; API-Aufrufe sind nicht garantiert iid aus einer unveränderlichen Population.
