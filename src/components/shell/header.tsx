"use client";

import { Menu } from "lucide-react";

import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  user: { email: string };
  onMenuToggle: () => void;
}

export function Header({ user, onMenuToggle }: HeaderProps) {
  const initial = user.email.charAt(0).toUpperCase();

  return (
    <header className="flex h-12 items-center justify-between border-b bg-background px-4">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuToggle}
        aria-label="Open navigation menu"
      >
        <Menu className="size-4" />
      </Button>

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <Avatar>
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
