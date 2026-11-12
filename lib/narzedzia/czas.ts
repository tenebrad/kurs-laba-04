import { tool } from "ai";
import { z } from "zod";
import { blad, pobrano } from "./wspolne";

// Dawne narzędzie „aktualnyCzas”, rozszerzone o dowolną strefę czasową.
// Domyślnie nadal zwraca czas w Polsce.

// Przesunięcie strefy względem UTC w minutach, w danej chwili (uwzględnia czas letni).
function przesuniecieMinuty(strefa: string, chwila: Date): number {
  const czesci = new Intl.DateTimeFormat("en-US", {
    timeZone: strefa,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(chwila);
  const pole = (typ: string) => Number(czesci.find((c) => c.type === typ)?.value);
  const jakUtc = Date.UTC(pole("year"), pole("month") - 1, pole("day"), pole("hour"), pole("minute"), pole("second"));
  return Math.round((jakUtc - chwila.getTime()) / 60_000);
}

// Różnica względem Polski, np. „+8 h”, „−1 h”, „+5,5 h”, „bez różnicy”.
function roznicaWzgledemPolski(strefa: string, chwila: Date): string {
  const godziny = (przesuniecieMinuty(strefa, chwila) - przesuniecieMinuty("Europe/Warsaw", chwila)) / 60;
  if (godziny === 0) return "bez różnicy";
  const liczba = Math.abs(godziny).toLocaleString("pl-PL", { maximumFractionDigits: 2 });
  return `${godziny > 0 ? "+" : "−"}${liczba} h`;
}

const wejscie = z.object({
  strefa: z
    .string()
    .trim()
    .max(64)
    .optional()
    .describe("Strefa czasowa IANA, np. Europe/Warsaw, Europe/London, America/New_York, Asia/Tokyo. Domyślnie Europe/Warsaw."),
});

// Zwykła funkcja z całą logiką — używa jej narzędzie agenta i strona /dashboard.
export async function czasWStrefie({ strefa = "Europe/Warsaw" }: z.input<typeof wejscie>) {
  try {
    new Intl.DateTimeFormat("pl-PL", { timeZone: strefa }); // sprawdza, czy strefa istnieje
  } catch {
    return blad(`Nie znam strefy czasowej „${strefa}”. Użyj nazwy w formacie Kontynent/Miasto, np. Europe/London.`);
  }

  const teraz = new Date();
  const format = (opcje: Intl.DateTimeFormatOptions, jezyk = "pl-PL") =>
    new Intl.DateTimeFormat(jezyk, { timeZone: strefa, ...opcje }).format(teraz);
  const przesuniecie =
    new Intl.DateTimeFormat("en-US", { timeZone: strefa, timeZoneName: "shortOffset" })
      .formatToParts(teraz)
      .find((czesc) => czesc.type === "timeZoneName")?.value ?? "";

  return {
    data: format({ year: "numeric", month: "long", day: "numeric" }),
    dataIso: format({ year: "numeric", month: "2-digit", day: "2-digit" }, "en-CA"), // RRRR-MM-DD
    dzienTygodnia: format({ weekday: "long" }),
    godzina: format({ hour: "2-digit", minute: "2-digit" }),
    strefa,
    przesuniecie, // np. GMT+1
    roznicaWzgledemPolski: roznicaWzgledemPolski(strefa, teraz),
    pobrano: pobrano(),
  };
}

export const czas = tool({
  description:
    "Aktualna data, dzień tygodnia i godzina w podanej strefie czasowej (domyślnie Polska, Europe/Warsaw). " +
    "Użyj zawsze, gdy pytanie zależy od bieżącej daty lub godziny: „dziś”, „jutro”, „wczoraj”, „za ile dni”, " +
    "„który dziś dzień”, „ile zostało do…”, „która godzina w Tokio”. Nie zgaduj daty z pamięci.",
  inputSchema: wejscie,
  execute: czasWStrefie,
});
