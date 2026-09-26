import { useCallback, useEffect, useState } from "react";

const KEY = "ledger-theme";
export type Theme = "light" | "dark";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stored = (localStorage.getItem(KEY) as Theme | null) ?? "dark";
    setTheme(stored);
    document.documentElement.classList.toggle("dark", stored === "dark");
  }, []);

  const apply = useCallback((next: Theme) => {
    setTheme(next);
    localStorage.setItem(KEY, next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }, []);

  const toggle = useCallback(() => apply(theme === "dark" ? "light" : "dark"), [apply, theme]);

  return { theme, setTheme: apply, toggle };
}
