import { kartaDla, zapytanieKarty } from "@/lib/podroz";
import { hasSession } from "@/lib/session";

export const maxDuration = 30;

// Asystent podróży, krok 2: jedna karta (pogoda, waluty, swieta, wikipedia albo czas).
// Każda karta ma osobne zapytanie, więc awaria jednego źródła nie blokuje pozostałych.
export async function POST(req: Request) {
  // 1. Najpierw sesja. Bez niej nie pytamy żadnego źródła.
  if (!(await hasSession())) {
    return Response.json({ error: "Brak dostępu. Zaloguj się hasłem." }, { status: 401 });
  }

  // 2. Sprawdzamy, o którą kartę chodzi i dla jakiego miejsca.
  const body = await req.json().catch(() => null);
  const dane = zapytanieKarty.safeParse(body);
  if (!dane.success) {
    return Response.json({ error: "Niepoprawne dane karty." }, { status: 400 });
  }

  // 3. Karta zawsze wraca w jednym z dwóch stanów: „ok” (są dane) albo „brak” (z powodem).
  const { id, miejsce, data } = dane.data;
  return Response.json(await kartaDla(id, miejsce, data));
}
