import Image from "next/image";
import { barn } from "@/config/barn";
import { NotificationBell } from "@/components/NotificationBell";

export function AppHeader({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-brand-ink/10 bg-brand-cream/95 backdrop-blur">
      <div className="mx-auto flex max-w-screen-sm items-center gap-3 px-4 py-2">
        <Image
          src={barn.brand.logoSrc}
          alt={barn.name}
          width={36}
          height={36}
          priority
          className="size-9 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-brand-ink/50">
            {barn.shortName}
          </p>
          <h1 className="truncate text-lg font-semibold leading-tight">{title}</h1>
        </div>
        <NotificationBell />
      </div>
    </header>
  );
}
