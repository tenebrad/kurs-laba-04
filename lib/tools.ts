import { generateImage, tool } from "ai";
import { z } from "zod";
import { MAX_STEPS, MAX_TOOL_CALLS, TASK_TIMEOUT_MS, TOOL_TIMEOUT_MS, type StopReason } from "@/lib/limity";
import { imageModel, webSearchTool } from "@/lib/model";
import { bestiariusz } from "@/lib/narzedzia/bestiariusz";
import { czas } from "@/lib/narzedzia/czas";
import { diagnostykaTool } from "@/lib/narzedzia/diagnostyka";
import { kalkulator } from "@/lib/narzedzia/kalkulator";
import { ksiegaCzarow } from "@/lib/narzedzia/ksiegaCzarow";
import { notatki } from "@/lib/narzedzia/notatki";
import { pogoda } from "@/lib/narzedzia/pogoda";
import { swieta } from "@/lib/narzedzia/swieta";
import { waluty } from "@/lib/narzedzia/waluty";
import { wikipedia } from "@/lib/narzedzia/wikipedia";

// ============================================================
// NARZĘDZIA AGENTA.
// Model sam decyduje, którego użyć — na podstawie opisu (description).
// Każde narzędzie ma własny plik w lib/narzedzia/. Nowe dopisujesz do agentTools poniżej,
// a jego etykietę w app/components/Chat.tsx (TOOL_LABELS).
// ============================================================

// Limity pętli agenta (kroki, wywołania narzędzi, czas) są w lib/limity.ts.
export { MAX_STEPS } from "@/lib/limity";
export const MAX_IMAGE_PROMPT = 500;

// Wynik generowania obrazu — w tej postaci trafia do przeglądarki.
export type ImageResult = {
  image?: string; // obraz jako adres "data:image/png;base64,..."
  model?: string; // identyfikator modelu z odpowiedzi API
  error?: string; // komunikat po polsku, gdy się nie udało
};

// Dodatkowe informacje o odpowiedzi, które serwer dosyła do przeglądarki.
export type AgentMetadata = {
  model?: string; // model, który faktycznie odpowiedział
  fetchedAt?: string; // data i godzina odpowiedzi (dla listy „Źródła”)
  stoppedAtLimit?: boolean; // agent skończył wcześniej przez limit
  stopReason?: StopReason; // który limit zadziałał
  stepCount?: number; // ile kroków modelu wykonał agent
  toolCallCount?: number; // ile razy wywołał narzędzia
  durationMs?: number; // ile trwało całe zadanie
};

// Wspólna funkcja: używa jej endpoint /api/image oraz narzędzie generujObraz.
export async function createImage(prompt: string): Promise<ImageResult> {
  try {
    const result = await generateImage({ model: imageModel(), prompt });
    return {
      image: `data:${result.image.mediaType};base64,${result.image.base64}`,
      model: result.calls[0]?.response.modelId,
    };
  } catch {
    return {
      error: "Nie udało się wygenerować obrazu. Model obrazów może być teraz niedostępny — spróbuj za chwilę.",
    };
  }
}

const generujObraz = tool({
  description:
    "Generuje obraz na podstawie opisu. Użyj, gdy użytkownik prosi o grafikę, plakat, logo, ilustrację lub zdjęcie. " +
    "Obraz zobaczy użytkownik w rozmowie — nie wklejaj go do odpowiedzi.",
  inputSchema: z.object({
    opis: z.string().min(1).max(MAX_IMAGE_PROMPT).describe("Dokładny opis obrazu: co na nim jest, styl, kolory"),
  }),
  execute: async ({ opis }) => createImage(opis),
  // Do przeglądarki idzie cały obraz, ale do modelu wraca tylko krótki tekst.
  toModelOutput: ({ output }) => ({
    type: "text",
    value: output.error ? `Błąd: ${output.error}` : "obraz wygenerowany",
  }),
});

// Lista nazw narzędzi dla diagnostyki — uzupełniamy ją zaraz po złożeniu zestawu.
const nazwyNarzedzi: string[] = [];

export const agentTools = {
  // Wyszukiwanie wykonuje OpenRouter (Google), reszta to nasze funkcje.
  wyszukiwanie: webSearchTool(),
  generujObraz,
  pogoda,
  waluty,
  swieta,
  wikipedia,
  kalkulator,
  czas,
  notatki,
  bestiariusz,
  ksiegaCzarow,
  diagnostyka: diagnostykaTool(() => ({
    narzedzia: nazwyNarzedzi,
    limitKrokow: MAX_STEPS,
    limitWywolanNarzedzi: MAX_TOOL_CALLS,
    limitCzasuZadaniaS: TASK_TIMEOUT_MS / 1000,
    limitCzasuNarzedziaS: TOOL_TIMEOUT_MS / 1000,
  })),
};

nazwyNarzedzi.push(...Object.keys(agentTools));
