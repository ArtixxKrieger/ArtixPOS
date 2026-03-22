import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sileo";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout/app-layout";

import Dashboard from "@/pages/dashboard";
import POS from "@/pages/pos";
import Products from "@/pages/products";
import Analytics from "@/pages/analytics";
import PendingOrders from "@/pages/pending-orders";
import Settings from "@/pages/settings";

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard}/>
        <Route path="/pos" component={POS}/>
        <Route path="/products" component={Products}/>
        <Route path="/analytics" component={Analytics}/>
        <Route path="/pending" component={PendingOrders}/>
        <Route path="/settings" component={Settings}/>
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster
          position="bottom-center"
          theme="system"
          offset={{ bottom: 96 }}
          options={{
            duration: 3500,
            roundness: 16,
          }}
        />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
