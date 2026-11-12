import type { ToolSet } from "ai";

// ============================================================
// LIMITY JEDNEGO ZADANIA AGENTA
// Kroki modelu pilnuje stopWhen w app/api/agent/route.ts, a tutaj pilnujemy reszty:
// liczby wywołań narzędzi, czasu pojedynczego narzędzia, powtórek po błędzie i czasu całego zadania.
// ============================================================

export const MAX_STEPS = 6; // kroki modelu na zadanie (ostatni zawsze bez narzędzi — podsumowanie)
export const MAX_TOOL_CALLS = 16; // wywołania narzędzi na zadanie (liczone osobno od kroków)
export const TASK_TIMEOUT_MS = 60_000; // twardy limit całego zadania
export const SUMMARY_AFTER_MS = 45_000; // po tym czasie następny krok to już podsumowanie
export const TOOL_TIMEOUT_MS = 10_000; // pojedyncze narzędzie czeka na API najwyżej tyle

// Wyjątek: generowanie obrazu trwa zwykle 8–15 s, więc przy 10 s często by się nie udało.
const TOOL_TIMEOUT_OVERRIDES_MS: Record<string, number> = { generujObraz: 30_000 };

// Dlaczego agent skończył wcześniej (pokazujemy to w czacie).
export type StopReason = "kroki" | "narzedzia" | "czas" | "przerwano" | "uzytkownik";

// Błąd z limitu: trafia do modelu jako wynik narzędzia (tool-error), więc model może go wyjaśnić.
class LimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LimitError";
  }
}

// Czy wynik narzędzia oznacza porażkę? Nasze narzędzia zwracają wtedy pole „blad”, a obraz — „error”.
function isFailure(output: unknown): boolean {
  return typeof output === "object" && output !== null && ("blad" in output || "error" in output);
}

// Klucz wywołania: nazwa narzędzia + dane wejściowe (do wykrywania powtórek).
function callKey(name: string, input: unknown): string {
  return `${name}:${JSON.stringify(input)}`;
}

// Czeka na narzędzie najwyżej `ms` milisekund.
async function withTimeout<T>(work: Promise<T>, ms: number, name: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new LimitError(
            `Źródło nie odpowiada — narzędzie „${name}” czekało ${ms / 1000} s. Nie udało się tego sprawdzić.`,
          ),
        ),
      ms,
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// Strażnik jednego zadania: owija narzędzia i zbiera statystyki.
export function createTaskGuard<TOOLS extends ToolSet>(baseTools: TOOLS) {
  const startedAt = Date.now();
  const failedCalls = new Set<string>();
  let toolCalls = 0;

  const wrapped = Object.fromEntries(
    Object.entries(baseTools).map(([name, baseTool]) => {
      const execute = baseTool.execute;
      // Narzędzia wykonywane przez dostawcę (wyszukiwanie OpenRouter) nie mają execute — zostawiamy je bez zmian.
      if (!execute) return [name, baseTool];

      return [
        name,
        {
          ...baseTool,
          execute: async (input: unknown, options: Parameters<typeof execute>[1]) => {
            toolCalls += 1;
            const key = callKey(name, input);

            if (toolCalls > MAX_TOOL_CALLS) {
              throw new LimitError(
                `Wyczerpany limit ${MAX_TOOL_CALLS} wywołań narzędzi na jedno zadanie. ` +
                  "Nie wywołuj już narzędzi — podsumuj to, co udało się ustalić.",
              );
            }
            if (failedCalls.has(key)) {
              throw new LimitError(
                `To samo wywołanie „${name}” już się nie udało w tym zadaniu — nie powtarzaj go. ` +
                  "Napisz, czego nie udało się sprawdzić, i podaj wynik częściowy.",
              );
            }

            const ms = TOOL_TIMEOUT_OVERRIDES_MS[name] ?? TOOL_TIMEOUT_MS;
            try {
              const output = await withTimeout(Promise.resolve(execute(input as never, options)), ms, name);
              if (isFailure(output)) failedCalls.add(key);
              return output;
            } catch (e) {
              failedCalls.add(key);
              throw e;
            }
          },
        },
      ];
    }),
  ) as TOOLS;

  return {
    tools: wrapped,
    elapsedMs: () => Date.now() - startedAt,
    toolCallCount: () => toolCalls,
  };
}
