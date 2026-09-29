import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/components/auth-provider";
import { SiteHeader } from "@/components/site-header";
import { ServiceWorkerRegister } from "@/components/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Umiversity", template: "%s · Umiversity" },
  description: "A social learning network for polymaths. Request courses, build them together, learn across fields.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Umiversity" },
};

export const viewport: Viewport = { themeColor: "#0f6e63" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <AuthProvider>
          <SiteHeader />
          <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</div>
          <footer className="border-t border-line py-4 text-center text-xs text-muted">
            Umiversity — learn across fields
          </footer>
        </AuthProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
