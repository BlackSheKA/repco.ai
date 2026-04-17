"use client"

import * as React from "react"

type Theme = "system" | "light" | "dark"

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: "light" | "dark"
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(
  undefined
)

function resolveSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

function applyThemeClass(resolved: "light" | "dark") {
  const el = document.documentElement
  if (resolved === "dark") {
    el.classList.add("dark")
  } else {
    el.classList.remove("dark")
  }
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (typeof window === "undefined") return "system"
    return (localStorage.getItem("theme") as Theme) || "system"
  })

  const [resolvedTheme, setResolvedTheme] = React.useState<"light" | "dark">(
    () => {
      if (typeof window === "undefined") return "light"
      if (theme === "system") return resolveSystemTheme()
      return theme as "light" | "dark"
    }
  )

  const setTheme = React.useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    localStorage.setItem("theme", newTheme)
    const resolved = newTheme === "system" ? resolveSystemTheme() : newTheme
    setResolvedTheme(resolved)
    applyThemeClass(resolved)
  }, [])

  // Listen for system preference changes
  React.useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => {
      if (theme === "system") {
        const resolved = resolveSystemTheme()
        setResolvedTheme(resolved)
        applyThemeClass(resolved)
      }
    }
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [theme])

  // Apply on mount to ensure class is correct
  React.useEffect(() => {
    applyThemeClass(resolvedTheme)
  }, [resolvedTheme])

  const value = React.useMemo(
    () => ({ theme, setTheme, resolvedTheme }),
    [theme, setTheme, resolvedTheme]
  )

  return (
    <ThemeContext.Provider value={value}>
      <ThemeHotkey />
      {children}
    </ThemeContext.Provider>
  )
}

function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

function ThemeHotkey() {
  const { resolvedTheme, setTheme } = useTheme()

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (event.key.toLowerCase() !== "d") {
        return
      }

      if (isTypingTarget(event.target)) {
        return
      }

      setTheme(resolvedTheme === "dark" ? "light" : "dark")
    }

    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [resolvedTheme, setTheme])

  return null
}

export { ThemeProvider, useTheme }
export type { Theme }
