"use client";

import { AppSidebar } from "@/components/shell/app-sidebar";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";

interface AppShellProps {
  user: { email: string };
  terminalHeader?: React.ReactNode;
  children: React.ReactNode;
  hasAccountAlerts?: boolean;
}

export function AppShell({ user, terminalHeader, children, hasAccountAlerts }: AppShellProps) {
  const initial = user.email.charAt(0).toUpperCase();

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar user={user} hasAccountAlerts={hasAccountAlerts} />
        <SidebarInset>
          <header className="flex h-12 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <Avatar className="size-8">
                <AvatarFallback className="text-xs">{initial}</AvatarFallback>
              </Avatar>
            </div>
          </header>
          {terminalHeader}
          <main className="flex-1 overflow-y-auto">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
