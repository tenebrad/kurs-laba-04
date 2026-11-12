"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

export default function Login({ botName, tagline }: { botName: string; tagline: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (response.ok) {
      router.refresh();
    } else {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "Nie udało się zalogować.");
    }
  }

  return (
    <div className="login-screen">
      <div className="corner">
        <ThemeToggle />
      </div>
      {/* Okno dialogowe w stylu Windows 98: pasek tytułu + treść. */}
      <form className="login raised" onSubmit={submit}>
        <div className="titlebar">
          <h1>Logowanie</h1>
        </div>
        <div className="login-body">
          <div className="login-head">
            <div className="avatar" aria-hidden="true">
              {botName.charAt(0)}
            </div>
            <div>
              <h2>{botName}</h2>
              <p className="muted">{tagline}</p>
            </div>
          </div>
          <p>Podaj hasło, żeby wejść do czatu.</p>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Hasło"
            aria-label="Hasło"
            autoFocus
          />
          <button type="submit" className="primary" disabled={busy || !password}>
            {busy ? "Sprawdzam…" : "Wejdź"}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      </form>
    </div>
  );
}
