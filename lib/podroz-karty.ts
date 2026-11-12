// Lista kart asystenta podróży i nazwy ich źródeł — wspólne dla serwera i przeglądarki
// (ten plik celowo nic nie importuje, żeby można go było użyć w komponencie klienta).

export const ID_KART = ["pogoda", "waluty", "swieta", "wikipedia", "czas"] as const;
export type IdKarty = (typeof ID_KART)[number];

// Nazwy źródeł do podsumowania („Zabrakło danych z: …”).
export const NAZWY_ZRODEL: Record<IdKarty, string> = {
  pogoda: "pogoda (Open-Meteo)",
  waluty: "kurs waluty (NBP)",
  swieta: "święta (Nager.Date)",
  wikipedia: "opis miasta (Wikipedia)",
  czas: "czas na miejscu",
};

// Nagłówek i źródło karty, zanim przyjdą dane (stan „Ładuję…”).
export const OPIS_KARTY: Record<IdKarty, { ikona: string; tytul: string; zrodlo: string }> = {
  pogoda: { ikona: "🌤️", tytul: "Pogoda", zrodlo: "Open-Meteo" },
  waluty: { ikona: "💱", tytul: "Waluta", zrodlo: "NBP" },
  swieta: { ikona: "📅", tytul: "Najbliższe dni wolne", zrodlo: "Nager.Date" },
  wikipedia: { ikona: "📚", tytul: "O mieście", zrodlo: "Wikipedia (pl)" },
  czas: { ikona: "🕒", tytul: "Czas na miejscu", zrodlo: "zegar serwera" },
};
