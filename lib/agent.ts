import { isStepCount, streamText, toUIMessageStream, type LanguageModel, type ModelMessage, type UIMessage } from "ai";
import {
  MAX_STEPS,
  MAX_TOOL_CALLS,
  SUMMARY_AFTER_MS,
  TASK_TIMEOUT_MS,
  createTaskGuard,
  type StopReason,
} from "@/lib/limity";
import { FINAL_STEP_INSTRUCTIONS, INSTRUCTIONS } from "@/lib/persona";
import { agentTools, type AgentMetadata } from "@/lib/tools";

// ============================================================
// PĘTLA AGENTA (ReAct) z limitami.
// Model używa narzędzia, czyta wynik i decyduje o następnym kroku — aż odpowie
// albo zadziała któryś limit z lib/limity.ts. Wywołuje ją app/api/agent/route.ts.
// Model przychodzi z zewnątrz, dzięki czemu pętlę można sprawdzić modelem testowym.
// ============================================================

export function runAgentTask({
  model,
  messages,
  abortSignal,
}: {
  model: LanguageModel;
  messages: ModelMessage[];
  abortSignal?: AbortSignal; // przycisk „Stop” w czacie zamyka zapytanie, a ten sygnał zatrzymuje pętlę na serwerze
}) {
  // Strażnik zadania: limit wywołań narzędzi, 10 s na narzędzie, brak powtórek po błędzie, zegar zadania.
  const guard = createTaskGuard(agentTools);
  let stopReason: StopReason | undefined;

  const result = streamText({
    model,
    instructions: INSTRUCTIONS,
    messages,
    tools: guard.tools,
    stopWhen: isStepCount(MAX_STEPS),
    timeout: { totalMs: TASK_TIMEOUT_MS }, // twardy limit całego zadania
    abortSignal,
    // Przed każdym krokiem: gdy zbliża się któryś limit, ten krok jest ostatni —
    // bez narzędzi, z podsumowaniem tego, co udało się ustalić.
    prepareStep: ({ stepNumber, steps }) => {
      const toolCalls = steps.reduce((sum, step) => sum + step.toolCalls.length, 0);
      // Kolejność: najpierw czas (najpilniejszy), potem wywołania narzędzi, potem kroki.
      const reason: StopReason | undefined =
        guard.elapsedMs() >= SUMMARY_AFTER_MS
          ? "czas"
          : toolCalls >= MAX_TOOL_CALLS
            ? "narzedzia"
            : stepNumber >= MAX_STEPS - 1
              ? "kroki"
              : undefined;
      if (!reason) return {};
      stopReason = reason;
      return { toolChoice: "none", instructions: `${INSTRUCTIONS}\n\n${FINAL_STEP_INSTRUCTIONS}` };
    },
  });

  let steps = 0;
  let toolCalls = 0;
  const stats = () => ({ stepCount: steps, toolCallCount: toolCalls, durationMs: guard.elapsedMs() });

  // Odpowiedź kawałek po kawałku, razem ze źródłami i statystykami zadania.
  return toUIMessageStream<typeof agentTools, UIMessage<AgentMetadata>>({
    stream: result.stream,
    tools: agentTools,
    sendSources: true,
    onError: () => "Model nie odpowiedział. Spróbuj ponownie za chwilę.",
    messageMetadata: ({ part }) => {
      if (part.type === "tool-call") {
        toolCalls += 1; // liczymy też wyszukiwanie, które wykonuje OpenRouter
        return undefined;
      }
      if (part.type === "finish-step") {
        steps += 1;
        return { model: part.response.modelId };
      }
      if (part.type === "finish") {
        return {
          fetchedAt: new Date().toLocaleString("pl-PL", {
            timeZone: "Europe/Warsaw",
            dateStyle: "short",
            timeStyle: "short",
          }),
          stoppedAtLimit: stopReason !== undefined,
          stopReason,
          ...stats(),
        };
      }
      // Zadanie przerwane w trakcie: przyciskiem „Stop” albo twardym limitem 60 s.
      if (part.type === "abort") {
        const reason: StopReason = abortSignal?.aborted ? "uzytkownik" : "przerwano";
        return { stoppedAtLimit: true, stopReason: reason, ...stats() };
      }
    },
  });
}
