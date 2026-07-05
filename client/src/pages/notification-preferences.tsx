import { useLocation } from "wouter";
import { ChevronLeft, Bell, Truck, PackageX, CalendarClock, Wifi } from "lucide-react";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

type PrefKey = keyof NotificationPreferences;

const PREFERENCE_ITEMS: {
  key: PrefKey;
  label: string;
  hint: string;
  icon: React.ElementType;
  iconColor: string;
}[] = [
  {
    key: "lowStockAlerts",
    label: "Low & Out of Stock",
    hint: "Get alerted when a product hits its low-stock threshold or runs out",
    icon: PackageX,
    iconColor: "bg-amber-100 dark:bg-amber-900/30",
  },
  {
    key: "poOverdueAlerts",
    label: "Overdue Purchase Orders",
    hint: "Get alerted when a supplier delivery is past its expected date",
    icon: Truck,
    iconColor: "bg-blue-100 dark:bg-blue-900/30",
  },
  {
    key: "productExpiryAlerts",
    label: "Expiring Products",
    hint: "Get alerted when a tracked product is within 7 days of expiry",
    icon: CalendarClock,
    iconColor: "bg-rose-100 dark:bg-rose-900/30",
  },
  {
    key: "branchOfflineAlerts",
    label: "Branch Offline",
    hint: "Get alerted when a branch hasn't checked in for 30+ minutes",
    icon: Wifi,
    iconColor: "bg-violet-100 dark:bg-violet-900/30",
  },
];

export default function NotificationPreferences() {
  const [, setLocation] = useLocation();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const { toast } = useToast();

  const prefs: NotificationPreferences = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...((settings as any)?.notificationPreferences ?? {}),
  };

  const togglePref = (key: PrefKey) => {
    const next = { ...prefs, [key]: !prefs[key] };
    updateSettings.mutate(
      { notificationPreferences: next } as any,
      {
        onError: () => {
          toast({ title: "Failed to save preference", variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-4 pb-24">
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => setLocation("/settings")}
          data-testid="button-back-notification-preferences"
          className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted/60 transition-colors shrink-0"
        >
          <ChevronLeft className="h-4.5 w-4.5" />
        </button>
        <div>
          <h1 className="text-base font-bold">Notification Preferences</h1>
          <p className="text-[11px] text-muted-foreground">
            Choose which push alerts you want to receive
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 px-1 pt-1 pb-1.5">
        <Bell className="h-3 w-3 text-muted-foreground/60" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
          Alert Types
        </p>
      </div>
      <div className="bg-card rounded-2xl border border-border/25 shadow-sm overflow-hidden px-4 py-1">
        {PREFERENCE_ITEMS.map(({ key, label, hint, icon: Icon, iconColor }) => {
          const enabled = prefs[key];
          return (
            <div
              key={key}
              className="flex items-start justify-between gap-4 py-3 border-b border-border/20 last:border-0"
            >
              <div className="flex items-start gap-3 shrink-0 flex-1 min-w-0">
                <div
                  className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${iconColor}`}
                >
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
                </div>
              </div>
              <button
                data-testid={`toggle-notification-${key}`}
                onClick={() => togglePref(key)}
                disabled={updateSettings.isPending}
                className={[
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent mt-0.5",
                  "transition-colors duration-200 ease-in-out focus:outline-none",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                  enabled ? "bg-violet-600 dark:bg-violet-500" : "bg-slate-200 dark:bg-white/10",
                ].join(" ")}
                role="switch"
                aria-checked={enabled}
              >
                <span
                  className={[
                    "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm",
                    "transform transition duration-200 ease-in-out",
                    enabled ? "translate-x-5" : "translate-x-0",
                  ].join(" ")}
                />
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground px-1 mt-3">
        These control which categories of push alerts are sent. You still need to enable
        push notifications in Settings to receive any alerts at all.
      </p>
    </div>
  );
}
