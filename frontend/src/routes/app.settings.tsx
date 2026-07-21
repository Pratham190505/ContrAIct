import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/contexts/auth-context";

export const Route = createFileRoute("/app/settings")({
  head: () => ({
    meta: [
      { title: "Settings – ContrAIct" },
      { name: "description", content: "Manage your profile, theme, and notification preferences." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Profile and workspace preferences.</p>
      </div>

      <Card className="p-6">
        <h3 className="font-display text-base font-semibold">Profile</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={user?.name ?? ""} readOnly />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={user?.email ?? ""} readOnly />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-display text-base font-semibold">Appearance</h3>
        <div className="mt-4 flex gap-2">
          {(["light", "dark"] as const).map((t) => (
            <Button
              key={t}
              variant={theme === t ? "default" : "outline"}
              size="sm"
              onClick={() => setTheme(t)}
              className={theme === t ? "brand-gradient text-primary-foreground" : ""}
            >
              {t === "light" ? "Light" : "Dark"}
            </Button>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-display text-base font-semibold">Notifications</h3>
        <div className="mt-4 space-y-4">
          {[
            { label: "Email me when analysis completes", on: true },
            { label: "Weekly summary of upcoming deadlines", on: true },
            { label: "New AI insights for existing contracts", on: false },
          ].map((n) => (
            <div key={n.label} className="flex items-center justify-between">
              <Label className="text-sm">{n.label}</Label>
              <Switch defaultChecked={n.on} />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-display text-base font-semibold text-destructive">Danger zone</h3>
        <Separator className="my-4" />
        <Button variant="destructive">Delete all contracts</Button>
      </Card>
    </div>
  );
}
