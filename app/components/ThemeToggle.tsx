"use client";

// Przełącznik trybu jasnego i ciemnego.
// Bez zapisanego wyboru strona idzie za ustawieniem systemu.
// Po kliknięciu wybór trafia do localStorage (klucz "theme"), a ThemeScript.tsx
// odczytuje go przy następnym wejściu, zanim strona się narysuje.
// Ikona zmienia się przez CSS, więc serwer i przeglądarka renderują to samo.

export const THEME_KEY = "theme";

function currentTheme(): "light" | "dark" {
  const saved = document.documentElement.getAttribute("data-theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function ThemeToggle() {
  function toggle() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Brak dostępu do localStorage (np. tryb prywatny) — tryb działa do odświeżenia strony.
    }
  }

  return (
    <button
      type="button"
      className="ghost theme-toggle"
      onClick={toggle}
      aria-label="Przełącz tryb jasny lub ciemny"
      title="Przełącz tryb jasny lub ciemny"
    >
      <span className="to-dark" aria-hidden="true">
        ☾
      </span>
      <span className="to-light" aria-hidden="true">
        ☀
      </span>
    </button>
  );
}
