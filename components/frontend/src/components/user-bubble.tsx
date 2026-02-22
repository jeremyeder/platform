"use client";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useCurrentUser } from "@/services/queries";

export function UserBubble() {
  const { data: me, isLoading } = useCurrentUser();

  const initials = (me?.displayName || me?.username || me?.email || "?")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  if (isLoading || !me) return <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />;

  if (!me.authenticated) {
    return (
      <Button variant="ghost" size="sm">Sign in</Button>
    );
  }

  return (
    <div className="flex items-center gap-2 m-2 p-1 pr-2 cursor-pointer rounded-md hover:bg-accent hover:text-accent-foreground transition-colors">
      <Avatar>
        <AvatarImage alt={me.displayName || initials} />
        <AvatarFallback>{initials || "?"}</AvatarFallback>
      </Avatar>
      <span className="hidden sm:block text-sm text-muted-foreground">{me.displayName}</span>
    </div>
  );
}


