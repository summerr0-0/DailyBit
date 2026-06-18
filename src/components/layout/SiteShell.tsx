import type { ReactNode } from "react";
import { SiteNav } from "./SiteNav";

type Props = {
  children: ReactNode;
  right?: ReactNode;
};

export function SiteShell({ children, right }: Props) {
  return (
    <div className="flex min-h-screen justify-center">
      <div className="flex w-full max-w-[1300px]">
        {/* Left sidebar */}
        <aside className="hidden md:flex flex-col w-[244px] shrink-0 sticky top-0 h-screen border-r border-border">
          <SiteNav />
        </aside>

        {/* Center feed */}
        <div className="flex-1 min-w-0 border-r border-border min-h-screen">
          {children}
        </div>

        {/* Right panel */}
        {right ? (
          <aside className="hidden lg:flex flex-col w-[350px] shrink-0 px-6 pt-6 gap-4">
            {right}
          </aside>
        ) : (
          <div className="hidden lg:block w-[350px] shrink-0" />
        )}
      </div>
    </div>
  );
}
