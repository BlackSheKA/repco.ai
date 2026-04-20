import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { OnboardingWizard } from "@/features/onboarding/components/onboarding-wizard"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Welcome to repco",
}

// Render wizard with fixed positioning so it overlays the AppShell (sidebar +
// header) inherited from the (app) layout.
export default async function OnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <OnboardingWizard />
    </div>
  )
}
