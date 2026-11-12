import { tool } from "ai";
import { z } from "zod";
import { nazwaPoAngielsku, skroc, szukajWOpen5e } from "./open5e";
import { blad, bladPolaczenia, pobrano } from "./wspolne";

// Księga czarów D&D 5e — dane z Open5e (api.open5e.com/v2/spells/).

type Czar = {
  name: string;
  level: number;
  school: { name: string };
  casting_time: string;
  range_text: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  verbal: boolean;
  somatic: boolean;
  material: boolean;
  material_specified: string | null;
  classes: { name: string }[];
  damage_roll: string | null;
  damage_types: string[];
  saving_throw_ability: string | null;
  desc: string;
  higher_level: string | null;
  document: { name: string; key: string };
};

// Komponenty jak w podręczniku: „V, S, M (kawałek nietoperzego guana)”.
function komponenty(c: Czar): string {
  const lista = [c.verbal && "V", c.somatic && "S", c.material && "M"].filter(Boolean) as string[];
  const tekst = lista.join(", ");
  return c.material && c.material_specified ? `${tekst} (${c.material_specified})` : tekst;
}

export const ksiegaCzarow = tool({
  description:
    "Księga czarów Dungeons & Dragons 5e: poziom, szkoła magii, czas rzucania, zasięg, czas trwania, komponenty, " +
    "obrażenia i opis czaru. Użyj, gdy ktoś pyta o czar lub zaklęcie z D&D. " +
    "Nazwę podaj PO ANGIELSKU (np. „kula ognia” -> „fireball”, „magiczny pocisk” -> „magic missile”). " +
    "Dane są po angielsku — odpowiedz po polsku.",
  inputSchema: z.object({
    nazwa: nazwaPoAngielsku.describe("Angielska nazwa czaru, np. „Fireball”, „Magic Missile”, „Cure Wounds”"),
  }),
  execute: async ({ nazwa }) => {
    try {
      const znalezione = await szukajWOpen5e<Czar>("spells", nazwa);
      if (!znalezione) {
        return blad(`Nie znalazłem czaru „${nazwa}” w księdze Open5e. Podaj angielską nazwę, np. „fireball”.`);
      }
      const c = znalezione.wynik;
      return {
        nazwa: c.name,
        poziom: c.level === 0 ? "sztuczka (poziom 0)" : c.level,
        szkola: c.school.name,
        czasRzucania: c.casting_time,
        zasieg: c.range_text,
        czasTrwania: c.duration,
        koncentracja: c.concentration,
        rytual: c.ritual,
        komponenty: komponenty(c),
        klasy: c.classes.map((k) => k.name),
        obrazenia: c.damage_roll ? `${c.damage_roll} ${c.damage_types.join(", ")}`.trim() : undefined,
        rzutObronny: c.saving_throw_ability || undefined, // API czasem zwraca pusty tekst
        opis: skroc(c.desc, 700),
        naWyzszychPoziomach: skroc(c.higher_level, 300),
        ksiega: c.document.name,
        inneWyniki: znalezione.inne,
        zrodlo: "Open5e",
        pobrano: pobrano(),
      };
    } catch (e) {
      return bladPolaczenia("Open5e", e);
    }
  },
});
