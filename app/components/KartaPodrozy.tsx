"use client";

// Wspólne elementy asystenta podróży: karta, pobieranie karty i wyszukiwanie miasta.
// Używają ich oba tryby: „Jedno miasto” (Dashboard.tsx) i „Porównaj” (Porownanie.tsx).

import type { Miejsce } from "@/lib/narzedzia/pogoda";
import type { Karta } from "@/lib/podroz";
import { ID_KART, OPIS_KARTY, type IdKarty } from "@/lib/podroz-karty";

// Stan karty w przeglądarce: „Ładuję…” albo to, co przyszło z serwera („ok” / „brak”).
export type StanKarty = { stan: "laduje" } | Karta;
export type Cel = { miejsce: Miejsce; data: string };

// Ile przeglądarka czeka na jedną kartę (źródło ma 10 s na zapytanie, karta robi najwyżej dwa).
const LIMIT_KARTY_MS = 25_000;

export const wszystkieLaduja = () =>
  Object.fromEntries(ID_KART.map((id) => [id, { stan: "laduje" }])) as Record<IdKarty, StanKarty>;

// Data RRRR-MM-DD przesunięta o podaną liczbę dni (do limitu w polu „Kiedy?”).
export function plusDni(iso: string, dni: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dni);
  return d.toISOString().slice(0, 10);
}

export const dataPl = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });

const teraz = () =>
  new Date().toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "medium" });

export function Kropki() {
  return (
    <span className="dots" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

// Miasto + data -> miejsce. Zwraca { error }, gdy nie ma miasta albo serwer nie odpowiada.
export async function szukajCelu(miasto: string, data: string): Promise<Cel | { error: string }> {
  const odp = await fetch("/api/podroz", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ miasto, data }),
  }).catch(() => null);
  const json = await odp?.json().catch(() => null);
  if (!odp?.ok || !json?.miejsce) return { error: json?.error ?? "Nie udało się wyszukać miasta. Spróbuj ponownie." };
  return { miejsce: json.miejsce as Miejsce, data: json.data as string };
}

// Jedna karta z serwera. Gdy serwer nie odpowie albo odpowie błędem — karta „brak”, bez żadnych danych zastępczych.
export async function pobierzKarte(id: IdKarty, miejsce: Miejsce, data: string): Promise<Karta> {
  const opis = OPIS_KARTY[id];
  const brak: Karta = {
    id,
    stan: "brak",
    niedostepne: true,
    tytul: opis.tytul,
    ikona: opis.ikona,
    blad: "Serwer nie odpowiedział.",
    zrodlo: opis.zrodlo,
    pobrano: teraz(),
  };
  try {
    const odp = await fetch("/api/podroz/karta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, miejsce, data }),
      signal: AbortSignal.timeout(LIMIT_KARTY_MS),
    });
    const json = (await odp.json().catch(() => null)) as Karta | null;
    if (!odp.ok || !json || json.id !== id || (json.stan !== "ok" && json.stan !== "brak")) return brak;
    return json;
  } catch {
    return brak; // przekroczony czas albo brak połączenia
  }
}

// Karty do podsumowania / porównania — tylko pola potrzebne modelowi.
export const kartyDoModelu = (karty: Karta[]) =>
  karty.map(({ id, stan, tytul, wartosc, szczegoly }) => ({ id, stan, tytul, wartosc, szczegoly }));

// Karta na stronie. `miasto` = etykieta miasta w trybie „Porównaj”.
export function KartaDanych({ id, karta, miasto }: { id: IdKarty; karta: StanKarty; miasto?: string }) {
  const opis = OPIS_KARTY[id];
  const tytul = karta.stan === "laduje" ? opis.tytul : karta.tytul;
  const ikona = karta.stan === "laduje" ? opis.ikona : karta.ikona;
  const etykieta = { laduje: "Ładuję…", ok: "OK", brak: "Brak danych" }[karta.stan];
  const htmlId = `karta-${id}${miasto ? `-${miasto.replace(/\W+/g, "")}` : ""}`;

  return (
    <article className={`karta raised karta-${karta.stan}`} aria-labelledby={htmlId} aria-busy={karta.stan === "laduje"}>
      <h2 className="karta-tytul" id={htmlId}>
        <span aria-hidden="true">{ikona}</span> {miasto && <span className="karta-miasto">{miasto}:</span>} {tytul}
      </h2>

      <div className="karta-tresc">
        {karta.stan === "laduje" && (
          <p className="typing">
            <Kropki />
            Ładuję…
          </p>
        )}

        {karta.stan === "brak" && (
          <>
            <p className="karta-brak">
              {karta.niedostepne ? "Brak danych — spróbuj odświeżyć." : "Brak danych."}
            </p>
            {karta.blad && <p className="small">{karta.blad}</p>}
          </>
        )}

        {karta.stan === "ok" && (
          <>
            <p className={id === "wikipedia" ? "karta-wartosc opis" : "karta-wartosc"}>{karta.wartosc}</p>
            {karta.szczegoly && karta.szczegoly.length > 0 && (
              <ul className="karta-szczegoly">
                {karta.szczegoly.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            )}
            {karta.link && (
              <a className="download" href={karta.link.url} target="_blank" rel="noreferrer">
                {karta.link.tekst}
              </a>
            )}
          </>
        )}
      </div>

      <p className="karta-meta">
        źródło: {karta.stan === "laduje" ? opis.zrodlo : karta.zrodlo} ·{" "}
        {karta.stan === "laduje" ? "pobieram…" : karta.stan === "ok" ? `pobrano: ${karta.pobrano}` : `sprawdzono: ${karta.pobrano}`}
      </p>
      {/* Pasek stanu jak w oknach Windows 98. */}
      <p className={`karta-stan stan-${karta.stan}`} role="status">
        Stan: {etykieta}
      </p>
    </article>
  );
}
