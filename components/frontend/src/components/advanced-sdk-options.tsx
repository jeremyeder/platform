"use client";

import { useState, useCallback } from "react";
import type { UseFormReturn } from "react-hook-form";
import { ChevronRight, Check, X, Settings2 } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWorkspaceFlag } from "@/services/queries/use-feature-flags-admin";
import {
  AgentOptionsFields,
  claudeAgentOptionsDefaults,
  type ClaudeAgentOptionsForm,
} from "./claude-agent-options";

type AdvancedSdkOptionsProps = {
  projectName: string;
  form: UseFormReturn<ClaudeAgentOptionsForm>;
  disabled?: boolean;
};

/** Return non-default field entries as a flat record for display. */
function getSavedSummary(
  values: Partial<ClaudeAgentOptionsForm>,
): Record<string, string> {
  const defaults = claudeAgentOptionsDefaults as Record<string, unknown>;
  const summary: Record<string, string> = {};

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      Object.keys(value as Record<string, unknown>).length === 0
    )
      continue;
    if (
      key in defaults &&
      JSON.stringify(value) === JSON.stringify(defaults[key])
    )
      continue;

    // Format display value
    if (typeof value === "boolean") {
      summary[key] = value ? "on" : "off";
    } else if (typeof value === "number") {
      summary[key] = String(value);
    } else if (typeof value === "string") {
      summary[key] = value.length > 30 ? `${value.slice(0, 27)}...` : value;
    } else {
      summary[key] = "configured";
    }
  }

  return summary;
}

export function AdvancedSdkOptions({
  projectName,
  form,
  disabled,
}: AdvancedSdkOptionsProps) {
  const { enabled } = useWorkspaceFlag(projectName, "advanced-sdk-options");
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedValues, setSavedValues] = useState<Record<string, string>>({});
  const [showAbandonDialog, setShowAbandonDialog] = useState(false);
  const [snapshotValues, setSnapshotValues] =
    useState<Partial<ClaudeAgentOptionsForm> | null>(null);

  const hasSavedOptions = Object.keys(savedValues).length > 0;

  const isDirty = useCallback(() => {
    const current = form.getValues();
    const compare = snapshotValues ?? claudeAgentOptionsDefaults;
    return JSON.stringify(current) !== JSON.stringify(compare);
  }, [form, snapshotValues]);

  const handleSave = useCallback(() => {
    const values = form.getValues();
    const summary = getSavedSummary(values);
    setSavedValues(summary);
    setSaved(true);
    setEditing(false);
    setSnapshotValues(values);
  }, [form]);

  const handleStartEdit = useCallback(() => {
    setSnapshotValues(form.getValues());
    setEditing(true);
    setSaved(false);
  }, [form]);

  const handleCollapse = useCallback(() => {
    if (editing && isDirty()) {
      setShowAbandonDialog(true);
    } else {
      setEditing(false);
    }
  }, [editing, isDirty]);

  const handleAbandon = useCallback(() => {
    if (snapshotValues) {
      form.reset(snapshotValues as ClaudeAgentOptionsForm);
    } else {
      form.reset(claudeAgentOptionsDefaults as ClaudeAgentOptionsForm);
    }
    setEditing(false);
    setShowAbandonDialog(false);
  }, [form, snapshotValues]);

  const handleSaveFromDialog = useCallback(() => {
    handleSave();
    setShowAbandonDialog(false);
  }, [handleSave]);

  if (!enabled) return null;

  // Saved state: show compact summary
  if (saved && !editing && hasSavedOptions) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={handleStartEdit}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer"
        >
          <Settings2 className="h-4 w-4 shrink-0" />
          SDK Options
          <Check className="h-4 w-4 text-green-500 ml-auto" />
        </button>
        <div className="flex flex-wrap gap-1.5 px-3">
          {Object.entries(savedValues).map(([key, value]) => (
            <Badge
              key={key}
              variant="secondary"
              className="text-xs font-normal"
            >
              {key.replace(/_/g, " ")}: {value}
            </Badge>
          ))}
        </div>
      </div>
    );
  }

  // Editing state: show full form
  return (
    <>
      <Collapsible open={editing} onOpenChange={(open) => {
        if (open) {
          handleStartEdit();
        } else {
          handleCollapse();
        }
      }}>
        <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer">
          <ChevronRight
            className={`h-4 w-4 shrink-0 transition-transform duration-200 ${editing ? "rotate-90" : ""}`}
          />
          Advanced SDK Options
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pt-3 space-y-3">
            <Form {...form}>
              <AgentOptionsFields form={form} disabled={disabled} />
            </Form>
            <div className="flex items-center gap-2 px-1">
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={disabled}
              >
                <Check className="h-3.5 w-3.5 mr-1.5" />
                Save Options
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCollapse}
                disabled={disabled}
              >
                Cancel
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Dirty form guard */}
      <Dialog open={showAbandonDialog} onOpenChange={setShowAbandonDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved SDK Options</DialogTitle>
            <DialogDescription>
              You have unsaved changes to the SDK options. Save them or discard?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleAbandon}>
              <X className="h-3.5 w-3.5 mr-1.5" />
              Discard
            </Button>
            <Button onClick={handleSaveFromDialog}>
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
