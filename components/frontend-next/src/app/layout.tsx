import type { Metadata } from "next";
import "./globals.css";
import { ChatSidebar } from "@/components/chat-sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { SyntaxThemeProvider } from "@/components/providers/syntax-theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Ambient Code Platform",
  description:
    "ACP is an AI-native agentic-powered enterprise software development platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const wsBase = env.BACKEND_URL.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')
  return (
    // suppressHydrationWarning is required for next-themes to prevent hydration mismatch
    // between server-rendered content and client-side theme application
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="backend-ws-base" content={wsBase} />
      </head>
      {/* suppressHydrationWarning is needed here as well since ThemeProvider modifies the class attribute */}
      <body className="font-sans antialiased" suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <SyntaxThemeProvider />
          <QueryProvider>
            <TooltipProvider>
              <div className="flex h-screen overflow-hidden">
                <ChatSidebar />
                <main className="flex-1 overflow-y-auto">{children}</main>
              </div>
              <Toaster />
            </TooltipProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
