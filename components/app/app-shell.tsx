"use client";

import * as React from "react";
import Link from "next/link";
import { Menu } from "lucide-react";

import { AppSidebar } from "@/components/app/app-sidebar";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { UserMenu } from "@/components/app/user-menu";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export type ShellUser = {
  fullName: string;
  username: string;
  roleNames: string[];
};

/**
 * Desktop-first shell: a narrow fixed sidebar, a thin utility bar, and the
 * rest of the width given to content. Below `lg` the sidebar becomes a sheet
 * rather than shrinking the content area.
 */
export function AppShell({
  allowedHrefs,
  periodLabel,
  todayLabel,
  user,
  children,
}: {
  allowedHrefs: string[];
  periodLabel: string | null;
  todayLabel: string;
  user: ShellUser;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const brand = (
    <Link href="/daily" className="flex items-center gap-2 px-2 py-3">
      <span aria-hidden className="text-brand">
        ◆
      </span>
      <span className="text-[13px] font-semibold tracking-tight">CentralBee</span>
    </Link>
  );

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="border-b border-sidebar-border px-3">{brand}</div>
        <AppSidebar allowedHrefs={allowedHrefs} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-5">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="lg:hidden"
                aria-label="Menüyü aç"
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64 sm:max-w-xs">
              <SheetTitle className="sr-only">Menü</SheetTitle>
              <div className="border-b border-border px-3">{brand}</div>
              <div
                className="flex flex-1 flex-col overflow-hidden"
                onClick={() => setMobileOpen(false)}
              >
                <AppSidebar allowedHrefs={allowedHrefs} />
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex min-w-0 items-center gap-3 text-[13px] text-muted-foreground">
            <span className="tabular whitespace-nowrap">{todayLabel}</span>
            {periodLabel ? (
              <>
                <span aria-hidden className="text-border">
                  |
                </span>
                <span className="whitespace-nowrap">
                  Dönem <span className="text-foreground">{periodLabel}</span>
                </span>
              </>
            ) : null}
          </div>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu
              fullName={user.fullName}
              username={user.username}
              roleNames={user.roleNames}
            />
          </div>
        </header>

        <main className="flex-1 px-3 py-5 sm:px-5 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
