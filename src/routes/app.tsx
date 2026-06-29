import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

const titles: Record<string, string> = {
  "/app": "Dashboard",
  "/app/upload": "Upload contract",
  "/app/contracts": "Contracts",
  "/app/analysis": "Analysis",
  "/app/clauses": "Clauses",
  "/app/chat": "Chat with contract",
  "/app/compare": "Compare contracts",
  "/app/timeline": "Timeline",
  "/app/obligations": "Obligations",
  "/app/reports": "Reports",
  "/app/settings": "Settings",
};

function AppLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title =
    titles[pathname] ??
    (pathname.startsWith("/app/contracts/") ? "Contract detail" : "ContrAIct");

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b bg-background/80 px-4 backdrop-blur">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <div className="hidden sm:block">
                <h1 className="font-display text-sm font-semibold">{title}</h1>
                <p className="text-[11px] text-muted-foreground">ContrAIct workspace</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild size="sm" className="brand-gradient text-primary-foreground shadow-sm">
                <Link to="/app/upload">
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  New analysis
                </Link>
              </Button>
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
