import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import {
  Package, ShoppingCart, BarChart2, DollarSign, ChefHat, CalendarDays,
  Users, Tag, Boxes, Scissors, Dumbbell, CreditCard, ClipboardList,
  Clock, Star, TrendingUp, Wallet, Truck, Coffee, UtensilsCrossed,
  ArrowRight, Check, X, Sparkles, Store,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface GuideStep {
  icon: LucideIcon;
  title: string;
  description: string;
  tip: string;
  nav: string;
}

interface GuideContent {
  businessLabel: string;
  tagline: string;
  categoryKey: "food" | "retail" | "services";
  steps: GuideStep[];
}

const GUIDES: Record<string, GuideContent> = {
  restaurant: {
    businessLabel: "Restaurant",
    tagline: "Let's get your first table served.",
    categoryKey: "food",
    steps: [
      { icon: UtensilsCrossed, title: "Build your menu", description: "Go to Products and add your dishes with prices and categories like Mains, Drinks, and Desserts. Customers will see exactly what they ordered on their receipt.", tip: "Use categories to keep your menu organised and easy to navigate at the POS.", nav: "Products" },
      { icon: Wallet, title: "Open your cash register", description: "Before taking your first order, go to Shifts and tap Open Shift. Enter how much cash is in your register — this is your starting float.", tip: "Always open a shift at the start of each day so your cash totals are accurate.", nav: "Shifts" },
      { icon: ShoppingCart, title: "Take a table order", description: "Go to the POS screen, select a table, tap your menu items, and choose Dine-in or Takeout. Then collect payment — cash, card, or e-wallet.", tip: "You can split bills, apply discounts, and add notes to individual items.", nav: "POS" },
      { icon: ChefHat, title: "Keep your kitchen updated", description: "Every order you place at the POS appears instantly on the Kitchen screen. Your staff can mark orders ready and you'll be notified — no more shouting across the floor.", tip: "Open the Kitchen screen on a separate tablet or monitor for the smoothest workflow.", nav: "Kitchen" },
      { icon: BarChart2, title: "Close up and count your cash", description: "At the end of the day, go to Shifts and close your shift. Enter your physical cash count — ArtixPOS will tell you if it matches and show your full earnings summary.", tip: "Your Analytics page shows top-selling dishes and busiest hours so you can plan better.", nav: "Analytics" },
    ],
  },

  cafe: {
    businessLabel: "Cafe / Coffee Shop",
    tagline: "First coffee's on us — let's get you set up.",
    categoryKey: "food",
    steps: [
      { icon: Coffee, title: "Add your drinks & food", description: "Go to Products and create your menu — coffees, teas, pastries. Group them into categories like Hot Drinks, Cold Drinks, and Food to make checkout lightning fast.", tip: "Add modifiers (e.g. oat milk, extra shot) as product variants to speed up orders.", nav: "Products" },
      { icon: Wallet, title: "Open your register", description: "Before your first sale, go to Shifts and open a shift with your starting cash. This tracks every peso that goes through your register all day.", tip: "If you have multiple cashiers, each can open their own shift on separate devices.", nav: "Shifts" },
      { icon: ShoppingCart, title: "Ring up orders fast", description: "At the POS, tap items to add to the cart. You can search by name or scroll your categories. Collect payment in seconds — cash, card, or GCash.", tip: "The POS works offline too — orders are saved locally if your internet drops.", nav: "POS" },
      { icon: ClipboardList, title: "Manage your queue", description: "Orders appear on the Pending Orders screen as they come in. Your barista can see the queue, mark drinks ready, and keep the line moving without confusion.", tip: "Display Pending Orders on a kitchen screen so baristas never miss an order.", nav: "Pending" },
      { icon: TrendingUp, title: "See today's performance", description: "Analytics shows your sales total, number of transactions, peak hours, and your best-selling items — updated in real time throughout the day.", tip: "Check your busiest hour to know when to schedule extra staff.", nav: "Analytics" },
    ],
  },

  bakery: {
    businessLabel: "Bakery",
    tagline: "Fresh start — let's bake your first sale.",
    categoryKey: "food",
    steps: [
      { icon: Package, title: "List your baked goods", description: "Go to Products and add everything you sell — breads, cakes, pastries — with their prices. Add stock levels so ArtixPOS can alert you when you're running low.", tip: "Use categories like Breads, Cakes, and Pastries to speed up your cashier's workflow.", nav: "Products" },
      { icon: Wallet, title: "Open your register", description: "Start every morning by going to Shifts and opening a shift. Enter your cash float so your daily cash totals are tracked accurately from the first sale.", tip: "Your shift summary at end of day will show total sales, cash received, and any discrepancy.", nav: "Shifts" },
      { icon: ShoppingCart, title: "Make your first sale", description: "Tap items at the POS to add to the cart. You can serve multiple customers quickly — just clear the cart and start a new sale after each transaction.", tip: "Speed up checkout by setting your most popular items as favourites at the top of the POS.", nav: "POS" },
      { icon: Tag, title: "Run daily specials", description: "Apply a discount at checkout for end-of-day specials or loyalty customers. Choose a percentage off or a fixed amount — no separate process needed.", tip: "You can also create Discount Codes your regular customers can use at checkout.", nav: "POS" },
      { icon: BarChart2, title: "Track what sells", description: "Your Analytics page shows which items sold most today, your revenue trend, and your busiest selling windows — so you know exactly how much to bake tomorrow.", tip: "Low stock alerts in Products help you prep the right amount before opening each day.", nav: "Analytics" },
    ],
  },

  bar: {
    businessLabel: "Bar / Pub",
    tagline: "Let's get your bar running smoothly.",
    categoryKey: "food",
    steps: [
      { icon: Package, title: "Add your drinks menu", description: "Go to Products and list your beers, cocktails, spirits, and food. Group them into categories like Beers, Cocktails, and Bar Chow for fast ordering.", tip: "Add your most-ordered drinks first — they'll appear at the top of your POS grid.", nav: "Products" },
      { icon: Wallet, title: "Open your shift", description: "Before service starts, go to Shifts and open a cash shift with your starting float. Every payment — cash or card — is tracked against your shift.", tip: "Running multiple tills? Each device can run its own shift simultaneously.", nav: "Shifts" },
      { icon: ShoppingCart, title: "Start a tab or quick sale", description: "At the POS, tap to add drinks to a cart. You can hold an open tab for a table and add more drinks throughout the night, then settle all at once.", tip: "Tables can be assigned to keep different groups' orders separate.", nav: "POS" },
      { icon: ChefHat, title: "Kitchen & bar display", description: "Food orders go directly to your kitchen screen so chefs know what to prepare. Drink orders can appear on a bar display so your bartenders stay in sync.", tip: "The kitchen display also lets staff mark items as ready so service runs smoothly.", nav: "Kitchen" },
      { icon: BarChart2, title: "Count your till at close", description: "At the end of service, close your shift in Shifts. Count your physical cash — ArtixPOS compares it to expected and shows your full night's revenue breakdown.", tip: "Analytics shows your top-selling drinks and your peak night hours.", nav: "Analytics" },
    ],
  },

  food_truck: {
    businessLabel: "Food Truck",
    tagline: "Mobile, fast, and ready to roll.",
    categoryKey: "food",
    steps: [
      { icon: Truck, title: "Load your menu", description: "Add your menu items in Products with prices. Keep it focused — food trucks work best with a tight, fast menu. Add categories like Mains, Sides, and Drinks.", tip: "ArtixPOS works offline so you can take orders even with no signal at your spot.", nav: "Products" },
      { icon: Wallet, title: "Open your register", description: "Before your first customer, open a Shift with your cash float. This tracks every transaction so your end-of-day count is always accurate.", tip: "Use the mobile app on your phone or tablet — no bulky hardware needed.", nav: "Shifts" },
      { icon: ShoppingCart, title: "Serve customers fast", description: "Tap items at the POS to build orders in seconds. Accept cash, card, GCash, or Maya — whatever your customers prefer at the window.", tip: "The POS is touch-optimised for one-handed use, perfect for a busy truck window.", nav: "POS" },
      { icon: ClipboardList, title: "Queue management", description: "Pending Orders shows all active orders in sequence. Your kitchen crew sees exactly what's queued so nobody's order gets lost in the rush.", tip: "Name each order by the customer's name for easy pickup calls.", nav: "Pending" },
      { icon: TrendingUp, title: "Track your spot's performance", description: "Analytics shows your daily revenue, top items, and transaction count. Compare locations and days to find your best spots and times.", tip: "Use your sales data to decide which menu items to drop and which to feature more.", nav: "Analytics" },
    ],
  },

  clothing: {
    businessLabel: "Clothing / Fashion",
    tagline: "Style meets smart business — let's set up shop.",
    categoryKey: "retail",
    steps: [
      { icon: Package, title: "Add your products", description: "Go to Products and add each item with its price, category, and stock quantity. You can add size or colour notes in the product description.", tip: "Use categories like Men, Women, Kids, and Accessories to organise your store.", nav: "Products" },
      { icon: Wallet, title: "Open your cash register", description: "Start every day by going to Shifts and opening a shift with your float. This tracks all cash going through your register and makes daily reconciliation easy.", tip: "Your shift report shows total sales by payment method — perfect for bank deposits.", nav: "Shifts" },
      { icon: ShoppingCart, title: "Process a sale", description: "At the POS, search for items by name or scroll your categories. Add to cart, apply any discount, and collect payment. The receipt is printed or sent digitally.", tip: "You can add multiple items from different categories in one transaction.", nav: "POS" },
      { icon: Tag, title: "Run promotions easily", description: "Apply a discount at checkout for sale items or loyal customers. Use percentage discounts for percentage-off sales or fixed discounts for bundle deals.", tip: "Create reusable Discount Codes for specific promotions so cashiers don't need to calculate manually.", nav: "Discounts" },
      { icon: Boxes, title: "Keep your stock accurate", description: "Every sale automatically reduces your stock count. Analytics shows your top sellers and low-stock items so you always know what to reorder.", tip: "Set stock alerts on your fast-moving sizes — you'll be notified before you sell out.", nav: "Analytics" },
    ],
  },

  electronics: {
    businessLabel: "Electronics",
    tagline: "Tech-powered sales management starts here.",
    categoryKey: "retail",
    steps: [
      { icon: Package, title: "Catalogue your products", description: "Add every item you sell — phones, accessories, gadgets — to Products with their price and stock count. Use categories like Phones, Accessories, and Laptops.", tip: "Add brand and model in the product name for fast searching at the POS.", nav: "Products" },
      { icon: Wallet, title: "Open your register", description: "Start the day with a Shift so every transaction is tracked. Electronics stores often have high-value sales — accurate records matter.", tip: "Your shift report breaks down sales by payment method (cash, card, transfer).", nav: "Shifts" },
      { icon: ShoppingCart, title: "Process a sale", description: "Search by product name at the POS to find items quickly. Add to cart and collect payment. Receipts include itemised product names for warranty reference.", tip: "Add serial numbers or IMEI in the order notes for warranty tracking.", nav: "POS" },
      { icon: Tag, title: "Bundle deals & discounts", description: "Apply discounts at checkout for bundle deals (e.g. phone + case). Create Discount Codes for store promos like anniversary sales.", tip: "Percentage discounts work well for accessories; fixed discounts for bundle deals.", nav: "Discounts" },
      { icon: Boxes, title: "Monitor your inventory", description: "Stock levels update automatically with every sale. Analytics shows your best-selling products and flags items running low so you can reorder before they run out.", tip: "High-value items should have stock alerts set so you're never caught understocked.", nav: "Analytics" },
    ],
  },

  grocery: {
    businessLabel: "Grocery / Supermarket",
    tagline: "Stocked, fast, and always accurate.",
    categoryKey: "retail",
    steps: [
      { icon: Package, title: "Add your products", description: "Go to Products and add your items with prices, categories (Fresh, Pantry, Dairy, etc.), and stock quantities. For large inventories, add products in bulk via the import tool.", tip: "Keep product names consistent with how your staff searches — short and clear.", nav: "Products" },
      { icon: Wallet, title: "Open your register", description: "Before the store opens, go to Shifts and open a cash shift with your starting float. Each cashier can open their own shift on their terminal.", tip: "Multiple simultaneous shifts on different devices keep each cashier's cash separate.", nav: "Shifts" },
      { icon: ShoppingCart, title: "Fast checkout", description: "At the POS, search items by name to add them quickly. Ring up a full basket in seconds — the cart totals automatically and calculates change for cash payments.", tip: "The search bar at the POS is your fastest tool — type first 3 letters to find any product.", nav: "POS" },
      { icon: Boxes, title: "Stay on top of stock", description: "Every sale reduces your stock automatically. Check the Products page to see current levels and set low-stock alerts so you're never caught short on popular items.", tip: "Use Purchases to record deliveries and update your stock when new goods arrive.", nav: "Products" },
      { icon: BarChart2, title: "Daily cash reconciliation", description: "Close your shift at end of day, count your cash, and compare it to ArtixPOS's expected total. The difference is flagged immediately so discrepancies never go unnoticed.", tip: "Analytics shows your daily revenue, top products, and peak shopping hours.", nav: "Shifts" },
    ],
  },

  pharmacy: {
    businessLabel: "Pharmacy / Drugstore",
    tagline: "Precision and speed at the counter.",
    categoryKey: "retail",
    steps: [
      { icon: Package, title: "Add your medicines & products", description: "Add your medications, vitamins, and health products in Products with their prices, categories (Prescription, OTC, Vitamins), and stock quantities.", tip: "Group generic and branded versions under the same category for easy lookup.", nav: "Products" },
      { icon: Wallet, title: "Open your register", description: "Start every shift with a cash float in Shifts. With high-transaction volume, accurate shift records are essential for daily reporting.", tip: "Your shift summary shows total collections by payment method — handy for reporting.", nav: "Shifts" },
      { icon: ShoppingCart, title: "Process a transaction", description: "Search by medicine name or brand at the POS. Add items, apply senior/PWD discount at checkout, and collect payment — receipts are itemised automatically.", tip: "Add the dosage or instructions in the product name for prescription items (e.g. 'Amoxicillin 500mg').", nav: "POS" },
      { icon: Tag, title: "Senior & PWD discounts", description: "Apply a discount at checkout for senior citizens and PWD customers. Use the percentage discount feature for the standard 20% discount.", tip: "You can create a Discount Code labelled 'Senior/PWD' for quick, consistent application.", nav: "Discounts" },
      { icon: Boxes, title: "Track expiry & stock", description: "Monitor your stock levels in Products so fast-moving items are always in stock. Analytics shows your top sellers so you can manage your ordering better.", tip: "Check the Expiry Tracker to flag medicines approaching their expiry date.", nav: "Products" },
    ],
  },

  bookstore: {
    businessLabel: "Bookstore",
    tagline: "Every great story starts with a sale.",
    categoryKey: "retail",
    steps: [
      { icon: Package, title: "Catalogue your books", description: "Add your books and merchandise to Products with prices and categories like Fiction, Non-fiction, Children, and Stationery.", tip: "Include the author name in the product name for faster searching — e.g. 'Atomic Habits – Clear'.", nav: "Products" },
      { icon: Wallet, title: "Open your register", description: "Open a Shift at the start of your day with your cash float. Every transaction goes against your shift so your end-of-day count is always accurate.", tip: "Your shift report will show total sales, payment methods, and any discounts given.", nav: "Shifts" },
      { icon: ShoppingCart, title: "Ring up a sale", description: "Search by title or author at the POS to find books quickly. Add to cart, apply any member discount, and print or send a digital receipt.", tip: "Students often buy multiple items — the cart can hold unlimited items before checkout.", nav: "POS" },
      { icon: Users, title: "Build your reader community", description: "Add regular customers to your Customers list with their contact info. You can track their purchase history and offer personalised recommendations.", tip: "Customer profiles also work with your loyalty programme for repeat-buyer rewards.", nav: "Customers" },
      { icon: BarChart2, title: "See what's selling", description: "Analytics shows your top-selling titles, daily revenue, and transaction counts. Know which genres and authors to stock more of.", tip: "Check your slowest-moving stock in Products and consider a clearance sale to free up shelf space.", nav: "Analytics" },
    ],
  },

  salon: {
    businessLabel: "Salon / Barbershop",
    tagline: "Let's get your chairs filled and cash flowing.",
    categoryKey: "services",
    steps: [
      { icon: Scissors, title: "Add your services", description: "Go to Products and list every service you offer — Haircut, Colour, Treatment, Blowout — with their prices. Each service is a product in ArtixPOS.", tip: "Add service duration in the description (e.g. 'Hair Colour – 2hrs') to help with appointment scheduling.", nav: "Products" },
      { icon: CalendarDays, title: "Book appointments", description: "Go to Appointments to schedule clients by date, time, and staff member. Each booking shows the service, duration, and client name so your team stays coordinated.", tip: "Clients can be added to your Customer list so you keep their history and contact details.", nav: "Appointments" },
      { icon: ShoppingCart, title: "Check in a client at the POS", description: "When a client arrives, go to the POS and search for their services. Add everything they're getting to the cart — haircut, treatment, products — then process payment.", tip: "You can link a sale to a specific customer to build their purchase history.", nav: "POS" },
      { icon: Users, title: "Know your clients", description: "Your Customers list holds every client's name, contact number, and full visit history. Use it to follow up, send reminders, or personalise their next visit.", tip: "Loyal clients can be enrolled in your loyalty programme for points and rewards.", nav: "Customers" },
      { icon: TrendingUp, title: "Track your stylists' performance", description: "Analytics shows daily revenue, top services sold, and transaction counts. Use it to spot your busiest days and plan staffing accordingly.", tip: "The Staff module lets you track hours worked via the time clock feature.", nav: "Analytics" },
    ],
  },

  gym: {
    businessLabel: "Gym / Fitness Center",
    tagline: "Stronger members, stronger revenue.",
    categoryKey: "services",
    steps: [
      { icon: Dumbbell, title: "Set up membership plans", description: "Go to Products and create your membership tiers — Monthly, Quarterly, Annual — as separate products with their prices. Add day passes and class drop-ins too.", tip: "Name plans clearly like 'Monthly Membership – Unlimited' so they're easy to find at the POS.", nav: "Products" },
      { icon: Users, title: "Register your members", description: "Add each member to your Customers list with their name, contact number, and membership type. This lets you look them up instantly when they walk in.", tip: "Customer profiles track their purchase history — you'll know when memberships expire.", nav: "Customers" },
      { icon: ShoppingCart, title: "Process a membership or drop-in", description: "At the POS, search the member's name, link them as the customer, add their plan, and collect payment. Their purchase history updates automatically.", tip: "You can take payment by cash, card, or bank transfer — ArtixPOS tracks all payment types.", nav: "POS" },
      { icon: CalendarDays, title: "Schedule classes & sessions", description: "Use Appointments to book PT sessions, group classes, and consultations. Assign sessions to specific staff members and set time blocks.", tip: "Appointments keep your trainers organised and clients feel professionally managed.", nav: "Appointments" },
      { icon: BarChart2, title: "Monitor your revenue", description: "Analytics shows your daily, weekly, and monthly revenue. See how many memberships were sold vs renewals, and track your busiest sign-up periods.", tip: "January is every gym's biggest month — use Analytics to plan your staffing and promotions.", nav: "Analytics" },
    ],
  },

  spa: {
    businessLabel: "Spa / Wellness",
    tagline: "Create calm experiences with seamless operations.",
    categoryKey: "services",
    steps: [
      { icon: Sparkles, title: "Add your treatments", description: "Go to Products and list every treatment — Swedish Massage, Facial, Body Scrub — with durations and prices. Retail products like oils and skincare go here too.", tip: "Include treatment duration in the name (e.g. 'Swedish Massage – 60min') for scheduling clarity.", nav: "Products" },
      { icon: CalendarDays, title: "Manage your bookings", description: "Go to Appointments to schedule clients with their preferred therapist and treatment. See your full day at a glance so there are no double-bookings.", tip: "Confirmed appointments are tied to your Customers list so client history is always at hand.", nav: "Appointments" },
      { icon: ShoppingCart, title: "Check out a client", description: "After a treatment, go to the POS, find the client, add their services and any retail products purchased, then collect payment. Receipts are sent digitally or printed.", tip: "Clients often buy retail products at checkout — keeping them in your Products list makes upselling effortless.", nav: "POS" },
      { icon: Users, title: "Build lasting client relationships", description: "Your Customers list holds every client's visit history, preferences, and contact details. Use this to personalise each visit and follow up between appointments.", tip: "Enrol regular clients in your loyalty programme so they earn points on every visit.", nav: "Customers" },
      { icon: TrendingUp, title: "Measure your performance", description: "Analytics shows your top treatments, daily revenue, and booking trends. Know your busiest days and most popular services so you plan rosters and promotions smartly.", tip: "Friday afternoons and weekends are peak for most spas — check your data to confirm and staff up.", nav: "Analytics" },
    ],
  },

  clinic: {
    businessLabel: "Clinic / Healthcare",
    tagline: "Organised care starts with organised billing.",
    categoryKey: "services",
    steps: [
      { icon: Package, title: "Add your services & products", description: "List your consultation types, procedures, and retail items (vitamins, OTC medicines) in Products with prices. Each billable item is a product.", tip: "Use categories like Consultations, Procedures, and Medicines to keep your POS organised.", nav: "Products" },
      { icon: Users, title: "Register your patients", description: "Add every patient to your Customers list with their full name and contact number. This builds a searchable patient database you can access instantly.", tip: "Patient notes and visit history are tracked every time they're linked to a transaction.", nav: "Customers" },
      { icon: CalendarDays, title: "Schedule appointments", description: "Use Appointments to book consultations and procedures by date, time, and doctor. A clear calendar prevents overbooking and keeps patients on time.", tip: "Assign appointments to specific staff so every doctor sees their own schedule.", nav: "Appointments" },
      { icon: ShoppingCart, title: "Bill a patient", description: "At the POS, link the patient as the customer, add their consultation fee, procedures, and any medicines dispensed, then collect payment — HMO, cash, or card.", tip: "Itemised receipts give patients a clear breakdown of every charge — important for reimbursements.", nav: "POS" },
      { icon: BarChart2, title: "Track your revenue", description: "Analytics shows daily collections, top services, and transaction counts. Understand your busiest days and most profitable services to plan your schedule.", tip: "Use Expense tracking for clinic supplies and overhead so you see true net income.", nav: "Analytics" },
    ],
  },

  laundry: {
    businessLabel: "Laundry / Dry Cleaning",
    tagline: "Clean business starts with clear records.",
    categoryKey: "services",
    steps: [
      { icon: Package, title: "Set up your services", description: "Add your services to Products — Wash & Fold (per kg), Dry Clean, Press Only — with prices. You can add both per-kg and per-item services.", tip: "Create a service for 'Rush Order' at a higher rate so customers can choose urgency.", nav: "Products" },
      { icon: Wallet, title: "Open your register", description: "Start every day with an open Shift and your cash float. Laundry shops often collect deposits upfront — your shift tracks all payments including partial collections.", tip: "You can accept a partial payment at drop-off and collect the balance at pickup.", nav: "Shifts" },
      { icon: ShoppingCart, title: "Log a new order", description: "At the POS, add the services for each customer's load. Enter the weight or item count, note the customer's name, and collect the deposit or full payment.", tip: "Link each order to a Customer profile so you can track their pickup status and history.", nav: "POS" },
      { icon: ClipboardList, title: "Track pending orders", description: "Pending Orders shows all active laundry orders in progress. Mark orders as ready when done so you know exactly what's waiting for pickup.", tip: "Add the promised pickup date in the order notes so you never miss a deadline.", nav: "Pending" },
      { icon: TrendingUp, title: "Count your earnings", description: "Close your shift at end of day and verify your cash. Analytics shows daily revenue, peak days of the week, and your most popular services.", tip: "Mondays and after weekends are usually your busiest — check your data to plan staffing.", nav: "Analytics" },
    ],
  },

  car_wash: {
    businessLabel: "Car Wash / Auto Detailing",
    tagline: "Streamlined service from drive-in to drive-out.",
    categoryKey: "services",
    steps: [
      { icon: Package, title: "Add your wash packages", description: "Create your service packages in Products — Basic Wash, Full Detail, Interior Clean — with prices. You can add add-ons like Engine Bay or Tyre Shine too.", tip: "Clear package names make checkout fast when customers ask 'what's included in Full Detail?'", nav: "Products" },
      { icon: Wallet, title: "Open your register", description: "Open a Shift before your first customer arrives. All cash, card, and GCash payments are tracked against your shift for accurate end-of-day reconciliation.", tip: "If you run multiple bays with separate staff, each can have their own shift record.", nav: "Shifts" },
      { icon: ShoppingCart, title: "Log a vehicle", description: "When a car arrives, go to the POS, add their chosen package and any add-ons, and collect payment. Link to a Customer profile for return customers.", tip: "Add the vehicle type or plate number in the order notes for easy tracking through the wash.", nav: "POS" },
      { icon: ClipboardList, title: "Track vehicles in progress", description: "Pending Orders shows every vehicle currently being washed or detailed. Staff can mark jobs complete so customers are notified when their car is ready.", tip: "For detailing jobs that take hours, the order stays in Pending until you mark it done.", nav: "Pending" },
      { icon: BarChart2, title: "Measure your daily output", description: "Analytics shows how many cars you serviced, total revenue, and your busiest times. Use this to plan your team's schedule and spot your peak hours.", tip: "Weekends before 10am are peak for most car washes — use data to confirm your best windows.", nav: "Analytics" },
    ],
  },

  pet_grooming: {
    businessLabel: "Pet Grooming",
    tagline: "Happy pets, happy owners, smooth business.",
    categoryKey: "services",
    steps: [
      { icon: Scissors, title: "List your grooming services", description: "Add your services to Products — Basic Groom, Full Groom, Bath Only — organised by pet size (Small, Medium, Large) with the relevant prices.", tip: "Creating size-based services (e.g. 'Full Groom – Small Dog') avoids confusion and pricing mistakes.", nav: "Products" },
      { icon: CalendarDays, title: "Book appointments", description: "Use Appointments to schedule every pet. Assign to a groomer, set the time, and link to the owner's Customer profile — no more appointment books to lose.", tip: "Regular clients book repeat appointments — their history helps you remember their pet's preferences.", nav: "Appointments" },
      { icon: Users, title: "Build your client database", description: "Add every pet owner to Customers with their name, number, and pet details. Knowing the pet's name, breed, and temperament makes every visit feel personal.", tip: "You can add pet details and special notes in the customer profile's notes field.", nav: "Customers" },
      { icon: ShoppingCart, title: "Check out after grooming", description: "At the POS, link the owner, add their grooming services and any retail products (shampoo, accessories), and collect payment. Send a digital receipt instantly.", tip: "Upsell grooming products at checkout — they're already in your Products list ready to add.", nav: "POS" },
      { icon: TrendingUp, title: "Track your performance", description: "Analytics shows your daily revenue, top services, and transaction count. See which services are most popular and which groomers are generating the most bookings.", tip: "Use your busiest days to plan ahead — Saturdays and school holidays see the most grooming demand.", nav: "Analytics" },
    ],
  },

  default: {
    businessLabel: "Your Business",
    tagline: "Everything you need to run your business smarter.",
    categoryKey: "services",
    steps: [
      { icon: Package, title: "Add your products or services", description: "Go to Products and add everything you sell — goods, services, packages — with their prices. Organise them into categories for fast checkout.", tip: "Start with your 10 most popular items and add the rest as you go.", nav: "Products" },
      { icon: Wallet, title: "Open your cash register", description: "Go to Shifts and open a shift before your first sale. Enter your starting cash so every transaction is tracked accurately from the beginning.", tip: "Always open a shift at the start of your business day — it's how ArtixPOS tracks your daily totals.", nav: "Shifts" },
      { icon: ShoppingCart, title: "Make your first sale", description: "At the POS, tap items to add to the cart, apply any discounts, and collect payment. ArtixPOS handles cash, card, and e-wallet payments.", tip: "The POS works offline so you never lose a sale even without an internet connection.", nav: "POS" },
      { icon: Users, title: "Build your customer list", description: "Add your regular customers to the Customers page with their contact details. Track their purchase history and enrol them in your loyalty programme.", tip: "Customers with profiles get personalised service — and it helps you follow up after big purchases.", nav: "Customers" },
      { icon: BarChart2, title: "See your business at a glance", description: "Analytics shows your daily revenue, best-selling items, peak hours, and transaction count — updated live throughout the day.", tip: "Close your shift at end of day to see a full cash and sales summary for your records.", nav: "Analytics" },
    ],
  },
};

const CATEGORY_STYLE = {
  food: {
    gradient: "from-orange-500 via-amber-400 to-yellow-300",
    ring: "ring-orange-200 dark:ring-orange-800",
    badge: "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300",
    dot: "bg-orange-500",
    btn: "bg-orange-500 hover:bg-orange-600 text-white",
    icon: "text-orange-500 dark:text-orange-400",
    step: "bg-orange-50 dark:bg-orange-950/30 border-orange-100 dark:border-orange-900/50",
  },
  retail: {
    gradient: "from-blue-600 via-blue-400 to-cyan-300",
    ring: "ring-blue-200 dark:ring-blue-800",
    badge: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
    dot: "bg-blue-500",
    btn: "bg-blue-600 hover:bg-blue-700 text-white",
    icon: "text-blue-500 dark:text-blue-400",
    step: "bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900/50",
  },
  services: {
    gradient: "from-violet-600 via-purple-500 to-fuchsia-400",
    ring: "ring-violet-200 dark:ring-violet-800",
    badge: "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300",
    dot: "bg-violet-500",
    btn: "bg-violet-600 hover:bg-violet-700 text-white",
    icon: "text-violet-500 dark:text-violet-400",
    step: "bg-violet-50 dark:bg-violet-950/30 border-violet-100 dark:border-violet-900/50",
  },
};

function getGuide(subtype: string | null | undefined): GuideContent {
  if (subtype && GUIDES[subtype]) return GUIDES[subtype];
  return GUIDES.default;
}

export function BusinessGuide() {
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  const subtype: string | undefined =
    (user?.activeBranch as any)?.businessType ??
    (settings as any)?.businessType ??
    undefined;

  const storageKey = user?.id ? `artix-guide-v1-${user.id}` : null;

  useEffect(() => {
    if (!storageKey) return;
    if (localStorage.getItem(storageKey)) return;
    if (!settings?.onboardingComplete) return;
    const t = setTimeout(() => setVisible(true), 900);
    return () => clearTimeout(t);
  }, [storageKey, settings?.onboardingComplete]);

  const dismiss = () => {
    if (storageKey) localStorage.setItem(storageKey, "1");
    setExiting(true);
    setTimeout(() => setVisible(false), 250);
  };

  const next = () => {
    if (step < guide.steps.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss();
    }
  };

  if (!visible) return null;

  const guide = getGuide(subtype);
  const style = CATEGORY_STYLE[guide.categoryKey];
  const current = guide.steps[step];
  const isLast = step === guide.steps.length - 1;
  const Icon = current.icon;

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 transition-all duration-250 ${exiting ? "opacity-0" : "opacity-100"}`}
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
    >
      <div
        className={`w-full sm:max-w-md bg-white dark:bg-slate-900 sm:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden transition-all duration-250 ${exiting ? "translate-y-8 scale-95 opacity-0" : "translate-y-0 scale-100 opacity-100"}`}
      >
        {/* ── Hero header ──────────────────────────────────────────────────── */}
        <div className={`relative bg-gradient-to-br ${style.gradient} px-5 pt-5 pb-8 overflow-hidden`}>
          {/* Decorative circles */}
          <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10" />
          <div className="absolute -right-4 top-8 w-20 h-20 rounded-full bg-white/8" />

          <div className="relative flex items-start justify-between mb-4">
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 text-white text-xs font-semibold tracking-wide`}>
              <Store className="w-3 h-3" />
              {guide.businessLabel}
            </div>
            <button
              onClick={dismiss}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
              aria-label="Close guide"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative">
            <p className="text-white/75 text-xs font-medium uppercase tracking-widest mb-1">Quick-start guide</p>
            <h2 className="text-white text-xl font-bold leading-tight">{guide.tagline}</h2>
          </div>
        </div>

        {/* ── Step indicator tabs ───────────────────────────────────────────── */}
        <div className="flex gap-1 px-5 -mt-3 relative z-10">
          {guide.steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`h-1.5 rounded-full flex-1 transition-all duration-200 ${
                i === step ? `${style.dot} flex-[2]` : i < step ? `${style.dot} opacity-60` : "bg-slate-200 dark:bg-slate-700"
              }`}
            />
          ))}
        </div>

        {/* ── Step content ──────────────────────────────────────────────────── */}
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Step {step + 1} of {guide.steps.length}
            </span>
          </div>

          <div className={`rounded-xl border p-4 ${style.step} mb-4`}>
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-white dark:bg-slate-800 shadow-sm ring-1 ${style.ring}`}>
                <Icon className={`w-5 h-5 ${style.icon}`} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900 dark:text-white text-base leading-snug mb-1.5">
                  {current.title}
                </h3>
                <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                  {current.description}
                </p>
              </div>
            </div>
          </div>

          {/* Pro tip */}
          <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50 rounded-xl px-3.5 py-3 mb-5">
            <Star className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-amber-800 dark:text-amber-300 text-xs leading-relaxed">
              <span className="font-semibold">Pro tip: </span>{current.tip}
            </p>
          </div>
        </div>

        {/* ── Navigation ───────────────────────────────────────────────────── */}
        <div className="px-5 pb-6 flex items-center gap-3">
          <button
            onClick={dismiss}
            className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors font-medium px-2 py-2"
          >
            Skip guide
          </button>

          <button
            onClick={next}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95 ${style.btn}`}
          >
            {isLast ? (
              <>
                <Check className="w-4 h-4" />
                Start using ArtixPOS
              </>
            ) : (
              <>
                Next
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        {/* Safe area spacer for mobile */}
        <div className="sm:hidden pb-safe" />
      </div>
    </div>
  );
}
