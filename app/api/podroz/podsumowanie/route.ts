import { chatModel, isModelConfigured } from "@/lib/model";
import { podsumujPodroz, zapytaniePodsumowania } from "@/lib/podroz";
import { hasSession } from "@/lib/session";

export const maxDuration = 30;

// Podsumowanie od agenta pod kartami: 2–3 zdania — co spakować i na co uważać,
// plus wprost: których źródeł zabrakło.
export async function POST(req: Request) {
  // 1. Najpierw sesja. Bez niej nie dotykamy modelu.
  if (!(await hasSession())) {
    return Response.json({ error: "Brak dostępu. Zaloguj się hasłem." }, { status: 401 });
  }
  if (!isModelConfigured()) {
    return Response.json({ error: "Brak OPENROUTER_API_KEY w konfiguracji." }, { status: 500 });
  }

  // 2. Karty z przeglądarki sprawdzamy schematem (długości pól i liczba kart są ograniczone).
  const body = await req.json().catch(() => null);
  const dane = zapytaniePodsumowania.safeParse(body);
  if (!dane.success) {
    return Response.json({ error: "Niepoprawne dane do podsumowania." }, { status: 400 });
  }

  // 3. Podsumowanie: zdanie o brakach dopisuje aplikacja, resztę pisze model tylko z dostępnych danych.
  try {
    return Response.json(await podsumujPodroz({ model: chatModel(), zapytanie: dane.data }));
  } catch {
    return Response.json({ error: "Nie udało się przygotować podsumowania. Spróbuj odświeżyć." }, { status: 502 });
  }
}
