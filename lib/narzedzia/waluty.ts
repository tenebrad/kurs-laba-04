import { tool } from "ai";
import { z } from "zod";
import { BladApi, blad, bladPolaczenia, pobierzJson, pobrano, zaokraglij } from "./wspolne";

// Dane: API NBP (api.nbp.pl), bez klucza. Średni kurs z tabeli A (główne waluty),
// a gdy waluty tam nie ma — z tabeli B (pozostałe waluty).

type KursNbp = {
  table: string;
  currency: string;
  code: string;
  rates: { no: string; effectiveDate: string; mid: number }[];
};

const formatPl = (liczba: number) => liczba.toLocaleString("pl-PL", { maximumFractionDigits: 4 });

async function kursZTabeli(tabela: "a" | "b", kod: string): Promise<KursNbp | null> {
  try {
    return await pobierzJson<KursNbp>(`https://api.nbp.pl/api/exchangerates/rates/${tabela}/${kod}/?format=json`);
  } catch (e) {
    if (e instanceof BladApi && e.status === 404) return null; // NBP: „404 NotFound - Brak danych”
    throw e;
  }
}

const wejscie = z.object({
  waluta: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, "Trzyliterowy kod waluty")
    .describe("Trzyliterowy kod waluty ISO 4217, np. EUR, USD, GBP, CHF"),
  kwota: z.number().positive().max(1_000_000_000_000).optional().describe("Kwota do przeliczenia (opcjonalnie)"),
  kierunek: z
    .enum(["na_zlote", "ze_zlotych"])
    .optional()
    .describe("na_zlote: kwota jest w walucie obcej; ze_zlotych: kwota jest w złotych. Domyślnie na_zlote."),
});

// Zwykła funkcja z całą logiką — używa jej narzędzie agenta i strona /dashboard.
export async function kursWaluty({ waluta, kwota, kierunek = "na_zlote" }: z.input<typeof wejscie>) {
  const kod = waluta.toUpperCase();
  if (kod === "PLN") {
    return blad("Złoty jest walutą bazową NBP — podaj walutę obcą, np. EUR albo USD.");
  }
  try {
    const dane = (await kursZTabeli("a", kod)) ?? (await kursZTabeli("b", kod));
    const kurs = dane?.rates[0];
    if (!dane || !kurs) {
      return blad(`NBP nie podaje kursu waluty „${kod}”. Sprawdź kod, np. EUR, USD, GBP.`);
    }

    const wynik = { waluta: kod, nazwa: dane.currency, kursSredniPln: kurs.mid, dataKursu: kurs.effectiveDate, tabelaNbp: kurs.no };
    if (kwota === undefined) return { ...wynik, zrodlo: "NBP", pobrano: pobrano() };

    const przeliczone = kierunek === "na_zlote" ? zaokraglij(kwota * kurs.mid) : zaokraglij(kwota / kurs.mid);
    const zapis =
      kierunek === "na_zlote"
        ? `${formatPl(kwota)} ${kod} = ${formatPl(przeliczone)} PLN`
        : `${formatPl(kwota)} PLN = ${formatPl(przeliczone)} ${kod}`;
    return { ...wynik, kwota, kierunek, wynik: przeliczone, zapis, zrodlo: "NBP", pobrano: pobrano() };
  } catch (e) {
    return bladPolaczenia("API NBP", e);
  }
}

export const waluty = tool({
  description:
    "Aktualny średni kurs waluty wobec złotego według NBP i przeliczenie kwoty. " +
    "Użyj, gdy ktoś pyta o kurs euro, dolara, franka itd. albo chce przeliczyć kwotę na złote lub ze złotych. " +
    "Nie zgaduj kursów z pamięci.",
  inputSchema: wejscie,
  execute: kursWaluty,
});
