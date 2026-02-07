"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Brain, ChevronRight } from "lucide-react";
import type { ThinkingBlock } from "@/types/agentic-session";

export type ThinkingMessageProps = {
  block: ThinkingBlock;
  className?: string;
};

export const ThinkingMessage: React.FC<ThinkingMessageProps> = ({ block, className }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn("mb-2 group", className)}>
      <div className="flex items-center gap-2 max-w-3xl mx-auto px-4">
        <div
          className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
          onClick={() => setExpanded((e) => !e)}
        >
          <Brain className="w-4 h-4" />
          <span>Thinking</span>
          <ChevronRight className={cn("w-3 h-3 transition-transform", expanded && "rotate-90")} />
        </div>
      </div>
      {expanded && (
        <div className="max-w-3xl mx-auto px-4 mt-2">
          <div className="rounded-lg border border-border-light bg-muted/30 p-3">
            <pre className="text-xs whitespace-pre-wrap break-words text-muted-foreground">{block.thinking}</pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThinkingMessage;
