import type { Metadata } from "next";

import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = {
  title: "Sign in - repco",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen">
      {/* Left panel — always dark brand panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#09090B] items-center justify-center flex-col gap-2">
        <span className="font-sans text-[40px] text-white">repco</span>
        <p className="text-base text-[#A1A1AA]">
          Your AI sales rep that never sleeps.
        </p>
      </div>

      {/* Right panel — auth form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-[400px]">
          {/* Mobile brand header */}
          <div className="lg:hidden text-center mb-8">
            <span className="font-sans text-2xl">repco</span>
          </div>

          <LoginForm />
        </div>
      </div>
    </div>
  );
}
