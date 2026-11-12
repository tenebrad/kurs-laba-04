import { tool } from "ai";
import { z } from "zod";
import { blad, pobrano } from "./wspolne";

// Kalkulator: liczby przychodzą jako osobne argumenty, a działanie wybieramy z listy.
// Nigdy nie wykonujemy wpisanego tekstu jako kodu (żadnego eval).

const DZIALANIA = ["dodawanie", "odejmowanie", "mnozenie", "dzielenie", "potegowanie", "pierwiastek", "procent", "reszta"] as const;
type Dzialanie = (typeof DZIALANIA)[number];

// Usuwa „ogony” obliczeń na liczbach zmiennoprzecinkowych, np. 0.1 + 0.2 = 0.30000000000000004.
const ladnie = (x: number) => Number(x.toPrecision(12));

function policz(dzialanie: Dzialanie, a: number, b: number | undefined): { wynik: number; zapis: string } | string {
  const potrzebneB = dzialanie !== "pierwiastek";
  if (potrzebneB && b === undefined) return "To działanie potrzebuje dwóch liczb: a i b.";
  const y = b ?? 2;

  switch (dzialanie) {
    case "dodawanie":
      return { wynik: a + y, zapis: `${a} + ${y}` };
    case "odejmowanie":
      return { wynik: a - y, zapis: `${a} − ${y}` };
    case "mnozenie":
      return { wynik: a * y, zapis: `${a} × ${y}` };
    case "dzielenie":
      if (y === 0) return "Nie można dzielić przez zero.";
      return { wynik: a / y, zapis: `${a} ÷ ${y}` };
    case "reszta":
      if (y === 0) return "Nie można dzielić przez zero.";
      return { wynik: a % y, zapis: `${a} mod ${y}` };
    case "potegowanie":
      return { wynik: a ** y, zapis: `${a}^${y}` };
    case "pierwiastek":
      if (y === 0) return "Stopień pierwiastka nie może być zerem.";
      if (a < 0 && y % 2 === 0) return "Nie ma pierwiastka parzystego stopnia z liczby ujemnej.";
      return { wynik: a < 0 ? -Math.pow(-a, 1 / y) : Math.pow(a, 1 / y), zapis: `pierwiastek ${y}. stopnia z ${a}` };
    case "procent":
      return { wynik: (a / 100) * y, zapis: `${a}% z ${y}` };
  }
}

export const kalkulator = tool({
  description:
    "Dokładne obliczenia na liczbach: dodawanie, odejmowanie, mnożenie, dzielenie, potęgowanie, pierwiastek, procent, reszta z dzielenia. " +
    "Użyj zawsze, gdy odpowiedź wymaga liczenia — nie licz w pamięci. Przy kilku krokach wywołaj narzędzie kilka razy.",
  inputSchema: z.object({
    dzialanie: z
      .enum(DZIALANIA)
      .describe("Rodzaj działania. procent = a procent z b. pierwiastek = pierwiastek stopnia b z a (domyślnie kwadratowy)."),
    a: z.number().describe("Pierwsza liczba"),
    b: z.number().optional().describe("Druga liczba (przy pierwiastku: stopień, domyślnie 2)"),
  }),
  execute: async ({ dzialanie, a, b }) => {
    const wynik = policz(dzialanie, a, b);
    if (typeof wynik === "string") return blad(wynik);
    if (!Number.isFinite(wynik.wynik)) return blad("Wynik jest za duży albo nieokreślony.");
    const w = ladnie(wynik.wynik);
    return { dzialanie, a, b, wynik: w, zapis: `${wynik.zapis} = ${w}`, pobrano: pobrano() };
  },
});
