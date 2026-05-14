import { getEssentialBusinessUrls } from "@shared/business-access";

/**
 * Centralized feature-visibility rules based on business type and sub-type.
 * Controls: which pages are hidden, which items appear in the primary bottom nav,
 * custom labels per business context, sidebar ordering priority,
 * business-specific terminology, and quick service suggestions.
 */

export type BusinessTerminology = {
  // ── Appointment / booking ─────────────────────────────────────────────────
  page: string;               // Page title e.g. "Bookings", "Sessions", "Patients"
  entry: string;              // Singular e.g. "Appointment", "Booking", "Job"
  entryPlural: string;        // Plural e.g. "Appointments", "Bookings", "Jobs"
  service: string;            // Field label e.g. "Service", "Treatment", "Procedure"
  bookButton: string;         // CTA e.g. "Book", "Schedule", "Add Job", "Queue"
  emptyState: string;         // Empty state message

  // ── People ────────────────────────────────────────────────────────────────
  customer: string;           // e.g. "Customer", "Client", "Patient", "Student"
  staff: string;              // e.g. "Staff", "Stylist", "Doctor", "Trainer"
  room: string;               // e.g. "Room", "Chair", "Station", "Court", "Studio"

  // ── Products & inventory ──────────────────────────────────────────────────
  product: string;            // "Product" | "Medicine" | "Menu Item" | "Item" | "Service"
  productPlural: string;      // "Products" | "Medicines" | "Menu Items" | "Items"
  categoryLabel: string;      // "Category" | "Drug Category" | "Menu Section" | "Department"
  supplierLabel: string;      // "Supplier" | "Drug Supplier" | "Distributor" | "Vendor"

  // ── POS / cart ────────────────────────────────────────────────────────────
  posAction: string;          // Checkout CTA: "Process Sale" | "Dispense" | "Ring Up" | "Close Tab"
  addToCartLabel: string;     // "Add to Cart" | "Add to Prescription" | "Add to Order"
  cartLabel: string;          // "Cart" | "Prescription" | "Order Ticket" | "Basket" | "Tab"

  // ── Transactions ──────────────────────────────────────────────────────────
  transactionLabel: string;   // "Transaction" | "Dispensation" | "Visit" | "Order" | "Job"
  transactionPlural: string;  // "Transactions" | "Dispensations" | "Visits" | "Orders"
  orderLabel: string;         // (legacy compat) transaction unit e.g. "order", "booking"

  // ── Analytics labels ──────────────────────────────────────────────────────
  topItemsLabel: string;      // "Top Products" | "Top Medicines" | "Top Services"
  itemUnit: string;           // "unit" | "booking" | "session" | "job" | "kg"
  bestSellerLabel: string;    // "Best Seller" | "Most Booked" | "Most Dispensed"
};

export type BusinessFeatures = {
  hiddenUrls: Set<string>;
  essentialUrls: Set<string>;
  showBarcode: boolean;
  primaryNavUrls: [string, string];
  labels: Record<string, string>;
  sidebarOrder: string[];
  terminology: BusinessTerminology;
  quickSuggestions: string[];
};

const DEFAULT_SIDEBAR_ORDER = [
  "/", "/pos", "/pending", "/kitchen", "/tables",
  "/appointments", "/staff", "/rooms", "/memberships",
  "/products", "/customers", "/transactions", "/analytics",
  "/expenses", "/suppliers", "/purchases", "/shifts",
  "/timeclock", "/payroll", "/discount-codes", "/loyalty",
  "/refunds", "/ai", "/settings",
];

export const DEFAULT_TERMINOLOGY: BusinessTerminology = {
  page: "Sales",
  entry: "Sale",
  entryPlural: "Sales",
  service: "Service",
  bookButton: "Book",
  emptyState: "No appointments",
  customer: "Customer",
  staff: "Staff",
  room: "Room",
  product: "Product",
  productPlural: "Products",
  categoryLabel: "Category",
  supplierLabel: "Supplier",
  posAction: "Process Sale",
  addToCartLabel: "Add to Cart",
  cartLabel: "Cart",
  transactionLabel: "Transaction",
  transactionPlural: "Transactions",
  orderLabel: "sale",
  topItemsLabel: "Top Products",
  itemUnit: "unit",
  bestSellerLabel: "Best Seller",
};

export function getBusinessFeatures(
  businessType?: string | null,
  businessSubType?: string | null,
): BusinessFeatures {
  const hidden = new Set<string>();
  let showBarcode = true;
  let primaryNavUrls: [string, string] = ["/pos", "/pending"];
  let labels: Record<string, string> = {};
  let sidebarOrder: string[] = DEFAULT_SIDEBAR_ORDER;
  let terminology: BusinessTerminology = DEFAULT_TERMINOLOGY;
  let quickSuggestions: string[] = [];

  if (!businessType || businessType === "other") {
    hidden.add("/appointments");
    hidden.add("/staff");
    hidden.add("/memberships");
    hidden.add("/rooms");
    hidden.add("/kitchen");
    hidden.add("/tables");
    return { hiddenUrls: hidden, essentialUrls: getEssentialBusinessUrls(businessType, businessSubType), showBarcode, primaryNavUrls, labels, sidebarOrder, terminology, quickSuggestions };
  }

  // ── Food & Beverage ──────────────────────────────────────────────────────
  if (businessType === "food_beverage") {
    showBarcode = false;
    hidden.add("/appointments");
    hidden.add("/staff");
    hidden.add("/memberships");
    hidden.add("/rooms");

    switch (businessSubType) {
      case "restaurant":
        primaryNavUrls = ["/pos", "/kitchen"];
        labels = {
          "/pos": "New Order", "/pending": "Active Orders",
          "/kitchen": "Kitchen Display", "/tables": "Floor Map",
          "/products": "Menu", "/customers": "Guests",
          "/transactions": "Orders", "/suppliers": "Vendors",
          "/purchases": "Supply Orders",
        };
        sidebarOrder = ["/", "/pos", "/kitchen", "/tables", "/pending", "/products", "/customers", "/transactions", "/analytics", "/expenses", "/suppliers", "/purchases", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          ...DEFAULT_TERMINOLOGY,
          page: "Orders", entry: "Order", entryPlural: "Orders",
          service: "Menu Item", customer: "Guest", staff: "Server",
          product: "Menu Item", productPlural: "Menu Items",
          categoryLabel: "Menu Section", supplierLabel: "Vendor",
          posAction: "Place Order", addToCartLabel: "Add to Order",
          cartLabel: "Order Ticket",
          transactionLabel: "Order", transactionPlural: "Orders",
          orderLabel: "order", topItemsLabel: "Most Ordered",
          itemUnit: "order", bestSellerLabel: "Most Ordered",
        };
        quickSuggestions = ["Burger", "Pasta", "Pizza", "Fried Chicken", "Rice Meal", "Salad", "Soup", "Dessert", "Soft Drink", "Water"];
        break;

      case "bar":
        primaryNavUrls = ["/pos", "/tables"];
        hidden.add("/kitchen");
        labels = {
          "/pos": "Open Tab", "/tables": "Tables",
          "/products": "Drink Menu", "/customers": "Guests",
          "/transactions": "Bills", "/suppliers": "Beverage Suppliers",
          "/purchases": "Stock Orders",
        };
        sidebarOrder = ["/", "/pos", "/tables", "/pending", "/products", "/customers", "/transactions", "/analytics", "/expenses", "/suppliers", "/purchases", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          ...DEFAULT_TERMINOLOGY,
          customer: "Guest", staff: "Bartender",
          product: "Drink", productPlural: "Drinks",
          categoryLabel: "Drink Type", supplierLabel: "Beverage Supplier",
          posAction: "Close Tab", addToCartLabel: "Add to Tab",
          cartLabel: "Tab",
          transactionLabel: "Bill", transactionPlural: "Bills",
          orderLabel: "bill", topItemsLabel: "Top Sellers",
          itemUnit: "drink", bestSellerLabel: "Top Seller",
        };
        quickSuggestions = ["Beer", "Cocktail", "Whiskey", "Vodka", "Rum", "Wine", "Gin Tonic", "Mocktail", "Softdrink", "Water"];
        break;

      case "bakery":
        primaryNavUrls = ["/pos", "/pending"];
        hidden.add("/kitchen");
        hidden.add("/tables");
        hidden.add("/customers");
        labels = {
          "/pos": "New Order", "/pending": "Active Orders",
          "/products": "Baked Goods & Menu",
          "/transactions": "Sales",
        };
        sidebarOrder = ["/", "/pos", "/pending", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          ...DEFAULT_TERMINOLOGY,
          staff: "Baker",
          product: "Baked Good", productPlural: "Baked Goods",
          categoryLabel: "Product Type",
          posAction: "Complete Order", addToCartLabel: "Add to Order",
          cartLabel: "Order",
          transactionLabel: "Sale", transactionPlural: "Sales",
          orderLabel: "sale", topItemsLabel: "Top Sellers",
          itemUnit: "piece", bestSellerLabel: "Best Seller",
        };
        quickSuggestions = ["Pandesal", "Ensaymada", "Hopia", "Cake Slice", "Muffin", "Croissant", "Donut", "Bread Loaf", "Cookie", "Coffee"];
        break;

      case "cafe":
        primaryNavUrls = ["/pos", "/pending"];
        hidden.add("/kitchen");
        hidden.add("/tables");
        hidden.add("/customers");
        labels = {
          "/pos": "New Order", "/pending": "Active Orders",
          "/products": "Menu",
          "/transactions": "Sales",
        };
        sidebarOrder = ["/", "/pos", "/pending", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          ...DEFAULT_TERMINOLOGY,
          staff: "Barista",
          product: "Menu Item", productPlural: "Menu Items",
          categoryLabel: "Menu Section",
          posAction: "Complete Order", addToCartLabel: "Add to Order",
          cartLabel: "Order",
          transactionLabel: "Sale", transactionPlural: "Sales",
          orderLabel: "sale", topItemsLabel: "Top Sellers",
          itemUnit: "cup", bestSellerLabel: "Best Seller",
        };
        quickSuggestions = ["Latte", "Espresso", "Cappuccino", "Americano", "Matcha Latte", "Frappe", "Sandwich", "Croissant", "Cake Slice", "Bottled Water"];
        break;

      case "food_truck":
        primaryNavUrls = ["/pos", "/pending"];
        hidden.add("/kitchen");
        hidden.add("/tables");
        hidden.add("/customers");
        labels = {
          "/pos": "New Order", "/pending": "Active Orders",
          "/products": "Menu",
          "/transactions": "Orders",
        };
        sidebarOrder = ["/", "/pos", "/pending", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          ...DEFAULT_TERMINOLOGY,
          product: "Menu Item", productPlural: "Menu Items",
          categoryLabel: "Menu Section",
          posAction: "Complete Order", addToCartLabel: "Add to Order",
          cartLabel: "Order",
          transactionLabel: "Order", transactionPlural: "Orders",
          orderLabel: "order", topItemsLabel: "Most Ordered",
          itemUnit: "order", bestSellerLabel: "Most Popular",
        };
        quickSuggestions = ["Burger", "Fries", "Hotdog", "Isaw", "Kwek-kwek", "Fishball", "Barbeque", "Taho", "Softdrink", "Water"];
        break;

      default:
        primaryNavUrls = ["/pos", "/pending"];
        hidden.add("/tables");
        labels = {
          "/pos": "New Order", "/pending": "Active Orders",
          "/products": "Menu",
          "/transactions": "Orders",
        };
        sidebarOrder = ["/", "/pos", "/pending", "/kitchen", "/products", "/customers", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          ...DEFAULT_TERMINOLOGY,
          product: "Menu Item", productPlural: "Menu Items",
          categoryLabel: "Menu Section",
          posAction: "Place Order", addToCartLabel: "Add to Order",
          cartLabel: "Order",
          transactionLabel: "Order", transactionPlural: "Orders",
          orderLabel: "order", topItemsLabel: "Most Ordered",
          itemUnit: "order", bestSellerLabel: "Most Popular",
        };
        break;
    }

  // ── Retail ───────────────────────────────────────────────────────────────
  } else if (businessType === "retail") {
    showBarcode = true;
    hidden.add("/kitchen");
    hidden.add("/tables");
    hidden.add("/appointments");
    hidden.add("/staff");
    hidden.add("/memberships");
    hidden.add("/rooms");
    primaryNavUrls = ["/pos", "/products"];

    switch (businessSubType) {
      case "pharmacy":
      case "drugstore":
        primaryNavUrls = ["/pos", "/products"];
        labels = {
          "/pos": "Dispensary",
          "/pending": "Rx Queue",
          "/products": "Drug Inventory",
          "/customers": "Patients",
          "/transactions": "Dispensations",
          "/suppliers": "Drug Suppliers",
          "/purchases": "Drug Orders",
          "/expiry": "Drug Expiry Monitor",
          "/expenses": "Operating Expenses",
          "/discount-codes": "Patient Discounts",
        };
        sidebarOrder = ["/", "/pos", "/products", "/expiry", "/customers", "/transactions", "/analytics", "/expenses", "/suppliers", "/purchases", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          ...DEFAULT_TERMINOLOGY,
          customer: "Patient", staff: "Pharmacist",
          product: "Medicine", productPlural: "Medicines",
          categoryLabel: "Drug Category", supplierLabel: "Drug Supplier",
          posAction: "Dispense", addToCartLabel: "Add to Prescription",
          cartLabel: "Prescription",
          transactionLabel: "Dispensation", transactionPlural: "Dispensations",
          orderLabel: "dispensation",
          topItemsLabel: "Top Medicines", itemUnit: "tablet",
          bestSellerLabel: "Most Dispensed",
        };
        quickSuggestions = ["Paracetamol", "Amoxicillin", "Mefenamic Acid", "Ibuprofen", "Cetirizine", "Omeprazole", "Vitamin C", "Multivitamins", "Antacid", "Antibiotic"];
        break;

      case "grocery":
      case "grocery_enhanced":
        primaryNavUrls = ["/pos", "/products"];
        labels = {
          "/pos": "Checkout",
          "/products": "Product Catalog",
          "/customers": "Loyalty Members",
          "/transactions": "Sales",
          "/suppliers": "Distributors",
          "/purchases": "Stock Orders",
          "/expiry": "Expiry Monitor",
          "/discount-codes": "Promotions",
        };
        sidebarOrder = ["/", "/pos", "/products", "/expiry", "/customers", "/transactions", "/analytics", "/expenses", "/suppliers", "/purchases", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          ...DEFAULT_TERMINOLOGY,
          customer: "Member", staff: "Cashier",
          product: "Item", productPlural: "Items",
          categoryLabel: "Department", supplierLabel: "Distributor",
          posAction: "Ring Up", addToCartLabel: "Add to Basket",
          cartLabel: "Basket",
          transactionLabel: "Sale", transactionPlural: "Sales",
          orderLabel: "sale",
          topItemsLabel: "Top Sellers", itemUnit: "unit",
          bestSellerLabel: "Top Seller",
        };
        quickSuggestions = ["Rice", "Cooking Oil", "Eggs", "Instant Noodles", "Canned Goods", "Sardines", "Detergent", "Bottled Water", "Soft Drink", "Coffee"];
        break;

      case "perishable_goods":
        primaryNavUrls = ["/pos", "/products"];
        labels = {
          "/pos": "Checkout",
          "/products": "Goods & Produce",
          "/transactions": "Sales",
          "/expiry": "Freshness Tracker",
        };
        sidebarOrder = ["/", "/pos", "/products", "/expiry", "/customers", "/transactions", "/analytics", "/expenses", "/suppliers", "/purchases", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          ...DEFAULT_TERMINOLOGY,
          product: "Produce", productPlural: "Goods & Produce",
          categoryLabel: "Product Type", supplierLabel: "Supplier",
          posAction: "Process Sale", addToCartLabel: "Add to Order",
          cartLabel: "Order",
          transactionLabel: "Sale", transactionPlural: "Sales",
          orderLabel: "sale",
          topItemsLabel: "Top Products", itemUnit: "kg",
          bestSellerLabel: "Top Seller",
        };
        quickSuggestions = ["Bangus", "Tilapia", "Pork Kasim", "Chicken Breast", "Beef Brisket", "Kamatis", "Sibuyas", "Bawang", "Kangkong", "Mangga"];
        break;

      case "clothing":
        primaryNavUrls = ["/pos", "/products"];
        labels = {
          "/products": "Clothing Inventory",
          "/transactions": "Sales",
          "/customers": "Customers",
          "/suppliers": "Brands & Suppliers",
          "/purchases": "Stock Orders",
        };
        sidebarOrder = ["/", "/pos", "/products", "/customers", "/transactions", "/analytics", "/expenses", "/suppliers", "/purchases", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          ...DEFAULT_TERMINOLOGY,
          product: "Item", productPlural: "Items",
          categoryLabel: "Collection", supplierLabel: "Brand / Supplier",
          posAction: "Complete Purchase", addToCartLabel: "Add to Cart",
          cartLabel: "Cart",
          transactionLabel: "Sale", transactionPlural: "Sales",
          orderLabel: "sale",
          topItemsLabel: "Top Sellers", itemUnit: "piece",
          bestSellerLabel: "Best Seller",
        };
        quickSuggestions = ["T-Shirt", "Jeans", "Dress", "Polo", "Shorts", "Jacket", "Blouse", "Skirt", "Sneakers", "Socks"];
        break;

      case "electronics":
        primaryNavUrls = ["/pos", "/products"];
        labels = {
          "/products": "Product Inventory",
          "/transactions": "Sales",
          "/customers": "Customers",
          "/suppliers": "Distributors",
          "/purchases": "Stock Orders",
        };
        sidebarOrder = ["/", "/pos", "/products", "/customers", "/transactions", "/analytics", "/expenses", "/suppliers", "/purchases", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          ...DEFAULT_TERMINOLOGY,
          product: "Device", productPlural: "Devices",
          categoryLabel: "Product Category", supplierLabel: "Distributor",
          posAction: "Complete Sale", addToCartLabel: "Add to Cart",
          cartLabel: "Cart",
          transactionLabel: "Sale", transactionPlural: "Sales",
          orderLabel: "sale",
          topItemsLabel: "Top Products", itemUnit: "unit",
          bestSellerLabel: "Best Seller",
        };
        quickSuggestions = ["Phone", "Laptop", "Tablet", "Earbuds", "Charger", "Power Bank", "USB Cable", "Casing", "Screen Protector", "Mouse"];
        break;

      case "bookstore":
        primaryNavUrls = ["/pos", "/products"];
        labels = {
          "/products": "Book Inventory",
          "/transactions": "Sales",
          "/customers": "Customers",
          "/suppliers": "Publishers",
          "/purchases": "Book Orders",
        };
        sidebarOrder = ["/", "/pos", "/products", "/customers", "/transactions", "/analytics", "/expenses", "/suppliers", "/purchases", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          ...DEFAULT_TERMINOLOGY,
          product: "Book", productPlural: "Books",
          categoryLabel: "Genre / Section", supplierLabel: "Publisher",
          posAction: "Complete Purchase", addToCartLabel: "Add to Cart",
          cartLabel: "Cart",
          transactionLabel: "Sale", transactionPlural: "Sales",
          orderLabel: "sale",
          topItemsLabel: "Top Sellers", itemUnit: "copy",
          bestSellerLabel: "Best Seller",
        };
        quickSuggestions = ["Fiction Novel", "Non-Fiction", "Textbook", "Magazine", "Comic Book", "Self-Help", "Children's Book", "Reference", "Notebook", "Pen"];
        break;

      default:
        sidebarOrder = ["/", "/pos", "/products", "/customers", "/transactions", "/analytics", "/expenses", "/suppliers", "/purchases", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        break;
    }

  // ── Services ─────────────────────────────────────────────────────────────
  } else if (businessType === "services") {
    showBarcode = false;
    hidden.add("/kitchen");
    hidden.add("/tables");
    hidden.add("/suppliers");
    hidden.add("/purchases");

    switch (businessSubType) {
      case "salon":
        primaryNavUrls = ["/appointments", "/staff"];
        labels = {
          "/appointments": "Bookings", "/staff": "Stylists",
          "/customers": "Clients", "/pos": "Check Out",
          "/products": "Retail Products", "/transactions": "Visits",
          "/discount-codes": "Promos",
        };
        hidden.add("/memberships");
        sidebarOrder = ["/", "/appointments", "/staff", "/customers", "/rooms", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Bookings", entry: "Booking", entryPlural: "Bookings",
          service: "Service", customer: "Client", staff: "Stylist", room: "Chair",
          bookButton: "Book", emptyState: "No bookings yet",
          product: "Retail Product", productPlural: "Retail Products",
          categoryLabel: "Service Type", supplierLabel: "Supplier",
          posAction: "Check Out", addToCartLabel: "Add Service",
          cartLabel: "Bill",
          transactionLabel: "Visit", transactionPlural: "Visits",
          orderLabel: "booking",
          topItemsLabel: "Top Services", itemUnit: "booking",
          bestSellerLabel: "Most Booked",
        };
        quickSuggestions = ["Haircut", "Hair Color", "Highlights", "Blowout", "Trim", "Styling", "Perm", "Treatment", "Rebond", "Keratin"];
        break;

      case "barbershop":
      case "barber":
        primaryNavUrls = ["/appointments", "/staff"];
        labels = {
          "/appointments": "Bookings", "/staff": "Barbers",
          "/customers": "Clients", "/pos": "Check Out",
          "/products": "Retail Products", "/transactions": "Visits",
        };
        hidden.add("/memberships");
        sidebarOrder = ["/", "/appointments", "/staff", "/customers", "/rooms", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Bookings", entry: "Booking", entryPlural: "Bookings",
          service: "Service", customer: "Client", staff: "Barber", room: "Chair",
          bookButton: "Book", emptyState: "No bookings yet",
          product: "Retail Product", productPlural: "Retail Products",
          categoryLabel: "Service Type", supplierLabel: "Supplier",
          posAction: "Check Out", addToCartLabel: "Add Service",
          cartLabel: "Bill",
          transactionLabel: "Visit", transactionPlural: "Visits",
          orderLabel: "booking",
          topItemsLabel: "Top Services", itemUnit: "booking",
          bestSellerLabel: "Most Booked",
        };
        quickSuggestions = ["Haircut", "Beard Trim", "Clean Shave", "Fade", "Hair & Beard", "Styling", "Kids Cut", "Senior Cut"];
        break;

      case "nail_salon":
        primaryNavUrls = ["/appointments", "/staff"];
        labels = {
          "/appointments": "Bookings", "/customers": "Clients",
          "/staff": "Nail Techs", "/rooms": "Stations",
          "/pos": "Check Out", "/products": "Nail Products",
          "/transactions": "Visits",
        };
        hidden.add("/memberships");
        sidebarOrder = ["/", "/appointments", "/staff", "/rooms", "/customers", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Bookings", entry: "Booking", entryPlural: "Bookings",
          service: "Nail Service", customer: "Client", staff: "Nail Tech", room: "Station",
          bookButton: "Book", emptyState: "No bookings yet",
          product: "Nail Product", productPlural: "Nail Products",
          categoryLabel: "Service Type", supplierLabel: "Supplier",
          posAction: "Check Out", addToCartLabel: "Add Service",
          cartLabel: "Bill",
          transactionLabel: "Visit", transactionPlural: "Visits",
          orderLabel: "booking",
          topItemsLabel: "Top Services", itemUnit: "booking",
          bestSellerLabel: "Most Booked",
        };
        quickSuggestions = ["Manicure", "Pedicure", "Gel Nails", "Acrylic Nails", "Nail Art", "French Tips", "Spa Mani-Pedi", "Nail Removal"];
        break;

      case "massage":
        primaryNavUrls = ["/appointments", "/staff"];
        labels = {
          "/appointments": "Bookings", "/customers": "Clients",
          "/staff": "Therapists", "/rooms": "Rooms",
          "/pos": "Check Out", "/products": "Retail Products",
          "/transactions": "Visits",
        };
        hidden.add("/memberships");
        sidebarOrder = ["/", "/appointments", "/staff", "/rooms", "/customers", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Bookings", entry: "Booking", entryPlural: "Bookings",
          service: "Massage Type", customer: "Client", staff: "Therapist", room: "Room",
          bookButton: "Book", emptyState: "No bookings yet",
          product: "Retail Product", productPlural: "Retail Products",
          categoryLabel: "Massage Type", supplierLabel: "Supplier",
          posAction: "Check Out", addToCartLabel: "Add Treatment",
          cartLabel: "Bill",
          transactionLabel: "Visit", transactionPlural: "Visits",
          orderLabel: "booking",
          topItemsLabel: "Top Treatments", itemUnit: "booking",
          bestSellerLabel: "Most Booked",
        };
        quickSuggestions = ["Swedish Massage", "Deep Tissue", "Hot Stone", "Shiatsu", "Reflexology", "Sports Massage", "Prenatal Massage", "Couple Massage"];
        break;

      case "gym":
        primaryNavUrls = ["/memberships", "/appointments"];
        labels = {
          "/memberships": "Members", "/appointments": "Sessions",
          "/staff": "Trainers", "/rooms": "Courts & Studios",
          "/customers": "Members", "/pos": "Billing",
          "/products": "Merchandise", "/transactions": "Payments",
        };
        sidebarOrder = ["/", "/memberships", "/appointments", "/staff", "/rooms", "/customers", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Sessions", entry: "Session", entryPlural: "Sessions",
          service: "Session Type", customer: "Member", staff: "Trainer", room: "Court / Studio",
          bookButton: "Schedule", emptyState: "No sessions scheduled",
          product: "Product", productPlural: "Merchandise",
          categoryLabel: "Category", supplierLabel: "Supplier",
          posAction: "Process Payment", addToCartLabel: "Add Item",
          cartLabel: "Bill",
          transactionLabel: "Payment", transactionPlural: "Payments",
          orderLabel: "session",
          topItemsLabel: "Top Sessions", itemUnit: "session",
          bestSellerLabel: "Most Scheduled",
        };
        quickSuggestions = ["Personal Training", "Group Class", "Court Booking", "Fitness Assessment", "Yoga Session", "CrossFit", "Consultation", "Spin Class"];
        break;

      case "spa":
        primaryNavUrls = ["/appointments", "/rooms"];
        labels = {
          "/appointments": "Bookings", "/rooms": "Treatment Rooms",
          "/customers": "Clients", "/memberships": "Packages",
          "/pos": "Check Out", "/products": "Retail Products",
          "/transactions": "Visits",
        };
        sidebarOrder = ["/", "/appointments", "/rooms", "/memberships", "/staff", "/customers", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Bookings", entry: "Booking", entryPlural: "Bookings",
          service: "Treatment", customer: "Client", staff: "Therapist", room: "Treatment Room",
          bookButton: "Book", emptyState: "No bookings yet",
          product: "Retail Product", productPlural: "Retail Products",
          categoryLabel: "Treatment Type", supplierLabel: "Supplier",
          posAction: "Check Out", addToCartLabel: "Add Treatment",
          cartLabel: "Bill",
          transactionLabel: "Visit", transactionPlural: "Visits",
          orderLabel: "booking",
          topItemsLabel: "Top Treatments", itemUnit: "booking",
          bestSellerLabel: "Most Booked",
        };
        quickSuggestions = ["Full Body Massage", "Swedish Massage", "Facial", "Body Scrub", "Aromatherapy", "Hot Stone Massage", "Foot Spa", "Couple Massage"];
        break;

      case "clinic":
        primaryNavUrls = ["/appointments", "/customers"];
        labels = {
          "/appointments": "Patients", "/customers": "Patient Records",
          "/staff": "Doctors", "/rooms": "Examination Rooms",
          "/pos": "Bill Patient", "/products": "Medical Supplies",
          "/transactions": "Consultations", "/expenses": "Operating Expenses",
          "/discount-codes": "Billing Adjustments",
        };
        hidden.add("/memberships");
        sidebarOrder = ["/", "/appointments", "/customers", "/staff", "/rooms", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Patients", entry: "Patient", entryPlural: "Patients",
          service: "Procedure", customer: "Patient", staff: "Doctor", room: "Examination Room",
          bookButton: "Schedule", emptyState: "No patients today",
          product: "Medical Supply", productPlural: "Medical Supplies",
          categoryLabel: "Procedure Type", supplierLabel: "Medical Supplier",
          posAction: "Bill Patient", addToCartLabel: "Add Charge",
          cartLabel: "Bill",
          transactionLabel: "Consultation", transactionPlural: "Consultations",
          orderLabel: "consultation",
          topItemsLabel: "Top Procedures", itemUnit: "patient",
          bestSellerLabel: "Most Common",
        };
        quickSuggestions = ["General Consultation", "Follow-up Visit", "Check-up", "Lab Request", "Vaccination", "Prescription Renewal", "Physical Exam", "ECG"];
        break;

      case "dental":
        primaryNavUrls = ["/appointments", "/customers"];
        labels = {
          "/appointments": "Patients", "/customers": "Patient Records",
          "/staff": "Dentists", "/rooms": "Dental Chairs",
          "/pos": "Bill Patient", "/products": "Dental Supplies",
          "/transactions": "Consultations", "/expenses": "Operating Expenses",
        };
        hidden.add("/memberships");
        sidebarOrder = ["/", "/appointments", "/customers", "/staff", "/rooms", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Patients", entry: "Patient", entryPlural: "Patients",
          service: "Dental Procedure", customer: "Patient", staff: "Dentist", room: "Dental Chair",
          bookButton: "Schedule", emptyState: "No patients today",
          product: "Dental Supply", productPlural: "Dental Supplies",
          categoryLabel: "Procedure Type", supplierLabel: "Dental Supplier",
          posAction: "Bill Patient", addToCartLabel: "Add Charge",
          cartLabel: "Bill",
          transactionLabel: "Consultation", transactionPlural: "Consultations",
          orderLabel: "consultation",
          topItemsLabel: "Top Procedures", itemUnit: "patient",
          bestSellerLabel: "Most Common",
        };
        quickSuggestions = ["Dental Cleaning", "Tooth Extraction", "Filling", "Whitening", "Root Canal", "Braces Adjustment", "Consultation", "X-ray"];
        break;

      case "pet_grooming":
        primaryNavUrls = ["/appointments", "/customers"];
        labels = {
          "/appointments": "Grooming Bookings", "/customers": "Pet Owners",
          "/staff": "Groomers", "/rooms": "Grooming Stations",
          "/pos": "Check Out", "/products": "Grooming Products",
          "/transactions": "Visits",
        };
        hidden.add("/memberships");
        sidebarOrder = ["/", "/appointments", "/customers", "/staff", "/rooms", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Bookings", entry: "Booking", entryPlural: "Bookings",
          service: "Grooming Service", customer: "Pet Owner", staff: "Groomer", room: "Grooming Station",
          bookButton: "Book", emptyState: "No grooming bookings today",
          product: "Grooming Product", productPlural: "Grooming Products",
          categoryLabel: "Service Type", supplierLabel: "Supplier",
          posAction: "Check Out", addToCartLabel: "Add Service",
          cartLabel: "Bill",
          transactionLabel: "Visit", transactionPlural: "Visits",
          orderLabel: "booking",
          topItemsLabel: "Top Services", itemUnit: "booking",
          bestSellerLabel: "Most Booked",
        };
        quickSuggestions = ["Full Groom", "Bath & Dry", "Nail Trim", "Ear Cleaning", "Hair Trim", "Teeth Brushing", "De-shedding", "Puppy Groom"];
        break;

      case "car_wash":
        primaryNavUrls = ["/appointments", "/pos"];
        labels = {
          "/appointments": "Queue", "/customers": "Clients",
          "/pos": "New Job", "/products": "Wash Services",
          "/transactions": "Jobs",
        };
        hidden.add("/memberships");
        hidden.add("/rooms");
        sidebarOrder = ["/", "/appointments", "/pos", "/customers", "/staff", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Queue", entry: "Job", entryPlural: "Jobs",
          service: "Wash Type", customer: "Client", staff: "Washer", room: "Bay",
          bookButton: "Queue", emptyState: "Queue is empty",
          product: "Wash Service", productPlural: "Wash Services",
          categoryLabel: "Wash Type", supplierLabel: "Supplier",
          posAction: "Process Job", addToCartLabel: "Add Service",
          cartLabel: "Job Order",
          transactionLabel: "Job", transactionPlural: "Jobs",
          orderLabel: "job",
          topItemsLabel: "Top Wash Types", itemUnit: "job",
          bestSellerLabel: "Most Popular",
        };
        quickSuggestions = ["Basic Wash", "Full Detail", "Interior Cleaning", "Wax & Polish", "Engine Wash", "Underchassis Wash", "Express Wash", "Premium Detail"];
        break;

      case "auto_repair":
      case "repair":
        primaryNavUrls = ["/appointments", "/customers"];
        labels = {
          "/appointments": "Repair Jobs", "/customers": "Clients",
          "/pos": "Open Job", "/products": "Parts & Services",
          "/transactions": "Repair Jobs", "/suppliers": "Parts Suppliers",
          "/purchases": "Parts Orders",
        };
        hidden.add("/memberships");
        hidden.add("/rooms");
        hidden.delete("/suppliers");
        hidden.delete("/purchases");
        sidebarOrder = ["/", "/appointments", "/customers", "/staff", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Jobs", entry: "Job", entryPlural: "Jobs",
          service: "Repair Type", customer: "Client", staff: "Technician", room: "Bay",
          bookButton: "Add Job", emptyState: "No repair jobs",
          product: "Part / Service", productPlural: "Parts & Services",
          categoryLabel: "Repair Type", supplierLabel: "Parts Supplier",
          posAction: "Close Job", addToCartLabel: "Add Part / Service",
          cartLabel: "Job Order",
          transactionLabel: "Job", transactionPlural: "Jobs",
          orderLabel: "job",
          topItemsLabel: "Top Repair Types", itemUnit: "job",
          bestSellerLabel: "Most Requested",
        };
        quickSuggestions = ["Diagnosis", "Screen Repair", "Battery Replacement", "Oil Change", "Brake Service", "Data Recovery", "Software Fix", "General Repair"];
        break;

      case "laundry":
        primaryNavUrls = ["/appointments", "/pos"];
        labels = {
          "/appointments": "Laundry Orders", "/customers": "Clients",
          "/pos": "New Order", "/products": "Laundry Services",
          "/transactions": "Orders",
        };
        hidden.add("/memberships");
        hidden.add("/rooms");
        sidebarOrder = ["/", "/appointments", "/pos", "/customers", "/staff", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Orders", entry: "Order", entryPlural: "Orders",
          service: "Laundry Service", customer: "Client", staff: "Staff", room: "Station",
          bookButton: "New Order", emptyState: "No laundry orders",
          product: "Service", productPlural: "Services",
          categoryLabel: "Service Type", supplierLabel: "Supplier",
          posAction: "Process Order", addToCartLabel: "Add Service",
          cartLabel: "Order",
          transactionLabel: "Order", transactionPlural: "Orders",
          orderLabel: "order",
          topItemsLabel: "Top Services", itemUnit: "order",
          bestSellerLabel: "Most Ordered",
        };
        quickSuggestions = ["Wash & Fold", "Dry Clean", "Press & Iron", "Comforter Wash", "Express Service", "Shoe Cleaning", "Curtain Wash", "Bedding Set"];
        break;

      case "photography":
        primaryNavUrls = ["/appointments", "/rooms"];
        labels = {
          "/appointments": "Bookings", "/rooms": "Studios",
          "/customers": "Clients", "/pos": "Create Invoice",
          "/products": "Packages & Add-ons", "/transactions": "Bookings",
        };
        hidden.add("/memberships");
        sidebarOrder = ["/", "/appointments", "/rooms", "/staff", "/customers", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Bookings", entry: "Booking", entryPlural: "Bookings",
          service: "Shoot Type", customer: "Client", staff: "Photographer", room: "Studio",
          bookButton: "Book Shoot", emptyState: "No shoots booked",
          product: "Package", productPlural: "Packages & Add-ons",
          categoryLabel: "Shoot Category", supplierLabel: "Vendor",
          posAction: "Complete Booking", addToCartLabel: "Add to Package",
          cartLabel: "Invoice",
          transactionLabel: "Booking", transactionPlural: "Bookings",
          orderLabel: "booking",
          topItemsLabel: "Top Shoot Types", itemUnit: "session",
          bestSellerLabel: "Most Booked",
        };
        quickSuggestions = ["Portrait Session", "Family Photo", "Event Coverage", "Product Shoot", "Headshot", "Graduation Photos", "Prenatal Shoot", "Commercial Shoot"];
        break;

      case "tutoring":
        primaryNavUrls = ["/appointments", "/staff"];
        labels = {
          "/appointments": "Sessions", "/staff": "Tutors",
          "/customers": "Students", "/pos": "Process Payment",
          "/products": "Study Packages", "/transactions": "Sessions",
        };
        hidden.add("/memberships");
        hidden.add("/rooms");
        sidebarOrder = ["/", "/appointments", "/staff", "/customers", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Sessions", entry: "Session", entryPlural: "Sessions",
          service: "Subject", customer: "Student", staff: "Tutor", room: "Room",
          bookButton: "Schedule", emptyState: "No sessions scheduled",
          product: "Study Package", productPlural: "Study Packages",
          categoryLabel: "Subject Area", supplierLabel: "Supplier",
          posAction: "Process Payment", addToCartLabel: "Add Session",
          cartLabel: "Invoice",
          transactionLabel: "Session", transactionPlural: "Sessions",
          orderLabel: "session",
          topItemsLabel: "Top Subjects", itemUnit: "session",
          bestSellerLabel: "Most Scheduled",
        };
        quickSuggestions = ["Math", "Science", "English", "Filipino", "Test Prep", "Homework Help", "College Entrance Prep", "Programming"];
        break;

      case "cleaning":
        primaryNavUrls = ["/appointments", "/staff"];
        labels = {
          "/appointments": "Bookings", "/staff": "Cleaning Teams",
          "/customers": "Clients", "/pos": "New Job",
          "/products": "Cleaning Services", "/transactions": "Jobs",
        };
        hidden.add("/memberships");
        hidden.add("/rooms");
        sidebarOrder = ["/", "/appointments", "/staff", "/customers", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Bookings", entry: "Booking", entryPlural: "Bookings",
          service: "Cleaning Type", customer: "Client", staff: "Cleaner", room: "Area",
          bookButton: "Book", emptyState: "No cleaning jobs",
          product: "Service", productPlural: "Cleaning Services",
          categoryLabel: "Service Type", supplierLabel: "Supplier",
          posAction: "Complete Job", addToCartLabel: "Add Service",
          cartLabel: "Work Order",
          transactionLabel: "Job", transactionPlural: "Jobs",
          orderLabel: "booking",
          topItemsLabel: "Top Services", itemUnit: "booking",
          bestSellerLabel: "Most Booked",
        };
        quickSuggestions = ["Regular Clean", "Deep Clean", "Move-in Clean", "Move-out Clean", "After-party Clean", "Window Clean", "Carpet Clean", "Office Clean"];
        break;

      default:
        primaryNavUrls = ["/appointments", "/pos"];
        sidebarOrder = ["/", "/appointments", "/staff", "/rooms", "/memberships", "/customers", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = DEFAULT_TERMINOLOGY;
        quickSuggestions = [];
        break;
    }
  }

  const EXPIRY_SUBTYPES = new Set(["pharmacy", "drugstore", "perishable_goods", "grocery", "grocery_enhanced"]);
  if (!EXPIRY_SUBTYPES.has(businessSubType ?? "")) {
    hidden.add("/expiry");
  }

  return { hiddenUrls: hidden, essentialUrls: getEssentialBusinessUrls(businessType, businessSubType), showBarcode, primaryNavUrls, labels, sidebarOrder, terminology, quickSuggestions };
}
