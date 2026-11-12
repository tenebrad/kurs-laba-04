import { chatModel, isModelConfigured } from "@/lib/model";
import { porownajPodroze, zapytaniePorownania } from "@/lib/podroz";
import { hasSession } from "@/lib/session";

export const maxDuration = 30;

// Tryb „Porównaj”: agent poleca jedno z dwóch miast i uzasadnia to danymi z kart.
export async function POST(req: Request) {
  // 1. Najpierw sesja. Bez niej nie dotykamy modelu.
  if (!(await hasSession())) {
    return Response.json({ error: "Brak dostępu. Zaloguj się hasłem." }, { status: 401 });
  }
  if (!isModelConfigured()) {
    return Response.json({ error: "Brak OPENROUTER_API_KEY w konfiguracji." }, { status: 500 });
  }

  // 2. Karty obu miast sprawdzamy schematem (dokładnie dwa miasta, ograniczone długości pól).
  const body = await req.json().catch(() => null);
  const dane = zapytaniePorownania.safeParse(body);
  if (!dane.success) {
    return Response.json({ error: "Niepoprawne dane do porównania." }, { status: 400 });
  }

  // 3. Rekomendacja: model wybiera A albo B, aplikacja dopisuje braki i pilnuje uczciwego porównania.
  try {
    return Response.json(await porownajPodroze({ model: chatModel(), zapytanie: dane.data }));
  } catch {
    return Response.json({ error: "Nie udało się przygotować rekomendacji. Spróbuj odświeżyć." }, { status: 502 });
  }
}
