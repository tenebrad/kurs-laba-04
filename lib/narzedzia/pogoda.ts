import { tool } from "ai";
import { z } from "zod";
import { BladApi, blad, bladPolaczenia, pobierzJson, pobrano, zaokraglij, type Blad } from "./wspolne";

// Dane: Open-Meteo, bez klucza.
// 1) geokodowanie: nazwa miasta -> współrzędne (geocoding-api.open-meteo.com/v1/search)
// 2) prognoza dzienna dla współrzędnych (api.open-meteo.com/v1/forecast)

type Geokodowanie = {
  results?: {
    name: string;
    latitude: number;
    longitude: number;
    country?: string;
    country_code?: string;
    admin1?: string;
    timezone?: string;
  }[];
};

// Miejsce znalezione przez geokodowanie — z kodem kraju i strefą czasową (przydają się na /dashboard).
export type Miejsce = {
  nazwa: string;
  region?: string;
  kraj?: string;
  kodKraju?: string;
  strefaCzasowa?: string;
  szerokosc: number;
  dlugosc: number;
};

type Prognoza = {
  timezone: string;
  daily: {
    time: string[];
    weather_code: (number | null)[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
    precipitation_sum: (number | null)[];
    precipitation_probability_max: (number | null)[];
    wind_speed_10m_max: (number | null)[];
  };
};

// Kody pogody WMO (z dokumentacji Open-Meteo) po polsku.
const OPIS_POGODY: Record<number, string> = {
  0: "bezchmurnie",
  1: "przeważnie bezchmurnie",
  2: "częściowe zachmurzenie",
  3: "pochmurno",
  45: "mgła",
  48: "mgła osadzająca szadź",
  51: "lekka mżawka",
  53: "umiarkowana mżawka",
  55: "gęsta mżawka",
  56: "lekka marznąca mżawka",
  57: "gęsta marznąca mżawka",
  61: "słaby deszcz",
  63: "umiarkowany deszcz",
  65: "silny deszcz",
  66: "słaby marznący deszcz",
  67: "silny marznący deszcz",
  71: "słabe opady śniegu",
  73: "umiarkowane opady śniegu",
  75: "intensywne opady śniegu",
  77: "ziarnisty śnieg",
  80: "słabe przelotne opady deszczu",
  81: "umiarkowane przelotne opady deszczu",
  82: "gwałtowne przelotne opady deszczu",
  85: "słabe przelotne opady śniegu",
  86: "intensywne przelotne opady śniegu",
  95: "burza",
  96: "burza z lekkim gradem",
  97: "silna burza",
  99: "burza z silnym gradem",
};

const ZMIENNE = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "precipitation_probability_max",
  "wind_speed_10m_max",
].join(",");

const wejscie = z.object({
  miasto: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .describe("Nazwa miasta, np. „Kraków”. Przy niejasnej nazwie dodaj kraj: „Paris, France”."),
  dniOdDzisiaj: z
    .number()
    .int()
    .min(0)
    .max(15)
    .optional()
    .describe("0 = dziś, 1 = jutro, 2 = pojutrze… Pomiń, gdy podajesz data."),
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data w formacie RRRR-MM-DD")
    .optional()
    .describe("Konkretny dzień w formacie RRRR-MM-DD. Ma pierwszeństwo przed dniOdDzisiaj."),
});

// 1) Nazwa miasta -> miejsce (współrzędne, kraj, strefa czasowa). Zwraca Blad, gdy nie ma takiego miasta.
export async function znajdzMiejsce(miasto: string): Promise<Miejsce | Blad> {
  try {
    const geo = await pobierzJson<Geokodowanie>(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(miasto)}&count=1&language=pl&format=json`,
    );
    const m = geo?.results?.[0];
    if (!m) return blad(`Nie znalazłem miasta „${miasto}”. Sprawdź nazwę albo dodaj kraj, np. „Paris, France”.`);
    return {
      nazwa: m.name,
      region: m.admin1,
      kraj: m.country,
      kodKraju: m.country_code,
      strefaCzasowa: m.timezone,
      szerokosc: m.latitude,
      dlugosc: m.longitude,
    };
  } catch (e) {
    return bladPolaczenia("Open-Meteo", e);
  }
}

// 2) Prognoza na jeden dzień dla znalezionego miejsca.
export async function prognozaDlaMiejsca(
  miejsce: Miejsce,
  { dniOdDzisiaj, data }: { dniOdDzisiaj?: number; data?: string },
) {
  try {
    const zakres = data ? `start_date=${data}&end_date=${data}` : `forecast_days=${(dniOdDzisiaj ?? 0) + 1}`;
    const prognoza = await pobierzJson<Prognoza>(
      `https://api.open-meteo.com/v1/forecast?latitude=${miejsce.szerokosc}&longitude=${miejsce.dlugosc}` +
        `&daily=${ZMIENNE}&timezone=auto&${zakres}`,
    );
    const d = prognoza?.daily;
    const i = d ? d.time.length - 1 : -1; // ostatni dzień z zakresu = dzień, o który pytamy
    if (!d || i < 0) return blad("Open-Meteo nie zwróciło prognozy dla tego dnia.");

    const kod = d.weather_code[i];
    const liczba = (wartosc: number | null) => (wartosc === null ? null : zaokraglij(wartosc, 1));
    return {
      miasto: miejsce.nazwa,
      region: miejsce.region,
      kraj: miejsce.kraj,
      dzien: d.time[i],
      opis: kod === null ? "brak danych" : (OPIS_POGODY[kod] ?? `kod pogody ${kod}`),
      temperaturaMaxC: liczba(d.temperature_2m_max[i]),
      temperaturaMinC: liczba(d.temperature_2m_min[i]),
      opadyMm: liczba(d.precipitation_sum[i]),
      szansaOpadowProcent: d.precipitation_probability_max[i],
      wiatrMaxKmh: liczba(d.wind_speed_10m_max[i]),
      zrodlo: "Open-Meteo",
      pobrano: pobrano(),
    };
  } catch (e) {
    // Open-Meteo odpowiada 400, gdy data jest poza zakresem prognozy.
    if (e instanceof BladApi && e.status === 400) {
      return blad("Nie mam prognozy na ten dzień. Prognoza sięga najwyżej 15 dni do przodu.");
    }
    return bladPolaczenia("Open-Meteo", e);
  }
}

// Zwykła funkcja z całą logiką narzędzia: miasto -> miejsce -> prognoza.
export async function prognozaPogody({ miasto, dniOdDzisiaj, data }: z.input<typeof wejscie>) {
  const miejsce = await znajdzMiejsce(miasto);
  if ("blad" in miejsce) return miejsce;
  return prognozaDlaMiejsca(miejsce, { dniOdDzisiaj, data });
}

export const pogoda = tool({
  description:
    "Prognoza pogody na jeden dzień dla podanego miasta (temperatura, opady, wiatr). " +
    "Użyj, gdy ktoś pyta o pogodę, temperaturę, deszcz, śnieg albo wiatr w jakimś mieście. " +
    "Na dziś, jutro i pojutrze podaj dniOdDzisiaj (0, 1, 2). Na konkretny dzień podaj data (RRRR-MM-DD). " +
    "Prognoza sięga najwyżej 15 dni do przodu.",
  inputSchema: wejscie,
  execute: prognozaPogody,
});
