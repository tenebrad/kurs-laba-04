// Wspólne funkcje dla narzędzi agenta: pobieranie danych z API,
// godzina pobrania i czytelne komunikaty błędów po polsku.

// Wikipedia prosi, żeby każdy program przedstawiał się własną nazwą.
const USER_AGENT = "KursAgentAI/0.1 (projekt edukacyjny; Next.js)";
// Pojedyncze zapytanie do API czeka najwyżej 10 s (cały limit narzędzia pilnuje lib/limity.ts).
export const LIMIT_CZASU_MS = 10_000;

// Błąd z odpowiedzi API (np. 404 albo 400). Trzymamy kod i treść, żeby dobrać komunikat.
export class BladApi extends Error {
  status: number;
  tresc: string;

  constructor(status: number, tresc: string) {
    super(`HTTP ${status}`);
    this.status = status;
    this.tresc = tresc;
  }
}

// Pobiera JSON. Rzuca BladApi, gdy serwer odpowie błędem; zwraca null przy pustej odpowiedzi (204).
export async function pobierzJson<T>(url: string): Promise<T | null> {
  const odpowiedz = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(LIMIT_CZASU_MS),
    cache: "no-store",
  });
  if (!odpowiedz.ok) {
    throw new BladApi(odpowiedz.status, await odpowiedz.text().catch(() => ""));
  }
  if (odpowiedz.status === 204) return null;
  return (await odpowiedz.json()) as T;
}

// Data i godzina pobrania danych (czas polski).
export function pobrano(): string {
  return new Date().toLocaleString("pl-PL", {
    timeZone: "Europe/Warsaw",
    dateStyle: "short",
    timeStyle: "medium",
  });
}

// Wynik narzędzia, gdy coś poszło nie tak. Model dostaje zwykły tekst zamiast awarii aplikacji.
// niedostepne = źródło nie odpowiedziało (warto odświeżyć); bez tego pola = źródło odpowiedziało, ale danych nie ma.
export type Blad = { blad: string; pobrano: string; niedostepne?: true };

export function blad(tekst: string): Blad {
  return { blad: tekst, pobrano: pobrano() };
}

// Komunikat, gdy API nie odpowiada albo zwraca nieoczekiwany błąd.
export function bladPolaczenia(zrodlo: string, e: unknown): Blad {
  const niedostepne = (tekst: string): Blad => ({ ...blad(tekst), niedostepne: true });
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
    return niedostepne(`Źródło nie odpowiada (${zrodlo}) — minęło ${LIMIT_CZASU_MS / 1000} s. Nie udało się tego sprawdzić.`);
  }
  if (e instanceof BladApi) {
    return niedostepne(`Źródło danych (${zrodlo}) zwróciło błąd, kod ${e.status}. Spróbuj za chwilę.`);
  }
  return niedostepne(`Brak połączenia ze źródłem danych (${zrodlo}). Spróbuj za chwilę.`);
}

// Zaokrąglenie do 2 miejsc po przecinku (kwoty, temperatury).
export function zaokraglij(liczba: number, miejsca = 2): number {
  const mnoznik = 10 ** miejsca;
  return Math.round(liczba * mnoznik) / mnoznik;
}
