"use client";

import React from "react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { formatTimestamp } from "@/lib/format-timestamp";
import { Sparkles } from "lucide-react";

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
    const codeContent = String(children || '');
    const isShortCode = codeContent.length <= 50 && !codeContent.includes('\n');

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

    return (
      <pre className="bg-muted text-foreground py-3 rounded text-xs overflow-x-auto border my-2">
        <code
          className={className}
          {...(props as React.HTMLAttributes<HTMLElement>)}
        >
          {children}
        </code>
      </pre>
    );
  },
  p: ({ children }) => (
    <p className="text-foreground leading-relaxed mb-[0.2rem] text-sm">{children}</p>
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
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline cursor-pointer"
    >
      {children}
    </a>
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
    <div className="flex items-center mt-2">
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
              }
              30% {
                opacity: 1;
              }
            }
            .loading-dot {
              animation: loadingDotPulse 1.4s infinite ease-in-out;
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
      <span className="ml-2 text-xs text-muted-foreground/60">{LOADING_MESSAGES[messageIndex]}</span>
    </div>
  );
};

export const Message = React.forwardRef<HTMLDivElement, MessageProps>(
  (
    { role, content, isLoading, className, components, borderless, actions, timestamp, streaming, feedbackButtons, ...props },
    ref
  ) => {
    const isBot = role === "bot";
    const formattedTime = formatTimestamp(timestamp);
    const isActivelyStreaming = streaming && isBot;

    // --- User message: right-aligned bubble ---
    if (!isBot) {
      return (
        <div ref={ref} className={cn("mb-4", className)} {...props}>
          <div className="max-w-3xl mx-auto">
            <div className="group flex flex-col items-end">
              <div className="max-w-[80%] rounded-2xl bg-muted/60 px-4 py-2.5">
                <p className="text-sm text-foreground font-sans whitespace-pre-wrap">
                  {content}
                </p>
              </div>
              {formattedTime && (
                <span className="text-[10px] text-muted-foreground/60 mt-1 mr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {formattedTime}
                </span>
              )}
            </div>
          </div>
        </div>
      );
    }

    // --- Bot message: flat, full-width with icon ---
    return (
      <div ref={ref} className={cn("mb-4 group", className)} {...props}>
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-3 items-start">
            {/* Bot icon */}
            <div
              className={cn(
                "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-foreground/5 mt-0.5",
                (isLoading || isActivelyStreaming) && "animate-pulse"
              )}
            >
              <Sparkles className="w-4 h-4 text-foreground/70" />
            </div>

            {/* Content area */}
            <div className="min-w-0 flex-1 font-sans">
              {isLoading ? (
                <div>
                  <div className="text-sm text-muted-foreground mb-2">{content}</div>
                  <LoadingDots />
                </div>
              ) : (
                <div
                  className={cn(
                    "inline text-sm text-foreground",
                    isActivelyStreaming && "result-streaming"
                  )}
                >
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

              {/* Feedback buttons -- visible on hover */}
              {feedbackButtons && !isLoading && !streaming && (
                <div className="mt-1.5 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {feedbackButtons}
                </div>
              )}

              {actions && (
                <div className={cn(borderless ? "mt-1" : "mt-3 pt-2 border-t")}>{actions}</div>
              )}

              {/* Timestamp on hover */}
              {formattedTime && (
                <span className="block text-[10px] text-muted-foreground/60 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {formattedTime}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

Message.displayName = "Message";
