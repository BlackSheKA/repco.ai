"use client";

import {
  CheckCircle,
  LayoutDashboard,
  Radio,
  Settings,
  Shield,
  Users,
} from "lucide-react";

import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { cn } from "@/lib/utils";

interface SidebarProps {
  user: { email: string };
  open?: boolean;
  onClose?: () => void;
}

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, active: true },
  { label: "Signals", icon: Radio, active: false },
  { label: "Approvals", icon: CheckCircle, active: false },
  { label: "Prospects", icon: Users, active: false },
  { label: "Accounts", icon: Shield, active: false },
  { label: "Settings", icon: Settings, active: false },
];

export function Sidebar({ user, open, onClose }: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[240px] flex-col bg-secondary transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand */}
        <div className="p-6">
          <span className="font-heading text-[28px]">repco</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.label}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                item.active
                  ? "border-l-[3px] border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </button>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="space-y-2 border-t p-4">
          <p className="max-w-[180px] truncate text-sm text-muted-foreground">
            {user.email}
          </p>
          <SignOutButton />
        </div>
      </aside>
    </>
  );
}
