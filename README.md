# Starter — agent po lekcji 3

Gotowa, działająca aplikacja w stanie „po lekcji 3”. Użyj jej, jeśli Twój projekt z poprzednich zajęć nie działa albo chcesz zacząć lekcję 4 z czystego miejsca.

## Co już działa

- czat z odpowiedzią pisaną na żywo (streaming),
- ekran hasła — bez hasła nikt nie wejdzie do czatu ani do modelu,
- charakter chatbota i przykłady odpowiedzi (plik `lib/persona.ts`),
- **wyszukiwanie w internecie** — pod odpowiedzią lista „Źródła” z linkami i dopiskiem „pobrano: data i godzina”,
- **narzędzia agenta** (każde w osobnym pliku w `lib/narzedzia/`): `pogoda` (Open-Meteo), `waluty` (NBP), `swieta` (Nager.Date), `wikipedia`, `kalkulator`, `czas` (dowolna strefa, domyślnie Polska), `notatki` (w pamięci serwera), `bestiariusz` i `ksiegaCzarow` (D&D 5e, Open5e), `diagnostyka`,
- **lista kroków agenta** nad odpowiedzią, np. „1. 🌤️ pogoda → 2. 💱 waluty → 3. 🧮 kalkulator”,
- **przycisk „Stop”** podczas pracy agenta — przerywa zadanie także na serwerze (na Vercel wymaga `supportsCancellation` w `vercel.json`, już ustawione); pod odpowiedzią: liczba kroków, wywołań narzędzi i czas,
- **zdjęcia (Vision)** — przycisk „Dodaj zdjęcie” (jpg, png, webp, do 4 MB), miniatura w rozmowie,
- **generowanie obrazów** — przycisk „Wygeneruj obraz”, podpowiedzi opisów, przycisk „Pobierz”, nazwa modelu pod obrazem,
- **asystent podróży `/dashboard`** (tylko po zalogowaniu) — miasto i data → pięć kart: pogoda, waluta, najbliższe święta, opis z Wikipedii, czas na miejscu; dane z tych samych funkcji co narzędzia agenta (`lib/podroz.ts`); każda karta pobierana osobno (`/api/podroz/karta`) ze stanem „OK / Ładuję… / Brak danych” — awaria jednego źródła nie psuje reszty i nigdy nie wstawiamy danych zastępczych; pod kartami podsumowanie od agenta z informacją, których źródeł zabrakło (`/api/podroz/podsumowanie`), oraz zakładka **„Porównaj”**: dwa miasta i ten sam termin, karty obok siebie i rekomendacja agenta z uzasadnieniem z danych kart (`/api/podroz/porownanie`, wynik w ustalonym kształcie: A albo B),
- **jeden endpoint `/api/agent`** — tryb `chat` (pętla agenta w `lib/agent.ts` z limitami z `lib/limity.ts`: 6 kroków, 16 wywołań narzędzi, 10 s na narzędzie, 60 s na zadanie; po limicie — podsumowanie częściowe) i tryb `analyze` (przycisk „Analiza JSON”).

## Uruchomienie (5 minut)

1. Skopiuj ten folder w swoje miejsce na projekty (np. `Dokumenty/projekty/moj-agent`) i otwórz w nim terminal.
2. Zainstaluj biblioteki:

   ```bash
   npm install
   ```

   W Windows PowerShell wpisuj `npm.cmd` zamiast `npm`.

3. Skopiuj plik `.env.example` jako `.env.local` i uzupełnij cztery wartości. Jeśli masz `.env.local` z poprzedniego projektu — po prostu skopiuj go tutaj, nazwy są te same. Sprawdź tylko, czy model to `google/gemini-3.8-flash` (wyszukiwanie i zdjęcia działają z modelami Gemini).
4. Uruchom:

   ```bash
   npm run dev
   ```

5. Otwórz http://localhost:3000, wpisz swoje hasło i zapytaj: „Ile dni zostało do końca roku?”. Nad odpowiedzią powinna pojawić się etykieta „🕒 czas”.

## Zrób z niego swój projekt

Otwórz `lib/persona.ts` i zmień nazwę, powitanie, opis, przykłady oraz podpowiedzi obrazów na własny temat. Albo poproś asystenta:

```text
Zmień chatbota w pliku lib/persona.ts na: [opisz swój pomysł, np. asystent małej kwiaciarni w Krakowie].
Dopasuj nazwę, powitanie, zasady, dwa przykłady odpowiedzi i trzy podpowiedzi obrazów. Reszty aplikacji nie zmieniaj.
```

## Gdzie co jest

| Plik | Co robi |
|---|---|
| `lib/persona.ts` | charakter chatbota, zasady używania narzędzi, podpowiedzi obrazów, kształt analizy JSON |
| `lib/tools.ts` | zestaw narzędzi agenta (wyszukiwanie, `generujObraz` i narzędzia z `lib/narzedzia/`) |
| `lib/model.ts` | połączenie z modelem przez OpenRouter (rozmowa, obrazy, wyszukiwanie) |
| `lib/session.ts` | hasło i sesja |
| `app/api/agent/route.ts` | agent: tryb `chat` (streaming i narzędzia) oraz tryb `analyze` (analiza JSON) |
| `app/api/image/route.ts` | generowanie obrazu z przycisku „Wygeneruj obraz” |
| `app/components/Chat.tsx` | wygląd czatu: etykiety narzędzi, źródła, zdjęcia, obrazy |
