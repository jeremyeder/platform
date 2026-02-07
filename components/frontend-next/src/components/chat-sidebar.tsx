"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Plus, PanelLeftClose, PanelLeft, MessageSquare, Settings, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectSelector } from "@/components/project-selector";
import { UserBubble } from "@/components/user-bubble";
import { ThemeToggle } from "@/components/theme-toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ChatSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  // Extract project name from pathname: /projects/[name]/...
  const projectMatch = pathname?.match(/^\/projects\/([^/]+)/);
  const currentProject = projectMatch ? projectMatch[1] : null;

  // Extract session name from pathname: /projects/[name]/sessions/[sessionName]
  const sessionMatch = pathname?.match(/^\/projects\/([^/]+)\/sessions\/([^/]+)/);
  const currentSession = sessionMatch ? sessionMatch[2] : null;

  if (collapsed) {
    return (
      <div className="flex flex-col items-center w-14 h-screen bg-sidebar border-r border-sidebar-border py-3 gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 text-sidebar-foreground/60 hover:text-sidebar-foreground"
          onClick={() => setCollapsed(false)}
        >
          <PanelLeft className="w-4 h-4" />
        </Button>
        {currentProject && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href={`/projects/${currentProject}`}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{currentProject}</TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col w-[260px] h-screen bg-sidebar border-r border-sidebar-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-14 border-b border-sidebar-border">
        <Link href="/projects" className="flex items-center gap-2">
          <span className="font-semibold text-sm text-sidebar-foreground">ACP</span>
        </Link>
        <div className="flex items-center gap-1">
          {currentProject && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={`/projects/${currentProject}/sessions/new`}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent>New session</TooltipContent>
            </Tooltip>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 text-sidebar-foreground/60 hover:text-sidebar-foreground"
            onClick={() => setCollapsed(true)}
          >
            <PanelLeftClose className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Project selector */}
      <div className="px-3 py-2 border-b border-sidebar-border">
        <ProjectSelector />
      </div>

      {/* Navigation links */}
      <nav className="flex-1 overflow-y-auto scrollbar-hover px-2 py-2">
        {currentProject && (
          <div className="space-y-0.5">
            <Link
              href={`/projects/${currentProject}`}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors",
                !currentSession && !pathname?.includes("/keys") && !pathname?.includes("/permissions")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <MessageSquare className="w-4 h-4 flex-shrink-0" />
              <span>Sessions</span>
            </Link>
            <Link
              href={`/projects/${currentProject}/keys`}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors",
                pathname?.includes("/keys")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <Settings className="w-4 h-4 flex-shrink-0" />
              <span>Settings</span>
            </Link>
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-sidebar-border">
        <div className="flex items-center justify-between">
          <UserBubble />
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
