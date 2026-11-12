import {
  Output,
  consumeStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  generateText,
  type UIMessage,
} from "ai";
import { runAgentTask } from "@/lib/agent";
import { chatModel, isModelConfigured } from "@/lib/model";
import { ANALYSIS_INSTRUCTIONS, analysisSchema } from "@/lib/persona";
import { hasSession } from "@/lib/session";
import { agentTools } from "@/lib/tools";

// Zadanie agenta ma twardy limit 60 s (lib/limity.ts); serwer daje mu chwilę zapasu na wysłanie odpowiedzi.
export const maxDuration = 70;

const ALLOWED_IMAGES = ["image/jpeg", "image/png", "image/webp"];

// Jeden endpoint agenta. Pole mode wybiera sposób pracy:
// - "chat": rozmowa na żywo z narzędziami,
// - "analyze": wynik w ustalonym kształcie (JSON).
export async function POST(req: Request) {
  // 1. Najpierw sprawdzamy sesję. Bez niej nie dotykamy modelu.
  if (!(await hasSession())) {
    return Response.json({ error: "Brak dostępu. Zaloguj się hasłem." }, { status: 401 });
  }

  if (!isModelConfigured()) {
    return Response.json({ error: "Brak OPENROUTER_API_KEY w konfiguracji." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  if (body?.mode === "chat") return chat(body.messages, req.signal);
  if (body?.mode === "analyze") return analyze(body.text);
  return Response.json({ error: 'Nieznany tryb. Użyj mode: "chat" albo "analyze".' }, { status: 400 });
}

async function chat(messages: UIMessage[] | undefined, abortSignal: AbortSignal) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "Brak wiadomości." }, { status: 400 });
  }

  // Zdjęcia od użytkownika: przepuszczamy tylko jpg, png i webp.
  const badFile = messages.some(
    (message) =>
      Array.isArray(message.parts) &&
      message.parts.some((part) => part.type === "file" && !ALLOWED_IMAGES.includes(part.mediaType)),
  );
  if (badFile) {
    return Response.json({ error: "Można dodać tylko zdjęcie jpg, png albo webp." }, { status: 400 });
  }

  // 2. Pętla agenta z limitami (lib/agent.ts, lib/limity.ts): kroki, wywołania narzędzi, czas.
  //    abortSignal: przycisk „Stop” w czacie zamyka zapytanie — wtedy zatrzymujemy też model i narzędzia.
  return createUIMessageStreamResponse({
    stream: runAgentTask({
      model: chatModel(),
      // ignoreIncompleteToolCalls: po „Stop” w rozmowie mogą zostać wywołania narzędzi bez wyniku — pomijamy je.
      messages: await convertToModelMessages(messages, { tools: agentTools, ignoreIncompleteToolCalls: true }),
      abortSignal,
    }),
    consumeSseStream: consumeStream, // poprawne domknięcie strumienia po przerwaniu
  });
}

async function analyze(rawText: unknown) {
  const text = typeof rawText === "string" ? rawText.trim() : "";
  if (!text) {
    return Response.json({ error: "Wpisz wiadomość do analizy." }, { status: 400 });
  }
  if (text.length > 4000) {
    return Response.json({ error: "Wiadomość jest za długa (limit 4000 znaków)." }, { status: 400 });
  }

  try {
    // Model ma zwrócić dane dokładnie w kształcie analysisSchema.
    const { output } = await generateText({
      model: chatModel(),
      instructions: ANALYSIS_INSTRUCTIONS,
      prompt: text,
      output: Output.object({ schema: analysisSchema }),
    });

    // Sprawdzamy wynik jeszcze raz po stronie serwera — modelowi nie ufamy na słowo.
    const checked = analysisSchema.safeParse(output);
    if (!checked.success) {
      return Response.json({ error: "Model zwrócił dane w złym formacie." }, { status: 502 });
    }
    return Response.json(checked.data);
  } catch {
    return Response.json({ error: "Nie udało się przeanalizować wiadomości." }, { status: 502 });
  }
}
