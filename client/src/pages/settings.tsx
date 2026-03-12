import { useEffect } from "react";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { useForm } from "react-hook-form";
import { type InsertUserSetting } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon, Save, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useInstallPWA } from "@/hooks/use-install-pwa";

export default function Settings() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const { toast } = useToast();
  const { isInstallable, isInstalled, install } = useInstallPWA();

  const form = useForm<Partial<InsertUserSetting>>({
    defaultValues: {
      storeName: "", currency: "₱", taxRate: "0", address: "", phone: "", emailContact: "", receiptFooter: ""
    }
  });

  useEffect(() => {
    if (settings) form.reset(settings);
  }, [settings, form]);

  const onSubmit = (data: Partial<InsertUserSetting>) => {
    updateSettings.mutate(data, {
      onSuccess: () => toast({ title: "Settings Saved", description: "Your store configuration has been updated." })
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
          <Button
            onClick={install}
            className="h-12 px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
          >
            <Download className="h-5 w-5" />
            Install App
          </Button>
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
                    <FormControl><Input {...field} className="h-12 rounded-xl bg-secondary border-none" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="currency" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Currency Symbol</FormLabel>
                    <FormControl><Input {...field} className="h-12 rounded-xl bg-secondary border-none" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="taxRate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Default Tax Rate (%)</FormLabel>
                    <FormControl><Input type="number" step="0.01" {...field} className="h-12 rounded-xl bg-secondary border-none" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Contact Phone</FormLabel>
                    <FormControl><Input {...field} value={field.value || ""} className="h-12 rounded-xl bg-secondary border-none" /></FormControl>
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold">Store Address</FormLabel>
                  <FormControl><Textarea {...field} value={field.value || ""} className="rounded-xl bg-secondary border-none resize-none" rows={3} /></FormControl>
                </FormItem>
              )} />

              <FormField control={form.control} name="receiptFooter" render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold">Receipt Footer Message</FormLabel>
                  <FormControl><Input {...field} value={field.value || ""} className="h-12 rounded-xl bg-secondary border-none" /></FormControl>
                  <p className="text-xs text-muted-foreground">Printed at the bottom of customer receipts.</p>
                </FormItem>
              )} />

              <div className="pt-6 border-t border-border/50 flex justify-end">
                <Button 
                  type="submit" 
                  className="h-12 px-8 rounded-xl font-bold bg-gradient-to-r from-primary to-violet-500 text-white shadow-lg hover:shadow-xl transition-all"
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
    </div>
  );
}
