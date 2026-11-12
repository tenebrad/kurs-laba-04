"use client";

import { useRef } from "react";
import { useServerInsertedHTML } from "next/navigation";

// Skrypt, który przed narysowaniem strony ustawia zapisany tryb (jasny/ciemny) na <html>.
// Wstawiamy go raz, przez useServerInsertedHTML — tak zaleca dokumentacja Next.js,
// żeby React nie ostrzegał o znaczniku <script> w komponencie.
const SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function ThemeScript() {
  const inserted = useRef(false);
  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
  });
  return null;
}
