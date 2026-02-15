"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Settings,
  Terminal,
  Users,
  Paperclip,
  Clock,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { AutocompletePopover, type AutocompleteAgent, type AutocompleteCommand } from "./AutocompletePopover";
import { AttachmentPreview, type PendingAttachment } from "./AttachmentPreview";

// Maximum file size: 10MB for all types
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export interface ChatInputBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => Promise<void>;
  onInterrupt: () => Promise<void>;
  onPasteImage?: (file: File) => Promise<void>;
  onUploadFile?: (file: File) => Promise<void>;
  isRunActive?: boolean;
  isSending?: boolean;
  disabled?: boolean;
  placeholder?: string;
  agents?: AutocompleteAgent[];
  commands?: AutocompleteCommand[];
  onCommandClick?: (slashCommand: string) => void;
  showSystemMessages?: boolean;
  onShowSystemMessagesChange?: (show: boolean) => void;
  showCompactMode?: boolean;
  onShowCompactModeChange?: (show: boolean) => void;
  showTimestamps?: boolean;
  onShowTimestampsChange?: (show: boolean) => void;
  queuedCount?: number;
}

export const ChatInputBox: React.FC<ChatInputBoxProps> = ({
  value,
  onChange,
  onSend,
  onInterrupt,
  onPasteImage,
  onUploadFile,
  isRunActive = false,
  isSending = false,
  disabled = false,
  placeholder,
  agents = [],
  commands = [],
  onCommandClick,
  showSystemMessages = false,
  onShowSystemMessagesChange,
  showCompactMode = false,
  onShowCompactModeChange,
  showTimestamps = true,
  onShowTimestampsChange,
  queuedCount = 0,
}) => {
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Autocomplete state
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [autocompleteType, setAutocompleteType] = useState<"agent" | "command" | null>(null);
  const [autocompleteFilter, setAutocompleteFilter] = useState("");
  const [autocompleteTriggerPos, setAutocompleteTriggerPos] = useState(0);
  const [autocompleteSelectedIndex, setAutocompleteSelectedIndex] = useState(0);

  // Attachment state
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);

  // Popover states
  const [agentsPopoverOpen, setAgentsPopoverOpen] = useState(false);
  const [commandsPopoverOpen, setCommandsPopoverOpen] = useState(false);

  // Interrupting state
  const [interrupting, setInterrupting] = useState(false);

  // Dynamic placeholder
  const getPlaceholder = () => {
    if (placeholder) return placeholder;
    if (isRunActive) {
      return "Type a message (will be queued)...";
    }
    return "Type a message... (Enter to send, Shift+Enter for new line)";
  };

  // Handle paste events for images
  const handlePaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(e.clipboardData?.items || []);
      const imageItems = items.filter((item) => item.type.startsWith("image/"));

      if (imageItems.length > 0 && onPasteImage) {
        e.preventDefault();

        for (const item of imageItems) {
          const file = item.getAsFile();
          if (file) {
            if (file.size > MAX_FILE_SIZE) {
              toast({
                variant: "destructive",
                title: "File too large",
                description: `Maximum file size is 10MB. Your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`,
              });
              continue;
            }

            // Generate preview for image
            const preview = await generatePreview(file);
            const attachment: PendingAttachment = {
              id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              file,
              preview,
            };

            setPendingAttachments((prev) => [...prev, attachment]);

            // Upload immediately
            try {
              attachment.uploading = true;
              setPendingAttachments((prev) =>
                prev.map((a) => (a.id === attachment.id ? { ...a, uploading: true } : a))
              );

              await onPasteImage(file);

              toast({
                title: "Image uploaded",
                description: `${file.name} has been uploaded to your workspace.`,
              });

              // Remove from pending after successful upload
              setPendingAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
            } catch (error) {
              setPendingAttachments((prev) =>
                prev.map((a) =>
                  a.id === attachment.id
                    ? { ...a, uploading: false, error: "Upload failed" }
                    : a
                )
              );
            }
          }
        }
      }
    },
    [onPasteImage, toast]
  );

  // Generate preview for image files
  const generatePreview = (file: File): Promise<string | undefined> => {
    return new Promise((resolve) => {
      if (!file.type.startsWith("image/")) {
        resolve(undefined);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(file);
    });
  };

  // Handle file input change
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        toast({
          variant: "destructive",
          title: "File too large",
          description: `Maximum file size is 10MB. ${file.name} is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`,
        });
        continue;
      }

      const preview = await generatePreview(file);
      const attachment: PendingAttachment = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        file,
        preview,
      };

      setPendingAttachments((prev) => [...prev, attachment]);

      if (onUploadFile) {
        try {
          setPendingAttachments((prev) =>
            prev.map((a) => (a.id === attachment.id ? { ...a, uploading: true } : a))
          );

          await onUploadFile(file);

          toast({
            title: "File uploaded",
            description: `${file.name} has been uploaded.`,
          });

          setPendingAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
        } catch (error) {
          setPendingAttachments((prev) =>
            prev.map((a) =>
              a.id === attachment.id
                ? { ...a, uploading: false, error: "Upload failed" }
                : a
            )
          );
        }
      }
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Handle removing attachment
  const handleRemoveAttachment = (attachmentId: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
  };

  // Handle autocomplete selection
  const handleAutocompleteSelect = (item: AutocompleteAgent | AutocompleteCommand) => {
    if (!textareaRef.current) return;

    const cursorPos = textareaRef.current.selectionStart;
    const textBefore = value.substring(0, autocompleteTriggerPos);
    const textAfter = value.substring(cursorPos);

    let insertText = "";
    if (autocompleteType === "agent") {
      const agent = item as AutocompleteAgent;
      const agentNameShort = agent.name.split(" - ")[0];
      insertText = `@${agentNameShort} `;
    } else if (autocompleteType === "command") {
      const cmd = item as AutocompleteCommand;
      insertText = `${cmd.slashCommand} `;
    }

    const newText = textBefore + insertText + textAfter;
    onChange(newText);

    // Reset autocomplete
    setAutocompleteOpen(false);
    setAutocompleteType(null);
    setAutocompleteFilter("");
    setAutocompleteSelectedIndex(0);

    // Set cursor position after insert
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = textBefore.length + insertText.length;
        textareaRef.current.selectionStart = newCursorPos;
        textareaRef.current.selectionEnd = newCursorPos;
        textareaRef.current.focus();
      }
    }, 0);
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;

    onChange(newValue);

    // Check if we should show autocomplete
    if (cursorPos > 0) {
      const charBeforeCursor = newValue[cursorPos - 1];
      const textBeforeCursor = newValue.substring(0, cursorPos);

      // Check for @ or / trigger
      if (charBeforeCursor === "@" || charBeforeCursor === "/") {
        // Make sure it's at the start or after whitespace
        if (cursorPos === 1 || /\s/.test(newValue[cursorPos - 2])) {
          setAutocompleteTriggerPos(cursorPos - 1);
          setAutocompleteType(charBeforeCursor === "@" ? "agent" : "command");
          setAutocompleteFilter("");
          setAutocompleteSelectedIndex(0);
          setAutocompleteOpen(true);
          return;
        }
      }

      // Update filter if autocomplete is open
      if (autocompleteOpen) {
        const filterText = textBeforeCursor.substring(autocompleteTriggerPos + 1);

        // Close if we've moved past the trigger or hit whitespace
        if (cursorPos <= autocompleteTriggerPos || /\s/.test(filterText)) {
          setAutocompleteOpen(false);
          setAutocompleteType(null);
          setAutocompleteFilter("");
        } else {
          setAutocompleteFilter(filterText);
          setAutocompleteSelectedIndex(0);
        }
      }
    } else {
      // Cursor at start, close autocomplete
      if (autocompleteOpen) {
        setAutocompleteOpen(false);
        setAutocompleteType(null);
        setAutocompleteFilter("");
      }
    }
  };

  // Handle key events
  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Get filtered items for autocomplete navigation
    const getFilteredItems = () => {
      const filterLower = autocompleteFilter.toLowerCase();
      if (autocompleteType === "agent") {
        return agents.filter((a) => a.name.toLowerCase().includes(filterLower));
      }
      if (autocompleteType === "command") {
        return commands.filter(
          (c) =>
            c.name.toLowerCase().includes(filterLower) ||
            c.slashCommand.toLowerCase().includes(filterLower)
        );
      }
      return [];
    };

    const filteredItems = getFilteredItems();

    // Handle autocomplete navigation
    if (autocompleteOpen && filteredItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAutocompleteSelectedIndex((prev) =>
          prev < filteredItems.length - 1 ? prev + 1 : prev
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setAutocompleteSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        handleAutocompleteSelect(filteredItems[autocompleteSelectedIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setAutocompleteOpen(false);
        setAutocompleteType(null);
        setAutocompleteFilter("");
        return;
      }
    }

    // Ctrl+Space to manually trigger autocomplete
    if (e.key === " " && e.ctrlKey) {
      e.preventDefault();
      // Default to agent autocomplete
      const cursorPos = textareaRef.current?.selectionStart || 0;
      setAutocompleteTriggerPos(cursorPos);
      setAutocompleteType("agent");
      setAutocompleteFilter("");
      setAutocompleteSelectedIndex(0);
      setAutocompleteOpen(true);
      return;
    }

    // Regular enter to send (queues if agent is busy)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isSending) {
        if (isRunActive) {
          toast({
            title: "Message queued",
            description: "Your message will be sent when the agent is ready.",
          });
        }
        await onSend();
      }
    }
  };

  // Handle send button click
  const handleSend = async () => {
    if (value.trim() && !isSending) {
      if (isRunActive) {
        toast({
          title: "Message queued",
          description: "Your message will be sent when the agent is ready.",
        });
      }
      await onSend();
    }
  };

  // Handle interrupt
  const handleInterrupt = async () => {
    setInterrupting(true);
    try {
      await onInterrupt();
    } finally {
      setInterrupting(false);
    }
  };

  // Textarea border style based on state
  const getTextareaStyle = () => {
    if (isRunActive) {
      return "border-amber-400/50 bg-amber-50/30 dark:bg-amber-950/10";
    }
    return "";
  };

  return (
    <div className="sticky bottom-0 bg-card">
      <div className="px-2 pt-2 pb-0 space-y-1.5 max-w-[90%] mx-auto mb-4">
        {/* Attachment preview */}
        <AttachmentPreview
          attachments={pendingAttachments}
          onRemove={handleRemoveAttachment}
        />

        {/* Textarea with autocomplete */}
        <div className="relative">
          {/* Queue indicator */}
          {isRunActive && queuedCount > 0 && (
            <div className="absolute -top-6 left-0 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <Clock className="h-3 w-3" />
              {queuedCount} message{queuedCount > 1 ? "s" : ""} queued
            </div>
          )}

          <textarea
            ref={textareaRef}
            className={`w-full border rounded p-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${getTextareaStyle()}`}
            placeholder={getPlaceholder()}
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={3}
            disabled={disabled}
          />

          {/* Autocomplete popup */}
          <AutocompletePopover
            open={autocompleteOpen}
            type={autocompleteType}
            filter={autocompleteFilter}
            selectedIndex={autocompleteSelectedIndex}
            agents={agents}
            commands={commands}
            onSelect={handleAutocompleteSelect}
            onSelectedIndexChange={setAutocompleteSelectedIndex}
            onClose={() => {
              setAutocompleteOpen(false);
              setAutocompleteType(null);
              setAutocompleteFilter("");
            }}
          />
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Settings dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Display Settings</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {onShowSystemMessagesChange && (
                  <DropdownMenuCheckboxItem
                    checked={showSystemMessages}
                    onCheckedChange={onShowSystemMessagesChange}
                  >
                    Show system messages
                  </DropdownMenuCheckboxItem>
                )}
                {onShowTimestampsChange && (
                  <DropdownMenuCheckboxItem
                    checked={showTimestamps}
                    onCheckedChange={onShowTimestampsChange}
                  >
                    Show timestamps
                  </DropdownMenuCheckboxItem>
                )}
                {onShowCompactModeChange && (
                  <DropdownMenuCheckboxItem
                    checked={showCompactMode}
                    onCheckedChange={onShowCompactModeChange}
                  >
                    Compact mode
                  </DropdownMenuCheckboxItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Attach button */}
            {onUploadFile && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileSelect}
                  multiple
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach file"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </>
            )}

            {/* Agents Button */}
            {agents.length > 0 && (
              <Popover open={agentsPopoverOpen} onOpenChange={setAgentsPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    Agents
                    <Badge
                      variant="secondary"
                      className="ml-0.5 h-4 px-1.5 text-[10px] font-medium"
                    >
                      {agents.length}
                    </Badge>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" side="top" className="w-[500px]">
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Available Agents</h4>
                      <p className="text-xs text-muted-foreground">
                        Mention agents in your message to collaborate with them
                      </p>
                    </div>
                    <div className="max-h-[400px] overflow-y-scroll space-y-2 pr-2 scrollbar-thin">
                      {agents.map((agent) => {
                        const agentNameShort = agent.name.split(" - ")[0];
                        return (
                          <div key={agent.id} className="p-3 rounded-md border bg-muted/30">
                            <div className="flex items-center justify-between mb-1">
                              <h3 className="text-sm font-bold">{agent.name}</h3>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-shrink-0 h-7 text-xs"
                                onClick={() => {
                                  onChange(value + `@${agentNameShort} `);
                                  setAgentsPopoverOpen(false);
                                  textareaRef.current?.focus();
                                }}
                              >
                                @{agentNameShort}
                              </Button>
                            </div>
                            {agent.description && (
                              <p className="text-xs text-muted-foreground">
                                {agent.description}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {/* Commands Button */}
            {commands.length > 0 && (
              <Popover open={commandsPopoverOpen} onOpenChange={setCommandsPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 gap-1.5">
                    <Terminal className="h-3.5 w-3.5" />
                    Commands
                    <Badge
                      variant="secondary"
                      className="ml-0.5 h-4 px-1.5 text-[10px] font-medium"
                    >
                      {commands.length}
                    </Badge>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" side="top" className="w-[500px]">
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Available Commands</h4>
                      <p className="text-xs text-muted-foreground">
                        Run workflow commands to perform specific actions
                      </p>
                    </div>
                    <div className="max-h-[400px] overflow-y-scroll space-y-2 pr-2 scrollbar-thin">
                      {commands.map((cmd) => (
                        <div key={cmd.id} className="p-3 rounded-md border bg-muted/30">
                          <div className="flex items-center justify-between mb-1">
                            <h3 className="text-sm font-bold">{cmd.name}</h3>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-shrink-0 h-7 text-xs"
                              onClick={() => {
                                if (onCommandClick) {
                                  onCommandClick(cmd.slashCommand);
                                  setCommandsPopoverOpen(false);
                                }
                              }}
                            >
                              Run {cmd.slashCommand}
                            </Button>
                          </div>
                          {cmd.description && (
                            <p className="text-xs text-muted-foreground">
                              {cmd.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* Send/Stop buttons */}
          <div className="flex gap-2">
            {isRunActive ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleInterrupt}
                disabled={interrupting}
              >
                {interrupting && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleSend}
                disabled={!value.trim() || isSending || disabled}
              >
                {isSending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                Send
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInputBox;
