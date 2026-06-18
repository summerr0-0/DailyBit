"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Leaf } from "lucide-react";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/garden", label: "Garden", icon: Leaf },
] as const;

export function SiteNav() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col py-2">
      <Link href="/" className="flex items-center px-3 py-3 mb-2">
        <span className="font-extrabold text-xl tracking-tight">DailyBit</span>
      </Link>
      <nav className="flex flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-4 px-3 py-3 rounded-full hover:bg-muted transition-colors w-fit ${
                active ? "font-bold" : "text-foreground/80"
              }`}
            >
              <Icon
                className="h-[26px] w-[26px] shrink-0"
                strokeWidth={active ? 2.5 : 2}
              />
              <span className="text-[1.0625rem]">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
