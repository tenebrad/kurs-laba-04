import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { BOT_NAME, BOT_TAGLINE } from "@/lib/persona";
import { dzisiajPl } from "@/lib/podroz";
import { hasSession } from "@/lib/session";
import Dashboard from "../components/Dashboard";
import Login from "../components/Login";

export const metadata: Metadata = {
  title: "Asystent podróży",
  description: "Pogoda, waluta, święta, opis miasta i czas na miejscu — w jednym miejscu.",
};

// Ta sama bramka co na stronie czatu: bez sesji tylko ekran hasła.
async function Gate() {
  await connection(); // ta część strony powstaje przy każdym wejściu, nie podczas budowania
  const loggedIn = await hasSession();
  return loggedIn ? <Dashboard dzisiaj={dzisiajPl()} /> : <Login botName={BOT_NAME} tagline={BOT_TAGLINE} />;
}

export default function DashboardPage() {
  return (
    <main className="app">
      <Suspense fallback={<p className="loading">Ładowanie…</p>}>
        <Gate />
      </Suspense>
    </main>
  );
}
