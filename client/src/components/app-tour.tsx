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
  const name = storeName || 'your store';
  const cat = getCategory(subtype);

  // Intro

  const intro: TourStep = {
    target: null,
    title: `Welcome to ${name} 👋`,
    body: cat === 'food'
      ? "Here's where you'll run everything. Orders, kitchen display, inventory, staff, and your daily revenue are all in one place. Let me show you around. Tap Next to continue."
      : cat === 'retail'
      ? 'Everything your store needs is right here. Scan products, track inventory, manage suppliers, run reports. Let me show you around. Tap Next.'
      : cat === 'salon'
      ? 'Your whole salon runs from here. Appointments, stylist schedules, client history, payments. Let me walk you through it. Tap Next.'
      : cat === 'wellness'
      ? 'Your whole spa runs from here. Bookings, therapist schedules, treatment packages, payments. Let me walk you through it. Tap Next.'
      : cat === 'clinic'
      ? "Your clinic's front desk and billing all live here. Appointments, patient records, doctor schedules, invoices. Let me show you around. Tap Next."
      : cat === 'gym'
      ? "Memberships, class schedules, trainer assignments, daily revenue. It's all here. Let me show you around. Tap Next."
      : cat === 'queue_service'
      ? 'Every job that comes in gets tracked here from start to finish. Intake, queue, staff, payments. Let me walk you through it. Tap Next.'
      : cat === 'appointment_service'
      ? 'Bookings, staff schedules, client profiles, payments. Everything in one place. Let me show you around. Tap Next.'
      : 'Everything you need to run your business is right here. Sales, staff, reports, all under one roof. Let me show you around. Tap Next.',
  };

  // Dashboard

  const dashboardHero: TourStep = {
    target: '[data-tour="tour-dashboard-hero"]',
    title: "Today's Revenue",
    body: cat === 'food'
      ? 'This is where your day starts. Total revenue, how many orders went out, and your average order value. Updates automatically with every sale.'
      : cat === 'retail'
      ? 'Your day at a glance. Total revenue, transactions done, and average basket size. Updates live as sales come in.'
      : cat === 'salon'
      ? 'Your day at a glance. Total revenue from services, appointments done, and average ticket size. Refreshes as clients check out.'
      : cat === 'wellness'
      ? 'A live look at today. Total earnings from treatments and packages, sessions done, and average spend per client. Updates after every checkout.'
      : cat === 'clinic'
      ? "Your clinic's numbers for the day. Total billing, patient visits, and average fee per visit. Updates throughout the day as you see patients."
      : cat === 'gym'
      ? "Today's numbers. Revenue collected, sessions done, average transaction. All updates in real time."
      : 'Your day at a glance. Total revenue, completed transactions, and average sale value. Updates every time a sale goes through.',
  };

  const dashboardKpi: TourStep = {
    target: '[data-tour="tour-dashboard-kpi"]',
    title: 'Key Numbers',
    body: cat === 'food'
      ? "These cards break down your total orders, net revenue, average order size, and tax for today. Scroll down and you'll see your top dishes, payment method breakdown, and hourly order flow."
      : cat === 'retail'
      ? 'Total transactions, net revenue, average basket, and tax collected today. Scroll down to see which products are selling, how customers are paying, and your busiest hours.'
      : cat === 'salon' || cat === 'wellness'
      ? 'Total appointments done, net revenue, average service value, and tax for today. Scroll down to see your most popular services and busiest time slots.'
      : cat === 'clinic'
      ? 'Patient visits, total billed, average per visit, and tax collected today. Scroll down to see your most in-demand services and peak appointment times.'
      : cat === 'gym'
      ? 'Members checked in, revenue collected, average transaction, and tax today. Scroll down for peak hours and your top earning services.'
      : 'Total transactions, net revenue, average sale, and tax collected today. Scroll down to see your bestsellers, how people are paying, and end-of-day totals.',
  };

  // POS step

  let posBody: string;
  if (subtype === 'restaurant') {
    posBody = 'This is where orders get taken. Pick the table, add the dishes, and send it to the kitchen. Collect payment at the end of the meal with whatever method they prefer. Split bills are supported too. Works offline.';
  } else if (subtype === 'bar') {
    posBody = "Ring up drinks and food here. Add items to a tab, apply promos, then close it out when they're ready to pay. Any payment method you have set up. Fast and works offline.";
  } else if (subtype === 'cafe') {
    posBody = "Take orders here. Tap a drink or pastry, pick the size or milk type, then collect payment. The order goes straight to your barista's queue. Receipts print instantly. Works without Wi-Fi.";
  } else if (subtype === 'bakery') {
    posBody = 'Ring up your pastries, breads, and cakes here. Tap an item, set the quantity, add a discount if needed, then collect payment. Receipts print right away and stock adjusts on its own.';
  } else if (subtype === 'food_truck') {
    posBody = 'Built for speed. Tap items to build the order, collect payment, and print or send the receipt. Works offline so a bad signal never slows you down.';
  } else if (subtype === 'clothing' || subtype === 'retail') {
    posBody = 'Scan the barcode or tap a product to add it to the cart. Apply a discount, process returns if needed, then collect payment. Stock levels update on their own after every sale.';
  } else if (subtype === 'electronics') {
    posBody = "Scan or search for the item, add any warranty or bundle, then collect payment. Stock adjusts automatically and you'll get a low-stock alert before you run out.";
  } else if (subtype === 'grocery' || subtype === 'perishable_goods' || subtype === 'drugstore' || subtype === 'pharmacy') {
    posBody = 'Scan items at checkout, apply any promos or discounts, then collect payment. Fast and works offline so a full queue is never a problem.';
  } else if (subtype === 'bookstore') {
    posBody = "Scan the ISBN or search by title, apply student or member discounts, then collect payment. Inventory updates after every sale so you always know what's left on the shelf.";
  } else if (subtype === 'salon' || subtype === 'barbershop' || subtype === 'nail_salon') {
    posBody = 'When a service is done, open the POS to collect payment. Pick the service, add any retail products the client wants to take home, apply a discount if needed, and close out. Prints a receipt right away.';
  } else if (subtype === 'spa' || subtype === 'massage') {
    posBody = 'When a session wraps up, collect payment here. Pick the treatment or package, apply a membership discount or promo, then process payment. Prints a receipt instantly. No internet required.';
  } else if (subtype === 'gym') {
    posBody = "Sell memberships, day passes, and PT sessions here. Pick the plan, apply any discount, and collect payment. The membership links straight to the client's profile.";
  } else if (subtype === 'clinic' || subtype === 'dental') {
    posBody = "Bill patients after each visit. Pick the services done, apply any applicable discounts, then issue a receipt. Every transaction is saved to the patient's record.";
  } else if (subtype === 'pet_grooming') {
    posBody = "When grooming's done, collect payment here. Pick the package, add any products, apply a discount if needed, then print a receipt. It all links back to the pet owner's profile.";
  } else if (subtype === 'laundry') {
    posBody = 'Log each job here to get it into the queue. Pick the service type, enter the weight or items, collect payment or a deposit, and print a claim stub. Done.';
  } else if (subtype === 'car_wash') {
    posBody = "Log each vehicle here. Pick the wash package, collect payment, and it goes straight into your team's queue. Receipt prints right away.";
  } else if (subtype === 'repair' || subtype === 'auto_repair') {
    posBody = 'Log each job here. Pick the service, add any parts, collect a deposit, and it enters the queue. When the work is done, collect the balance and close it out.';
  } else if (subtype === 'photography') {
    posBody = "Collect session fees and package payments here. Pick the package, apply a discount if needed, and issue a receipt. Everything links to the client's profile.";
  } else if (subtype === 'cleaning') {
    posBody = "Log each job and collect payment here. Pick the service package, apply any promo, and close out. Links to the client's profile for easy repeat booking.";
  } else if (subtype === 'tutoring') {
    posBody = "Collect session fees here. Pick the subject, session type, or package, apply a discount if needed, and issue a receipt. Payment history links to the student's profile.";
  } else {
    posBody = 'This is where sales happen. Tap an item or service to add it to the cart, apply a discount, then collect payment however your customer prefers. Receipts print automatically. Works without internet.';
  }

  const posStep: TourStep = {
    target: '[data-tour="tour-nav-pos"]',
    title: cat === 'clinic' ? 'Billing and Payment'
      : cat === 'queue_service' ? 'Job Intake and Payment'
      : 'Point of Sale',
    body: posBody,
  };

  // More step

  const moreStep: TourStep = {
    target: '[data-tour="tour-nav-more"]',
    title: 'Everything Else Is in Here',
    body: cat === 'food'
      ? 'Tap here for everything else. Your menu (Products), Inventory, Customers, Transactions, Analytics, Expenses, Shifts, Staff, Discounts, Loyalty, and Settings. All organized by section.'
      : cat === 'retail'
      ? 'Tap here for everything else. Products, Inventory, Suppliers, Purchase Orders, Customers, Transactions, Analytics, Expenses, Shifts, Staff, Discounts, Loyalty, and Settings.'
      : cat === 'salon' || cat === 'wellness' || cat === 'appointment_service'
      ? 'Tap here for everything else. Services, Customers, Appointments, Transactions, Analytics, Expenses, Staff, Payroll, Discounts, Loyalty, and Settings.'
      : cat === 'clinic'
      ? 'Tap here for everything else. Services, Patients, Appointments, Transactions, Analytics, Expenses, Staff, and Settings.'
      : cat === 'gym'
      ? 'Tap here for everything else. Membership Plans, Members, Class Bookings, Transactions, Analytics, Expenses, Staff, and Settings.'
      : cat === 'queue_service'
      ? 'Tap here for everything else. Services, Customers, Job Queue, Transactions, Analytics, Expenses, Staff, and Settings.'
      : 'Tap here for everything else. Products, Inventory, Customers, Transactions, Analytics, Expenses, Shifts, Staff, Discounts, Loyalty, and Settings.',
  };

  // Products step

  const productsStep: TourStep = {
    target: null,
    title: cat === 'food' ? 'Building Your Menu'
      : cat === 'clinic' ? 'Services and Procedures'
      : cat === 'gym' ? 'Membership Plans and Classes'
      : cat === 'salon' || cat === 'wellness' ? 'Services and Packages'
      : cat === 'appointment_service' ? 'Services and Packages'
      : cat === 'queue_service' ? 'Services and Job Types'
      : 'Products and Inventory',
    body: cat === 'food'
      ? 'Go to Products inside More to build your menu. Add dishes, drinks, and combos, group them into categories like Mains, Beverages, or Desserts, and set prices. Upload photos, add modifiers for size or add-ons. Your POS and Kitchen Display pull straight from here.'
      : cat === 'retail'
      ? 'Go to Products inside More to add everything you carry. Set the barcode or SKU, price, category, and stock count. Turn on low-stock alerts so you know before you run out. Your POS pulls from this list and stock adjusts after every sale.'
      : cat === 'salon'
      ? 'Go to Products inside More to add your services. Haircut, color, rebond, nails. Set the price and how long each one takes. You can add retail products too, like shampoo or treatments. Everything links to your Appointments calendar and POS.'
      : cat === 'wellness'
      ? 'Go to Products inside More to add your treatments and packages. Swedish massage, deep tissue, aromatherapy, facials. Set the price, duration, and which room it needs. You can add membership packages here too. It all links to your booking calendar and POS.'
      : cat === 'clinic'
      ? 'Go to Products inside More to list your services and procedures. Consultations, lab tests, vaccines. Set the fees, assign to the right doctor, and group by type. These show up at the POS when you bill a patient.'
      : cat === 'gym'
      ? "Go to Products inside More to create your membership plans. Monthly, quarterly, annual, day passes, PT packages. Set prices, duration, and access levels. Each member's active plan gets tracked in their Customers profile."
      : cat === 'queue_service'
      ? 'Go to Products inside More to add your service types. Basic wash, wax and polish, repair jobs. Set the standard price for each. These show up at the POS when you log a new job and fill in the queue automatically.'
      : cat === 'appointment_service'
      ? "Go to Products inside More to add your services and packages with pricing and duration. They link to your Appointments calendar and show up at the POS when it's time to collect payment."
      : 'Go to Products inside More to add everything you sell. Items, services, or packages. Set prices, upload photos, group by category, and set stock levels. Your POS pulls straight from here.',
  };

  // Customers step (service businesses)

  const customersStep: TourStep = {
    target: null,
    title: cat === 'clinic' ? 'Your Patient Records'
      : cat === 'gym' ? 'Your Members'
      : 'Your Client List',
    body: cat === 'salon'
      ? 'Add your clients under Customers inside More. Save their name, contact, and service history. When a regular comes in, pull up their profile, see what they usually get, and book them with their preferred stylist in seconds.'
      : cat === 'wellness'
      ? "Add your clients under Customers inside More. Save their name, contact, membership status, and visit history. You'll know exactly how many sessions they've used, when they last came in, and which treatments they prefer."
      : cat === 'clinic'
      ? 'Add your patients under Customers inside More. Save their contact details, medical notes, and visit history. Every billing transaction links back to their profile so you have a full record of every visit.'
      : cat === 'gym'
      ? "Add your members under Customers inside More. Track their membership plan, start date, and visit history. You can see who's active, whose membership is about to expire, and follow up before they lapse."
      : subtype === 'pet_grooming'
      ? "Add your clients under Customers inside More. Save the owner's contact info and the pet's details, breed, and grooming notes. Every visit goes on their record so your groomers always know what to expect."
      : subtype === 'tutoring'
      ? 'Add your students under Customers inside More. Save their contact details, subject preferences, and session history. Every payment and booking links to their profile so nothing gets lost.'
      : 'Add your clients under Customers inside More. Save their contact details and booking history. Every appointment and payment links back to their profile so returning clients get faster, more personal service.',
  };

  // Analytics step

  const analyticsStep: TourStep = {
    target: null,
    title: 'Analytics and Reports',
    body: cat === 'food'
      ? 'Go to Analytics inside More to see your top-selling dishes, busiest hours, payment breakdown, and revenue over time. Useful for planning what to restock, which items to push, and when your kitchen needs the most hands.'
      : cat === 'retail'
      ? 'Go to Analytics inside More to see your best-selling products, revenue by day or week, how people are paying, and your busiest hours. Great for deciding what to reorder and when to run a promo.'
      : cat === 'salon' || cat === 'wellness'
      ? 'Go to Analytics inside More to see which services are most popular, revenue per service type, busiest booking slots, and your top clients. Helps you plan promos, tweak pricing, and spot which services make the most money.'
      : cat === 'clinic'
      ? 'Go to Analytics inside More to see most-billed procedures, revenue by doctor, busiest days, and payment trends. Helps you see which services are in highest demand and plan your schedule better.'
      : cat === 'gym'
      ? 'Go to Analytics inside More to see membership revenue, peak hours, most-booked classes, and who might be about to lapse. Use it to plan promotions and keep members coming back.'
      : cat === 'queue_service'
      ? 'Go to Analytics inside More to see your most popular services, revenue over time, busiest days, and average job time. Helps you plan staffing and spot when you need more hands.'
      : 'Go to Analytics inside More to see your sales trends, top sellers, payment breakdown, and busiest hours. Good for planning restocks, promos, and staff schedules.',
  };

  // Shifts step

  const shiftsStep: TourStep = {
    target: null,
    title: 'Shifts and Cash Management',
    body: cat === 'food'
      ? 'Open a Shift before service starts. It records your starting cash, tracks every order and payment, and prints a cash-out report when you close. Your manager always knows how much should be in the drawer.'
      : cat === 'retail'
      ? 'Open a Shift before the store opens. It records starting cash, tracks sales, refunds, and drawer movements, then generates a close-of-day report. Makes end-of-day reconciliation fast.'
      : cat === 'salon' || cat === 'wellness' || cat === 'appointment_service'
      ? 'Open a Shift at the start of the day. It logs starting cash, tracks every service payment, product sale, and tip, and gives you a clean cash report at closing. Reconciliation takes minutes.'
      : cat === 'clinic'
      ? 'Open a Shift when clinic hours start. It tracks all billing during the shift and produces a report at the end showing total collections, payment methods, and any outstanding balances.'
      : cat === 'gym'
      ? 'Open a Shift at the start of each day. It logs all membership payments, walk-ins, and retail sales, and gives your front desk a clean end-of-day cash report.'
      : 'Open a Shift before your staff starts. It tracks starting cash, all sales, and gives you a cash-out report at the end. Keeps the drawer accountable and end-of-day easy.',
  };

  // Settings step

  const settingsStep: TourStep = {
    target: null,
    title: 'Settings',
    body: cat === 'food'
      ? 'Go to Settings under More then Tools. Update your store name, tax rate, service charge, currency, and payment methods. Set team roles so your cashier, manager, and kitchen staff each only see what they need.'
      : cat === 'retail'
      ? 'Go to Settings under More then Tools. Set your store name, VAT rate, currency, and payment methods. Set up receipt printing and control what each team member can access.'
      : cat === 'salon' || cat === 'wellness'
      ? "Go to Settings under More then Tools. Update your business name, tax rate, booking rules, and payment methods. Assign roles to your receptionist, stylists, and manager so everyone sees only what's relevant to them."
      : cat === 'clinic'
      ? 'Go to Settings under More then Tools. Set your clinic name, tax settings, payment methods, and team roles. You can give doctors, nurses, and front desk staff different levels of access.'
      : cat === 'gym'
      ? 'Go to Settings under More then Tools. Set your gym name, tax settings, payment methods, and membership rules. Assign roles for trainers, front desk, and management.'
      : 'Go to Settings under More then Tools. Update your business name, tax rate, currency, and payment methods. Manage team access, connect a receipt printer, and adjust any other preferences.',
  };

  // Mid-steps

  let midSteps: TourStep[] = [];
  let includeCustomers = false;
  let outroBody = 'Start here: Add your products, open a Shift, then make your first sale at the POS.';

  if (subtype === 'restaurant') {
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: 'Live Order Queue',
        body: 'Every table order placed at the POS shows up here right away. Your floor staff can track status and mark orders ready for pickup. No more running to the kitchen or losing paper tickets.',
      },
      {
        target: '[data-tour="tour-nav-kitchen"]',
        title: 'Kitchen Display System',
        body: "Put a tablet in the kitchen and pull this up. Orders appear on screen the moment they're placed at the POS. Kitchen staff mark each one done and floor staff get notified. No paper, no confusion.",
      },
    ];
    outroBody = 'Build your menu in Products, open a Shift, take your first table order at the POS, then watch it appear on the Kitchen Display.';
  } else if (subtype === 'bar') {
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: 'Live Tab Queue',
        body: "Every open tab shows up here. Your bar staff can see what's being served, mark rounds done, and track which tables still have open tabs.",
      },
      {
        target: '[data-tour="tour-nav-kitchen"]',
        title: 'Kitchen and Bar Display',
        body: "Put a tablet behind the bar or in the kitchen. Orders appear as they're placed and staff mark them done. Simple.",
      },
    ];
    outroBody = 'Add your drinks and food in Products, open a Shift, open a tab at the POS, then watch orders appear on the Bar Display.';
  } else if (subtype === 'cafe') {
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: 'Order Queue',
        body: "Orders show up here the moment they're placed. Your baristas see exactly what to make next, size, milk type, and all. No paper slips, no missed names.",
      },
    ];
    outroBody = 'Build your menu in Products, open a Shift, ring up your first order at the POS, then watch it appear in the Order Queue.';
  } else if (subtype === 'bakery') {
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: 'Order Queue',
        body: 'Pre-orders and walk-in orders show up here. Your team sees what needs to be made and when. No slips, no guessing.',
      },
    ];
    outroBody = 'Add your baked goods in Products, open a Shift, ring up your first sale at the POS, then track orders in the Queue.';
  } else if (subtype === 'food_truck') {
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: 'Order Queue',
        body: "Every order queues here as it comes in. Your cook sees what's next in line. Great for keeping up during the rush.",
      },
    ];
    outroBody = 'Add your menu in Products, open a Shift, take your first order at the POS, then track it in the Queue.';
  } else if (cat === 'salon') {
    includeCustomers = true;
    midSteps = [
      {
        target: '[data-tour="tour-nav-appointments"]',
        title: 'Appointments Calendar',
        body: "Book clients by date, time, and stylist. It won't let you double-book. Set how long each service takes, add walk-ins on the fly, and see your whole team's day at a glance.",
      },
      {
        target: '[data-tour="tour-nav-pending"]',
        title: 'Active Clients Queue',
        body: "Walk-ins and active appointments show up here. Your team marks each service done so the front desk always knows who's in the chair, who's waiting, and what's coming next.",
      },
    ];
    outroBody = 'Add your services, add a client in Customers, book your first appointment, mark it done in the Queue, then collect payment at the POS.';
  } else if (cat === 'wellness') {
    includeCustomers = true;
    midSteps = [
      {
        target: '[data-tour="tour-nav-appointments"]',
        title: 'Booking Calendar',
        body: 'Book treatments by date, time, room, and therapist. Double-bookings and room conflicts are blocked automatically. Walk-ins can be added anytime. Returning clients have their full visit history in Customers.',
      },
      {
        target: '[data-tour="tour-nav-pending"]',
        title: 'Active Sessions Queue',
        body: "In-progress sessions show up here. Your front desk can see which rooms are busy, which sessions are almost done, and who's waiting. Therapists mark sessions done when they finish.",
      },
    ];
    outroBody = 'Add your treatments, add a client in Customers, book your first session, track it in the Active Queue, then collect payment at the POS.';
  } else if (cat === 'clinic') {
    includeCustomers = true;
    midSteps = [
      {
        target: '[data-tour="tour-nav-appointments"]',
        title: 'Patient Appointments',
        body: "Schedule consultations, procedures, and follow-ups by date, time, and doctor. Overbooking is prevented automatically. Each patient's visit history is kept in Customers so nothing gets lost.",
      },
    ];
    outroBody = 'Add your services, register patients in Customers, schedule an appointment, then bill the patient at the POS.';
  } else if (cat === 'gym') {
    includeCustomers = true;
    midSteps = [
      {
        target: '[data-tour="tour-nav-appointments"]',
        title: 'Class and Session Bookings',
        body: "Book PT sessions and group classes here. Assign to a specific trainer, set capacity, and keep your floor organized. Each member's bookings and attendance are tracked in their Customers profile.",
      },
    ];
    outroBody = 'Create membership plans in Products, register members in Customers, book sessions in Appointments, then collect payment at the POS.';
  } else if (cat === 'queue_service') {
    const qTitle = subtype === 'laundry' ? 'Laundry Job Queue'
      : subtype === 'car_wash' ? 'Vehicle Job Queue'
      : 'Repair Job Queue';
    const qBody = subtype === 'laundry'
      ? "Every laundry job logged at the POS shows up here. Your team marks jobs in progress or ready for pickup so the front desk always knows what's done and what's still being washed. Fewer 'is it ready yet?' calls."
      : subtype === 'car_wash'
      ? 'Every vehicle logged at the POS goes into this queue. Your team moves jobs from In Progress to Done so the front desk always knows which cars are ready. Customers get their car back faster.'
      : "Every repair job logged at the POS shows up here. Your techs update status as they work so the front desk knows what's being fixed, what's ready, and what's still waiting on parts.";
    midSteps = [
      {
        target: '[data-tour="tour-nav-pending"]',
        title: qTitle,
        body: qBody,
      },
    ];
    outroBody = subtype === 'laundry'
      ? 'Add your services in Products, log a laundry job at the POS, track it in the Queue, then collect payment on pickup.'
      : subtype === 'car_wash'
      ? 'Add your packages in Products, log a vehicle at the POS, track it in the Queue, then collect payment when done.'
      : 'Add your services in Products, log a repair job at the POS, track progress in the Queue, then collect the balance on completion.';
  } else if (cat === 'appointment_service') {
    includeCustomers = true;
    const aTitle = subtype === 'pet_grooming' ? 'Grooming Appointments'
      : subtype === 'photography' ? 'Session Bookings'
      : subtype === 'cleaning' ? 'Cleaning Schedule'
      : subtype === 'tutoring' ? 'Tutoring Sessions'
      : 'Appointments';
    const aBody = subtype === 'pet_grooming'
      ? "Book grooming by date, time, and groomer. No double-bookings. Each pet's grooming history and special notes are saved in their profile so returning clients get faster, more consistent service."
      : subtype === 'photography'
      ? 'Schedule shoots and studio sessions by date, time, and photographer. Full schedule view, no conflicts. Client briefs and session history are saved in Customers.'
      : subtype === 'cleaning'
      ? 'Schedule jobs by date, time, and crew. No double-bookings. Client addresses and preferences are saved in Customers for repeat visits.'
      : subtype === 'tutoring'
      ? 'Schedule sessions by date, time, and tutor. Full week view per tutor. Student records and session notes are saved in Customers.'
      : 'Book appointments by date, time, and staff member. No double-bookings. Client history is saved in Customers for more personal service every time.';
    midSteps = [
      {
        target: '[data-tour="tour-nav-appointments"]',
        title: aTitle,
        body: aBody,
      },
      {
        target: '[data-tour="tour-nav-pending"]',
        title: 'Active Jobs Queue',
        body: "Jobs in progress show up here. Your team marks each one done so the front desk always knows who's being served, who's next, and what's finished.",
      },
    ];
    outroBody = 'Add your services, add a client in Customers, book an appointment, then collect payment at the POS.';
  } else if (cat === 'retail') {
    const invBody = subtype === 'electronics'
      ? "Track every unit by barcode, supplier, and reorder point. When stock drops below your threshold you'll get an alert automatically. Use Purchase Orders to restock straight from your suppliers inside the app."
      : subtype === 'bookstore'
      ? 'Track every title by ISBN, author, and stock count. Set reorder points so your bestsellers never run out. Restock from your distributors using Purchase Orders, all inside the app.'
      : subtype === 'pharmacy' || subtype === 'perishable_goods'
      ? 'Track expiry dates, batch numbers, and stock levels for every item. Low-stock alerts fire automatically. Restock from suppliers using Purchase Orders without leaving the app.'
      : 'Track stock levels for every SKU, set reorder points, and get low-stock alerts automatically. Use Purchase Orders to restock from suppliers and Inventory for stock counts and adjustments.';
    midSteps = [
      {
        target: null,
        title: 'Inventory and Stock Control',
        body: invBody,
      },
      {
        target: null,
        title: 'Suppliers and Purchase Orders',
        body: subtype === 'grocery' || subtype === 'perishable_goods'
          ? 'Add your suppliers under More then Suppliers. When you need to restock, raise a Purchase Order. When the delivery arrives, receive it in the app and your inventory updates on its own. No counting by hand.'
          : subtype === 'pharmacy'
          ? 'Add your drug distributors under Suppliers and raise Purchase Orders when you need stock. Receive deliveries in the app and stock levels update instantly, with expiry batch tracking included.'
          : 'Add your suppliers under More then Suppliers. Raise a Purchase Order when you need to restock. Receive the delivery in the app and inventory updates automatically.',
      },
    ];
    outroBody = subtype === 'clothing'
      ? 'Add your products with sizes and variants, set stock levels, open a Shift, then make your first sale at the POS.'
      : subtype === 'electronics'
      ? 'Add your products with barcodes, set reorder points, add your suppliers, open a Shift, then make your first sale.'
      : subtype === 'grocery' || subtype === 'perishable_goods'
      ? 'Add your products with barcodes, set stock and reorder levels, add your suppliers, open a Shift, then start scanning at the POS.'
      : subtype === 'pharmacy'
      ? 'Add your medicines and products, set expiry alerts and reorder points, add your distributors, open a Shift, then start billing at the POS.'
      : subtype === 'bookstore'
      ? 'Add your books with ISBN and stock count, add your distributors, open a Shift, then start selling at the POS.'
      : 'Add your products, set stock levels, add your suppliers, open a Shift, then make your first sale at the POS.';
  } else {
    midSteps = [];
    outroBody = 'Add your products or services, open a Shift, then make your first sale at the POS.';
  }

  const outro: TourStep = {
    target: null,
    title: "You're all set!",
    body: outroBody,
  };

  // POS step is only shown for transaction-first businesses (food, retail,
  // queue services). Service businesses with appointment workflows (wellness,
  // salon, clinic, gym, appointment services) handle checkout as part of their
  // natural flow and don't need a dedicated POS tour step.
  const showPosStep = cat === 'food' || cat === 'retail' || cat === 'queue_service' || cat === 'other';

  return [
    intro,
    dashboardHero,
    dashboardKpi,
    ...(showPosStep ? [posStep] : []),
    ...midSteps,
    moreStep,
    productsStep,
    ...(includeCustomers ? [customersStep] : []),
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
