import Link from "next/link";
import { Wordmark } from "./logo";

export function SiteFooter() {
  return (
    <footer className="umi-footer">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-6 text-center text-sm">
        <Link href="/" aria-label="Umiversity home" className="inline-flex">
          <Wordmark className="h-7 w-auto" />
        </Link>
        <p>Umiversity — learn across fields</p>
      </div>
    </footer>
  );
}
