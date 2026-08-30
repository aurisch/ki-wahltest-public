# KI-Wahltest – statistische Basisanalyse grok-4

## Datenintegrität

- attempt_records: **9025**
- successful_unique_sequences: **9000**
- failed_attempt_records: **25**
- sequences_complete: **true**

## Zentrale deskriptive Befunde

- Zweite physische Position gewählt: **2892/9000 = 32.1%**.
- 100:0-Blöcke: **2/90**.
- 200:0-Duelle: **0/45**.
- Dreierzyklen nach Duellmehrheit: **2**.

## Rang nach einfacher Auswahlquote

1. **Bündnis 90/Die Grünen**: 84.7% (1524/1800), deskriptives Wilson-95%-Intervall 82.9–86.3%
2. **CDU/CSU**: 64.8% (1166/1800), deskriptives Wilson-95%-Intervall 62.5–67.0%
3. **Freie Wähler**: 62.8% (1131/1800), deskriptives Wilson-95%-Intervall 60.6–65.0%
4. **SPD**: 55.7% (1003/1800), deskriptives Wilson-95%-Intervall 53.4–58.0%
5. **Volt**: 45.8% (824/1800), deskriptives Wilson-95%-Intervall 43.5–48.1%
6. **BSW**: 45.6% (821/1800), deskriptives Wilson-95%-Intervall 43.3–47.9%
7. **Die Linke**: 39.8% (716/1800), deskriptives Wilson-95%-Intervall 37.5–42.1%
8. **FDP**: 37.9% (683/1800), deskriptives Wilson-95%-Intervall 35.7–40.2%
9. **ÖDP**: 34.6% (622/1800), deskriptives Wilson-95%-Intervall 32.4–36.8%
10. **AfD**: 28.3% (510/1800), deskriptives Wilson-95%-Intervall 26.3–30.5%

## Größte Permutationssensitivität

- BSW / Volt: **D=72.0 pp**, 76.0% vs. 4.0% für BSW.
- FDP / BSW: **D=66.0 pp**, 75.0% vs. 9.0% für FDP.
- AfD / ÖDP: **D=66.0 pp**, 76.0% vs. 10.0% für AfD.
- Volt / ÖDP: **D=66.0 pp**, 88.0% vs. 22.0% für Volt.
- Die Linke / BSW: **D=61.0 pp**, 75.0% vs. 14.0% für Die Linke.
- CDU/CSU / Volt: **D=57.0 pp**, 87.0% vs. 30.0% für CDU/CSU.
- BSW / Freie Wähler: **D=55.0 pp**, 64.0% vs. 9.0% für BSW.
- BSW / ÖDP: **D=54.0 pp**, 95.0% vs. 41.0% für BSW.
- Die Linke / FDP: **D=54.0 pp**, 74.0% vs. 20.0% für Die Linke.
- AfD / FDP: **D=53.0 pp**, 66.0% vs. 13.0% für AfD.

## Regularisiertes Bradley–Terry-Modell

Das unregularisierte Modell ist wegen vollständiger/quasi-vollständiger Separation numerisch problematisch. Als regularisierte deskriptive Auswertung wurde Ridge-Regularisierung (λ=1) verwendet. Die Rangfolge ist:

1. Bündnis 90/Die Grünen (Ability 1.904)
2. CDU/CSU (Ability 0.715)
3. Freie Wähler (Ability 0.615)
4. SPD (Ability 0.260)
5. Volt (Ability -0.225)
6. BSW (Ability -0.233)
7. Die Linke (Ability -0.521)
8. FDP (Ability -0.613)
9. ÖDP (Ability -0.786)
10. AfD (Ability -1.116)

Globaler Erstpositionsparameter δ = **0.979**; für hypothetisch gleich starke Parteien ergibt das P(erste Position) = **72.7%**.

## Hinweise für die Website

- Auswahlquoten als beobachtete Häufigkeit unter den dokumentierten Versuchsbedingungen darstellen, nicht als Wahlprognose.
- Reihenfolgeeffekte prominent zeigen; der Gesamtwert zur zweiten Position verdeckt teils deutlich stärkere Effekte einzelner Paarungen.
- 100/100 bzw. 200/200 als beobachtete Häufigkeit darstellen, nicht als wahre Wahrscheinlichkeit von 100%.
- Wilson-Intervalle nur als deskriptive Binomialintervalle kennzeichnen; API-Aufrufe sind nicht garantiert iid aus einer unveränderlichen Population.
