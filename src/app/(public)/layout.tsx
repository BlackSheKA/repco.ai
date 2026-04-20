import Image from "next/image"
import Link from "next/link"

import logoDark from "@/app/images/repco-dark-mode.svg"
import logoLight from "@/app/images/repco-light-mode.svg"
import { Button } from "@/components/ui/button"

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/80 px-6 backdrop-blur">
        <Link href="/live" className="flex items-center gap-2">
          <Image
            src={logoLight}
            alt="repco"
            height={24}
            className="block h-6 w-auto dark:hidden"
            priority
          />
          <Image
            src={logoDark}
            alt="repco"
            height={24}
            className="hidden h-6 w-auto dark:block"
            priority
          />
        </Link>
        <Button asChild size="sm">
          <Link href="/login">Sign up free</Link>
        </Button>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
