"use client";

import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Form } from "@/components/ui/form";
import { useWorkspaceFlag } from "@/services/queries/use-feature-flags-admin";
import {
  AgentOptionsFields,
  type ClaudeAgentOptionsForm,
} from "./claude-agent-options";

type AdvancedSdkOptionsProps = {
  projectName: string;
  form: UseFormReturn<ClaudeAgentOptionsForm>;
  disabled?: boolean;
};

export function AdvancedSdkOptions({
  projectName,
  form,
  disabled,
}: AdvancedSdkOptionsProps) {
  const { enabled } = useWorkspaceFlag(projectName, "advanced-sdk-options");
  const [open, setOpen] = useState(false);

  if (!enabled) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer">
        <ChevronRight
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
        Advanced SDK Options
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-3">
          <Form {...form}>
            <AgentOptionsFields form={form} disabled={disabled} />
          </Form>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
