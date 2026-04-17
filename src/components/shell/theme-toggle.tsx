"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

const CYCLE = ["system", "light", "dark"] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleToggle = useCallback(() => {
    const currentIndex = CYCLE.indexOf(
      (theme as (typeof CYCLE)[number]) ?? "system"
    );
    const nextIndex = (currentIndex + 1) % CYCLE.length;
    setTheme(CYCLE[nextIndex]);
  }, [theme, setTheme]);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="Toggle color theme">
        <Monitor className="size-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      aria-label="Toggle color theme"
    >
      {theme === "dark" && <Sun className="size-4" />}
      {theme === "light" && <Moon className="size-4" />}
      {theme === "system" && <Monitor className="size-4" />}
    </Button>
  );
}
