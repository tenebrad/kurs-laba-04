import { tool } from "ai";
import { z } from "zod";
import { BladApi, blad, bladPolaczenia, pobierzJson, pobrano } from "./wspolne";

// Dane: polska Wikipedia.
// 1) wyszukiwanie: pl.wikipedia.org/w/rest.php/v1/search/page
// 2) streszczenie: pl.wikipedia.org/api/rest_v1/page/summary/{tytuł}

type Wyszukiwanie = { pages: { key: string; title: string; description: string | null }[] };

type Streszczenie = {
  type: string; // "standard" albo "disambiguation" (strona ujednoznaczniająca)
  title: string;
  description?: string;
  extract: string;
  content_urls: { desktop: { page: string } };
};

const UJEDNOZNACZNIENIE = "strona ujednoznaczniająca";
const MAX_ZNAKOW = 1200;

const wejscie = z.object({
  haslo: z.string().trim().min(2).max(200).describe("Szukane hasło, np. „Mikołaj Kopernik”"),
});

// Zwykła funkcja z całą logiką — używa jej narzędzie agenta i strona /dashboard.
export async function streszczenieHasla({ haslo }: z.input<typeof wejscie>) {
  try {
    const wyniki = await pobierzJson<Wyszukiwanie>(
      `https://pl.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(haslo)}&limit=5`,
    );
    const strony = wyniki?.pages ?? [];
    if (strony.length === 0) {
      return blad(`Nie znalazłem w polskiej Wikipedii hasła „${haslo}”.`);
    }

    // Wybieramy pierwszy artykuł, który nie jest stroną ujednoznaczniającą.
    const wybrana = strony.find((s) => s.description !== UJEDNOZNACZNIENIE) ?? strony[0];
    const inne = strony.filter((s) => s !== wybrana).slice(0, 3).map((s) => s.title);

    const s = await pobierzJson<Streszczenie>(
      `https://pl.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wybrana.key)}`,
    );
    if (!s) return blad(`Nie udało się pobrać streszczenia hasła „${wybrana.title}”.`);

    const tekst = s.extract.length > MAX_ZNAKOW ? `${s.extract.slice(0, MAX_ZNAKOW)}…` : s.extract;
    return {
      tytul: s.title,
      opis: s.description,
      streszczenie: tekst,
      link: s.content_urls.desktop.page,
      ...(s.type === "disambiguation" && { uwaga: "To strona ujednoznaczniająca — poproś o doprecyzowanie." }),
      inneHasla: inne,
      zrodlo: "Wikipedia (pl)",
      pobrano: pobrano(),
    };
  } catch (e) {
    if (e instanceof BladApi && e.status === 404) {
      return blad(`Nie znalazłem w polskiej Wikipedii hasła „${haslo}”.`);
    }
    return bladPolaczenia("Wikipedia", e);
  }
}

export const wikipedia = tool({
  description:
    "Krótkie streszczenie hasła z polskiej Wikipedii z linkiem do artykułu. " +
    "Użyj, gdy ktoś pyta, kim był ktoś, czym jest coś, albo prosi o encyklopedyczną definicję. " +
    "Do bieżących wiadomości i cen używaj wyszukiwania, nie Wikipedii.",
  inputSchema: wejscie,
  execute: streszczenieHasla,
});
