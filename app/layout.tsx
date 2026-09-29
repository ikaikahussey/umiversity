import type { Metadata, Viewport } from "next";
import { Graduate, Source_Sans_3 } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ServiceWorkerRegister } from "@/components/sw-register";
import "./globals.css";

const graduate = Graduate({ weight: "400", subsets: ["latin"], display: "swap", variable: "--font-graduate" });
const sourceSans = Source_Sans_3({
  weight: ["400", "600", "700"],
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-source-sans",
});

export const metadata: Metadata = {
  title: { default: "Umiversity", template: "%s · Umiversity" },
  description: "A social learning network for polymaths. Request courses, build them together, learn across fields.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Umiversity" },
};

export const viewport: Viewport = { themeColor: "#0f6e63" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${graduate.variable} ${sourceSans.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <AuthProvider>
          <SiteHeader />
          <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</div>
          <SiteFooter />
        </AuthProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
