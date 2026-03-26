import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SpeedInsights } from "@vercel/speed-insights/react";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/hooks/use-auth";

import Dashboard from "@/pages/dashboard";
import POS from "@/pages/pos";
import Products from "@/pages/products";
import Analytics from "@/pages/analytics";
import PendingOrders from "@/pages/pending-orders";
import Settings from "@/pages/settings";
import Transactions from "@/pages/transactions";
import Login from "@/pages/login";

function ProtectedRouter() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    setLocation("/login");
    return null;
  }

  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/pos" component={POS} />
        <Route path="/products" component={Products} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/pending" component={PendingOrders} />
        <Route path="/transactions" component={Transactions} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route component={ProtectedRouter} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <SpeedInsights />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
