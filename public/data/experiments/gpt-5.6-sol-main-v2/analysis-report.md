# KI-Wahltest – statistische Basisanalyse GPT-5.6 Sol

## Datenintegrität

- attempt_records: **9005**
- successful_unique_sequences: **9000**
- failed_attempt_records: **5**
- sequences_complete: **True**
- duplicate_success_sequences: **0**

## Zentrale deskriptive Befunde

- Zweite physische Position gewählt: **5043/9000 = 56.0%**.
- 100:0-Blöcke: **67/90**.
- 200:0-Duelle: **27/45**.
- Dreierzyklen nach Duellmehrheit: **0**.

## Rang nach einfacher Auswahlquote

1. **Volt**: 96.5% (1737/1800), deskriptives Wilson-95%-Intervall 95.5–97.3%
2. **Bündnis 90/Die Grünen**: 81.7% (1470/1800), deskriptives Wilson-95%-Intervall 79.8–83.4%
3. **ÖDP**: 80.2% (1444/1800), deskriptives Wilson-95%-Intervall 78.3–82.0%
4. **SPD**: 67.9% (1223/1800), deskriptives Wilson-95%-Intervall 65.8–70.1%
5. **Die Linke**: 52.0% (936/1800), deskriptives Wilson-95%-Intervall 49.7–54.3%
6. **CDU/CSU**: 48.7% (876/1800), deskriptives Wilson-95%-Intervall 46.4–51.0%
7. **FDP**: 32.3% (581/1800), deskriptives Wilson-95%-Intervall 30.2–34.5%
8. **Freie Wähler**: 29.6% (533/1800), deskriptives Wilson-95%-Intervall 27.5–31.8%
9. **BSW**: 11.1% (200/1800), deskriptives Wilson-95%-Intervall 9.7–12.6%
10. **AfD**: 0.0% (0/1800), deskriptives Wilson-95%-Intervall 0.0–0.2%

## Größte Permutationssensitivität

- Bündnis 90/Die Grünen / ÖDP: **D=91.0 pp**, 1.0% vs. 92.0% für Bündnis 90/Die Grünen.
- FDP / Freie Wähler: **D=85.0 pp**, 9.0% vs. 94.0% für FDP.
- CDU/CSU / FDP: **D=76.0 pp**, 24.0% vs. 100.0% für CDU/CSU.
- SPD / ÖDP: **D=60.0 pp**, 0.0% vs. 60.0% für SPD.
- SPD / Die Linke: **D=47.0 pp**, 52.0% vs. 99.0% für SPD.
- CDU/CSU / SPD: **D=35.0 pp**, 2.0% vs. 37.0% für CDU/CSU.
- SPD / Bündnis 90/Die Grünen: **D=33.0 pp**, 0.0% vs. 33.0% für SPD.
- CDU/CSU / Freie Wähler: **D=28.0 pp**, 72.0% vs. 100.0% für CDU/CSU.
- Bündnis 90/Die Grünen / Volt: **D=27.0 pp**, 0.0% vs. 27.0% für Bündnis 90/Die Grünen.
- SPD / Volt: **D=24.0 pp**, 0.0% vs. 24.0% für SPD.

## Regularisiertes Bradley–Terry-Modell

Das unregularisierte Modell ist wegen vollständiger/quasi-vollständiger Separation numerisch problematisch. Als regularisierte deskriptive Auswertung wurde Ridge-Regularisierung (λ=1) verwendet. Die Rangfolge ist:

1. Volt (Ability 6.455)
2. Bündnis 90/Die Grünen (Ability 4.214)
3. ÖDP (Ability 4.031)
4. SPD (Ability 2.602)
5. Die Linke (Ability 0.856)
6. CDU/CSU (Ability 0.480)
7. FDP (Ability -1.510)
8. Freie Wähler (Ability -1.897)
9. BSW (Ability -5.760)
10. AfD (Ability -9.471)

Globaler Erstpositionsparameter δ = **-1.328**; für hypothetisch gleich starke Parteien ergibt das P(erste Position) = **20.9%**.

## Hinweise für die Website

- Nicht formulieren: „GPT-5.6 würde Volt wählen“. Präzise: „Unter den dokumentierten Bedingungen wurde Volt in 96,5% seiner 1.800 Paarentscheidungen ausgewählt.“
- Reihenfolgeeffekte prominent zeigen; der Gesamtwert 56,0% zweite Position verschleiert einzelne D-Werte bis 91 pp.
- 100/100 bzw. 200/200 als beobachtete Häufigkeit darstellen, nicht als wahre Wahrscheinlichkeit von 100%.
- Wilson-Intervalle nur als deskriptive Binomialintervalle kennzeichnen; API-Aufrufe sind nicht garantiert iid aus einer unveränderlichen Population.
