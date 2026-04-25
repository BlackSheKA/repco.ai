"use client"

import Image from "next/image"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import {
  CheckCircle,
  CreditCard,
  LayoutDashboard,
  Radio,
  Settings,
  Shield,
  Users,
} from "lucide-react"

import logoDark from "@/app/images/repco-dark-mode.svg"
import logoLight from "@/app/images/repco-light-mode.svg"
import { SignOutButton } from "@/features/auth/components/sign-out-button"
import { CreditBalance } from "@/features/billing/components/credit-balance"
import { OnboardingChecklist } from "@/features/onboarding/components/onboarding-checklist"
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
  { label: "Signals", icon: Radio, href: "/signals" },
  { label: "Approvals", icon: CheckCircle, href: "#" },
  { label: "Prospects", icon: Users, href: "/prospects" },
  { label: "Accounts", icon: Shield, href: "/accounts" },
  { label: "Billing", icon: CreditCard, href: "/billing" },
  { label: "Settings", icon: Settings, href: "/settings" },
]

interface OnboardingState {
  productDescribed: boolean
  keywordsGenerated: boolean
  redditConnected: boolean
  firstDmApproved: boolean
}

interface AppSidebarProps {
  user: { email: string }
  hasAccountAlerts?: boolean
  creditBalance?: number
  onboarding?: OnboardingState
}

export function AppSidebar({
  user,
  hasAccountAlerts,
  creditBalance,
  onboarding,
}: AppSidebarProps) {
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
        <Image src={logo} alt="repco" height={32} priority className="ml-2" />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const showAlert =
                  item.label === "Accounts" && hasAccountAlerts
                return (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton asChild isActive={isActive(item.href)}>
                      <a href={item.href}>
                        <span className="relative inline-flex">
                          <item.icon />
                          {showAlert && (
                            <span
                              className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-sidebar"
                              aria-label="Account needs attention"
                            />
                          )}
                        </span>
                        <span>{item.label}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {onboarding && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <OnboardingChecklist {...onboarding} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <div className="space-y-2 p-2">
          {typeof creditBalance === "number" && (
            <CreditBalance balance={creditBalance} />
          )}
          <p className="truncate text-sm text-muted-foreground">
            {user.email}
          </p>
          <SignOutButton />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
