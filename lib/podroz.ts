import { Output, generateText, type LanguageModel } from "ai";
import { z } from "zod";
import { czasWStrefie } from "@/lib/narzedzia/czas";
import { prognozaDlaMiejsca, znajdzMiejsce, type Miejsce } from "@/lib/narzedzia/pogoda";
import { swietaWRoku } from "@/lib/narzedzia/swieta";
import { kursWaluty } from "@/lib/narzedzia/waluty";
import { streszczenieHasla } from "@/lib/narzedzia/wikipedia";
import { pobrano, type Blad } from "@/lib/narzedzia/wspolne";
import { ID_KART, NAZWY_ZRODEL, type IdKarty } from "@/lib/podroz-karty";

// ============================================================
// ASYSTENT PODRÓŻY (/dashboard)
// Pięć kart z tych samych funkcji, których używają narzędzia agenta (lib/narzedzia/).
// Każda karta jest pobierana osobno: awaria jednego źródła nie psuje pozostałych.
// Zasada: nigdy nie wstawiamy danych zastępczych — brak danych to stan „brak”.
// ============================================================

// Lista kart i nazwy źródeł są w lib/podroz-karty.ts (wspólne z przeglądarką).

// Jedna karta na stronie: wartość z jednostką, szczegóły, źródło i godzina pobrania.
// stan „ok” = są dane; „brak” = danych nie ma (niedostepne: źródło nie odpowiedziało — warto odświeżyć).
export type Karta = {
  id: IdKarty;
  stan: "ok" | "brak";
  niedostepne?: boolean;
  tytul: string;
  ikona: string;
  wartosc?: string;
  szczegoly?: string[];
  link?: { url: string; tekst: string };
  blad?: string;
  zrodlo: string;
  pobrano: string;
};

// Dane z formularza — sprawdzamy je na serwerze.
export const zapytaniePodrozy = z.object({
  miasto: z.string().trim().min(2, "Wpisz nazwę miasta.").max(100),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Podaj datę w formacie RRRR-MM-DD."),
});

// Dzisiejsza data w Polsce jako RRRR-MM-DD.
export function dzisiajPl(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
}

// Waluta kraju (kod ISO 3166 -> ISO 4217). REST Countries wymaga już klucza API,
// więc trzymamy tabelę w kodzie: strefa euro i popularne kierunki podróży.
const STREFA_EURO = [
  "AT", "BE", "BG", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT",
  "SK", "SI", "ES", "AD", "MC", "SM", "VA", "ME", "XK",
];
const WALUTY_KRAJOW: Record<string, string> = {
  ...Object.fromEntries(STREFA_EURO.map((kraj) => [kraj, "EUR"])),
  PL: "PLN", CZ: "CZK", DK: "DKK", HU: "HUF", RO: "RON", SE: "SEK", NO: "NOK", IS: "ISK", GB: "GBP",
  CH: "CHF", LI: "CHF", UA: "UAH", RS: "RSD", BA: "BAM", MK: "MKD", AL: "ALL", MD: "MDL", TR: "TRY",
  GE: "GEL", AM: "AMD", AZ: "AZN", US: "USD", CA: "CAD", MX: "MXN", BR: "BRL", AR: "ARS", CL: "CLP",
  CO: "COP", PE: "PEN", CU: "CUP", DO: "DOP", JP: "JPY", CN: "CNY", KR: "KRW", IN: "INR", TH: "THB",
  VN: "VND", ID: "IDR", MY: "MYR", SG: "SGD", PH: "PHP", HK: "HKD", TW: "TWD", LK: "LKR", NP: "NPR",
  MV: "MVR", AE: "AED", SA: "SAR", QA: "QAR", IL: "ILS", JO: "JOD", EG: "EGP", MA: "MAD", TN: "TND",
  ZA: "ZAR", KE: "KES", TZ: "TZS", MU: "MUR", CV: "CVE", AU: "AUD", NZ: "NZD",
};

const liczba = (x: number, miejsca = 2) => x.toLocaleString("pl-PL", { maximumFractionDigits: miejsca });
const dataPl = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });

// Pierwsze dwa zdania tekstu (krótkie skróty typu „m.in.” doklejamy do następnego kawałka).
function dwaZdania(tekst: string): string {
  const kawalki = tekst.replace(/\s+/g, " ").replace(/ ([,;:–])/g, "$1").replace(/–/g, " –").split(/(?<=[.!?])\s+/);
  const zdania: string[] = [];
  for (const kawalek of kawalki) {
    if (zdania.length > 0 && zdania[zdania.length - 1].length < 25) zdania[zdania.length - 1] += ` ${kawalek}`;
    else zdania.push(kawalek);
    if (zdania.length === 2 && zdania[1].length >= 25) break;
  }
  return zdania.slice(0, 2).join(" ");
}

// Karta bez danych. Nigdy nie wstawiamy wartości zastępczych — tylko powód braku.
const kartaBledu = (id: IdKarty, tytul: string, ikona: string, zrodlo: string, powod: Blad | string): Karta => ({
  id,
  stan: "brak",
  niedostepne: typeof powod === "object" && powod.niedostepne === true,
  tytul,
  ikona,
  blad: typeof powod === "string" ? powod : powod.blad,
  zrodlo,
  pobrano: typeof powod === "string" ? pobrano() : powod.pobrano,
});

// ---------- Karty ----------

async function kartaPogody(miejsce: Miejsce, data: string): Promise<Karta> {
  const tytul = `Pogoda — ${dataPl(data)}`;
  const p = await prognozaDlaMiejsca(miejsce, { data });
  if ("blad" in p) return kartaBledu("pogoda", tytul, "🌤️", "Open-Meteo", p);
  const temp =
    p.temperaturaMinC !== null && p.temperaturaMaxC !== null
      ? `${liczba(p.temperaturaMinC, 1)} … ${liczba(p.temperaturaMaxC, 1)} °C`
      : "brak danych o temperaturze";
  return {
    id: "pogoda",
    stan: "ok",
    tytul,
    ikona: "🌤️",
    wartosc: temp,
    szczegoly: [
      p.opis,
      `opady: ${p.opadyMm === null ? "brak danych" : `${liczba(p.opadyMm, 1)} mm`}` +
        (p.szansaOpadowProcent === null ? "" : ` (szansa ${p.szansaOpadowProcent}%)`),
      p.wiatrMaxKmh === null ? "wiatr: brak danych" : `wiatr: do ${liczba(p.wiatrMaxKmh, 1)} km/h`,
    ],
    zrodlo: p.zrodlo,
    pobrano: p.pobrano,
  };
}

async function kartaWaluty(kodKraju: string | undefined): Promise<Karta> {
  const waluta = kodKraju ? WALUTY_KRAJOW[kodKraju] : undefined;
  if (!waluta) {
    return kartaBledu("waluty", "Waluta", "💱", "NBP", `Nie znam waluty kraju ${kodKraju ?? "docelowego"} — sprawdź ją przed wyjazdem.`);
  }
  if (waluta === "PLN") {
    // Kraj docelowy to Polska — nie pytamy NBP, więc nie podajemy NBP jako źródła.
    return {
      id: "waluty",
      stan: "ok",
      tytul: "Waluta — złoty (PLN)",
      ikona: "💱",
      wartosc: "złoty (PLN)",
      szczegoly: ["Na miejscu płacisz złotówkami — nic nie trzeba przeliczać."],
      zrodlo: "tabela walut w aplikacji",
      pobrano: pobrano(),
    };
  }
  const k = await kursWaluty({ waluta });
  if ("blad" in k) return kartaBledu("waluty", `Waluta — ${waluta}`, "💱", "NBP", k);
  // Dla „drobnych” walut (jen, forint) pokazujemy kurs za 100 jednostek.
  const ile = k.kursSredniPln < 0.1 ? 100 : 1;
  return {
    id: "waluty",
    stan: "ok",
    tytul: `Waluta — ${k.nazwa} (${k.waluta})`,
    ikona: "💱",
    wartosc: `${ile} ${k.waluta} = ${liczba(ile * k.kursSredniPln, 4)} zł`,
    szczegoly: [`100 zł = ${liczba(100 / k.kursSredniPln)} ${k.waluta}`, `kurs średni z dnia ${dataPl(k.dataKursu)}`],
    zrodlo: `${k.zrodlo}, tabela ${k.tabelaNbp}`,
    pobrano: k.pobrano,
  };
}

async function kartaSwiat(kodKraju: string | undefined, data: string): Promise<Karta> {
  const tytul = "Najbliższe dni wolne";
  if (!kodKraju) return kartaBledu("swieta", tytul, "📅", "Nager.Date", "Nie znam kraju docelowego.");
  const rok = Number(data.slice(0, 4));
  const tenRok = await swietaWRoku({ kraj: kodKraju, rok });
  if ("blad" in tenRok) return kartaBledu("swieta", tytul, "📅", "Nager.Date", tenRok);

  let najblizsze = tenRok.swieta.filter((s) => s.data >= data);
  let zrodloPobrano = tenRok.pobrano;
  if (najblizsze.length < 3) {
    const nastepnyRok = await swietaWRoku({ kraj: kodKraju, rok: rok + 1 });
    if ("blad" in nastepnyRok) {
      // Bez przyszłego roku nie mamy czego pokazać — to brak danych, nie „zero świąt”.
      if (najblizsze.length === 0) return kartaBledu("swieta", tytul, "📅", "Nager.Date", nastepnyRok);
    } else {
      najblizsze = [...najblizsze, ...nastepnyRok.swieta];
      zrodloPobrano = nastepnyRok.pobrano;
    }
  }
  const trzy = najblizsze.slice(0, 3);
  if (trzy.length === 0) return kartaBledu("swieta", tytul, "📅", "Nager.Date", "Brak danych o najbliższych świętach.");

  // Nazwa lokalna, gdy jest w alfabecie łacińskim; inaczej angielska (np. dla Japonii).
  const nazwa = (s: { nazwa: string; nazwaAngielska: string }) =>
    /^[\p{Script=Latin}\p{N}\p{P}\p{Zs}]+$/u.test(s.nazwa) ? s.nazwa : s.nazwaAngielska;
  const opis = (s: { data: string; nazwa: string; nazwaAngielska: string }) =>
    `${dataPl(s.data)} — ${nazwa(s)}${s.data === data ? " (w dniu przyjazdu!)" : ""}`;
  return {
    id: "swieta",
    stan: "ok",
    tytul: `${tytul} (${kodKraju})`,
    ikona: "📅",
    wartosc: opis(trzy[0]),
    szczegoly: trzy.slice(1).map(opis),
    zrodlo: "Nager.Date",
    pobrano: zrodloPobrano,
  };
}

async function kartaWikipedii(miejsce: Miejsce): Promise<Karta> {
  // Szukamy samej nazwy miasta — dopisanie kraju potrafi trafić w artykuł o państwie (np. „Nowy Jork”).
  const w = await streszczenieHasla({ haslo: miejsce.nazwa });
  if ("blad" in w) return kartaBledu("wikipedia", "O mieście", "📚", "Wikipedia (pl)", w);
  return {
    id: "wikipedia",
    stan: "ok",
    tytul: `O mieście — ${w.tytul}`,
    ikona: "📚",
    wartosc: dwaZdania(w.streszczenie),
    link: { url: w.link, tekst: "Czytaj w Wikipedii" },
    zrodlo: w.zrodlo,
    pobrano: w.pobrano,
  };
}

async function kartaCzasu(strefa: string | undefined): Promise<Karta> {
  if (!strefa) return kartaBledu("czas", "Czas na miejscu", "🕒", "zegar serwera", "Nie znam strefy czasowej miasta.");
  const c = await czasWStrefie({ strefa });
  if ("blad" in c) return kartaBledu("czas", "Czas na miejscu", "🕒", "zegar serwera", c);
  return {
    id: "czas",
    stan: "ok",
    tytul: "Czas na miejscu",
    ikona: "🕒",
    wartosc: `${c.godzina} (${c.przesuniecie})`,
    szczegoly: [`${c.roznicaWzgledemPolski === "bez różnicy" ? "Ta sama godzina co w Polsce" : `${c.roznicaWzgledemPolski} względem Polski`}`, `${c.dzienTygodnia}, ${c.data}`, c.strefa],
    zrodlo: "zegar serwera (strefa IANA)",
    pobrano: c.pobrano,
  };
}

// ---------- Wejście do API ----------

// Miejsce z geokodowania — przeglądarka odsyła je przy pobieraniu każdej karty.
export const miejsceSchema = z.object({
  nazwa: z.string().trim().min(1).max(100),
  region: z.string().max(100).optional(),
  kraj: z.string().max(100).optional(),
  kodKraju: z.string().regex(/^[A-Z]{2}$/).optional(),
  strefaCzasowa: z.string().max(64).optional(),
  szerokosc: z.number().min(-90).max(90),
  dlugosc: z.number().min(-180).max(180),
});

export const zapytanieKarty = z.object({
  id: z.enum(ID_KART),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  miejsce: miejsceSchema,
});

// 1) Miasto -> miejsce (raz na sprawdzenie). Zwraca Blad, gdy nie ma takiego miasta albo geokodowanie nie odpowiada.
export async function szukajMiejsca(miasto: string): Promise<Miejsce | Blad> {
  return znajdzMiejsce(miasto);
}

// 2) Jedna karta. Każdy nieoczekiwany wyjątek kończy się kartą „brak”, nigdy wymyśloną wartością.
export async function kartaDla(id: IdKarty, miejsce: Miejsce, data: string): Promise<Karta> {
  try {
    switch (id) {
      case "pogoda":
        return await kartaPogody(miejsce, data);
      case "waluty":
        return await kartaWaluty(miejsce.kodKraju);
      case "swieta":
        return await kartaSwiat(miejsce.kodKraju, data);
      case "wikipedia":
        return await kartaWikipedii(miejsce);
      case "czas":
        return await kartaCzasu(miejsce.strefaCzasowa);
    }
  } catch {
    return {
      id,
      stan: "brak",
      niedostepne: true,
      tytul: NAZWY_ZRODEL[id],
      ikona: "⚠",
      blad: "Nie udało się pobrać danych.",
      zrodlo: NAZWY_ZRODEL[id],
      pobrano: pobrano(),
    };
  }
}

// ---------- Podsumowanie od agenta ----------

export const PODSUMOWANIE_PODROZY = `
Jesteś asystentem podróży. Dostaniesz dane o celu podróży z kilku źródeł.
Napisz po polsku 2–3 krótkie zdania: co spakować i na co uważać.
Opieraj się wyłącznie na podanych danych — niczego nie zgaduj i nie uzupełniaj z pamięci.
Nie wspominaj o źródłach, których brakuje — tę informację aplikacja dopisze sama.
Bez list, nagłówków i emotek.
`.trim();

// Karty odesłane z przeglądarki do podsumowania — tylko to, czego model potrzebuje.
export const zapytaniePodsumowania = z.object({
  miasto: z.string().trim().min(2).max(100),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  karty: z
    .array(
      z.object({
        id: z.enum(ID_KART),
        stan: z.enum(["ok", "brak"]),
        tytul: z.string().max(200),
        wartosc: z.string().max(600).optional(),
        szczegoly: z.array(z.string().max(300)).max(5).optional(),
      }),
    )
    .min(1)
    .max(5),
});

// Podsumowanie: zdanie o brakach pisze aplikacja (zawsze i dokładnie), resztę model — tylko z kart „ok”.
export async function podsumujPodroz({
  model,
  zapytanie,
}: {
  model: LanguageModel;
  zapytanie: z.infer<typeof zapytaniePodsumowania>;
}): Promise<{ podsumowanie: string; brakujace: string[] }> {
  const zDanymi = zapytanie.karty.filter((k) => k.stan === "ok");
  const brakujace = ID_KART.filter((id) => !zDanymi.some((k) => k.id === id)).map((id) => NAZWY_ZRODEL[id]);
  const zdanieOBrakach = brakujace.length
    ? `Zabrakło danych z: ${brakujace.join(", ")} — tych informacji nie uwzględniam.`
    : "";

  if (zDanymi.length === 0) {
    return { podsumowanie: "Brak danych ze wszystkich źródeł — spróbuj odświeżyć.", brakujace };
  }

  const { text } = await generateText({
    model,
    instructions: PODSUMOWANIE_PODROZY,
    prompt:
      `Cel: ${zapytanie.miasto}, dzień przyjazdu: ${zapytanie.data}.\nDane:\n` +
      JSON.stringify(zDanymi.map(({ tytul, wartosc, szczegoly }) => ({ tytul, wartosc, szczegoly })), null, 1),
    maxOutputTokens: 300,
    timeout: 25_000,
  });
  const odModelu = text.trim();
  if (!odModelu) throw new Error("Pusta odpowiedź modelu");
  return { podsumowanie: [zdanieOBrakach, odModelu].filter(Boolean).join(" "), brakujace };
}

// ---------- Tryb „Porównaj”: dwa miasta, ten sam termin ----------

export const POROWNANIE_PODROZY = `
Jesteś asystentem podróży. Dostaniesz dane o dwóch miastach (A i B) na ten sam termin.
Poleć dokładnie jedno z nich i uzasadnij wybór w 2–3 zdaniach po polsku.
Uzasadnienie musi opierać się na konkretnych wartościach z danych (np. temperatura, opady, kurs waluty, święta, różnica czasu) — przytocz je.
Nie zgaduj i nie uzupełniaj z pamięci niczego, czego nie ma w danych.
Nie wspominaj o brakujących danych — tę informację aplikacja dopisze sama.
`.trim();

const kartaDoPorownania = z.object({
  id: z.enum(ID_KART),
  stan: z.enum(["ok", "brak"]),
  tytul: z.string().max(200),
  wartosc: z.string().max(600).optional(),
  szczegoly: z.array(z.string().max(300)).max(5).optional(),
});

export const zapytaniePorownania = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  miasta: z
    .array(z.object({ miasto: z.string().trim().min(2).max(100), karty: z.array(kartaDoPorownania).min(1).max(5) }))
    .length(2),
});

// Odpowiedź modelu w ustalonym kształcie: które miasto (A albo B) i dlaczego.
const rekomendacjaSchema = z.object({
  polecane: z.enum(["A", "B"]).describe("A albo B — które miasto polecasz"),
  uzasadnienie: z.string().min(1).max(800).describe("2–3 zdania z konkretnymi wartościami z danych"),
});

export type Rekomendacja = {
  polecane?: string; // nazwa polecanego miasta (brak, gdy nie dało się porównać)
  tekst: string; // pełny tekst do pokazania pod kartami
  brakujace: Record<string, string[]>; // miasto -> źródła bez danych
};

// Rekomendacja: zdania o brakach i decyzję „nie da się porównać” podejmuje aplikacja, wybór i uzasadnienie — model.
export async function porownajPodroze({
  model,
  zapytanie,
}: {
  model: LanguageModel;
  zapytanie: z.infer<typeof zapytaniePorownania>;
}): Promise<Rekomendacja> {
  const [a, b] = zapytanie.miasta;
  const zDanymi = (karty: typeof a.karty) => karty.filter((k) => k.stan === "ok");
  const braki = (karty: typeof a.karty) =>
    ID_KART.filter((id) => !zDanymi(karty).some((k) => k.id === id)).map((id) => NAZWY_ZRODEL[id]);
  const brakujace = { [a.miasto]: braki(a.karty), [b.miasto]: braki(b.karty) };

  const zdanieOBrakach = [a, b]
    .filter((m) => brakujace[m.miasto].length > 0)
    .map((m) => `Dla miasta ${m.miasto} zabrakło danych z: ${brakujace[m.miasto].join(", ")}.`)
    .join(" ");

  // Bez danych dla któregoś miasta porównanie nie byłoby uczciwe — nie pytamy modelu.
  const bezDanych = [a, b].filter((m) => zDanymi(m.karty).length === 0).map((m) => m.miasto);
  if (bezDanych.length > 0) {
    return {
      tekst: `Nie mogę uczciwie porównać — brak danych dla: ${bezDanych.join(", ")}. Spróbuj odświeżyć.`,
      brakujace,
    };
  }

  const opis = (m: typeof a) => zDanymi(m.karty).map(({ tytul, wartosc, szczegoly }) => ({ tytul, wartosc, szczegoly }));
  const { output } = await generateText({
    model,
    instructions: POROWNANIE_PODROZY,
    prompt:
      `Termin: ${zapytanie.data}.\n` +
      `Miasto A: ${a.miasto}\n${JSON.stringify(opis(a), null, 1)}\n\n` +
      `Miasto B: ${b.miasto}\n${JSON.stringify(opis(b), null, 1)}`,
    output: Output.object({ schema: rekomendacjaSchema }),
    maxOutputTokens: 400,
    timeout: 25_000,
  });

  // Wynik modelu sprawdzamy jeszcze raz — nie ufamy mu na słowo.
  const wynik = rekomendacjaSchema.parse(output);
  const polecane = wynik.polecane === "A" ? a.miasto : b.miasto;
  return {
    polecane,
    tekst: [`Polecam: ${polecane}.`, wynik.uzasadnienie.trim(), zdanieOBrakach].filter(Boolean).join(" "),
    brakujace,
  };
}
