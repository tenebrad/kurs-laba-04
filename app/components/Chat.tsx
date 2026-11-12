"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart, type FileUIPart, type UIMessage } from "ai";
import { MAX_STEPS, MAX_TOOL_CALLS, TASK_TIMEOUT_MS } from "@/lib/limity";
import type { AgentMetadata, ImageResult } from "@/lib/tools";
import ThemeToggle from "./ThemeToggle";

type Analysis = {
  category: string;
  priority: string;
  draft: string;
  needs_review: boolean;
};

type AgentMessage = UIMessage<AgentMetadata>;

// Obraz z przycisku „Wygeneruj obraz”. Pamiętamy, po której wiadomości go pokazać.
type GeneratedImage = ImageResult & { id: number; prompt: string; after: number };

// Etykiety narzędzi pokazywane nad odpowiedzią. Dodajesz narzędzie — dopisz je tutaj.
const TOOL_LABELS: Record<string, string> = {
  wyszukiwanie: "🔎 wyszukiwanie",
  generujObraz: "🎨 generujObraz",
  pogoda: "🌤️ pogoda",
  waluty: "💱 waluty",
  swieta: "📅 swieta",
  wikipedia: "📚 wikipedia",
  kalkulator: "🧮 kalkulator",
  czas: "🕒 czas",
  notatki: "📝 notatki",
  bestiariusz: "🐉 bestiariusz",
  ksiegaCzarow: "📜 ksiegaCzarow",
  diagnostyka: "🩺 diagnostyka",
};

const ALLOWED_IMAGES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_PROMPT = 500;

// Rozmowa idzie do /api/agent w trybie "chat". Wygenerowanych obrazów nie odsyłamy
// z powrotem na serwer — są duże, a modelowi wystarcza informacja, że obraz powstał.
const transport = new DefaultChatTransport<AgentMessage>({
  api: "/api/agent",
  prepareSendMessagesRequest: ({ messages }) => ({
    body: {
      mode: "chat",
      messages: messages.map((message) => ({
        ...message,
        parts: message.parts.map((part) =>
          part.type === "tool-generujObraz" && part.state === "output-available"
            ? { ...part, output: { model: (part.output as ImageResult).model } }
            : part,
        ),
      })),
    },
  }),
});

// Kroki agenta po kolei: numer kroku i narzędzia użyte w tym kroku.
// AI SDK oddziela kroki częściami "step-start". Wyszukiwanie wykonuje OpenRouter,
// więc rozpoznajemy je po źródłach dołączonych do odpowiedzi.
type AgentStep = { number: number; tools: string[] };

function agentSteps(message: AgentMessage): AgentStep[] {
  const steps: AgentStep[] = [];
  let number = 0;
  for (const part of message.parts) {
    if (part.type === "step-start") {
      number += 1;
      continue;
    }
    const name = isToolUIPart(part) ? getToolName(part) : part.type === "source-url" ? "wyszukiwanie" : "";
    if (!name) continue;
    const current = Math.max(number, 1);
    let step = steps.find((s) => s.number === current);
    if (!step) {
      step = { number: current, tools: [] };
      steps.push(step);
    }
    if (!step.tools.includes(name)) step.tools.push(name);
  }
  return steps;
}

// Komunikat, gdy agent skończył wcześniej przez któryś limit (lib/limity.ts).
function limitMessage(meta: AgentMetadata | undefined): string {
  switch (meta?.stopReason) {
    case "narzedzia":
      return `Doszedłem do limitu ${MAX_TOOL_CALLS} wywołań narzędzi. Oto, co udało się ustalić:`;
    case "czas":
      return `Zatrzymałem się, bo zadanie zbliżało się do limitu ${TASK_TIMEOUT_MS / 1000} s. Oto, co udało się ustalić:`;
    case "przerwano":
      return `Przerwałem po ${TASK_TIMEOUT_MS / 1000} sekundach — to limit jednego zadania. Poniżej to, co zdążyłem ustalić.`;
    default:
      return `Zatrzymałem się po ${MAX_STEPS} krokach. Oto, co udało się ustalić:`;
  }
}

// Mały tekst pod odpowiedzią: model, liczba kroków, wywołań narzędzi i czas.
function statsLine(meta: AgentMetadata | undefined): string {
  const parts: string[] = [];
  if (meta?.model) parts.push(`model: ${meta.model}`);
  if (meta?.stepCount !== undefined) parts.push(`kroki: ${meta.stepCount}`);
  if (meta?.toolCallCount !== undefined) parts.push(`wywołania narzędzi: ${meta.toolCallCount}`);
  if (meta?.durationMs !== undefined) {
    parts.push(`czas: ${(meta.durationMs / 1000).toLocaleString("pl-PL", { maximumFractionDigits: 1 })} s`);
  }
  return parts.join(" · ");
}

function Picture({ result }: { result: ImageResult }) {
  if (result.error) return <p className="error">{result.error}</p>;
  if (!result.image) return null;
  return (
    <figure className="picture">
      <img src={result.image} alt="Wygenerowany obraz" />
      <figcaption>
        <span className="small">model: {result.model ?? "nieznany"}</span>
        <a className="download" href={result.image} download="obraz.png">
          Pobierz
        </a>
      </figcaption>
    </figure>
  );
}

// Dopisek pod wiadomością, którą użytkownik przerwał przyciskiem „Stop”.
const INTERRUPTED_NOTE = "⏹ Przerwane przez użytkownika";

function Message({ message, interrupted = false }: { message: AgentMessage; interrupted?: boolean }) {
  const isAssistant = message.role === "assistant";
  const steps = isAssistant ? agentSteps(message) : [];
  const stoppedAtLimit = isAssistant && message.metadata?.stoppedAtLimit;
  const sources = message.parts.filter((part) => part.type === "source-url");
  const hasContent = message.parts.some(
    (part) => (part.type === "text" && part.text.trim()) || part.type === "tool-generujObraz",
  );

  return (
    <div className={`message ${message.role}`}>
      {steps.length > 0 && (
        <ol className="steps" aria-label="Kroki agenta">
          {steps.map((step) => (
            <li key={step.number}>
              <span className="step-number">{step.number}.</span>
              {step.tools.map((name) => (
                <span key={name} className="label">
                  {TOOL_LABELS[name] ?? `🛠️ ${name}`}
                </span>
              ))}
            </li>
          ))}
        </ol>
      )}

      {stoppedAtLimit && (
        <p className="limit" role="status">
          ⚠ {limitMessage(message.metadata)}
        </p>
      )}

      {message.parts.map((part, index) => {
        if (part.type === "text") return <span key={index} className="text">{part.text}</span>;
        if (part.type === "file" && part.mediaType.startsWith("image/")) {
          return <img key={index} className="thumb" src={part.url} alt={part.filename ?? "Wysłane zdjęcie"} />;
        }
        if (part.type === "tool-generujObraz") {
          if (part.state === "output-available") {
            return <Picture key={index} result={part.output as ImageResult} />;
          }
          if (part.state === "output-error") {
            return (
              <p key={index} className="error">
                Nie udało się wygenerować obrazu.
              </p>
            );
          }
          return (
            <p key={index} className="muted">
              Generuję obraz…
            </p>
          );
        }
        return null;
      })}

      {stoppedAtLimit && !hasContent && (
        <p className="muted">
          Nie zdążyłem przygotować podsumowania — sprawdzone kroki widać powyżej. Podziel pytanie na mniejsze części.
        </p>
      )}
      {isAssistant && !hasContent && message.metadata?.fetchedAt && !stoppedAtLimit && (
        <p className="muted">Nie mam odpowiedzi. Spróbuj zapytać inaczej.</p>
      )}
      {interrupted && <p className="interrupted">{INTERRUPTED_NOTE}</p>}

      {sources.length > 0 && (
        <div className="sources">
          <div className="sources-head">
            <strong>Źródła</strong>
            {message.metadata?.fetchedAt && <span className="small">pobrano: {message.metadata.fetchedAt}</span>}
          </div>
          <ul>
            {sources.map((source) => (
              <li key={source.sourceId}>
                <a href={source.url} target="_blank" rel="noreferrer" title={source.title || source.url}>
                  {source.title || source.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isAssistant && statsLine(message.metadata) && <div className="small">{statsLine(message.metadata)}</div>}
    </div>
  );
}

// Animowane kropki „agent pisze…”.
function Typing({ label }: { label: string }) {
  return (
    <div className="message assistant" role="status" aria-live="polite">
      <span className="typing">
        <span className="dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        {label}
      </span>
    </div>
  );
}

export default function Chat({
  botName,
  tagline,
  intro,
  imageSuggestions,
}: {
  botName: string;
  tagline: string;
  intro: string;
  imageSuggestions: string[];
}) {
  const router = useRouter();
  const { messages, sendMessage, status, error, stop } = useChat<AgentMessage>({ transport });
  // Wiadomości przerwane przyciskiem „Stop” (id ostatniej wiadomości w chwili kliknięcia).
  const [interruptedIds, setInterruptedIds] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [photo, setPhoto] = useState<FileUIPart | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [generating, setGenerating] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  // Po nowej wiadomości, obrazie lub analizie przewijamy rozmowę na dół.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, images.length, status, generating, analysis, analysisError]);

  // Gdy coś trwa, blokujemy przyciski, żeby nie wysłać zlecenia dwa razy.
  const agentWorking = status === "submitted" || status === "streaming";
  const busy = agentWorking || generating;
  const text = input.trim();

  function send(event: React.FormEvent) {
    event.preventDefault();
    if (busy || (!text && !photo)) return;
    sendMessage({ text: text || "Opisz to zdjęcie.", files: photo ? [photo] : undefined });
    setInput("");
    setPhoto(null);
  }

  // Vision: sprawdzamy plik od razu w przeglądarce i zamieniamy go na adres "data:".
  function choosePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPhotoError("");
    if (!ALLOWED_IMAGES.includes(file.type)) {
      setPhotoError("Ten plik nie jest zdjęciem. Dodaj plik jpg, png albo webp.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setPhotoError("Zdjęcie jest za duże. Limit to 4 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setPhoto({ type: "file", mediaType: file.type, filename: file.name, url: String(reader.result) });
    reader.onerror = () => setPhotoError("Nie udało się wczytać zdjęcia.");
    reader.readAsDataURL(file);
  }

  async function generateImage() {
    if (!text || busy) return;
    setGenerating(true);
    const response = await fetch("/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: text }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    const result: ImageResult = response?.ok && data ? data : { error: data?.error ?? "Nie udało się wygenerować obrazu." };
    setImages((list) => [...list, { ...result, id: list.length, prompt: text, after: messages.length }]);
    setGenerating(false);
    if (response?.ok) setInput("");
  }

  async function analyze() {
    if (!text) return;
    setAnalyzing(true);
    setAnalysis(null);
    setAnalysisError("");
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "analyze", text }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setAnalyzing(false);
    if (response?.ok && data) setAnalysis(data);
    else setAnalysisError(data?.error ?? "Analiza się nie udała.");
  }

  // „Stop”: przerywa zadanie agenta. To, co agent zdążył zrobić, zostaje w rozmowie.
  function stopAgent() {
    const last = messages[messages.length - 1];
    if (last) setInterruptedIds((ids) => [...ids, last.id]);
    stop();
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.refresh();
  }

  // Obrazy z przycisku pokazujemy w rozmowie — w miejscu, w którym zostały zamówione.
  function imagesAfter(count: number) {
    return images
      .filter((image) => image.after === count)
      .map((image) => (
        <div key={`image-${image.id}`} className="message assistant">
          <span className="small">Obraz: {image.prompt}</span>
          <Picture result={image} />
        </div>
      ));
  }

  return (
    <div className="chat">
      <header className="topbar">
        <div className="titlebar">
          <div className="avatar" aria-hidden="true">
            {botName.charAt(0)}
          </div>
          <h1>{botName}</h1>
          <Link className="linkbtn" href="/dashboard">
            🧳 Podróż
          </Link>
          <ThemeToggle />
          <button type="button" className="ghost" onClick={logout}>
            Wyjdź
          </button>
        </div>
        <p className="menubar">{tagline}</p>
      </header>

      <div className="messages inner">
        <div className="message assistant">
          <span className="text">{intro}</span>
        </div>
        {imagesAfter(0)}
        {messages.map((message, index) => (
          <div key={message.id} className="turn">
            <Message
              message={message}
              interrupted={message.role === "assistant" && interruptedIds.includes(message.id)}
            />
            {/* Przerwano, zanim agent zaczął odpowiadać — dopisek w osobnym dymku. */}
            {message.role === "user" && interruptedIds.includes(message.id) && (
              <div className="message assistant">
                <p className="interrupted">{INTERRUPTED_NOTE}</p>
              </div>
            )}
            {imagesAfter(index + 1)}
          </div>
        ))}
        {status === "submitted" && <Typing label="Agent pisze…" />}
        {generating && <Typing label="Generuję obraz…" />}
        {error && <p className="error">Coś poszło nie tak. Spróbuj ponownie.</p>}

        {analysisError && <p className="error">{analysisError}</p>}
        {analysis && (
          <section className="analysis">
            <h2>Analiza wiadomości</h2>
            <dl>
              <dt>Kategoria</dt>
              <dd>{analysis.category}</dd>
              <dt>Priorytet</dt>
              <dd>{analysis.priority}</dd>
              <dt>Do sprawdzenia przez człowieka</dt>
              <dd>{analysis.needs_review ? "tak" : "nie"}</dd>
              <dt>Szkic odpowiedzi</dt>
              <dd>{analysis.draft}</dd>
            </dl>
          </section>
        )}
        <div ref={bottom} />
      </div>

      <div className="dock">
        <div className="inner">
          {photo && (
            <div className="attachment">
              <img className="thumb" src={photo.url} alt="Wybrane zdjęcie" />
              <span className="small">{photo.filename}</span>
              <button type="button" className="ghost" onClick={() => setPhoto(null)}>
                Usuń
              </button>
            </div>
          )}
          {photoError && <p className="error">{photoError}</p>}

          <form onSubmit={send} className="composer">
            <div className="inputrow">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Napisz wiadomość albo opis obrazu…"
                aria-label="Wiadomość"
              />
              {/* Podczas pracy agenta zamiast „Wyślij” jest „Stop”. */}
              {agentWorking ? (
                <button type="button" className="stop" onClick={stopAgent} aria-label="Zatrzymaj agenta">
                  <span className="stop-icon" aria-hidden="true" />
                  Stop
                </button>
              ) : (
                <button type="submit" className="primary" disabled={busy || (!text && !photo)}>
                  Wyślij
                </button>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={choosePhoto}
              hidden
              aria-label="Zdjęcie"
            />
            <div className="actions">
              <button type="button" className="secondary" onClick={() => fileInput.current?.click()} disabled={busy}>
                📎 Dodaj zdjęcie
              </button>
              <button
                type="button"
                className="secondary"
                onClick={generateImage}
                disabled={busy || !text || text.length > MAX_IMAGE_PROMPT}
              >
                {generating ? "Generuję…" : "🎨 Wygeneruj obraz"}
              </button>
              <button type="button" className="secondary" onClick={analyze} disabled={analyzing || !text}>
                {analyzing ? "Analizuję…" : "🧾 Analiza JSON"}
              </button>
            </div>
          </form>

          <div className="suggestions">
            <span className="small">Pomysły na obraz:</span>
            {imageSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="chip"
                title={suggestion}
                onClick={() => setInput(suggestion)}
                disabled={busy}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
