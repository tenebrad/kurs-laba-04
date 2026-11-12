"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ID_KART, type IdKarty } from "@/lib/podroz-karty";
import {
  KartaDanych,
  Kropki,
  dataPl,
  kartyDoModelu,
  plusDni,
  pobierzKarte,
  szukajCelu,
  wszystkieLaduja,
  type Cel,
  type StanKarty,
} from "./KartaPodrozy";
import Porownanie from "./Porownanie";
import ThemeToggle from "./ThemeToggle";

type Tryb = "jedno" | "porownaj";
type Zapytanie = { miasto: string; data: string };
type Podsumowanie = { tekst?: string; blad?: string; laduje: boolean };

// Tryb „Jedno miasto”: pięć kart i podsumowanie od agenta.
function JednoMiasto({ dzisiaj }: { dzisiaj: string }) {
  const [miasto, setMiasto] = useState("");
  const [data, setData] = useState(dzisiaj);
  const [ostatnie, setOstatnie] = useState<Zapytanie | null>(null);
  const [cel, setCel] = useState<Cel | null>(null);
  const [karty, setKarty] = useState<Record<IdKarty, StanKarty> | null>(null);
  const [blad, setBlad] = useState("");
  const [szukam, setSzukam] = useState(false);
  const [podsumowanie, setPodsumowanie] = useState<Podsumowanie | null>(null);
  // Numer zapytania: odpowiedź starszego zapytania nie nadpisze nowszego.
  const numer = useRef(0);

  const ladujeKarty = karty !== null && Object.values(karty).some((k) => k.stan === "laduje");
  const pracuje = szukam || ladujeKarty || podsumowanie?.laduje === true;

  async function sprawdz(z: Zapytanie) {
    const moje = ++numer.current;
    const aktualne = () => moje === numer.current;
    setSzukam(true);
    setBlad("");
    setPodsumowanie(null);
    setOstatnie(z);
    // Odświeżenie czyści stare dane — nigdy nie pokazujemy wyników z poprzedniego sprawdzenia.
    if (karty) setKarty(wszystkieLaduja());

    // 1. Miasto -> miejsce.
    const wynik = await szukajCelu(z.miasto, z.data);
    if (!aktualne()) return;
    setSzukam(false);
    if ("error" in wynik) {
      setCel(null);
      setKarty(null);
      setBlad(wynik.error);
      return;
    }
    setCel(wynik);
    setKarty(wszystkieLaduja());

    // 2. Pięć kart naraz, każda osobno — każda pokazuje się, gdy tylko przyjdzie.
    const gotowe = await Promise.all(
      ID_KART.map(async (id) => {
        const karta = await pobierzKarte(id, wynik.miejsce, wynik.data);
        if (aktualne()) setKarty((stare) => (stare ? { ...stare, [id]: karta } : stare));
        return karta;
      }),
    );
    if (!aktualne()) return;

    // 3. Podsumowanie od agenta — gdy wszystkie karty są już gotowe (także te bez danych).
    setPodsumowanie({ laduje: true });
    const odp = await fetch("/api/podroz/podsumowanie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ miasto: wynik.miejsce.nazwa, data: wynik.data, karty: kartyDoModelu(gotowe) }),
    }).catch(() => null);
    const json = await odp?.json().catch(() => null);
    if (!aktualne()) return;
    setPodsumowanie(
      odp?.ok && json?.podsumowanie
        ? { tekst: json.podsumowanie, laduje: false }
        : { blad: json?.error ?? "Nie udało się przygotować podsumowania. Spróbuj odświeżyć.", laduje: false },
    );
  }

  function wyslij(event: React.FormEvent) {
    event.preventDefault();
    const m = miasto.trim();
    if (m.length < 2 || !data || pracuje) return;
    sprawdz({ miasto: m, data });
  }

  return (
    <>
      <form className="dash-form" onSubmit={wyslij}>
        <label>
          <span>Dokąd jedziesz?</span>
          <input
            value={miasto}
            onChange={(e) => setMiasto(e.target.value)}
            placeholder="np. Lizbona"
            maxLength={100}
            required
          />
        </label>
        <label>
          <span>Kiedy?</span>
          <input
            type="date"
            value={data}
            min={dzisiaj}
            max={plusDni(dzisiaj, 365)}
            onChange={(e) => setData(e.target.value)}
            required
          />
        </label>
        <button type="submit" className="primary" disabled={pracuje || miasto.trim().length < 2 || !data}>
          {szukam ? "Szukam…" : "Sprawdź"}
        </button>
      </form>

      {blad && <p className="error">{blad}</p>}

      {szukam && !karty && (
        <p className="dash-status" role="status">
          <Kropki />
          Szukam miasta…
        </p>
      )}

      {cel && karty && (
        <>
          <div className="dash-naglowek">
            <h2>
              {cel.miejsce.nazwa}
              {cel.miejsce.kraj ? `, ${cel.miejsce.kraj}` : ""} — {dataPl(cel.data)}
            </h2>
            <button type="button" onClick={() => ostatnie && sprawdz(ostatnie)} disabled={pracuje}>
              🔄 Odśwież
            </button>
          </div>

          <div className="karty">
            {ID_KART.map((id) => (
              <KartaDanych key={id} id={id} karta={karty[id]} />
            ))}
          </div>

          <section className="analysis podsumowanie" aria-live="polite">
            <h2>💡 Podsumowanie od agenta</h2>
            {!podsumowanie && <p className="muted">Czekam, aż wszystkie karty będą gotowe…</p>}
            {podsumowanie?.laduje && (
              <p className="typing">
                <Kropki />
                Agent pisze…
              </p>
            )}
            {podsumowanie?.tekst && <p>{podsumowanie.tekst}</p>}
            {podsumowanie?.blad && <p className="error">{podsumowanie.blad}</p>}
          </section>
        </>
      )}
    </>
  );
}

export default function Dashboard({ dzisiaj }: { dzisiaj: string }) {
  const [tryb, setTryb] = useState<Tryb>("jedno");

  return (
    <div className="chat dash">
      <header className="topbar">
        <div className="titlebar">
          <div className="avatar" aria-hidden="true">
            ✈
          </div>
          <h1>Asystent podróży</h1>
          <ThemeToggle />
          <Link className="linkbtn" href="/">
            💬 Czat
          </Link>
        </div>
        <p className="menubar">Pogoda, waluta, święta, opis miasta i czas na miejscu — z pięciu źródeł naraz.</p>
      </header>

      <div className="inner dash-body">
        {/* Zakładki jak w oknach ustawień Windows 98. */}
        <div className="zakladki" role="tablist" aria-label="Tryb asystenta">
          <button type="button" role="tab" aria-selected={tryb === "jedno"} onClick={() => setTryb("jedno")}>
            🗺️ Jedno miasto
          </button>
          <button type="button" role="tab" aria-selected={tryb === "porownaj"} onClick={() => setTryb("porownaj")}>
            ⚖️ Porównaj
          </button>
        </div>

        {/* Oba tryby zostają w pamięci — przełączanie zakładek nie kasuje wyników. */}
        <div role="tabpanel" hidden={tryb !== "jedno"} className="dash-panel">
          <JednoMiasto dzisiaj={dzisiaj} />
        </div>
        <div role="tabpanel" hidden={tryb !== "porownaj"} className="dash-panel">
          <Porownanie dzisiaj={dzisiaj} />
        </div>
      </div>
    </div>
  );
}
