import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Upload,
  FileText,
  ShieldAlert,
  ListChecks,
  MessageSquare,
  GitCompare,
  Calendar,
  Scale,
  FileDown,
  Settings,
  Sparkles,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "./theme-toggle";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "./ui/button";

const mainItems = [
  { title: "Dashboard", to: "/app", icon: LayoutDashboard },
  { title: "Upload", to: "/app/upload", icon: Upload },
  { title: "Contracts", to: "/app/contracts", icon: FileText },
];

const analysisItems = [
  { title: "Analysis", to: "/app/analysis", icon: ShieldAlert },
  { title: "Clauses", to: "/app/clauses", icon: ListChecks },
  { title: "Chat", to: "/app/chat", icon: MessageSquare },
  { title: "Compare", to: "/app/compare", icon: GitCompare },
];

const trackItems = [
  { title: "Timeline", to: "/app/timeline", icon: Calendar },
  { title: "Obligations", to: "/app/obligations", icon: Scale },
  { title: "Reports", to: "/app/reports", icon: FileDown },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isActive = (to: string) =>
    to === "/app" ? pathname === "/app" : pathname.startsWith(to);

  const renderGroup = (label: string, items: typeof mainItems) => (
    <SidebarGroup>
      {!collapsed && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.to}>
              <SidebarMenuButton asChild isActive={isActive(item.to)} tooltip={item.title}>
                <Link to={item.to} className="flex items-center gap-2">
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  const initials =
    user?.name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out");
    void navigate({ to: "/login" });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/" className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg brand-gradient text-primary-foreground shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="font-display text-sm font-semibold">ContrAIct</span>
              <span className="text-[10px] text-muted-foreground">Contract Risk AI</span>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {renderGroup("Workspace", mainItems)}
        {renderGroup("Analysis", analysisItems)}
        {renderGroup("Track", trackItems)}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/app/settings")} tooltip="Settings">
                  <Link to="/app/settings" className="flex items-center gap-2">
                    <Settings className="h-4 w-4 shrink-0" />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-between gap-2 px-2 py-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 shrink-0 rounded-full brand-gradient text-primary-foreground flex items-center justify-center text-xs font-semibold">
              {initials}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{user?.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
              </div>
            )}
          </div>
          {!collapsed && (
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleSignOut}
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
