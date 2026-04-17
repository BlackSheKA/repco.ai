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
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/", active: true },
  { label: "Signals", icon: Radio, href: "#", active: false },
  { label: "Approvals", icon: CheckCircle, href: "#", active: false },
  { label: "Prospects", icon: Users, href: "#", active: false },
  { label: "Accounts", icon: Shield, href: "#", active: false },
  { label: "Settings", icon: Settings, href: "/settings", active: false },
];

interface AppSidebarProps {
  user: { email: string };
}

export function AppSidebar({ user }: AppSidebarProps) {
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="p-2">
          <span className="text-xl font-semibold">repco</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton asChild isActive={item.active}>
                    <a href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="space-y-2 p-2">
          <p className="truncate text-sm text-muted-foreground">
            {user.email}
          </p>
          <SignOutButton />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
