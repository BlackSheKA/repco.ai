import type { Metadata } from "next"
import Image from "next/image"

import logoDark from "@/app/images/repco-dark-mode.svg"
import logoLight from "@/app/images/repco-light-mode.svg"
import { LoginForm } from "@/features/auth/components/login-form"

export const metadata: Metadata = {
  title: "Sign in - repco",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen">
      {/* Left panel — always dark brand panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#09090B] items-center justify-center flex-col gap-2">
        <Image src={logoDark} alt="repco" height={48} priority />
        <p className="text-base text-[#A1A1AA]">
          Your AI sales rep that never sleeps.
        </p>
      </div>

      {/* Right panel — auth form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-[400px]">
          {/* Mobile brand header */}
          <div className="lg:hidden text-center mb-8">
            <Image
              src={logoLight}
              alt="repco"
              height={28}
              className="dark:hidden"
              priority
            />
            <Image
              src={logoDark}
              alt="repco"
              height={28}
              className="hidden dark:block"
              priority
            />
          </div>

          <LoginForm />
        </div>
      </div>
    </div>
  );
}
