"use client";

import { ChevronDown, LogOut, User } from "lucide-react";

import { logoutAction } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({
  fullName,
  username,
  roleNames,
}: {
  fullName: string;
  username: string;
  roleNames: string[];
}) {
  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("tr-TR") ?? "")
    .join("");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 pl-1.5 pr-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
            {initials || <User className="size-3.5" />}
          </span>
          <span className="hidden max-w-[12rem] truncate sm:inline">{fullName}</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2 py-1.5">
          <p className="truncate text-[13px] font-medium">{fullName}</p>
          <p className="truncate text-xs text-muted-foreground">@{username}</p>
        </div>

        {roleNames.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Roller</DropdownMenuLabel>
            <p className="px-2 pb-1.5 text-[13px] text-muted-foreground">
              {roleNames.join(", ")}
            </p>
          </>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            void logoutAction();
          }}
        >
          <LogOut />
          Çıkış yap
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
