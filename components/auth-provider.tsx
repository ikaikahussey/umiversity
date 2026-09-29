"use client";
import { NeonAuthUIProvider } from "@neondatabase/auth/react/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { authClient } from "@/lib/auth/client";

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <NeonAuthUIProvider
      authClient={authClient}
      navigate={router.push}
      replace={router.replace}
      onSessionChange={() => router.refresh()}
      Link={Link}
      redirectTo="/"
      social={{ providers: ["google"] }}
      defaultTheme="light"
    >
      {children}
    </NeonAuthUIProvider>
  );
}
