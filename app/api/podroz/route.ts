import { hasSession } from "@/lib/session";
import { dzisiajPl, szukajMiejsca, zapytaniePodrozy } from "@/lib/podroz";

// Asystent podróży, krok 1: miasto -> miejsce (kraj, strefa czasowa, współrzędne).
// Karty przeglądarka pobiera potem osobno z /api/podroz/karta — każdą niezależnie.
export async function POST(req: Request) {
  // 1. Najpierw sesja. Bez niej nie pytamy żadnego źródła.
  if (!(await hasSession())) {
    return Response.json({ error: "Brak dostępu. Zaloguj się hasłem." }, { status: 401 });
  }

  // 2. Sprawdzamy dane z formularza.
  const body = await req.json().catch(() => null);
  const dane = zapytaniePodrozy.safeParse(body);
  if (!dane.success) {
    return Response.json({ error: dane.error.issues[0]?.message ?? "Niepoprawne dane." }, { status: 400 });
  }
  const { miasto, data } = dane.data;
  if (Number.isNaN(Date.parse(`${data}T12:00:00Z`))) {
    return Response.json({ error: "Taka data nie istnieje." }, { status: 400 });
  }
  if (data < dzisiajPl()) {
    return Response.json({ error: "Wybierz dzisiejszą albo przyszłą datę." }, { status: 400 });
  }

  // 3. Szukamy miasta. Nie ma go albo geokodowanie nie odpowiada — czytelny komunikat zamiast kart.
  const miejsce = await szukajMiejsca(miasto);
  if ("blad" in miejsce) {
    return Response.json({ error: miejsce.blad }, { status: miejsce.niedostepne ? 503 : 404 });
  }
  return Response.json({ miejsce, data });
}
