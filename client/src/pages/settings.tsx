import { useEffect } from "react";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { useForm } from "react-hook-form";
import { type InsertUserSetting } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
      <div className="flex items-center gap-3 mb-8">
        <div className="h-12 w-12 rounded-2xl bg-secondary flex items-center justify-center text-foreground shadow-sm">
          <SettingsIcon className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Store Settings</h2>
          <p className="text-sm text-muted-foreground">Configure your POS environment</p>
        </div>
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

              <FormField control={form.control} name="emailContact" render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold">Email Address</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} value={field.value || ""} className="h-12 rounded-xl bg-secondary border-none" />
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
    </div>
  );
}
