import { tool } from "ai";
import { z } from "zod";
import { BladApi, blad, bladPolaczenia, pobierzJson, pobrano } from "./wspolne";

// Dane: Nager.Date (date.nager.at/api/v3/PublicHolidays/{rok}/{kraj}), bez klucza.

type Swieto = {
  date: string;
  localName: string;
  name: string;
  global: boolean;
  types: string[];
};

const wejscie = z.object({
  kraj: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, "Dwuliterowy kod kraju")
    .describe("Dwuliterowy kod kraju ISO 3166-1, np. PL, DE, GB, US"),
  rok: z.number().int().min(1900).max(2100).describe("Rok, np. 2026"),
});

// Zwykła funkcja z całą logiką — używa jej narzędzie agenta i strona /dashboard.
export async function swietaWRoku({ kraj, rok }: z.input<typeof wejscie>) {
  const kod = kraj.toUpperCase();
  try {
    const lista = await pobierzJson<Swieto[]>(`https://date.nager.at/api/v3/PublicHolidays/${rok}/${kod}`);
    if (!lista || lista.length === 0) {
      return blad(`Nie mam danych o świętach dla kraju ${kod} w roku ${rok}.`);
    }
    // Zostawiamy dni ustawowo wolne („Public”). Gdyby takich nie było, pokazujemy wszystkie.
    const wolne = lista.filter((s) => s.types.includes("Public"));
    const wybrane = wolne.length > 0 ? wolne : lista;
    return {
      kraj: kod,
      rok,
      liczba: wybrane.length,
      swieta: wybrane.map((s) => ({
        data: s.date,
        nazwa: s.localName,
        nazwaAngielska: s.name,
        ogolnokrajowe: s.global,
      })),
      zrodlo: "Nager.Date",
      pobrano: pobrano(),
    };
  } catch (e) {
    if (e instanceof BladApi && e.status === 404) {
      return blad(`Nie znam kraju o kodzie „${kod}”. Podaj dwuliterowy kod, np. PL, DE, FR.`);
    }
    if (e instanceof BladApi && e.status === 400) {
      return blad(`Nager.Date nie ma danych na rok ${rok}. Spróbuj innego roku.`);
    }
    return bladPolaczenia("Nager.Date", e);
  }
}

export const swieta = tool({
  description:
    "Lista dni wolnych od pracy (świąt państwowych) w podanym kraju i roku. " +
    "Użyj, gdy ktoś pyta o święta, długie weekendy, dni wolne albo czy dany dzień jest wolny w jakimś kraju.",
  inputSchema: wejscie,
  execute: swietaWRoku,
});
