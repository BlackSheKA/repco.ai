"use client"

import Image from "next/image"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import {
  CheckCircle,
  LayoutDashboard,
  Radio,
  Settings,
  Shield,
  Users,
} from "lucide-react"

import logoDark from "@/app/images/repco-dark-mode.svg"
import logoLight from "@/app/images/repco-light-mode.svg"
import { SignOutButton } from "@/features/auth/components/sign-out-button"
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
} from "@/components/ui/sidebar"

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "Signals", icon: Radio, href: "#" },
  { label: "Approvals", icon: CheckCircle, href: "#" },
  { label: "Prospects", icon: Users, href: "#" },
  { label: "Accounts", icon: Shield, href: "/accounts" },
  { label: "Settings", icon: Settings, href: "/settings" },
]

interface AppSidebarProps {
  user: { email: string }
  hasAccountAlerts?: boolean
}

export function AppSidebar({ user, hasAccountAlerts }: AppSidebarProps) {
  const pathname = usePathname()
  const { resolvedTheme } = useTheme()
  const logo = resolvedTheme === "dark" ? logoDark : logoLight

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/"
    if (href === "#") return false
    return pathname.startsWith(href)
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="p-2">
          <Image src={logo} alt="repco" height={28} priority />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.label} className="relative">
                  <SidebarMenuButton asChild isActive={isActive(item.href)}>
                    <a href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </a>
                  </SidebarMenuButton>
                  {item.label === "Accounts" && hasAccountAlerts && (
                    <span
                      className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive"
                      aria-label="Account needs attention"
                    />
                  )}
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
  )
}
