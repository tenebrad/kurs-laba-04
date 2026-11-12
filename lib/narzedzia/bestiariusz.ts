import { tool } from "ai";
import { z } from "zod";
import { nazwaPoAngielsku, skroc, szukajWOpen5e } from "./open5e";
import { blad, bladPolaczenia, pobrano } from "./wspolne";

// Bestiariusz D&D 5e — dane z Open5e (api.open5e.com/v2/creatures/).

type Stwor = {
  name: string;
  size: { name: string };
  type: { name: string };
  alignment: string;
  armor_class: number;
  hit_points: number;
  hit_dice: string | null;
  challenge_rating: number;
  speed: Record<string, number | string>;
  ability_scores: Record<string, number>;
  languages?: { as_string: string };
  traits?: { name: string; desc: string }[];
  actions?: { name: string; desc: string }[];
  document: { name: string; key: string };
};

const MAKS_AKCJI = 6;

// Skala wyzwania (CR) jak w podręczniku: 0.25 -> „1/4”.
function skala(cr: number): string {
  const ulamki: Record<number, string> = { 0.125: "1/8", 0.25: "1/4", 0.5: "1/2" };
  return ulamki[cr] ?? String(cr);
}

// Prędkość jako tekst, np. „walk 40 ft, fly 80 ft”.
function predkosc(speed: Stwor["speed"]): string {
  return Object.entries(speed)
    .filter(([rodzaj, wartosc]) => rodzaj !== "unit" && typeof wartosc === "number" && wartosc > 0)
    .map(([rodzaj, wartosc]) => `${rodzaj} ${wartosc} ft`)
    .join(", ");
}

export const bestiariusz = tool({
  description:
    "Bestiariusz Dungeons & Dragons 5e: statystyki potwora (klasa pancerza, punkty życia, skala wyzwania, atrybuty, " +
    "cechy i akcje). Użyj, gdy ktoś pyta o potwora lub stwora z D&D, np. smoka, gobliny, beholdera. " +
    "Nazwę podaj PO ANGIELSKU (np. „czerwony smok” -> „red dragon”, „goblin” -> „goblin”). " +
    "Dane są po angielsku — odpowiedz po polsku.",
  inputSchema: z.object({
    nazwa: nazwaPoAngielsku.describe("Angielska nazwa potwora, np. „Adult Red Dragon”, „Goblin”, „Beholder”"),
  }),
  execute: async ({ nazwa }) => {
    try {
      const znalezione = await szukajWOpen5e<Stwor>("creatures", nazwa);
      if (!znalezione) {
        return blad(`Nie znalazłem potwora „${nazwa}” w bestiariuszu Open5e. Podaj angielską nazwę, np. „goblin”.`);
      }
      const s = znalezione.wynik;
      return {
        nazwa: s.name,
        rozmiar: s.size.name,
        typ: s.type.name,
        charakter: s.alignment,
        klasaPancerza: s.armor_class,
        punktyZycia: s.hit_points,
        kosciZycia: s.hit_dice ?? undefined,
        skalaWyzwania: skala(s.challenge_rating),
        predkosc: predkosc(s.speed),
        atrybuty: s.ability_scores,
        jezyki: s.languages?.as_string || undefined,
        cechy: (s.traits ?? []).map((c) => ({ nazwa: c.name, opis: skroc(c.desc, 200) })),
        akcje: (s.actions ?? []).slice(0, MAKS_AKCJI).map((a) => ({ nazwa: a.name, opis: skroc(a.desc, 200) })),
        ksiega: s.document.name,
        inneWyniki: znalezione.inne,
        zrodlo: "Open5e",
        pobrano: pobrano(),
      };
    } catch (e) {
      return bladPolaczenia("Open5e", e);
    }
  },
});
