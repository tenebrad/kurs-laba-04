import { Suspense } from "react";
import { connection } from "next/server";
import { hasSession } from "@/lib/session";
import { BOT_INTRO, BOT_NAME, BOT_TAGLINE, IMAGE_SUGGESTIONS } from "@/lib/persona";
import Chat from "./components/Chat";
import Login from "./components/Login";

// Serwer sprawdza ciasteczko sesji i decyduje, co pokazać: ekran hasła czy czat.
async function Gate() {
  await connection(); // ta część strony powstaje przy każdym wejściu, nie podczas budowania
  const loggedIn = await hasSession();
  return loggedIn ? (
    <Chat botName={BOT_NAME} tagline={BOT_TAGLINE} intro={BOT_INTRO} imageSuggestions={IMAGE_SUGGESTIONS} />
  ) : (
    <Login botName={BOT_NAME} tagline={BOT_TAGLINE} />
  );
}

export default function Home() {
  return (
    <main className="app">
      <Suspense fallback={<p className="loading">Ładowanie…</p>}>
        <Gate />
      </Suspense>
    </main>
  );
}
