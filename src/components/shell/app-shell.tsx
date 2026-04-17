"use client";

import { useState } from "react";

import { Header } from "@/components/shell/header";
import { Sidebar } from "@/components/shell/sidebar";

interface AppShellProps {
  user: { email: string };
  children: React.ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen">
      <Sidebar
        user={user}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          user={user}
          onMenuToggle={() => setSidebarOpen((prev) => !prev)}
        />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
