import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { useBranchBusiness } from "@/hooks/use-branch-business";
import { ArrowRight, ArrowLeft, X, Zap } from "lucide-react";

interface TourStep {
  target: string | null;
  title: string;
  body: string;
}

// Returns which broad category a subtype belongs to
function getCategory(subtype: string | null | undefined): "food" | "retail" | "salon" | "wellness" | "clinic" | "gym" | "queue_service" | "appointment_service" | "other" {
  if (!subtype) return "other";
  if (["cafe", "restaurant", "bakery", "bar", "food_truck"].includes(subtype)) return "food";
  if (["clothing", "electronics", "grocery", "bookstore", "pharmacy", "perishable_goods", "drugstore"].includes(subtype)) return "retail";
  if (["salon", "barbershop", "nail_salon"].includes(subtype)) return "salon";
  if (["spa", "massage"].includes(subtype)) return "wellness";
  if (["clinic", "dental"].includes(subtype)) return "clinic";
  if (subtype === "gym") return "gym";
  if (["laundry", "car_wash", "repair", "auto_repair"].includes(subtype)) return "queue_service";
  if (["pet_grooming", "photography", "cleaning", "tutoring"].includes(subtype)) return "appointment_service";
  return "other";
}

function getSteps(subtype: string | null | undefined, storeName: string): TourStep[] {
  const name = storeName || "your store";
  const cat = getCategory(subtype);

  // ── Intro — always first ───────────────────────────────────────────────────

  const intro: TourStep = {
    target: null,
    title: `Welcome to ${name} 👋`,
    body: cat === "food"
      ? "ArtixPOS is your all-in-one restaurant OS — orders, kitchen display, inventory, staff, and revenue all in one place. Let me walk you through each section. Tap Next to start."
      : cat === "retail"
      ? "ArtixPOS is your all-in-one retail OS — sales, inventory, barcodes, suppliers, and analytics all in one place. Let me walk you through each section. Tap Next to start."
      : cat === "salon"
      ? "ArtixPOS is your all-in-one salon management system — appointments, stylist schedules, client history, and payments in one place. Let me walk you through each section. Tap Next to start."
      : cat === "wellness"
      ? "ArtixPOS is your all-in-one wellness studio OS — bookings, therapist schedules, treatment packages, memberships, and payments in one place. Let me walk you through each section. Tap Next to start."
      : cat === "clinic"
      ? "ArtixPOS is your all-in-one clinic management system — patient appointments, doctor schedules, billing, and records all in one place. Let me walk you through each section. Tap Next to start."
      : cat === "gym"
      ? "ArtixPOS is your all-in-one gym management system — memberships, class bookings, trainer schedules, and revenue all in one place. Let me walk you through each section. Tap Next to start."
      : cat === "queue_service"
      ? "ArtixPOS is your all-in-one service OS — job intake, queue tracking, staff management, and payments all in one place. Let me walk you through each section. Tap Next to start."
      : cat === "appointment_service"
      ? "ArtixPOS is your all-in-one booking OS — appointments, staff schedules, client profiles, and payments all in one place. Let me walk you through each section. Tap Next to start."
      : "ArtixPOS is your all-in-one business OS — sales, inventory, staff, and analytics in one place. Let me walk you through each section. Tap Next to start.",
  };

  // ── Dashboard steps — language tuned per category ─────────────────────────

  const dashboardHero: TourStep = {
    target: '[data-tour="tour-dashboard-hero"]',
    title: "Today's Revenue",
    body: cat === "food"
      ? "Your command center for the day. See total revenue, number of orders completed, and average order value — all updating live with every sale and table payment."
      : cat === "retail"
      ? "Your daily command center. See total revenue, transactions completed, and average basket size — updating in real time with every sale at the counter."
      : cat === "salon"
      ? "Your daily command center. See total revenue from all services today, how many appointments were completed, and average ticket value — live as each client checks out."
      : cat === "wellness"
      ? "Your daily revenue snapshot. See total earnings from treatments and packages today, sessions completed, and average treatment value — updating live after each checkout."
      : cat === "clinic"
      ? "Your daily overview. See total revenue from consultations and procedures, patient visits completed, and average billing amount — live throughout the day."
      : cat === "gym"
      ? "Your daily overview. See membership revenue collected, sessions completed, and average transaction value — all updating in real time."
      : "This is your command center. At a glance you see today's total revenue, completed orders, and average transaction value. It updates in real time every time a sale is made.",
  };

  const dashboardKpi: TourStep = {
    target: '[data-tour="tour-dashboard-kpi"]',
    title: "Key Numbers",
    body: cat === "food"
      ? "These cards show total orders, net revenue, average order size, and tax collected today. Scroll down to see your top-selling dishes, payment method split, and hourly order volume."
      : cat === "retail"
      ? "These cards show total transactions, net revenue, average basket size, and tax collected today. Scroll down to see top-selling items, payment methods, and busiest hours."
      : cat === "salon" || cat === "wellness"
      ? "These cards show total appointments completed, net revenue, average service value, and tax collected today. Scroll down to see your most popular services and busiest time slots."
      : cat === "clinic"
      ? "These cards show patient visits, net revenue billed, average consultation fee, and tax collected today. Scroll down to see most-billed services and peak appointment hours."
      : cat === "gym"
      ? "These cards show active members checked in, revenue collected, average transaction value, and tax for today. Scroll down to see peak hours and top revenue sources."
      : "These four cards show your total transactions, net revenue, average order size, and tax collected — all for today. Scroll down to see your best sellers, payment breakdown, and end-of-day summary.",
  };

  // ── POS step — fully customised per subtype ────────────────────────────────

  let posBody: string;
  if (subtype === "restaurant") {
    posBody = "This is where table orders are taken. Select the table, tap dishes to add them to the order, apply discounts or modifiers, then send to the kitchen. Payment is collected here at the end — cash, card, GCash, Maya, or split bill. Works offline too.";
  } else if (subtype === "bar") {
    posBody = "Ring up drinks and food orders here. Tap items to add them to the tab, apply happy-hour discounts, then close out the tab with any payment method — cash, card, GCash, or Maya. Fast, offline-ready.";
  } else if (subtype === "cafe") {
    posBody = "Take orders here — tap a drink or pastry to add it to the order, customise with modifiers like size or milk type, then collect payment. Receipts print instantly. The order queues up for your barista automatically. Works even without Wi-Fi.";
  } else if (subtype === "bakery") {
    posBody = "Ring up breads, pastries, and cakes here. Tap an item, set the quantity, apply any discount, then collect payment — cash, card, GCash, or Maya. Receipts print instantly and inventory adjusts automatically.";
  } else if (subtype === "food_truck") {
    posBody = "Fast and offline-ready POS for your truck. Tap items to build the order, collect payment, and print or send a digital receipt — even without internet. Orders queue up automatically so nothing gets missed.";
  } else if (subtype === "clothing" || subtype === "retail") {
    posBody = "Ring up items here — scan a barcode or tap a product to add it to the cart. Apply discounts, process returns, and collect payment via cash, card, GCash, or Maya. Inventory adjusts automatically with every sale.";
  } else if (subtype === "electronics") {
    posBody = "Scan or search for items to add them to the sale. Apply warranty add-ons or bundle discounts, then collect payment. Inventory levels update automatically and low-stock alerts trigger when you're running low.";
  } else if (subtype === "grocery" || subtype === "perishable_goods" || subtype === "drugstore" || subtype === "pharmacy") {
    posBody = "Fast barcode-scanning checkout. Scan or search for items, apply promos or senior/PWD discounts, then collect payment. Works offline so long lines never mean a broken system.";
  } else if (subtype === "bookstore") {
    posBody = "Search or scan ISBN barcodes to add books to the cart. Apply student or member discounts, then collect payment. Inventory updates after every sale so you always know what's on the shelf.";
  } else if (subtype === "salon" || subtype === "barbershop" || subtype === "nail_salon") {
    posBody = "After a service is done, open the POS to collect payment. Select the service (haircut, color, nails), add retail products if they bought any, apply discounts, and close out — cash, card, GCash, or Maya. Receipts print instantly.";
  } else if (subtype === "spa" || subtype === "massage") {
    posBody = "After a treatment session, collect payment here. Select the treatment or package the client received, apply member discounts or promotions, then process payment — cash, card, GCash, or Maya. Receipts print instantly. No internet needed.";
  } else if (subtype === "gym") {
    posBody = "Sell memberships, daily passes, and PT sessions here. Select the plan or package, apply member discounts, and collect payment. Memberships link automatically to the client's profile in Customers.";
  } else if (subtype === "clinic" || subtype === "dental") {
    posBody = "Bill patients here after consultations or procedures. Select the services rendered, apply HMO, PhilHealth, or senior discounts, and issue an official receipt — cash, card, or GCash. Full billing history is saved per patient.";
  } else if (subtype === "pet_grooming") {
    posBody = "After grooming is done, collect payment here. Select the service package for the pet, add any retail products, apply discounts, and issue a receipt — cash, card, or GCash. Each transaction links to the pet owner's profile.";
  } else if (subtype === "laundry") {
    posBody = "Log each laundry job here to kick it into the queue. Select service type (wash, dry, press), enter the weight or items, collect a deposit or full payment, and print a claim stub. The job appears in your queue automatically.";
  } else if (subtype === "car_wash") {
    posBody = "Log each vehicle here to start the job. Select the wash package, apply any promo, collect payment, and the job queues up for your team. Receipts print instantly and the queue updates live.";
  } else if (subtype === "repair" || subtype === "auto_repair") {
    posBody = "Log each repair job here. Select the service, add parts if needed, collect a deposit, and the job enters your queue. When the work is done, collect the balance and close it out with a receipt.";
  } else if (subtype === "photography") {
    posBody = "Collect session fees and package payments here. Select the photography package, apply any discount, and issue a receipt — cash, card, or GCash. Payment history links to the client's profile automatically.";
  } else if (subtype === "cleaning") {
    posBody = "Log each cleaning job and collect payment here. Select the service package, apply any promo, and close out with a receipt. Each job links to the client's profile for repeat-booking history.";
  } else if (subtype === "tutoring") {
    posBody = "Collect session fees and package payments here. Select the subject, session type, or package the student enrolled in, apply any discount, and issue a receipt. Payment history links to the student's profile automatically.";
  } else {
    posBody = "This is where every sale happens. Tap an item or service to add it to the cart, apply discounts or modifiers, then collect payment — cash, card, GCash, Maya, or any method you've set up. Receipts print automatically. Works without internet.";
  }

  const posStep: TourStep = {
    target: '[data-tour="tour-nav-pos"]',
    title: cat === "clinic" ? "Billing & Payment"
      : cat === "queue_service" ? "Job Intake & Payment"
      : "Point of Sale",
    body: posBody,
  };

  // ── More step ──────────────────────────────────────────────────────────────

  const moreStep: TourStep = {
    target: '[data-tour="tour-nav-more"]',
    title: "More — Your Full Toolkit",
    body: cat === "food"
      ? "Tap here to access Products (your menu), Inventory, Customers, Transactions, Analytics, Expenses, Shifts, Staff, Discounts, Loyalty, and Settings — all organised by section."
      : cat === "retail"
      ? "Tap here to access Products, Inventory, Suppliers, Purchase Orders, Customers, Transactions, Analytics, Expenses, Shifts, Staff, Discounts, Loyalty, and Settings."
      : cat === "salon" || cat === "wellness" || cat === "appointment_service"
      ? "Tap here to access your Services (Products), Customers, Appointments, Transactions, Analytics, Expenses, Staff, Payroll, Discounts, Loyalty, and Settings."
      : cat === "clinic"
      ? "Tap here to access Services (Products), Patients (Customers), Appointments, Transactions, Analytics, Expenses, Staff, and Settings — everything to run your clinic."
      : cat === "gym"
      ? "Tap here to access Membership Plans (Products), Members (Customers), Class Bookings, Transactions, Analytics, Expenses, Staff, and Settings."
      : cat === "queue_service"
      ? "Tap here to access your Services (Products), Customers, Job Queue, Transactions, Analytics, Expenses, Staff, and Settings."
      : "Tap here to access everything else: Products, Inventory, Customers, Transactions, Analytics, Expenses, Shifts, Staff, Discounts, Loyalty, and Settings.",
  };

  // ── Products step ─────────────────────────────────────────────────────────

  const productsStep: TourStep = {
    target: null,
    title: cat === "food" ? "Menu Builder"
      : cat === "clinic" ? "Services & Procedures"
      : cat === "gym" ? "Membership Plans & Classes"
      : cat === "salon" || cat === "wellness" ? "Services & Packages"
      : cat === "appointment_service" ? "Services & Packages"
      : cat === "queue_service" ? "Services & Job Types"
      : "Products & Inventory",
    body: cat === "food"
      ? "In Products (inside More), build your full menu. Add dishes, drinks, and combos — group by category like Mains, Beverages, or Desserts. Set prices, upload photos, and add modifiers like size or add-ons. Your POS and Kitchen Display pull directly from this menu."
      : cat === "retail"
      ? "In Products (inside More), add everything you carry — with barcode/SKU, price, category, and stock count. Set low-stock alerts so you're notified before you run out. Your POS pulls directly from this list and inventory deducts automatically on every sale."
      : cat === "salon"
      ? "In Products (inside More), add all your services — haircut, colour, rebond, nails — with pricing and duration. You can also add retail products like shampoo or treatments. These link directly to your Appointments calendar and POS checkout."
      : cat === "wellness"
      ? "In Products (inside More), add all your treatments and packages — Swedish massage, deep tissue, aromatherapy, facials. Set pricing, duration, and room assignment. You can also add membership packages here. These link to your booking calendar and POS."
      : cat === "clinic"
      ? "In Products (inside More), list all your services and procedures — consultations, lab tests, procedures, vaccines. Set fees, link to the appropriate doctor, and categorise by service type. These appear at the POS when billing a patient."
      : cat === "gym"
      ? "In Products (inside More), create your membership tiers — monthly, quarterly, annual — plus day passes and PT session packages. Set prices, duration, and access levels. Members' active plans are tracked in their profile under Customers."
      : cat === "queue_service"
      ? "In Products (inside More), add your service types — wash & dry, basic wash, wax and polish, or repair jobs. Set standard prices for each. These appear at the POS when logging a new job and auto-populate the queue."
      : cat === "appointment_service"
      ? "In Products (inside More), add all your services and packages with pricing and duration. These link to your Appointments calendar and appear at the POS when collecting payment after a session."
      : "In Products (inside More), add everything you sell — items, services, or packages. Set prices, upload photos, group by category, and set stock levels. Your POS pulls directly from this list.",
  };

  // ── Analytics step ────────────────────────────────────────────────────────

  const analyticsStep: TourStep = {
    target: null,
    title: "Analytics & Reports",
    body: cat === "food"
      ? "Analytics (inside More) shows your top-selling dishes, peak ordering hours, payment method split, and revenue trends. Use it to spot slow-moving items, plan your next promo, and see when your kitchen is busiest."
      : cat === "retail"
      ? "Analytics (inside More) shows your best-selling products, revenue trends, payment method breakdown, and busiest hours. Use it to decide what to reorder, which items to promote, and when to schedule more staff."
      : cat === "salon" || cat === "wellness"
      ? "Analytics (inside More) shows your most popular treatments, revenue per service, busiest booking slots, and top-spending clients. Use it to plan promos, adjust pricing, and see which services drive the most revenue."
      : cat === "clinic"
      ? "Analytics (inside More) shows most-billed procedures, revenue per doctor, busiest appointment days, and payment method trends. Use it to spot high-demand services and optimise your doctor schedules."
      : cat === "gym"
      ? "Analytics (inside More) shows membership revenue, peak check-in hours, most-booked classes, and retention trends. Use it to plan your schedule, run promotions, and identify members at risk of churning."
      : cat === "queue_service"
      ? "Analytics (inside More) shows your most popular services, revenue trends, busiest days, and average job turnaround. Use it to plan staffing, spot peak periods, and see which services bring the most revenue."
      : "Analytics (inside More) shows your sales trends, best sellers, payment method breakdown, and hourly traffic. Use it to decide what to restock, which items to promote, and when you're busiest.",
  };

  // ── Shifts step ───────────────────────────────────────────────────────────

  const shiftsStep: TourStep = {
    target: null,
    title: "Shifts & Cash Management",
    body: cat === "food"
      ? "Open a Shift before service starts. It logs your starting cash, tracks every order and payment during the shift, and produces a cash-out report when service ends. Your manager always knows exactly how much cash should be in the drawer."
      : cat === "retail"
      ? "Open a Shift before the store opens. It records starting cash, tracks every sale, refund, and drawer movement, and generates a close-of-day report. Keeps your cash accountable and your end-of-day reconciliation fast."
      : cat === "salon" || cat === "wellness" || cat === "appointment_service"
      ? "Open a Shift at the start of the day. It logs starting cash, every service payment, product sale, and tip collected — and gives you a clean close-of-day cash report so reconciliation takes minutes, not an hour."
      : cat === "clinic"
      ? "Open a Shift at the start of clinic hours. It tracks all billing collected during the shift and produces a detailed end-of-day report — total collections, payment methods, and outstanding payments."
      : cat === "gym"
      ? "Open a Shift at the start of each operating day. It logs all membership payments, walk-in fees, and retail sales — and produces a close-of-day cash report for your front desk."
      : "Open a Shift before your staff starts. It tracks starting cash, all sales during the shift, and produces a cash-out report at the end. Keeps your cash drawer accountable and gives you a clean end-of-day summary.",
  };

  // ── Settings step — always generic ────────────────────────────────────────

  const settingsStep: TourStep = {
    target: null,
    title: "Settings",
    body: cat === "food"
      ? "In Settings (More → Tools), set your store name, tax rate, service charge, currency, and payment methods. Manage team roles so your cashier, manager, and kitchen staff each see only what they need."
      : cat === "retail"
      ? "In Settings (More → Tools), configure your store name, VAT rate, currency, and accepted payment methods. Set up receipt printing and manage your team's access roles."
      : cat === "salon" || cat === "wellness"
      ? "In Settings (More → Tools), update your salon name, tax rate, booking rules, and payment methods. Manage staff roles so your receptionist, stylists, and manager each have the right access level."
      : cat === "clinic"
      ? "In Settings (More → Tools), configure your clinic name, VAT/tax settings, accepted payment methods, and team roles. Assign doctor vs front-desk access so staff only see what's relevant to them."
      : cat === "gym"
      ? "In Settings (More → Tools), configure your gym name, tax settings, payment methods, and membership rules. Manage staff roles so trainers, front desk, and managers have the right permissions."
      : "In Settings (inside More → Tools), update your store name, tax rate, currency, and payment methods. Manage team roles and access, connect a receipt printer, and configure any integrations.",
  };

  // ── Business-type specific mid-steps (Appointments / Queue) ───────────────

  let midSteps: TourStep[] = [];
  let outroBody = "Start here: Add your products → Open a Shift → Make your first sale at the POS.";

  if (subtype === "restaurant") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: "Live Order Queue",
        body: "Every table order placed at the POS appears here the instant it's submitted. Your floor staff can monitor status and mark orders ready. No more shouting across the floor or lost paper tickets.",
      },
      {
        target: '[data-tour="tour-nav-kitchen"]',
        title: "Kitchen Display System",
        body: "Mount a tablet in your kitchen and open this screen. Orders stream in live as they're placed at the POS — your kitchen crew marks each one done. When ready, floor staff are notified. Zero paper tickets.",
      },
    ];
    outroBody = "Build your menu in Products → Open a Shift → Take your first table order at the POS → Watch it appear on the Kitchen Display.";
  } else if (subtype === "bar") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: "Live Tab Queue",
        body: "Every tab opened at the POS shows up here. Your bar staff can monitor what's being served, mark rounds complete, and keep track of which tables still have open tabs.",
      },
      {
        target: '[data-tour="tour-nav-kitchen"]',
        title: "Kitchen / Bar Display",
        body: "Mount a tablet behind the bar or in the kitchen. Food and drink orders appear here in real time as they're placed — staff mark each one done. No tickets, no miscommunication.",
      },
    ];
    outroBody = "Add your drinks and food in Products → Open a Shift → Open a tab at the POS → Watch orders appear on the Bar Display.";
  } else if (subtype === "cafe") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: "Order Queue",
        body: "Every order queues up here the moment it's placed. Your baristas see exactly what to make next — drink type, size, milk preference — in order. No paper slips, no missed names.",
      },
    ];
    outroBody = "Build your menu in Products → Open a Shift → Ring up your first order at the POS → Watch it appear in the Order Queue.";
  } else if (subtype === "bakery") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: "Order Queue",
        body: "Pre-orders and custom cake orders queue here. Your team sees what needs to be prepared and by when. Walk-in orders flow in from the POS automatically.",
      },
    ];
    outroBody = "Add your baked goods in Products → Open a Shift → Ring up your first sale at the POS → Track orders in the Queue.";
  } else if (subtype === "food_truck") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: "Order Queue",
        body: "Every order queues here the moment it's placed. Your cook sees exactly what's next — no paper slips, no shouting. Great for managing the rush during peak hours.",
      },
    ];
    outroBody = "Add your menu in Products → Open a Shift → Take your first order at the POS → Track it in the Queue.";
  } else if (cat === "salon") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-appointments"]',
        title: "Appointments Calendar",
        body: "Book clients by date, time, and specific stylist. The calendar prevents double-bookings automatically. Set service durations, add walk-ins on the fly, and see your team's full day at a glance. Repeat clients are tracked in Customers.",
      },
      {
        target: '[data-tour="tour-nav-pending"]',
        title: "Active Clients Queue",
        body: "Walk-ins and in-progress appointments appear here. Your team marks each service done — so the front desk always knows who's in the chair, who's waiting, and what's next. Nothing gets missed.",
      },
    ];
    outroBody = "Add your services in Products → Book your first appointment → Mark it done in the Queue → Collect payment at the POS.";
  } else if (cat === "wellness") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-appointments"]',
        title: "Booking Calendar",
        body: "Schedule treatments by date, time, room, and therapist. The calendar prevents double-bookings and overbooking treatment rooms. Walk-ins can be added on the spot. Returning clients are tracked in Customers with their full visit history.",
      },
      {
        target: '[data-tour="tour-nav-pending"]',
        title: "Active Sessions Queue",
        body: "All in-progress treatments queue here. Your front desk can see which rooms are occupied, which sessions are almost done, and who's waiting — all at a glance. Therapists mark sessions complete when done.",
      },
    ];
    outroBody = "Add your treatments in Products → Book your first session → Track it in the Active Queue → Collect payment at the POS.";
  } else if (cat === "clinic") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-appointments"]',
        title: "Patient Appointments",
        body: "Schedule consultations, procedures, and follow-ups by date, time, and doctor. The system prevents overbooking and tracks each patient's full visit history in Customers. Perfect for coordinating front desk and clinical staff.",
      },
    ];
    outroBody = "Add your services in Products → Register patients in Customers → Schedule an Appointment → Bill the patient at the POS.";
  } else if (cat === "gym") {
    midSteps = [
      {
        target: '[data-tour="tour-nav-appointments"]',
        title: "Class & Session Bookings",
        body: "Book PT sessions and group fitness classes here. Assign to specific trainers, set capacity limits, and keep your floor organised. Members are tracked in Customers with their membership plan and attendance history.",
      },
    ];
    outroBody = "Create membership plans in Products → Register members in Customers → Book sessions in Appointments → Collect payment at the POS.";
  } else if (cat === "queue_service") {
    const qTitle = subtype === "laundry" ? "Laundry Job Queue"
      : subtype === "car_wash" ? "Vehicle Job Queue"
      : "Repair Job Queue";
    const qBody = subtype === "laundry"
      ? "Every laundry job logged at the POS appears here with its status. Your team marks jobs in-progress or ready for pickup — so the front desk knows exactly what's done and what's still being processed. Fewer 'is it ready yet?' calls."
      : subtype === "car_wash"
      ? "Every vehicle job logged at the POS queues here. Your team moves jobs through In Progress → Done so the front desk always knows which cars are ready. Customers get their car back faster."
      : "Every repair job logged at the POS appears here. Your technicians update job status as they work — so the front desk knows exactly what's being fixed, what's ready for pickup, and what still needs parts.";
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: qTitle,
        body: qBody,
      },
    ];
    outroBody = subtype === "laundry"
      ? "Add your services in Products → Log a laundry job at the POS → Track it in the Queue → Collect payment on pickup."
      : subtype === "car_wash"
      ? "Add your packages in Products → Log a vehicle at the POS → Track it in the Queue → Collect payment when done."
      : "Add your services in Products → Log a repair job at the POS → Track progress in the Queue → Collect the balance on completion.";
  } else if (cat === "appointment_service") {
    const aTitle = subtype === "pet_grooming" ? "Grooming Appointments"
      : subtype === "photography" ? "Session Bookings"
      : subtype === "cleaning" ? "Cleaning Schedule"
      : subtype === "tutoring" ? "Tutoring Sessions"
      : "Appointments";
    const aBody = subtype === "pet_grooming"
      ? "Book grooming appointments by date, time, and groomer. The calendar prevents double-bookings automatically. Each pet's profile and grooming history is saved in Customers — so returning clients get faster, personalised service."
      : subtype === "photography"
      ? "Schedule photoshoots and studio sessions by date, time, and photographer. The calendar shows your team's full schedule and prevents booking conflicts. Client briefs and session history are saved in Customers."
      : subtype === "cleaning"
      ? "Schedule cleaning jobs by date, time, and team. The calendar shows your crews' full schedule and prevents double-booking. Client addresses and preferences are saved in Customers for repeat visits."
      : subtype === "tutoring"
      ? "Schedule tutoring sessions by date, time, and tutor. The calendar prevents double-bookings and shows each tutor's full week. Student records and progress notes are saved in Customers."
      : "Book appointments by date, time, and staff member. The calendar prevents double-bookings and shows your team's full schedule. Client history is saved in Customers for personalised repeat service.";
    midSteps = [
      {
        target: '[data-tour="tour-nav-appointments"]',
        title: aTitle,
        body: aBody,
      },
      {
        target: '[data-tour="tour-nav-pending"]',
        title: "Active Jobs Queue",
        body: "In-progress jobs and walk-ins queue here. Your team marks each one done — so front desk always knows who's being served, who's next, and what's completed. Nothing slips through.",
      },
    ];
    outroBody = "Add your services in Products → Add a client in Customers → Book an Appointment → Collect payment at the POS.";
  } else if (cat === "retail") {
    const invBody = subtype === "electronics"
      ? "Track every unit in stock — with barcode/SKU, supplier, and reorder point. When stock drops below your threshold you'll get a low-stock alert automatically. Use Purchase Orders to restock directly from suppliers inside the app."
      : subtype === "bookstore"
      ? "Track every title by ISBN, author, category, and stock count. Set reorder points so you never run out of bestsellers. Purchase Orders let you restock directly from your distributors inside the app."
      : subtype === "pharmacy" || subtype === "perishable_goods"
      ? "Track expiry dates, batch numbers, and stock levels for every item. Low-stock alerts fire automatically before you run out. Use Purchase Orders to replenish from suppliers without leaving the app."
      : "Track stock levels for every SKU — set reorder points and get low-stock alerts automatically. Use Purchase Orders to restock from suppliers, and Inventory to run stock counts and adjustments.";

    midSteps = [
      {
        target: null,
        title: "Inventory & Stock Control",
        body: invBody,
      },
      {
        target: null,
        title: "Suppliers & Purchase Orders",
        body: subtype === "grocery" || subtype === "perishable_goods"
          ? "Add your suppliers under More → Suppliers, then raise a Purchase Order when you need to restock. When the delivery arrives, receive it in the app and your inventory updates automatically — no manual counting needed."
          : subtype === "pharmacy"
          ? "Add your drug distributors under Suppliers, then raise Purchase Orders for restocking. When deliveries arrive, receive them in the app and stock levels update instantly — with expiry batch tracking included."
          : "Add your suppliers under More → Suppliers, then raise Purchase Orders when you need to restock. Receive deliveries in the app and inventory updates automatically — no spreadsheet juggling.",
      },
    ];
    outroBody = subtype === "clothing"
      ? "Add your products with sizes and variants → Set stock levels → Open a Shift → Make your first sale at the POS."
      : subtype === "electronics"
      ? "Add your products with barcodes → Set reorder points → Add your suppliers → Open a Shift → Make your first sale."
      : subtype === "grocery" || subtype === "perishable_goods"
      ? "Add your products with barcodes → Set stock and reorder levels → Add your suppliers → Open a Shift → Start scanning at the POS."
      : subtype === "pharmacy"
      ? "Add your medicines and products → Set expiry alerts and reorder points → Add your distributors → Open a Shift → Start billing at the POS."
      : subtype === "bookstore"
      ? "Add your books with ISBN and stock count → Add your distributors → Open a Shift → Start selling at the POS."
      : "Add your products → Set stock levels → Add suppliers → Open a Shift → Make your first sale at the POS.";
  } else {
    midSteps = [];
    outroBody = "Add your products or services → Open a Shift → Make your first sale at the POS.";
  }

  const outro: TourStep = {
    target: null,
    title: "You're ready! 🚀",
    body: outroBody,
  };

  return [
    intro,
    dashboardHero,
    dashboardKpi,
    posStep,
    ...midSteps,
    moreStep,
    productsStep,
    analyticsStep,
    shiftsStep,
    settingsStep,
    outro,
  ];
}

const PADDING = 10; // px of padding around highlighted element

interface SpotlightRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function useTargetRect(selector: string | null, visible: boolean): SpotlightRect | null {
  const [rect, setRect] = useState<SpotlightRect | null>(null);

  const measure = useCallback(() => {
    if (!selector) { setRect(null); return; }
    // Find the first element matching the selector that is actually visible
    // (non-zero size). This skips desktop sidebar items hidden on mobile.
    const candidates = document.querySelectorAll(selector);
    let el: Element | null = null;
    for (const candidate of candidates) {
      const r = candidate.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) { el = candidate; break; }
    }
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({
      x: r.left - PADDING,
      y: r.top - PADDING,
      w: r.width + PADDING * 2,
      h: r.height + PADDING * 2,
    });
  }, [selector]);

  useEffect(() => {
    if (!visible) return;
    setRect(null);
    // Stagger retries: scroll animation from previous step may still be running
    const t1 = setTimeout(measure, 80);
    const t2 = setTimeout(measure, 300);
    const t3 = setTimeout(measure, 600);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [visible, measure]);

  return rect;
}

function Spotlight({ rect, vw, vh }: { rect: SpotlightRect; vw: number; vh: number }) {
  const id = "tour-mask";
  const r = 14; // border-radius of cutout

  return (
    <svg
      style={{
        position: "fixed",
        inset: 0,
        width: vw,
        height: vh,
        zIndex: 998,
        pointerEvents: "none",
        transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      <defs>
        <mask id={id}>
          <rect x={0} y={0} width={vw} height={vh} fill="white" />
          <rect
            x={rect.x}
            y={rect.y}
            width={rect.w}
            height={rect.h}
            rx={r}
            ry={r}
            fill="black"
          />
        </mask>
      </defs>
      <rect
        x={0}
        y={0}
        width={vw}
        height={vh}
        fill="rgba(0,0,0,0.72)"
        mask={`url(#${id})`}
      />
    </svg>
  );
}

function TourCard({
  step,
  stepIndex,
  totalSteps,
  targetRect,
  vw,
  vh,
  onNext,
  onPrev,
  onSkip,
  entering,
  direction,
}: {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  targetRect: SpotlightRect | null;
  vw: number;
  vh: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  entering: boolean;
  direction: "forward" | "backward";
}) {
  const isLast = stepIndex === totalSteps - 1;
  const hasPrev = stepIndex > 0;

  const GAP = 14;
  const HEADER_CLEARANCE = 66;
  const sidePad = Math.max(12, Math.min(20, vw * 0.04));

  // Measure actual rendered height so positioning is always accurate
  const [measuredH, setMeasuredH] = useState(240);
  const cardRef = useCallback((node: HTMLDivElement | null) => {
    if (node) setMeasuredH(node.offsetHeight);
  }, [stepIndex]);

  const cardH = measuredH;

  let top: number;
  if (!targetRect) {
    top = Math.max(HEADER_CLEARANCE, vh / 2 - cardH / 2);
  } else {
    const elMidY = targetRect.y + targetRect.h / 2;
    if (elMidY > vh / 2) {
      // element in bottom half → popup above it, with real height
      top = Math.max(HEADER_CLEARANCE, targetRect.y - cardH - GAP);
    } else {
      // element in top half → popup below it, clamped so it doesn't go off screen
      top = Math.min(vh - cardH - GAP, targetRect.y + targetRect.h + GAP);
    }
  }

  const progressPct = ((stepIndex + 1) / totalSteps) * 100;

  return (
    <div
      ref={cardRef}
      style={{
        position: "fixed",
        top,
        left: sidePad,
        right: sidePad,
        zIndex: 999,
        transition: "top 0.35s cubic-bezier(0.4,0,0.2,1)",
        animation: entering ? "tour-card-in 300ms cubic-bezier(0.22,1,0.36,1) both" : undefined,
        maxWidth: 420,
        marginLeft: "auto",
        marginRight: "auto",
      }}
    >
      <div
        style={{
          borderRadius: 18,
          background: "rgba(14,12,20,0.96)",
          backdropFilter: "blur(32px)",
          WebkitBackdropFilter: "blur(32px)",
          border: "1px solid rgba(255,255,255,0.07)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Progress bar — top edge, very subtle */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "rgba(255,255,255,0.04)" }}>
          <div
            style={{
              height: "100%",
              width: `${progressPct}%`,
              background: "rgba(139,92,246,0.7)",
              transition: "width 0.4s cubic-bezier(0.4,0,0.2,1)",
            }}
          />
        </div>

        {/* Animated content — keyed so it re-mounts (and re-animates) on every step */}
        <div
          key={stepIndex}
          style={{
            padding: "14px 14px 14px 18px",
            animation: `tour-step-${direction} 280ms cubic-bezier(0.22,1,0.36,1) both`,
          }}
        >
          {/* Row 1: step label + close */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.28)",
              }}
            >
              {stepIndex + 1} / {totalSteps}
            </span>
            <button
              onClick={onSkip}
              style={{
                width: 22,
                height: 22,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.2)",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
              }}
            >
              <X style={{ width: 12, height: 12 }} />
            </button>
          </div>

          {/* Title */}
          <p
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "rgba(255,255,255,0.92)",
              lineHeight: 1.3,
              margin: "0 0 8px 0",
            }}
          >
            {step.title}
          </p>

          {/* Body — full text */}
          <p
            style={{
              fontSize: 12.5,
              color: "rgba(255,255,255,0.45)",
              lineHeight: 1.6,
              margin: "0 0 16px 0",
            }}
          >
            {step.body}
          </p>

          {/* Footer: back/skip · dots · Next */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Back or Skip */}
            {hasPrev ? (
              <button
                onClick={onPrev}
                style={{
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.28)",
                  background: "none",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 99,
                  padding: "4px 10px",
                  cursor: "pointer",
                }}
              >
                <ArrowLeft style={{ width: 10, height: 10 }} />
                Back
              </button>
            ) : (
              <button
                onClick={onSkip}
                style={{
                  flexShrink: 0,
                  fontSize: 11,
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.2)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px 0",
                }}
              >
                Skip
              </button>
            )}

            {/* Dot progress — center, monochrome */}
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: i === stepIndex ? 14 : 4,
                    height: 4,
                    borderRadius: 99,
                    background: i === stepIndex
                      ? "rgba(255,255,255,0.7)"
                      : i < stepIndex
                        ? "rgba(255,255,255,0.2)"
                        : "rgba(255,255,255,0.08)",
                    transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
                    flexShrink: 0,
                  }}
                />
              ))}
            </div>

            {/* Next / Done — only coloured element */}
            <button
              onClick={onNext}
              style={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                fontWeight: 600,
                color: "white",
                background: "#7c3aed",
                border: "none",
                borderRadius: 99,
                padding: "6px 14px",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {isLast ? "Done" : (<>Next <ArrowRight style={{ width: 11, height: 11 }} /></>)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppTour() {
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const { businessSubType } = useBranchBusiness();

  const [visible, setVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [entering, setEntering] = useState(true);
  const [exiting, setExiting] = useState(false);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [vw, setVw] = useState(() => window.innerWidth);
  const [vh, setVh] = useState(() => window.innerHeight);

  const storeName: string = (settings as any)?.storeName || "";
  const storageKey = user?.id ? `artix-tour-v2-${user.id}` : null;

  const steps = getSteps(businessSubType, storeName);

  // Show after onboarding is complete
  useEffect(() => {
    if (!storageKey) return;
    if (localStorage.getItem(storageKey)) return;
    if (!settings?.onboardingComplete) return;
    const t = setTimeout(() => setVisible(true), 1000);
    return () => clearTimeout(t);
  }, [storageKey, settings?.onboardingComplete]);

  // Listen for manual replay trigger from Settings
  useEffect(() => {
    const handler = () => {
      if (storageKey) localStorage.removeItem(storageKey);
      setStepIndex(0);
      setExiting(false);
      setEntering(true);
      setVisible(true);
    };
    window.addEventListener("artix:replay-tour", handler);
    return () => window.removeEventListener("artix:replay-tour", handler);
  }, [storageKey]);

  // Track viewport size
  useEffect(() => {
    const handler = () => { setVw(window.innerWidth); setVh(window.innerHeight); };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const step = steps[stepIndex];
  const targetRect = useTargetRect(step?.target ?? null, visible);

  const dismiss = useCallback(() => {
    if (storageKey) localStorage.setItem(storageKey, "1");
    setExiting(true);
    setTimeout(() => setVisible(false), 280);
  }, [storageKey]);

  const next = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      dismiss();
    } else {
      setDirection("forward");
      setStepIndex(i => i + 1);
    }
  }, [stepIndex, steps.length, dismiss]);

  const prev = useCallback(() => {
    if (stepIndex > 0) {
      setDirection("backward");
      setStepIndex(i => i - 1);
    }
  }, [stepIndex]);

  // Skip steps whose target doesn't exist in the DOM
  useEffect(() => {
    if (!visible || !step) return;
    if (step.target === null) return; // intro/outro always shown
    const el = document.querySelector(step.target);
    if (!el && stepIndex < steps.length - 1) {
      // Auto-skip this step
      setStepIndex(i => i + 1);
    }
  }, [visible, step, stepIndex, steps.length]);

  // Scroll to top when tour starts so step-1 spotlight always lands correctly
  useEffect(() => {
    if (!visible) return;
    if (stepIndex === 0) {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  }, [visible]);

  // Auto-scroll to target: position the element so the popup fits above it
  // without overlap. Uses a manual scroll calculation so the element top lands
  // at exactly HEADER + estimated-popup-height + gap — not centered, which
  // would scroll context above the element out of view.
  useEffect(() => {
    if (!visible || !step?.target) return;
    const el = document.querySelector(step.target) as HTMLElement | null;
    if (!el) return;
    const computed = window.getComputedStyle(el);
    // Fixed/sticky elements (e.g. bottom nav) don't scroll
    if (computed.position === "fixed" || computed.position === "sticky") return;

    const POPUP_H_EST = 280; // conservative — covers longest step body
    const HEADER_CLEAR = 66;
    const GAP = 14;
    // Where we want the element's top to land inside the viewport
    const desiredTop = HEADER_CLEAR + POPUP_H_EST + GAP; // ≈ 360px

    const elRect = el.getBoundingClientRect();
    const currentScrollY = window.scrollY;

    // Only scroll if the element isn't already comfortably visible below the popup
    const alreadyOk = elRect.top >= desiredTop - 20 && elRect.bottom <= window.innerHeight - 20;
    if (!alreadyOk) {
      const targetScrollY = currentScrollY + elRect.top - desiredTop;
      window.scrollTo({ top: Math.max(0, targetScrollY), behavior: "instant" as ScrollBehavior });
    }
  }, [visible, step?.target]);

  if (!visible || !step) return null;

  const hasTarget = targetRect !== null;

  return (
    <>
      <style>{`
        @keyframes tour-card-in {
          from { opacity: 0; transform: translateY(10px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes tour-overlay-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes tour-ring-pulse {
          0%   { box-shadow: 0 0 0 0px rgba(139,92,246,0.7); }
          70%  { box-shadow: 0 0 0 10px rgba(139,92,246,0); }
          100% { box-shadow: 0 0 0 0px rgba(139,92,246,0); }
        }
        @keyframes tour-step-forward {
          from { opacity: 0; transform: translateX(22px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes tour-step-backward {
          from { opacity: 0; transform: translateX(-22px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      {/* Full overlay when no target (intro/outro) */}
      {!hasTarget && (
        <div
          className="fixed inset-0 z-[998]"
          style={{
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(6px)",
            animation: "tour-overlay-in 300ms ease both",
            opacity: exiting ? 0 : 1,
            transition: "opacity 280ms ease",
          }}
          onClick={next}
        />
      )}

      {/* Spotlight for targeted steps */}
      {hasTarget && targetRect && (
        <Spotlight rect={targetRect} vw={vw} vh={vh} />
      )}

      {/* Single pulsing ring — rendered in root stacking context so it works
          for fixed elements (bottom nav) and regular elements alike */}
      {hasTarget && targetRect && (
        <div
          style={{
            position: "fixed",
            top: targetRect.y,
            left: targetRect.x,
            width: targetRect.w,
            height: targetRect.h,
            zIndex: 999,
            borderRadius: 24,
            border: "2.5px solid rgba(139,92,246,0.95)",
            pointerEvents: "none",
            animation: "tour-ring-pulse 1.5s ease-out infinite",
          }}
        />
      )}

      {/* Block clicks on everything except the highlighted element */}
      {hasTarget && targetRect && (
        <>
          {/* Top */}
          <div className="fixed z-[998]" style={{ top: 0, left: 0, right: 0, height: targetRect.y }} onClick={next} />
          {/* Bottom */}
          <div className="fixed z-[998]" style={{ top: targetRect.y + targetRect.h, left: 0, right: 0, bottom: 0 }} onClick={next} />
          {/* Left */}
          <div className="fixed z-[998]" style={{ top: targetRect.y, left: 0, width: targetRect.x, height: targetRect.h }} onClick={next} />
          {/* Right */}
          <div className="fixed z-[998]" style={{ top: targetRect.y, left: targetRect.x + targetRect.w, right: 0, height: targetRect.h }} onClick={next} />
        </>
      )}

      {/* Tour card */}
      <TourCard
        step={step}
        stepIndex={stepIndex}
        totalSteps={steps.length}
        targetRect={hasTarget ? targetRect : null}
        vw={vw}
        vh={vh}
        onNext={next}
        onPrev={prev}
        onSkip={dismiss}
        entering={entering}
        direction={direction}
      />
    </>
  );
}
