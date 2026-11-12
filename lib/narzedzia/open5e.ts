import { z } from "zod";
import { pobierzJson } from "./wspolne";

// Wspólne wyszukiwanie w Open5e (api.open5e.com, wersja 2, bez klucza) dla bestiariusza i księgi czarów.
// Najpierw szukamy w oficjalnym SRD 5.1 (Wizards of the Coast), a gdy tam nie ma — we wszystkich księgach.

type Lista<T> = { count: number; results: T[] };
type ZDokumentem = { name: string; document: { name: string; key: string } };

const OFICJALNE_SRD = "srd-2014";

// Nazwa w zapytaniu: po angielsku, litery, cyfry, spacje i kilka znaków (np. „Will-o'-Wisp”).
export const nazwaPoAngielsku = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[\p{L}0-9 '’,-]+$/u, "Nazwa może zawierać tylko litery, cyfry, spacje i znaki ' , -");

export type Znalezione<T> = { wynik: T; inne: string[] };

export async function szukajWOpen5e<T extends ZDokumentem>(
  rodzaj: "creatures" | "spells",
  nazwa: string,
): Promise<Znalezione<T> | null> {
  const adres = (ksiega?: string) =>
    `https://api.open5e.com/v2/${rodzaj}/?name__icontains=${encodeURIComponent(nazwa)}&limit=10` +
    (ksiega ? `&document__key=${ksiega}` : "");

  let lista = await pobierzJson<Lista<T>>(adres(OFICJALNE_SRD));
  if (!lista || lista.results.length === 0) lista = await pobierzJson<Lista<T>>(adres());
  if (!lista || lista.results.length === 0) return null;

  // Dokładne trafienie w nazwę ma pierwszeństwo, np. „Goblin” przed „Hobgoblin”.
  const szukana = nazwa.toLowerCase();
  const wynik = lista.results.find((r) => r.name.toLowerCase() === szukana) ?? lista.results[0];
  const inne = [...new Set(lista.results.filter((r) => r !== wynik).map((r) => r.name))].slice(0, 5);
  return { wynik, inne };
}

// Skraca długie opisy, żeby model dostał tylko to, co potrzebne.
export function skroc(tekst: string | null | undefined, maks: number): string | undefined {
  if (!tekst) return undefined;
  const czysty = tekst.replace(/\s+/g, " ").trim();
  return czysty.length > maks ? `${czysty.slice(0, maks)}…` : czysty;
}
