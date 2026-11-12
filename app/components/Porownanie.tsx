"use client";

import { Fragment, useRef, useState } from "react";
import type { Rekomendacja } from "@/lib/podroz";
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

// Tryb „Porównaj”: dwa miasta, ten sam termin, karty obok siebie i rekomendacja agenta.

type Zapytanie = { miasta: [string, string]; data: string };
type StanRekomendacji = { laduje: boolean; wynik?: Rekomendacja; blad?: string };

const LITERY = ["A", "B"] as const;

export default function Porownanie({ dzisiaj }: { dzisiaj: string }) {
  const [miasta, setMiasta] = useState<[string, string]>(["", ""]);
  const [data, setData] = useState(dzisiaj);
  const [ostatnie, setOstatnie] = useState<Zapytanie | null>(null);
  const [cele, setCele] = useState<[Cel, Cel] | null>(null);
  const [karty, setKarty] = useState<[Record<IdKarty, StanKarty>, Record<IdKarty, StanKarty>] | null>(null);
  const [blad, setBlad] = useState("");
  const [szukam, setSzukam] = useState(false);
  const [rekomendacja, setRekomendacja] = useState<StanRekomendacji | null>(null);
  const numer = useRef(0);

  const ladujeKarty = karty !== null && karty.some((k) => Object.values(k).some((s) => s.stan === "laduje"));
  const pracuje = szukam || ladujeKarty || rekomendacja?.laduje === true;
  const gotowyFormularz = miasta.every((m) => m.trim().length >= 2) && !!data;

  async function porownaj(z: Zapytanie) {
    const moje = ++numer.current;
    const aktualne = () => moje === numer.current;
    setSzukam(true);
    setBlad("");
    setRekomendacja(null);
    setOstatnie(z);
    if (karty) setKarty([wszystkieLaduja(), wszystkieLaduja()]); // nigdy nie zostawiamy starych danych

    // 1. Oba miasta naraz.
    const wyniki = await Promise.all(z.miasta.map((m) => szukajCelu(m, z.data)));
    if (!aktualne()) return;
    setSzukam(false);
    const bledy = wyniki
      .map((w, i) => ("error" in w ? `Miasto ${LITERY[i]} („${z.miasta[i]}”): ${w.error}` : ""))
      .filter(Boolean);
    if (bledy.length > 0) {
      setCele(null);
      setKarty(null);
      setBlad(bledy.join(" "));
      return;
    }
    const [a, b] = wyniki as [Cel, Cel];
    if (a.miejsce.szerokosc === b.miejsce.szerokosc && a.miejsce.dlugosc === b.miejsce.dlugosc) {
      setCele(null);
      setKarty(null);
      setBlad(`Oba pola wskazują to samo miejsce (${a.miejsce.nazwa}). Wpisz dwa różne miasta.`);
      return;
    }
    setCele([a, b]);
    setKarty([wszystkieLaduja(), wszystkieLaduja()]);

    // 2. Dziesięć kart naraz (po pięć na miasto), każda osobno.
    const gotowe = await Promise.all(
      [a, b].map((cel, i) =>
        Promise.all(
          ID_KART.map(async (id) => {
            const karta = await pobierzKarte(id, cel.miejsce, cel.data);
            if (aktualne()) {
              setKarty((stare) => {
                if (!stare) return stare;
                const nowe: typeof stare = [stare[0], stare[1]];
                nowe[i] = { ...stare[i], [id]: karta };
                return nowe;
              });
            }
            return karta;
          }),
        ),
      ),
    );
    if (!aktualne()) return;

    // 3. Rekomendacja agenta, gdy wszystkie karty są gotowe.
    setRekomendacja({ laduje: true });
    const odp = await fetch("/api/podroz/porownanie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: a.data,
        miasta: [
          { miasto: a.miejsce.nazwa, karty: kartyDoModelu(gotowe[0]) },
          { miasto: b.miejsce.nazwa, karty: kartyDoModelu(gotowe[1]) },
        ],
      }),
    }).catch(() => null);
    const json = await odp?.json().catch(() => null);
    if (!aktualne()) return;
    setRekomendacja(
      odp?.ok && json?.tekst
        ? { laduje: false, wynik: json as Rekomendacja }
        : { laduje: false, blad: json?.error ?? "Nie udało się przygotować rekomendacji. Spróbuj odświeżyć." },
    );
  }

  function wyslij(event: React.FormEvent) {
    event.preventDefault();
    if (!gotowyFormularz || pracuje) return;
    const [m1, m2] = miasta.map((m) => m.trim());
    if (m1.toLowerCase() === m2.toLowerCase()) {
      setBlad("Wpisz dwa różne miasta.");
      return;
    }
    porownaj({ miasta: [m1, m2], data });
  }

  const ustawMiasto = (i: 0 | 1, wartosc: string) =>
    setMiasta((stare) => (i === 0 ? [wartosc, stare[1]] : [stare[0], wartosc]));

  return (
    <>
      <form className="dash-form porownaj-form" onSubmit={wyslij}>
        {([0, 1] as const).map((i) => (
          <label key={i}>
            <span>Miasto {LITERY[i]}</span>
            <input
              value={miasta[i]}
              onChange={(e) => ustawMiasto(i, e.target.value)}
              placeholder={i === 0 ? "np. Lizbona" : "np. Rzym"}
              maxLength={100}
              required
            />
          </label>
        ))}
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
        <button type="submit" className="primary" disabled={pracuje || !gotowyFormularz}>
          {szukam ? "Szukam…" : "Porównaj"}
        </button>
      </form>

      {blad && <p className="error">{blad}</p>}

      {szukam && !karty && (
        <p className="dash-status" role="status">
          <Kropki />
          Szukam obu miast…
        </p>
      )}

      {cele && karty && (
        <>
          <div className="dash-naglowek">
            <h2>Porównanie — {dataPl(cele[0].data)}</h2>
            <button type="button" onClick={() => ostatnie && porownaj(ostatnie)} disabled={pracuje}>
              🔄 Odśwież
            </button>
          </div>

          {/* Siatka: nagłówki miast, potem wiersze kart tego samego rodzaju obok siebie. */}
          <div className="porownanie">
            {cele.map((cel, i) => {
              const polecane = rekomendacja?.wynik?.polecane === cel.miejsce.nazwa;
              return (
                <div key={i} className={`porownanie-miasto${polecane ? " polecane" : ""}`}>
                  <span className="litera">{LITERY[i]}</span>
                  <span>
                    {cel.miejsce.nazwa}
                    {cel.miejsce.kraj ? `, ${cel.miejsce.kraj}` : ""}
                  </span>
                  {polecane && <span className="odznaka">★ Polecam</span>}
                </div>
              );
            })}
            {ID_KART.map((id) => (
              <Fragment key={id}>
                <KartaDanych id={id} karta={karty[0][id]} miasto={cele[0].miejsce.nazwa} />
                <KartaDanych id={id} karta={karty[1][id]} miasto={cele[1].miejsce.nazwa} />
              </Fragment>
            ))}
          </div>

          <section className="analysis podsumowanie" aria-live="polite">
            <h2>🏆 Rekomendacja agenta</h2>
            {!rekomendacja && <p className="muted">Czekam, aż karty obu miast będą gotowe…</p>}
            {rekomendacja?.laduje && (
              <p className="typing">
                <Kropki />
                Agent porównuje…
              </p>
            )}
            {rekomendacja?.wynik && <p>{rekomendacja.wynik.tekst}</p>}
            {rekomendacja?.blad && <p className="error">{rekomendacja.blad}</p>}
          </section>
        </>
      )}
    </>
  );
}
