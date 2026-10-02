import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Coins,
  FileText,
  LayoutDashboard,
  ListOrdered,
  MessageCircleMore,
  LogOut,
  Menu,
  Moon,
  Settings as SettingsIcon,
  Sun,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/holdings", label: "Holdings", icon: BarChart3 },
  { to: "/transactions", label: "Transactions", icon: ListOrdered },
  { to: "/cash", label: "Cash", icon: Wallet },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/assistant", label: "AI Assistant", icon: MessageCircleMore },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

function AuthenticatedLayout() {
  const { session, loading, signOut, user } = useAuth();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (loading || !session) {
    return (
      <div className="text-muted-foreground flex min-h-screen items-center justify-center text-sm">Loading ledger…</div>
    );
  }

  return (
    <div className="bg-background flex min-h-screen">
      <aside className="border-border bg-sidebar hidden w-60 shrink-0 flex-col border-r lg:flex">
        <div className="px-5 py-6">
          <Link to="/dashboard" className="text-base font-extrabold tracking-tight">
            EGX<span className="text-primary">Ledger</span>
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => (
            <NavItem key={item.to} {...item} active={pathname.startsWith(item.to)} />
          ))}
        </nav>
        <div className="border-border space-y-2 border-t p-3">
          <div className="text-muted-foreground truncate px-2 text-xs">{user?.email}</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={toggle}>
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={async () => {
                await signOut();
                navigate({ to: "/auth" });
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border bg-background/90 sticky top-0 z-30 flex items-center justify-between border-b px-4 py-3 backdrop-blur lg:hidden">
          <Link to="/dashboard" className="font-extrabold tracking-tight">
            EGX<span className="text-primary">Ledger</span>
          </Link>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={toggle}>
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setOpen((v) => !v)}>
              <Menu className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {open && (
          <nav className="border-border grid gap-1 border-b p-3 lg:hidden">
            {NAV.map((item) => (
              <NavItem key={item.to} {...item} active={pathname.startsWith(item.to)} />
            ))}
            <Button
              variant="ghost"
              className="justify-start"
              onClick={async () => {
                await signOut();
                navigate({ to: "/auth" });
              }}
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </nav>
        )}

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: string;
  label: string;
  icon: typeof Coins;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
