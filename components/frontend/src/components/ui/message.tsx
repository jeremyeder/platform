"use client";

import React from "react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { formatTimestamp } from "@/lib/format-timestamp";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export type MessageRole = "bot" | "user";

export type MessageProps = {
  role: MessageRole;
  content: string;
  isLoading?: boolean;
  avatar?: string;
  name?: string;
  className?: string;
  components?: Components;
  borderless?: boolean;
  actions?: React.ReactNode;
  timestamp?: string;
  streaming?: boolean;
  /** Feedback buttons to show below the message (for bot messages) */
  feedbackButtons?: React.ReactNode;
};

// Code block component with copy button
const CodeBlock = ({ children, className }: { children?: React.ReactNode; className?: string }) => {
  const [copied, setCopied] = React.useState(false);
  const codeContent = String(children || '');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(codeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-2">
      <pre className="bg-muted text-foreground py-3 px-4 rounded-lg text-xs overflow-x-auto border">
        <code className={className}>{children}</code>
      </pre>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        className="absolute top-2 right-2 h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 hover:bg-background"
        title={copied ? "Copied!" : "Copy code"}
      >
        {copied ? (
          <>
            <Check className="h-3 w-3 mr-1" />
            <span className="text-xs">Copied</span>
          </>
        ) : (
          <>
            <Copy className="h-3 w-3 mr-1" />
            <span className="text-xs">Copy</span>
          </>
        )}
      </Button>
    </div>
  );
};

const defaultComponents: Components = {
  code: ({
    inline,
    className,
    children,
    ...props
  }: {
    inline?: boolean;
    className?: string;
    children?: React.ReactNode;
  } & React.HTMLAttributes<HTMLElement>) => {
    // Convert children to string to check length
    const codeContent = String(children || '');
    const isShortCode = codeContent.length <= 50 && !codeContent.includes('\n');

    // Treat short code blocks as inline
    if (inline || isShortCode) {
      return (
        <code
          className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono"
          {...(props as React.HTMLAttributes<HTMLElement>)}
        >
          {children}
        </code>
      );
    }

    // Full code blocks with copy button
    return <CodeBlock className={className}>{children}</CodeBlock>;
  },
  p: ({ children }) => (
    <p className="text-muted-foreground leading-relaxed mb-[0.2rem] text-sm">{children}</p>
  ),
  h1: ({ children }) => (
    <h1 className="text-lg font-bold text-foreground mb-2">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-md font-semibold text-foreground mb-2">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-medium text-foreground mb-1">{children}</h3>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-outside ml-4 mb-2 space-y-1 text-muted-foreground text-sm">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-outside ml-4 mb-2 space-y-1 text-muted-foreground text-sm">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="leading-relaxed">{children}</li>
  ),
};

const LOADING_MESSAGES = [
  "Pretending to be productive",
  "Downloading more RAM",
  "Consulting the magic 8-ball",
  "Teaching bugs to behave",
  "Brewing digital coffee",
  "Rolling for initiative",
  "Surfing the data waves",
  "Juggling bits and bytes",
  "Tipping my fedora",
  "Reticulating splines",
];

export const LoadingDots = () => {
  const [messageIndex, setMessageIndex] = React.useState(() =>
    Math.floor(Math.random() * LOADING_MESSAGES.length)
  );

  React.useEffect(() => {
    const intervalId = setInterval(() => {
      setMessageIndex((prevIndex) => (prevIndex + 1) % LOADING_MESSAGES.length);
    }, 8000);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <div className="flex items-center mt-2 animate-in fade-in duration-300">
      <svg
        width="24"
        height="8"
        viewBox="0 0 24 8"
        xmlns="http://www.w3.org/2000/svg"
        className="mr-2 text-primary"
      >
        <style>
          {`
            @keyframes loadingDotPulse {
              0%, 60%, 100% {
                opacity: 0.3;
                transform: scale(0.8);
              }
              30% {
                opacity: 1;
                transform: scale(1.1);
              }
            }
            .loading-dot {
              animation: loadingDotPulse 1.4s infinite ease-in-out;
              transform-origin: center;
            }
            .loading-dot-1 {
              animation-delay: 0s;
            }
            .loading-dot-2 {
              animation-delay: 0.2s;
            }
            .loading-dot-3 {
              animation-delay: 0.4s;
            }
          `}
        </style>
        <circle
          className="loading-dot loading-dot-1"
          cx="4"
          cy="4"
          r="3"
          fill="currentColor"
        />
        <circle
          className="loading-dot loading-dot-2"
          cx="12"
          cy="4"
          r="3"
          fill="currentColor"
        />
        <circle
          className="loading-dot loading-dot-3"
          cx="20"
          cy="4"
          r="3"
          fill="currentColor"
        />
      </svg>
      <span className="ml-2 text-xs text-muted-foreground/70 animate-in fade-in duration-500">
        {LOADING_MESSAGES[messageIndex]}
      </span>
    </div>
  );
};

export const Message = React.forwardRef<HTMLDivElement, MessageProps>(
  (
    { role, content, isLoading, className, components, borderless, actions, timestamp, streaming, feedbackButtons, ...props },
    ref
  ) => {
    const isBot = role === "bot";
    const avatarBg = isBot ? "bg-blue-600" : "bg-green-600";
    const avatarText = isBot ? "AI" : "U";
    const formattedTime = formatTimestamp(timestamp);
    const isActivelyStreaming = streaming && isBot;

    const avatar = (
      <div className="flex-shrink-0">
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center",
          avatarBg,
          (isLoading || isActivelyStreaming) && "animate-pulse"
        )}
      >
        <span className="text-white text-xs font-semibold">
          {avatarText}
        </span>
      </div>
    </div>
    )

    return (
      <div
        ref={ref}
        className={cn(
          "mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300",
          isBot && "mt-2",
          className
        )}
        {...props}
      >
        <div className={cn("flex space-x-3", isBot ? "items-start" : "items-center justify-end")}>
          {/* Avatar */}
         {isBot ? avatar : null}

          {/* Message Content */}
          <div className={cn("flex-1 min-w-0", !isBot && "max-w-[70%]")}>
            {/* Timestamp */}
            {formattedTime && (
              <div className={cn("text-[10px] text-muted-foreground/60 mb-1", !isBot && "text-right")}>
                {formattedTime}
              </div>
            )}
            <div className={cn(
              borderless ? "p-0" : "rounded-2xl shadow-sm",
              !borderless && (isBot
                ? "bg-card border border-border/50 hover:shadow-md transition-shadow"
                : "bg-primary/10 border border-primary/20"
              )
            )}>
              {/* Content */}
              <div className={cn("text-sm text-foreground", !isBot && "py-2.5 px-4")}>
                {isLoading ? (
                  <div>
                    <div className="text-sm text-muted-foreground mb-2">{content}</div>
                    <LoadingDots />
                  </div>
                ) : (
                  <div className="inline">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={components || defaultComponents}
                    >
                      {content}
                    </ReactMarkdown>
                    {isActivelyStreaming && (
                      <span className="inline-block w-2 h-4 bg-primary/70 animate-pulse ml-0.5 align-middle" />
                    )}
                  </div>
                )}
              </div>

              {/* Feedback buttons for bot messages */}
              {isBot && feedbackButtons && !isLoading && !streaming && (
                <div className="mt-2 flex items-center">
                  {feedbackButtons}
                </div>
              )}

              {actions ? (
                <div className={cn(borderless ? "mt-1" : "mt-3 pt-2 border-t")}>{actions}</div>
              ) : null}
            </div>
          </div>

          {isBot ? null : avatar}
        </div>
      </div>
    );
  }
);

Message.displayName = "Message";
