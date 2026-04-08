/**
 * Centralized feature-visibility rules based on business type and sub-type.
 * Controls: which pages are hidden, which items appear in the primary bottom nav,
 * custom labels per business context, sidebar ordering priority,
 * business-specific terminology, and quick service suggestions.
 */

export type BusinessTerminology = {
  page: string;            // Page title e.g. "Bookings", "Sessions", "Patients"
  entry: string;           // Singular e.g. "Appointment", "Booking", "Job"
  entryPlural: string;     // Plural e.g. "Appointments", "Bookings", "Jobs"
  service: string;         // Field label e.g. "Service", "Treatment", "Procedure"
  customer: string;        // e.g. "Customer", "Client", "Patient", "Student"
  staff: string;           // e.g. "Staff", "Stylist", "Doctor", "Trainer"
  room: string;            // e.g. "Room", "Chair", "Station", "Court", "Studio"
  bookButton: string;      // CTA e.g. "Book", "Schedule", "Add Job", "Queue"
  emptyState: string;      // Empty state message
  topItemsLabel: string;   // Analytics section e.g. "Top Services", "Top Products", "Top Shoot Types"
  itemUnit: string;        // Singular unit e.g. "booking", "unit", "session", "job"
  orderLabel: string;      // Transaction unit e.g. "order", "booking", "job", "sale"
  bestSellerLabel: string; // Dashboard card e.g. "Best Seller", "Most Booked", "Most Requested"
};

export type BusinessFeatures = {
  hiddenUrls: Set<string>;
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
  "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings",
];

const DEFAULT_TERMINOLOGY: BusinessTerminology = {
  page: "Sales",
  entry: "Sale",
  entryPlural: "Sales",
  service: "Service",
  customer: "Customer",
  staff: "Staff",
  room: "Room",
  bookButton: "Book",
  emptyState: "No appointments",
  topItemsLabel: "Top Products",
  itemUnit: "unit",
  orderLabel: "sale",
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
    return { hiddenUrls: hidden, showBarcode, primaryNavUrls, labels, sidebarOrder, terminology, quickSuggestions };
  }

  if (businessType === "food_beverage") {
    showBarcode = false;
    hidden.add("/appointments");
    hidden.add("/staff");
    hidden.add("/memberships");
    hidden.add("/rooms");
    labels = { "/pending": "Orders" };

    switch (businessSubType) {
      case "restaurant":
        primaryNavUrls = ["/pos", "/kitchen"];
        sidebarOrder = ["/", "/pos", "/kitchen", "/tables", "/pending", "/products", "/customers", "/transactions", "/analytics", "/expenses", "/suppliers", "/purchases", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        break;
      case "bar":
        primaryNavUrls = ["/pos", "/tables"];
        hidden.add("/kitchen");
        sidebarOrder = ["/", "/pos", "/tables", "/pending", "/products", "/customers", "/transactions", "/analytics", "/expenses", "/suppliers", "/purchases", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        break;
      case "cafe":
      case "bakery":
        primaryNavUrls = ["/pos", "/pending"];
        hidden.add("/kitchen");
        hidden.add("/tables");
        sidebarOrder = ["/", "/pos", "/pending", "/products", "/customers", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        break;
      case "food_truck":
        primaryNavUrls = ["/pos", "/pending"];
        hidden.add("/kitchen");
        hidden.add("/tables");
        sidebarOrder = ["/", "/pos", "/pending", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        break;
      default:
        primaryNavUrls = ["/pos", "/pending"];
        hidden.add("/tables");
        sidebarOrder = ["/", "/pos", "/pending", "/kitchen", "/products", "/customers", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        break;
    }

  } else if (businessType === "retail") {
    showBarcode = true;
    hidden.add("/kitchen");
    hidden.add("/tables");
    hidden.add("/appointments");
    hidden.add("/staff");
    hidden.add("/memberships");
    hidden.add("/rooms");
    primaryNavUrls = ["/pos", "/products"];
    sidebarOrder = ["/", "/pos", "/products", "/customers", "/transactions", "/analytics", "/expenses", "/suppliers", "/purchases", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];

  } else if (businessType === "services") {
    showBarcode = false;
    hidden.add("/kitchen");
    hidden.add("/tables");
    hidden.add("/suppliers");
    hidden.add("/purchases");

    switch (businessSubType) {
      case "salon":
        primaryNavUrls = ["/appointments", "/staff"];
        labels = { "/appointments": "Bookings", "/staff": "Stylists", "/customers": "Clients" };
        hidden.add("/memberships");
        sidebarOrder = ["/", "/appointments", "/staff", "/customers", "/rooms", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Bookings", entry: "Booking", entryPlural: "Bookings",
          service: "Service", customer: "Client", staff: "Stylist", room: "Chair",
          bookButton: "Book", emptyState: "No bookings",
          topItemsLabel: "Top Services", itemUnit: "booking", orderLabel: "booking", bestSellerLabel: "Most Booked",
        };
        quickSuggestions = ["Haircut", "Hair Color", "Highlights", "Blowout", "Trim", "Styling", "Perm", "Treatment", "Rebond", "Keratin"];
        break;

      case "barbershop":
      case "barber":
        primaryNavUrls = ["/appointments", "/staff"];
        labels = { "/appointments": "Bookings", "/staff": "Barbers", "/customers": "Clients" };
        hidden.add("/memberships");
        sidebarOrder = ["/", "/appointments", "/staff", "/customers", "/rooms", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Bookings", entry: "Booking", entryPlural: "Bookings",
          service: "Service", customer: "Client", staff: "Barber", room: "Chair",
          bookButton: "Book", emptyState: "No bookings",
          topItemsLabel: "Top Services", itemUnit: "booking", orderLabel: "booking", bestSellerLabel: "Most Booked",
        };
        quickSuggestions = ["Haircut", "Beard Trim", "Clean Shave", "Fade", "Hair & Beard", "Styling", "Kids Cut", "Senior Cut"];
        break;

      case "gym":
        primaryNavUrls = ["/memberships", "/appointments"];
        labels = { "/memberships": "Members", "/appointments": "Sessions", "/staff": "Trainers", "/rooms": "Courts" };
        sidebarOrder = ["/", "/memberships", "/appointments", "/staff", "/rooms", "/customers", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Sessions", entry: "Session", entryPlural: "Sessions",
          service: "Session Type", customer: "Member", staff: "Trainer", room: "Court / Studio",
          bookButton: "Schedule", emptyState: "No sessions",
          topItemsLabel: "Top Sessions", itemUnit: "session", orderLabel: "session", bestSellerLabel: "Most Scheduled",
        };
        quickSuggestions = ["Personal Training", "Group Class", "Court Booking", "Fitness Assessment", "Yoga Session", "CrossFit", "Consultation", "Spin Class"];
        break;

      case "spa":
        primaryNavUrls = ["/appointments", "/rooms"];
        labels = { "/appointments": "Bookings", "/rooms": "Treatment Rooms", "/customers": "Clients", "/memberships": "Packages" };
        sidebarOrder = ["/", "/appointments", "/rooms", "/memberships", "/staff", "/customers", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Bookings", entry: "Booking", entryPlural: "Bookings",
          service: "Treatment", customer: "Client", staff: "Therapist", room: "Treatment Room",
          bookButton: "Book", emptyState: "No bookings",
          topItemsLabel: "Top Treatments", itemUnit: "booking", orderLabel: "booking", bestSellerLabel: "Most Booked",
        };
        quickSuggestions = ["Full Body Massage", "Swedish Massage", "Facial", "Body Scrub", "Aromatherapy", "Hot Stone Massage", "Foot Spa", "Couple Massage"];
        break;

      case "clinic":
        primaryNavUrls = ["/appointments", "/customers"];
        labels = { "/appointments": "Patients", "/customers": "Records", "/staff": "Doctors", "/rooms": "Examination Room" };
        hidden.add("/memberships");
        sidebarOrder = ["/", "/appointments", "/customers", "/staff", "/rooms", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Patients", entry: "Patient", entryPlural: "Patients",
          service: "Procedure", customer: "Patient", staff: "Doctor", room: "Examination Room",
          bookButton: "Schedule", emptyState: "No patients",
          topItemsLabel: "Top Procedures", itemUnit: "patient", orderLabel: "patient", bestSellerLabel: "Most Common",
        };
        quickSuggestions = ["General Consultation", "Follow-up Visit", "Check-up", "Lab Request", "Vaccination", "Prescription Renewal", "Physical Exam", "Dental Cleaning"];
        break;

      case "dental":
        primaryNavUrls = ["/appointments", "/customers"];
        labels = { "/appointments": "Patients", "/customers": "Records", "/staff": "Dentists", "/rooms": "Dental Chair" };
        hidden.add("/memberships");
        sidebarOrder = ["/", "/appointments", "/customers", "/staff", "/rooms", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Patients", entry: "Patient", entryPlural: "Patients",
          service: "Procedure", customer: "Patient", staff: "Dentist", room: "Dental Chair",
          bookButton: "Schedule", emptyState: "No patients",
          topItemsLabel: "Top Procedures", itemUnit: "patient", orderLabel: "patient", bestSellerLabel: "Most Common",
        };
        quickSuggestions = ["Dental Cleaning", "Tooth Extraction", "Filling", "Whitening", "Root Canal", "Braces Adjustment", "Consultation", "X-ray"];
        break;

      case "pet_grooming":
        primaryNavUrls = ["/appointments", "/customers"];
        labels = { "/appointments": "Bookings", "/customers": "Clients", "/staff": "Groomers", "/rooms": "Grooming Station" };
        hidden.add("/memberships");
        sidebarOrder = ["/", "/appointments", "/customers", "/staff", "/rooms", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Bookings", entry: "Booking", entryPlural: "Bookings",
          service: "Grooming Service", customer: "Pet Owner", staff: "Groomer", room: "Grooming Station",
          bookButton: "Book", emptyState: "No bookings",
          topItemsLabel: "Top Services", itemUnit: "booking", orderLabel: "booking", bestSellerLabel: "Most Booked",
        };
        quickSuggestions = ["Full Groom", "Bath & Dry", "Nail Trim", "Ear Cleaning", "Hair Trim", "Teeth Brushing", "De-shedding", "Puppy Groom"];
        break;

      case "car_wash":
        primaryNavUrls = ["/appointments", "/pos"];
        labels = { "/appointments": "Queue", "/customers": "Clients" };
        hidden.add("/memberships");
        hidden.add("/rooms");
        sidebarOrder = ["/", "/appointments", "/pos", "/customers", "/staff", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Queue", entry: "Job", entryPlural: "Jobs",
          service: "Wash Type", customer: "Client", staff: "Washer", room: "Bay",
          bookButton: "Queue", emptyState: "No jobs in queue",
          topItemsLabel: "Top Wash Types", itemUnit: "job", orderLabel: "job", bestSellerLabel: "Most Popular",
        };
        quickSuggestions = ["Basic Wash", "Full Detail", "Interior Cleaning", "Wax & Polish", "Engine Wash", "Underchassis Wash", "Express Wash", "Premium Detail"];
        break;

      case "auto_repair":
      case "repair":
        primaryNavUrls = ["/appointments", "/customers"];
        labels = { "/appointments": "Jobs", "/customers": "Clients" };
        hidden.add("/memberships");
        hidden.add("/rooms");
        sidebarOrder = ["/", "/appointments", "/customers", "/staff", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Jobs", entry: "Job", entryPlural: "Jobs",
          service: "Repair Type", customer: "Client", staff: "Technician", room: "Bay",
          bookButton: "Add Job", emptyState: "No repair jobs",
          topItemsLabel: "Top Repair Types", itemUnit: "job", orderLabel: "job", bestSellerLabel: "Most Requested",
        };
        quickSuggestions = ["Diagnosis", "Screen Repair", "Battery Replacement", "Oil Change", "Brake Service", "Data Recovery", "Software Fix", "General Repair"];
        break;

      case "laundry":
        primaryNavUrls = ["/appointments", "/pos"];
        labels = { "/appointments": "Orders", "/customers": "Clients" };
        hidden.add("/memberships");
        hidden.add("/rooms");
        sidebarOrder = ["/", "/appointments", "/pos", "/customers", "/staff", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Orders", entry: "Order", entryPlural: "Orders",
          service: "Service Type", customer: "Client", staff: "Staff", room: "Station",
          bookButton: "Add Order", emptyState: "No laundry orders",
          topItemsLabel: "Top Services", itemUnit: "order", orderLabel: "order", bestSellerLabel: "Most Ordered",
        };
        quickSuggestions = ["Wash & Fold", "Dry Clean", "Press & Iron", "Comforter Wash", "Express Service", "Shoe Cleaning", "Curtain Wash", "Bedding Set"];
        break;

      case "photography":
        primaryNavUrls = ["/appointments", "/rooms"];
        labels = { "/appointments": "Bookings", "/rooms": "Studios", "/customers": "Clients" };
        hidden.add("/memberships");
        sidebarOrder = ["/", "/appointments", "/rooms", "/staff", "/customers", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Bookings", entry: "Booking", entryPlural: "Bookings",
          service: "Shoot Type", customer: "Client", staff: "Photographer", room: "Studio",
          bookButton: "Book", emptyState: "No bookings",
          topItemsLabel: "Top Shoot Types", itemUnit: "session", orderLabel: "booking", bestSellerLabel: "Most Booked",
        };
        quickSuggestions = ["Portrait Session", "Family Photo", "Event Coverage", "Product Shoot", "Headshot", "Graduation Photos", "Prenatal Shoot", "Commercial Shoot"];
        break;

      case "tutoring":
        primaryNavUrls = ["/appointments", "/staff"];
        labels = { "/appointments": "Sessions", "/staff": "Tutors", "/customers": "Students" };
        hidden.add("/memberships");
        hidden.add("/rooms");
        sidebarOrder = ["/", "/appointments", "/staff", "/customers", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Sessions", entry: "Session", entryPlural: "Sessions",
          service: "Subject", customer: "Student", staff: "Tutor", room: "Room",
          bookButton: "Schedule", emptyState: "No sessions",
          topItemsLabel: "Top Subjects", itemUnit: "session", orderLabel: "session", bestSellerLabel: "Most Scheduled",
        };
        quickSuggestions = ["Math", "Science", "English", "Filipino", "Test Prep", "Homework Help", "College Entrance Prep", "Programming"];
        break;

      case "cleaning":
        primaryNavUrls = ["/appointments", "/staff"];
        labels = { "/appointments": "Bookings", "/staff": "Teams", "/customers": "Clients" };
        hidden.add("/memberships");
        hidden.add("/rooms");
        sidebarOrder = ["/", "/appointments", "/staff", "/customers", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Bookings", entry: "Booking", entryPlural: "Bookings",
          service: "Cleaning Type", customer: "Client", staff: "Cleaner", room: "Area",
          bookButton: "Book", emptyState: "No bookings",
          topItemsLabel: "Top Services", itemUnit: "booking", orderLabel: "booking", bestSellerLabel: "Most Booked",
        };
        quickSuggestions = ["Regular Clean", "Deep Clean", "Move-in Clean", "Move-out Clean", "After-party Clean", "Window Clean", "Carpet Clean", "Office Clean"];
        break;

      case "massage":
        primaryNavUrls = ["/appointments", "/staff"];
        labels = { "/appointments": "Bookings", "/customers": "Clients", "/staff": "Therapists", "/rooms": "Room" };
        hidden.add("/memberships");
        sidebarOrder = ["/", "/appointments", "/staff", "/rooms", "/customers", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Bookings", entry: "Booking", entryPlural: "Bookings",
          service: "Massage Type", customer: "Client", staff: "Therapist", room: "Room",
          bookButton: "Book", emptyState: "No bookings",
          topItemsLabel: "Top Treatments", itemUnit: "booking", orderLabel: "booking", bestSellerLabel: "Most Booked",
        };
        quickSuggestions = ["Swedish Massage", "Deep Tissue", "Hot Stone", "Shiatsu", "Reflexology", "Sports Massage", "Prenatal Massage", "Couple Massage"];
        break;

      case "nail_salon":
        primaryNavUrls = ["/appointments", "/staff"];
        labels = { "/appointments": "Bookings", "/customers": "Clients", "/staff": "Nail Techs", "/rooms": "Station" };
        hidden.add("/memberships");
        sidebarOrder = ["/", "/appointments", "/staff", "/rooms", "/customers", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = {
          page: "Bookings", entry: "Booking", entryPlural: "Bookings",
          service: "Nail Service", customer: "Client", staff: "Nail Tech", room: "Station",
          bookButton: "Book", emptyState: "No bookings",
          topItemsLabel: "Top Services", itemUnit: "booking", orderLabel: "booking", bestSellerLabel: "Most Booked",
        };
        quickSuggestions = ["Manicure", "Pedicure", "Gel Nails", "Acrylic Nails", "Nail Art", "French Tips", "Spa Mani-Pedi", "Nail Removal"];
        break;

      default:
        primaryNavUrls = ["/appointments", "/pos"];
        sidebarOrder = ["/", "/appointments", "/staff", "/rooms", "/memberships", "/customers", "/pos", "/products", "/transactions", "/analytics", "/expenses", "/shifts", "/timeclock", "/discount-codes", "/refunds", "/ai", "/settings"];
        terminology = DEFAULT_TERMINOLOGY;
        quickSuggestions = [];
        break;
    }
  }

  return { hiddenUrls: hidden, showBarcode, primaryNavUrls, labels, sidebarOrder, terminology, quickSuggestions };
}
