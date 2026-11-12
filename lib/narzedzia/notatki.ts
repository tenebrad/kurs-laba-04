import { tool } from "ai";
import { z } from "zod";
import { blad, pobrano } from "./wspolne";

// Notatki w pamięci serwera. Znikają po restarcie (bazę danych dodamy na następnej lekcji).
// Uwaga: wszyscy zalogowani widzą te same notatki, a na Vercel każda instancja serwera ma własną pamięć.

type Notatka = { id: number; tresc: string; zapisano: string };

const MAX_NOTATEK = 50;
const MAX_ZNAKOW = 500;

// Trzymamy listę w globalThis, żeby przetrwała przeładowanie kodu w trybie dev.
const globalny = globalThis as unknown as { notatkiAgenta?: { lista: Notatka[]; nastepneId: number } };
const magazyn = (globalny.notatkiAgenta ??= { lista: [], nastepneId: 1 });

const UWAGA = "Notatki są w pamięci serwera i znikną po jego restarcie.";

export const notatki = tool({
  description:
    "Zapisuje krótką notatkę albo pokazuje zapisane notatki. " +
    "Użyj akcji „zapisz”, gdy ktoś prosi: zanotuj, zapamiętaj, zapisz. " +
    "Użyj akcji „pokaz”, gdy ktoś pyta o swoje notatki albo o to, co zapisał wcześniej.",
  inputSchema: z.object({
    akcja: z.enum(["zapisz", "pokaz"]).describe("zapisz = dodaj notatkę, pokaz = pokaż zapisane notatki"),
    tresc: z.string().max(MAX_ZNAKOW).optional().describe(`Treść notatki (tylko przy „zapisz”, do ${MAX_ZNAKOW} znaków)`),
  }),
  execute: async ({ akcja, tresc }) => {
    if (akcja === "pokaz") {
      return { liczba: magazyn.lista.length, notatki: magazyn.lista, uwaga: UWAGA, pobrano: pobrano() };
    }

    const tekst = tresc?.trim();
    if (!tekst) return blad("Brak treści notatki. Napisz, co mam zapisać.");

    const notatka: Notatka = { id: magazyn.nastepneId++, tresc: tekst, zapisano: pobrano() };
    magazyn.lista.push(notatka);
    // Przy limicie usuwamy najstarszą notatkę, żeby pamięć serwera nie rosła bez końca.
    const usunieta = magazyn.lista.length > MAX_NOTATEK ? magazyn.lista.shift() : undefined;

    return {
      zapisano: notatka,
      liczba: magazyn.lista.length,
      ...(usunieta && { usunietoNajstarsza: usunieta.tresc }),
      uwaga: UWAGA,
      pobrano: pobrano(),
    };
  },
});
