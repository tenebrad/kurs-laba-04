import { tool } from "ai";
import { z } from "zod";
import { IMAGE_MODEL_ID, MODEL_ID } from "@/lib/model";
import { pobrano } from "./wspolne";

// Diagnostyka agenta. Zmienne środowiskowe sprawdzamy tylko na „tak/nie” — nigdy nie zwracamy ich wartości.
const WYMAGANE_ZMIENNE = ["OPENROUTER_API_KEY", "OPENROUTER_MODEL", "CHAT_PASSWORD", "SESSION_SECRET"] as const;

// Lista narzędzi i limit kroków przychodzą z lib/tools.ts (tam składamy cały zestaw).
type Informacje = {
  narzedzia: string[];
  limitKrokow: number;
  limitWywolanNarzedzi: number;
  limitCzasuZadaniaS: number;
  limitCzasuNarzedziaS: number;
};

export function diagnostykaTool(informacje: () => Informacje) {
  return tool({
    description:
      "Diagnostyka agenta: nazwa modelu, lista dostępnych narzędzi, limity (kroki, wywołania narzędzi, czas) i to, czy wymagane zmienne " +
      "środowiskowe są ustawione (tylko tak/nie). Użyj, gdy ktoś pyta, jak agent jest skonfigurowany, " +
      "jakie ma narzędzia albo dlaczego coś nie działa.",
    inputSchema: z.object({}),
    execute: async () => {
      const { narzedzia, ...limity } = informacje();
      const zmienne = Object.fromEntries(
        WYMAGANE_ZMIENNE.map((nazwa) => [nazwa, process.env[nazwa]?.trim() ? "tak" : "nie"]),
      );
      return {
        model: MODEL_ID,
        modelObrazow: IMAGE_MODEL_ID,
        narzedzia,
        limity,
        zmienneUstawione: zmienne,
        pobrano: pobrano(),
      };
    },
  });
}
