import { useEffect, useState } from "react";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { useForm } from "react-hook-form";
import { type InsertUserSetting } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Settings as SettingsIcon, Save, Download, Info, Smartphone, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useInstallPWA } from "@/hooks/use-install-pwa";

interface SettingsFormData {
  storeName: string;
  currency: string;
  taxRate: string;
  address: string;
  phone: string;
  emailContact: string;
  receiptFooter: string;
}

export default function Settings() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const { toast } = useToast();
  const { isInstallable, isInstalled, install, isFallback } = useInstallPWA();
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  const form = useForm<SettingsFormData>({
    defaultValues: {
      storeName: "", 
      currency: "₱", 
      taxRate: "0", 
      address: "", 
      phone: "", 
      emailContact: "", 
      receiptFooter: ""
    }
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        storeName: settings.storeName || "",
        currency: settings.currency || "₱",
        taxRate: settings.taxRate || "0",
        address: settings.address || "",
        phone: settings.phone || "",
        emailContact: settings.emailContact || "",
        receiptFooter: settings.receiptFooter || ""
      });
    }
  }, [settings, form]);

  const onSubmit = (data: SettingsFormData) => {
    const payload: Partial<InsertUserSetting> = {
      storeName: data.storeName,
      currency: data.currency,
      taxRate: data.taxRate,
      address: data.address,
      phone: data.phone,
      emailContact: data.emailContact,
      receiptFooter: data.receiptFooter
    };

    updateSettings.mutate(payload, {
      onSuccess: () => toast({ 
        title: "Settings Saved", 
        description: "Your store configuration has been updated." 
      })
    });
  };

  if (isLoading) return <div className="p-8 text-center animate-pulse">Loading settings...</div>;

  return (
    <div className="max-w-3xl animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-secondary flex items-center justify-center text-foreground shadow-sm">
            <SettingsIcon className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Store Settings</h2>
            <p className="text-sm text-muted-foreground">Configure your POS environment</p>
          </div>
        </div>

        {isInstallable && !isInstalled && (
          <div className="flex gap-2">
            <Button
              onClick={install}
              className="h-12 px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
            >
              <Download className="h-5 w-5" />
              Install App
            </Button>
            {isFallback && (
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12 rounded-xl"
                onClick={() => setShowInstallGuide(true)}
              >
                <Info className="h-5 w-5" />
              </Button>
            )}
          </div>
        )}

        {isInstalled && (
          <div className="px-6 py-2 rounded-xl bg-emerald-500/10 text-emerald-600 font-bold text-sm border border-emerald-500/30">
            ✓ App Installed
          </div>
        )}
      </div>

      <Card className="rounded-3xl border border-border/50 shadow-lg shadow-black/5 bg-card overflow-hidden">
        <CardContent className="p-0">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="p-8 space-y-6">

              <div className="grid md:grid-cols-2 gap-6">
                <FormField control={form.control} name="storeName" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Store Name</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} className="h-12 rounded-xl bg-secondary border-none" />
                    </FormControl>
                  </FormItem>
                )} />

                <FormField control={form.control} name="currency" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Currency Symbol</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || "₱"} className="h-12 rounded-xl bg-secondary border-none" />
                    </FormControl>
                  </FormItem>
                )} />

                <FormField control={form.control} name="taxRate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Default Tax Rate (%)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} value={field.value || "0"} className="h-12 rounded-xl bg-secondary border-none" />
                    </FormControl>
                  </FormItem>
                )} />

                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Contact Phone</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} className="h-12 rounded-xl bg-secondary border-none" />
                    </FormControl>
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold">Store Address</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value || ""} className="rounded-xl bg-secondary border-none resize-none" rows={3} />
                  </FormControl>
                </FormItem>
              )} />

              <FormField control={form.control} name="receiptFooter" render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold">Receipt Footer Message</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value || ""} className="h-12 rounded-xl bg-secondary border-none" />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">Printed at the bottom of customer receipts.</p>
                </FormItem>
              )} />

              <div className="pt-6 border-t border-border/50 flex justify-end">
                <Button 
                  type="submit" 
                  className="h-12 px-8 rounded-xl font-bold bg-primary text-white shadow-lg hover:shadow-xl transition-all"
                  disabled={updateSettings.isPending}
                >
                  <Save className="mr-2 h-5 w-5" />
                  {updateSettings.isPending ? "Saving..." : "Save Configuration"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Dialog open={showInstallGuide} onOpenChange={setShowInstallGuide}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-6 w-6 text-primary" />
              Install Café Bara as an App
            </DialogTitle>
            <DialogDescription>
              Choose your device type to see installation instructions
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="border border-border/50 rounded-2xl p-6 space-y-3">
              <div className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-primary" />
                <h3 className="font-bold">Mobile (Android/iOS)</h3>
              </div>
              <div className="text-sm text-muted-foreground space-y-2">
                <p className="font-medium">For Chrome/Brave on Android:</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Tap the three dots menu (⋮)</li>
                  <li>Select "Install app" or "Add to home screen"</li>
                  <li>Tap "Install"</li>
                </ol>
                <p className="font-medium mt-3">For Safari on iOS:</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Tap the Share button</li>
                  <li>Scroll and tap "Add to Home Screen"</li>
                  <li>Tap "Add"</li>
                </ol>
              </div>
            </div>

            <div className="border border-border/50 rounded-2xl p-6 space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                <h3 className="font-bold">Desktop (Windows/Mac/Linux)</h3>
              </div>
              <div className="text-sm text-muted-foreground space-y-2">
                <p className="font-medium">For Chrome, Edge, or Brave:</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Look for the Install button in the address bar</li>
                  <li>Or tap the three dots menu (⋮)</li>
                  <li>Select "Install Café Bara POS"</li>
                  <li>Click "Install"</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm">
            <p className="font-medium text-blue-900 dark:text-blue-100">
              💡 Once installed, Café Bara will work offline and appear like a native app on your device!
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}