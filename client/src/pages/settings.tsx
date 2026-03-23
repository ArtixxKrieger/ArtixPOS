import { useEffect } from "react";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { useForm } from "react-hook-form";
import { type InsertUserSetting } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Store, Receipt, MapPin, Phone, Mail, FileText, Save, Percent } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SettingsFormData {
  storeName: string;
  taxRate: string;
  address: string;
  phone: string;
  emailContact: string;
  receiptFooter: string;
}

function SettingsSection({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border border-border/30 overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-border/30 bg-muted/10 flex items-center gap-2.5">
        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-3.5 w-3.5 text-primary" />
        </div>
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      <div className="p-5 space-y-4">
        {children}
      </div>
    </div>
  );
}

export default function Settings() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const { toast } = useToast();

  const form = useForm<SettingsFormData>({
    defaultValues: {
      storeName: "",
      taxRate: "0",
      address: "",
      phone: "",
      emailContact: "",
      receiptFooter: "",
    }
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        storeName: (settings as any).storeName || "",
        taxRate: (settings as any).taxRate || "0",
        address: (settings as any).address || "",
        phone: (settings as any).phone || "",
        emailContact: (settings as any).emailContact || "",
        receiptFooter: (settings as any).receiptFooter || "",
      });
    }
  }, [settings, form]);

  const onSubmit = (data: SettingsFormData) => {
    const payload: Partial<InsertUserSetting> = {
      storeName: data.storeName,
      taxRate: data.taxRate,
      address: data.address,
      phone: data.phone,
      emailContact: data.emailContact,
      receiptFooter: data.receiptFooter,
    };
    updateSettings.mutate(payload, {
      onSuccess: () => toast({
        title: "Settings Saved",
        description: "Your store configuration has been updated."
      })
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-2xl">
        {[1,2,3].map(i => <div key={i} className="h-36 bg-muted rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="max-w-2xl page-enter">

      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="h-11 w-11 rounded-2xl bg-secondary flex items-center justify-center text-foreground shadow-sm shrink-0">
          <Store className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-black">Store Settings</h2>
          <p className="text-xs text-muted-foreground font-medium mt-0.5">Configure your POS environment</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

          {/* Store Identity */}
          <SettingsSection title="Store Identity" icon={Store}>
            <FormField control={form.control} name="storeName" render={({ field }) => (
              <FormItem>
                <FormLabel className="font-semibold text-sm">Store Name</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value || ""}
                    className="h-11 rounded-xl bg-secondary border-none"
                    placeholder="Your store name"
                    data-testid="input-store-name"
                  />
                </FormControl>
              </FormItem>
            )} />
          </SettingsSection>

          {/* Financial */}
          <SettingsSection title="Financial" icon={Percent}>
            <FormField control={form.control} name="taxRate" render={({ field }) => (
              <FormItem>
                <FormLabel className="font-semibold text-sm">Tax Rate (%)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    {...field}
                    value={field.value || "0"}
                    className="h-11 rounded-xl bg-secondary border-none"
                    placeholder="0"
                    data-testid="input-tax-rate"
                  />
                </FormControl>
              </FormItem>
            )} />
          </SettingsSection>

          {/* Contact Information */}
          <SettingsSection title="Contact Information" icon={Phone}>
            <FormField control={form.control} name="address" render={({ field }) => (
              <FormItem>
                <FormLabel className="font-semibold text-sm flex items-center gap-1.5">
                  <MapPin className="h-3 w-3 text-muted-foreground" /> Address
                </FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    value={field.value || ""}
                    className="rounded-xl bg-secondary border-none resize-none"
                    rows={2}
                    placeholder="Store address..."
                  />
                </FormControl>
              </FormItem>
            )} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold text-sm flex items-center gap-1.5">
                    <Phone className="h-3 w-3 text-muted-foreground" /> Phone
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value || ""}
                      className="h-11 rounded-xl bg-secondary border-none"
                      placeholder="+63 912 345 6789"
                    />
                  </FormControl>
                </FormItem>
              )} />

              <FormField control={form.control} name="emailContact" render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold text-sm flex items-center gap-1.5">
                    <Mail className="h-3 w-3 text-muted-foreground" /> Email
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      {...field}
                      value={field.value || ""}
                      className="h-11 rounded-xl bg-secondary border-none"
                      placeholder="hello@example.com"
                    />
                  </FormControl>
                </FormItem>
              )} />
            </div>
          </SettingsSection>

          {/* Receipt */}
          <SettingsSection title="Receipt" icon={Receipt}>
            <FormField control={form.control} name="receiptFooter" render={({ field }) => (
              <FormItem>
                <FormLabel className="font-semibold text-sm flex items-center gap-1.5">
                  <FileText className="h-3 w-3 text-muted-foreground" /> Footer Message
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value || ""}
                    className="h-11 rounded-xl bg-secondary border-none"
                    placeholder="Receipt footer message"
                    data-testid="input-receipt-footer"
                  />
                </FormControl>
                <p className="text-[11px] text-muted-foreground/70 mt-1">Shown at the bottom of customer receipts.</p>
              </FormItem>
            )} />
          </SettingsSection>

          {/* Save */}
          <Button
            type="submit"
            className="w-full h-12 rounded-2xl font-bold bg-primary text-white shadow-lg shadow-primary/20 hover:opacity-90 transition-all"
            disabled={updateSettings.isPending}
            data-testid="button-save-settings"
          >
            <Save className="mr-2 h-4 w-4" />
            {updateSettings.isPending ? "Saving..." : "Save Configuration"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
