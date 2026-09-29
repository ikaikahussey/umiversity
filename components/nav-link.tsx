"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Header navigation link with a teal underline on hover and on the active section. */
export function NavLink({ href, children, ...rest }: { href: string; children: ReactNode; "aria-label"?: string; "data-testid"?: string }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
  return (
    <Link href={href} className="umi-nav-link" aria-current={active ? "page" : undefined} {...rest}>
      {children}
    </Link>
  );
}
