"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_SECTIONS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Permission filtering happens on the server; this component receives the set
 * of hrefs the viewer is allowed to see. Items outside that set are not
 * rendered at all — never rendered-and-disabled.
 */
export function AppSidebar({ allowedHrefs }: { allowedHrefs: string[] }) {
  const pathname = usePathname();
  const allowed = new Set(allowedHrefs);

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => allowed.has(item.href)),
  })).filter((section) => section.items.length > 0);

  return (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
      {sections.map((section) => (
        <div key={section.id} className="flex flex-col gap-1">
          {section.label ? (
            <p className="label-caps px-2 pb-1 text-muted-foreground">{section.label}</p>
          ) : null}

          {section.items.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors",
                  isActive
                    ? "bg-brand-subtle text-brand"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {Icon ? <Icon className="size-4 shrink-0" /> : null}
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
