export interface NavPage {
  label: string;
  url: string;
  location: "primary" | "more" | "admin";
  description: string;
}

export const APP_PAGES: NavPage[] = [
  { label: "Home / Dashboard", url: "/", location: "primary", description: "Overview of today's sales, revenue, and key metrics" },
  { label: "POS", url: "/pos", location: "primary", description: "Make sales, add items to cart, process payments" },
  { label: "Pending Orders", url: "/pending", location: "primary", description: "View and manage incoming/open orders" },
  { label: "Kitchen", url: "/kitchen", location: "more", description: "Kitchen display screen for order management (F&B)" },
  { label: "Tables", url: "/tables", location: "more", description: "Table layout and table management (restaurants)" },
  { label: "Appointments", url: "/appointments", location: "more", description: "Booking and appointment scheduling (services)" },
  { label: "Staff", url: "/staff", location: "more", description: "View and manage staff members and their roles" },
  { label: "Rooms", url: "/rooms", location: "more", description: "Room management (hotels/hospitality)" },
  { label: "Memberships", url: "/memberships", location: "more", description: "Customer membership plans and management" },
  { label: "Products", url: "/products", location: "more", description: "Add, edit, or delete products and menu items" },
  { label: "Customers", url: "/customers", location: "more", description: "View and manage customer profiles" },
  { label: "Transactions", url: "/transactions", location: "more", description: "Sales history, receipts, and refunds" },
  { label: "Analytics", url: "/analytics", location: "more", description: "Revenue charts, top products, category breakdowns, date-range comparisons" },
  { label: "Expenses", url: "/expenses", location: "more", description: "Log and track business expenses" },
  { label: "Suppliers", url: "/suppliers", location: "more", description: "Manage product suppliers" },
  { label: "Purchases", url: "/purchases", location: "more", description: "Track purchase orders from suppliers" },
  { label: "Shifts", url: "/shifts", location: "more", description: "Open and close cash register shifts" },
  { label: "Time Clock", url: "/timeclock", location: "more", description: "Staff time tracking and attendance" },
  { label: "Discount Codes", url: "/discount-codes", location: "more", description: "Create and manage promotional discount codes" },
  { label: "Refunds", url: "/refunds", location: "more", description: "Process and view refunds (managers and above)" },
  { label: "AI Assistant", url: "/ai", location: "more", description: "AI-powered business assistant" },
  { label: "Print Settings", url: "/print-settings", location: "more", description: "Configure receipt paper size, title, store info, and other print options (owner only)" },
  { label: "Settings", url: "/settings", location: "more", description: "Store name, logo, currency, tax rate, staff invites, receipt customization, monthly goal" },
  { label: "Branches", url: "/admin/branches", location: "admin", description: "Add and manage multiple store branches" },
  { label: "Team Overview", url: "/admin/users", location: "admin", description: "View all staff across all branches" },
  { label: "Admin Dashboard", url: "/admin", location: "admin", description: "Store-wide admin overview" },
  { label: "Admin Analytics", url: "/admin/analytics", location: "admin", description: "Analytics across all branches" },
  { label: "Audit Logs", url: "/admin/audit-logs", location: "admin", description: "View all admin actions and changes" },
  { label: "Permissions", url: "/admin/permissions", location: "admin", description: "Manage role permissions" },
];

export function buildNavGuide(): string {
  const primary = APP_PAGES.filter(p => p.location === "primary");
  const more = APP_PAGES.filter(p => p.location === "more");
  const admin = APP_PAGES.filter(p => p.location === "admin");

  return `APP NAVIGATION (Mobile: bottom nav bar | Desktop: left sidebar):

Primary nav (always visible in bottom bar):
${primary.map(p => `  • ${p.label} — ${p.description}`).join("\n")}

"More" menu (tap More in the bottom nav, then select from the grid):
${more.map(p => `  • ${p.label} — ${p.description}`).join("\n")}

Admin section (under More → Admin panel, visible to owners/managers only):
${admin.map(p => `  • ${p.label} — ${p.description}`).join("\n")}

IMPORTANT: When directing users to a page, always use the correct location above. Never guess or say "Settings" if the page is actually under More or Admin.`;
}
