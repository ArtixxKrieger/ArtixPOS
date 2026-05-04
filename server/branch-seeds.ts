// Branch seed templates — pre-populate a brand-new branch with sensible
// starter products/categories so the owner can ring up their first sale
// the moment they finish creating the branch.
//
// All seeded rows are scoped to the branchId + the owner's userId, so they
// only show up inside that branch and can be edited/deleted just like any
// other product the owner adds manually.

export interface SeedItem {
  name: string;
  price: string;
  category: string;
}

export interface SeedTemplate {
  label: string;
  description: string;
  items: SeedItem[];
  /** Optional dine-in tables to seed (cafe / restaurant / bar) */
  tables?: { name: string; seats: number }[];
}

const cafeMenu: SeedItem[] = [
  { name: "Espresso", price: "2.50", category: "Coffee" },
  { name: "Americano", price: "3.00", category: "Coffee" },
  { name: "Cappuccino", price: "3.75", category: "Coffee" },
  { name: "Latte", price: "4.00", category: "Coffee" },
  { name: "Mocha", price: "4.25", category: "Coffee" },
  { name: "Hot Chocolate", price: "3.50", category: "Coffee" },
  { name: "Green Tea", price: "2.75", category: "Tea" },
  { name: "Earl Grey", price: "2.75", category: "Tea" },
  { name: "Chai Latte", price: "3.75", category: "Tea" },
  { name: "Croissant", price: "3.00", category: "Pastries" },
  { name: "Blueberry Muffin", price: "2.75", category: "Pastries" },
  { name: "Chocolate Chip Cookie", price: "2.00", category: "Pastries" },
  { name: "Cheesecake Slice", price: "4.50", category: "Pastries" },
];

const restaurantMenu: SeedItem[] = [
  { name: "Garden Salad", price: "8.00", category: "Appetizers" },
  { name: "Soup of the Day", price: "6.50", category: "Appetizers" },
  { name: "Bruschetta", price: "7.50", category: "Appetizers" },
  { name: "Grilled Chicken", price: "16.00", category: "Mains" },
  { name: "Pasta Bolognese", price: "14.50", category: "Mains" },
  { name: "Margherita Pizza", price: "13.00", category: "Mains" },
  { name: "Beef Burger", price: "15.00", category: "Mains" },
  { name: "Fish & Chips", price: "17.00", category: "Mains" },
  { name: "Soft Drink", price: "3.50", category: "Drinks" },
  { name: "House Wine (Glass)", price: "6.00", category: "Drinks" },
  { name: "Local Beer", price: "5.00", category: "Drinks" },
  { name: "Tiramisu", price: "6.50", category: "Desserts" },
  { name: "Ice Cream", price: "5.00", category: "Desserts" },
];

const bakeryMenu: SeedItem[] = [
  { name: "Sourdough Loaf", price: "6.50", category: "Breads" },
  { name: "Baguette", price: "4.00", category: "Breads" },
  { name: "Whole Wheat Loaf", price: "5.50", category: "Breads" },
  { name: "Birthday Cake (Small)", price: "25.00", category: "Cakes" },
  { name: "Cheesecake", price: "22.00", category: "Cakes" },
  { name: "Carrot Cake Slice", price: "4.50", category: "Cakes" },
  { name: "Croissant", price: "3.00", category: "Pastries" },
  { name: "Pain au Chocolat", price: "3.50", category: "Pastries" },
  { name: "Cinnamon Roll", price: "3.75", category: "Pastries" },
];

const barMenu: SeedItem[] = [
  { name: "Draft Beer", price: "6.00", category: "Beer" },
  { name: "Bottled IPA", price: "7.50", category: "Beer" },
  { name: "House Red Wine", price: "8.00", category: "Wine" },
  { name: "House White Wine", price: "8.00", category: "Wine" },
  { name: "Mojito", price: "10.00", category: "Cocktails" },
  { name: "Margarita", price: "10.00", category: "Cocktails" },
  { name: "Old Fashioned", price: "12.00", category: "Cocktails" },
  { name: "Whiskey Shot", price: "7.00", category: "Spirits" },
  { name: "Vodka Shot", price: "6.00", category: "Spirits" },
  { name: "Nachos", price: "9.00", category: "Bar Snacks" },
  { name: "Buffalo Wings", price: "11.00", category: "Bar Snacks" },
];

const foodTruckMenu: SeedItem[] = [
  { name: "Classic Burger", price: "9.00", category: "Mains" },
  { name: "Chicken Wrap", price: "8.50", category: "Mains" },
  { name: "Veggie Bowl", price: "8.00", category: "Mains" },
  { name: "Loaded Fries", price: "6.00", category: "Sides" },
  { name: "Onion Rings", price: "5.00", category: "Sides" },
  { name: "Soft Drink", price: "2.50", category: "Drinks" },
  { name: "Bottled Water", price: "2.00", category: "Drinks" },
];

const salonServices: SeedItem[] = [
  { name: "Men's Haircut", price: "25.00", category: "Hair" },
  { name: "Women's Haircut", price: "45.00", category: "Hair" },
  { name: "Kids Haircut", price: "18.00", category: "Hair" },
  { name: "Beard Trim", price: "15.00", category: "Hair" },
  { name: "Blow Dry & Style", price: "35.00", category: "Hair" },
  { name: "Hair Coloring", price: "75.00", category: "Color" },
  { name: "Highlights", price: "95.00", category: "Color" },
  { name: "Root Touch-up", price: "55.00", category: "Color" },
  { name: "Manicure", price: "25.00", category: "Nails" },
  { name: "Pedicure", price: "35.00", category: "Nails" },
  { name: "Gel Polish", price: "30.00", category: "Nails" },
];

const gymServices: SeedItem[] = [
  { name: "Day Pass", price: "15.00", category: "Memberships" },
  { name: "Weekly Pass", price: "40.00", category: "Memberships" },
  { name: "Monthly Membership", price: "60.00", category: "Memberships" },
  { name: "Annual Membership", price: "600.00", category: "Memberships" },
  { name: "Personal Training (1 Session)", price: "55.00", category: "Personal Training" },
  { name: "Personal Training (5 Pack)", price: "250.00", category: "Personal Training" },
  { name: "Group Class Drop-in", price: "20.00", category: "Classes" },
  { name: "Class Pack (10)", price: "150.00", category: "Classes" },
  { name: "Protein Shake", price: "6.00", category: "Refreshments" },
  { name: "Bottled Water", price: "2.50", category: "Refreshments" },
];

const spaServices: SeedItem[] = [
  { name: "Swedish Massage (60 min)", price: "85.00", category: "Massage" },
  { name: "Deep Tissue Massage (60 min)", price: "95.00", category: "Massage" },
  { name: "Hot Stone Massage (90 min)", price: "130.00", category: "Massage" },
  { name: "Couples Massage (60 min)", price: "180.00", category: "Massage" },
  { name: "Classic Facial", price: "75.00", category: "Facials" },
  { name: "Anti-aging Facial", price: "110.00", category: "Facials" },
  { name: "Aromatherapy Session", price: "65.00", category: "Wellness" },
  { name: "Sauna Access", price: "20.00", category: "Wellness" },
];

const clinicServices: SeedItem[] = [
  { name: "General Consultation", price: "50.00", category: "Consultations" },
  { name: "Follow-up Visit", price: "35.00", category: "Consultations" },
  { name: "Specialist Consultation", price: "85.00", category: "Consultations" },
  { name: "Blood Pressure Check", price: "10.00", category: "Diagnostics" },
  { name: "Blood Test (Basic)", price: "40.00", category: "Diagnostics" },
  { name: "Vaccination", price: "25.00", category: "Treatments" },
];

const laundryServices: SeedItem[] = [
  { name: "Wash & Fold (per kg)", price: "3.50", category: "Wash" },
  { name: "Express Wash (per kg)", price: "5.00", category: "Wash" },
  { name: "Dry Cleaning - Shirt", price: "5.00", category: "Dry Cleaning" },
  { name: "Dry Cleaning - Suit", price: "18.00", category: "Dry Cleaning" },
  { name: "Dry Cleaning - Dress", price: "12.00", category: "Dry Cleaning" },
  { name: "Bedding (per piece)", price: "8.00", category: "Specialty" },
  { name: "Curtains (per panel)", price: "15.00", category: "Specialty" },
];

const carWashServices: SeedItem[] = [
  { name: "Basic Wash", price: "12.00", category: "Wash Packages" },
  { name: "Premium Wash & Wax", price: "25.00", category: "Wash Packages" },
  { name: "Full Detail", price: "75.00", category: "Detailing" },
  { name: "Interior Vacuum", price: "15.00", category: "Detailing" },
  { name: "Tire Shine", price: "8.00", category: "Add-ons" },
  { name: "Air Freshener", price: "5.00", category: "Add-ons" },
];

const petGroomingServices: SeedItem[] = [
  { name: "Bath (Small Dog)", price: "30.00", category: "Bathing" },
  { name: "Bath (Large Dog)", price: "50.00", category: "Bathing" },
  { name: "Full Groom (Small)", price: "55.00", category: "Grooming" },
  { name: "Full Groom (Large)", price: "85.00", category: "Grooming" },
  { name: "Nail Trim", price: "12.00", category: "Add-ons" },
  { name: "Teeth Brushing", price: "10.00", category: "Add-ons" },
];

const photographyServices: SeedItem[] = [
  { name: "Portrait Session (1 hr)", price: "150.00", category: "Sessions" },
  { name: "Family Session (2 hr)", price: "275.00", category: "Sessions" },
  { name: "Engagement Shoot", price: "350.00", category: "Sessions" },
  { name: "Event Coverage (per hr)", price: "200.00", category: "Events" },
  { name: "Photo Print 8x10", price: "15.00", category: "Prints" },
  { name: "Digital Album", price: "75.00", category: "Prints" },
];

const cleaningServices: SeedItem[] = [
  { name: "Standard Home Clean", price: "85.00", category: "Residential" },
  { name: "Deep Clean", price: "175.00", category: "Residential" },
  { name: "Move-in / Move-out Clean", price: "225.00", category: "Residential" },
  { name: "Office Cleaning (per hr)", price: "45.00", category: "Commercial" },
  { name: "Window Cleaning", price: "60.00", category: "Add-ons" },
];

const tutoringServices: SeedItem[] = [
  { name: "Math Tutoring (1 hr)", price: "40.00", category: "Tutoring" },
  { name: "English Tutoring (1 hr)", price: "40.00", category: "Tutoring" },
  { name: "Science Tutoring (1 hr)", price: "45.00", category: "Tutoring" },
  { name: "Test Prep Session", price: "55.00", category: "Test Prep" },
  { name: "Group Class (per student)", price: "25.00", category: "Group" },
];

const repairServices: SeedItem[] = [
  { name: "Diagnostic Fee", price: "35.00", category: "Diagnostics" },
  { name: "Labor (per hr)", price: "65.00", category: "Labor" },
  { name: "Emergency Call-out", price: "120.00", category: "Labor" },
  { name: "Standard Service Call", price: "85.00", category: "Service" },
];

const clothingItems: SeedItem[] = [
  { name: "T-Shirt", price: "25.00", category: "Tops" },
  { name: "Polo Shirt", price: "35.00", category: "Tops" },
  { name: "Hoodie", price: "55.00", category: "Tops" },
  { name: "Jeans", price: "65.00", category: "Bottoms" },
  { name: "Shorts", price: "40.00", category: "Bottoms" },
  { name: "Sneakers", price: "85.00", category: "Footwear" },
  { name: "Cap", price: "20.00", category: "Accessories" },
];

const electronicsItems: SeedItem[] = [
  { name: "Phone Charger", price: "15.00", category: "Accessories" },
  { name: "USB Cable", price: "10.00", category: "Accessories" },
  { name: "Wireless Earbuds", price: "55.00", category: "Audio" },
  { name: "Bluetooth Speaker", price: "75.00", category: "Audio" },
  { name: "Power Bank", price: "35.00", category: "Accessories" },
  { name: "Phone Case", price: "20.00", category: "Accessories" },
];

const groceryItems: SeedItem[] = [
  { name: "Milk (1L)", price: "2.50", category: "Dairy" },
  { name: "Eggs (Dozen)", price: "4.00", category: "Dairy" },
  { name: "White Bread", price: "3.00", category: "Bakery" },
  { name: "Bananas (per kg)", price: "2.00", category: "Produce" },
  { name: "Apples (per kg)", price: "3.50", category: "Produce" },
  { name: "Bottled Water", price: "1.50", category: "Beverages" },
  { name: "Soft Drink", price: "2.00", category: "Beverages" },
];

const pharmacyItems: SeedItem[] = [
  { name: "Paracetamol 500mg (Biogesic)", price: "5.75", category: "Pain Relief" },
  { name: "Mefenamic Acid 500mg (Ponstan)", price: "12.50", category: "Pain Relief" },
  { name: "Ibuprofen 200mg (Advil)", price: "9.50", category: "Pain Relief" },
  { name: "Amoxicillin 500mg (Amoxil)", price: "18.00", category: "Antibiotics" },
  { name: "Cetirizine 10mg (Zyrtec)", price: "8.00", category: "Antihistamine" },
  { name: "Loratadine 10mg (Claritin)", price: "9.25", category: "Antihistamine" },
  { name: "Omeprazole 20mg (Losec)", price: "22.00", category: "Gastro" },
  { name: "Antacid Tablet (Kremil-S)", price: "7.00", category: "Gastro" },
  { name: "Loperamide 2mg (Diatabs)", price: "6.50", category: "Gastro" },
  { name: "Ascorbic Acid 500mg (Vitamin C)", price: "5.00", category: "Vitamins" },
  { name: "Multivitamins (Centrum)", price: "22.50", category: "Vitamins" },
  { name: "Calcium+D3 Supplement", price: "18.00", category: "Vitamins" },
  { name: "Alcohol 70% Isopropyl (500ml)", price: "65.00", category: "First Aid" },
  { name: "Betadine Antiseptic Solution (60ml)", price: "85.00", category: "First Aid" },
  { name: "Sterile Gauze Pads (10s)", price: "45.00", category: "First Aid" },
  { name: "Surgical Mask (50pcs)", price: "120.00", category: "PPE" },
  { name: "Nitrile Gloves (Medium, 100pcs)", price: "350.00", category: "PPE" },
  { name: "Digital Thermometer", price: "199.00", category: "Devices" },
  { name: "Blood Pressure Monitor", price: "1299.00", category: "Devices" },
  { name: "Insulin Syringes 1ml (10s)", price: "85.00", category: "Diabetic Care" },
];

const perishableItems: SeedItem[] = [
  { name: "Fresh Bangus (per kg)", price: "180.00", category: "Fish & Seafood" },
  { name: "Tilapia (per kg)", price: "130.00", category: "Fish & Seafood" },
  { name: "Pork Kasim (per kg)", price: "280.00", category: "Meat" },
  { name: "Chicken Breast (per kg)", price: "220.00", category: "Poultry" },
  { name: "Chicken Whole (per kg)", price: "190.00", category: "Poultry" },
  { name: "Beef Brisket (per kg)", price: "380.00", category: "Meat" },
  { name: "Pork Liempo (per kg)", price: "320.00", category: "Meat" },
  { name: "Ground Beef (per kg)", price: "350.00", category: "Meat" },
  { name: "Kamatis (per kg)", price: "80.00", category: "Vegetables" },
  { name: "Sibuyas (per kg)", price: "90.00", category: "Vegetables" },
  { name: "Bawang (per kg)", price: "120.00", category: "Vegetables" },
  { name: "Ampalaya (per kg)", price: "75.00", category: "Vegetables" },
  { name: "Kangkong (bundle)", price: "25.00", category: "Vegetables" },
  { name: "Saging na Saba (per kg)", price: "60.00", category: "Fruits" },
  { name: "Mangga (per kg)", price: "95.00", category: "Fruits" },
  { name: "Eggs (per piece)", price: "12.00", category: "Dairy & Eggs" },
  { name: "Fresh Milk (1L)", price: "95.00", category: "Dairy & Eggs" },
  { name: "Tokwa (per block)", price: "28.00", category: "Soy Products" },
];

const groceryEnhancedItems: SeedItem[] = [
  { name: "Rice (5kg bag)", price: "265.00", category: "Grains & Staples" },
  { name: "Cooking Oil (1L)", price: "95.00", category: "Cooking" },
  { name: "Soy Sauce (350ml)", price: "45.00", category: "Condiments" },
  { name: "Vinegar (350ml)", price: "32.00", category: "Condiments" },
  { name: "Instant Noodles (pack)", price: "16.00", category: "Instant Food" },
  { name: "Canned Sardines (155g)", price: "32.00", category: "Canned Goods" },
  { name: "Canned Corned Beef (150g)", price: "55.00", category: "Canned Goods" },
  { name: "Evaporated Milk (370ml)", price: "48.00", category: "Dairy" },
  { name: "Eggs (per tray, 30pcs)", price: "320.00", category: "Dairy & Eggs" },
  { name: "Laundry Detergent (1kg)", price: "89.00", category: "Household" },
  { name: "Dishwashing Liquid (500ml)", price: "75.00", category: "Household" },
  { name: "Bar Soap (90g)", price: "28.00", category: "Personal Care" },
  { name: "Shampoo (200ml)", price: "115.00", category: "Personal Care" },
  { name: "Bottled Water (500ml)", price: "18.00", category: "Beverages" },
  { name: "Soft Drink 1.5L", price: "65.00", category: "Beverages" },
  { name: "Coffee Sachet (10s)", price: "85.00", category: "Beverages" },
  { name: "Sugar (1kg)", price: "75.00", category: "Baking" },
  { name: "All-Purpose Flour (1kg)", price: "58.00", category: "Baking" },
];

const bookstoreItems: SeedItem[] = [
  { name: "Bestseller (Hardcover)", price: "28.00", category: "Books" },
  { name: "Paperback Novel", price: "16.00", category: "Books" },
  { name: "Children's Book", price: "12.00", category: "Books" },
  { name: "Notebook", price: "8.00", category: "Stationery" },
  { name: "Pen Set", price: "12.00", category: "Stationery" },
  { name: "Greeting Card", price: "5.00", category: "Cards & Gifts" },
];

const cafeTables = [
  { name: "Table 1", seats: 2 },
  { name: "Table 2", seats: 2 },
  { name: "Table 3", seats: 4 },
  { name: "Table 4", seats: 4 },
];

const restaurantTables = [
  { name: "Table 1", seats: 2 },
  { name: "Table 2", seats: 2 },
  { name: "Table 3", seats: 4 },
  { name: "Table 4", seats: 4 },
  { name: "Table 5", seats: 6 },
  { name: "Table 6", seats: 6 },
];

const barTables = [
  { name: "Bar 1", seats: 1 },
  { name: "Bar 2", seats: 1 },
  { name: "Bar 3", seats: 1 },
  { name: "Booth 1", seats: 4 },
  { name: "Booth 2", seats: 4 },
];

export const SEED_TEMPLATES: Record<string, SeedTemplate> = {
  cafe: {
    label: "Cafe Starter Menu",
    description: "Coffee, tea, and pastries to get you ringing up your first sale today.",
    items: cafeMenu,
    tables: cafeTables,
  },
  restaurant: {
    label: "Restaurant Starter Menu",
    description: "A classic appetizer, mains, drinks and desserts menu — plus dine-in tables.",
    items: restaurantMenu,
    tables: restaurantTables,
  },
  bakery: {
    label: "Bakery Starter Menu",
    description: "Breads, cakes, and pastries to fill your display case.",
    items: bakeryMenu,
  },
  bar: {
    label: "Bar Starter Menu",
    description: "Beer, wine, cocktails, spirits and snacks — bar seating included.",
    items: barMenu,
    tables: barTables,
  },
  food_truck: {
    label: "Food Truck Starter Menu",
    description: "Quick-service mains, sides, and drinks.",
    items: foodTruckMenu,
  },
  salon: {
    label: "Salon Service Menu",
    description: "Hair, color, and nail services with typical price points.",
    items: salonServices,
  },
  gym: {
    label: "Gym Service Menu",
    description: "Memberships, personal training, group classes, and refreshments.",
    items: gymServices,
  },
  spa: {
    label: "Spa Service Menu",
    description: "Massage, facials, and wellness sessions.",
    items: spaServices,
  },
  clinic: {
    label: "Clinic Service Menu",
    description: "Consultations, diagnostics, and basic treatments.",
    items: clinicServices,
  },
  laundry: {
    label: "Laundry Service Menu",
    description: "Wash & fold, dry cleaning, and specialty items.",
    items: laundryServices,
  },
  car_wash: {
    label: "Car Wash Service Menu",
    description: "Wash packages, detailing, and add-ons.",
    items: carWashServices,
  },
  pet_grooming: {
    label: "Pet Grooming Service Menu",
    description: "Bathing, full grooms, and add-ons.",
    items: petGroomingServices,
  },
  photography: {
    label: "Photography Service Menu",
    description: "Sessions, event coverage, prints and albums.",
    items: photographyServices,
  },
  cleaning: {
    label: "Cleaning Service Menu",
    description: "Residential, commercial, and specialty cleaning.",
    items: cleaningServices,
  },
  tutoring: {
    label: "Tutoring Service Menu",
    description: "Subject tutoring, test prep, and group classes.",
    items: tutoringServices,
  },
  repair: {
    label: "Repair Service Menu",
    description: "Diagnostics, labor, and call-outs.",
    items: repairServices,
  },
  clothing: {
    label: "Clothing Starter Inventory",
    description: "Common apparel categories with sample SKUs.",
    items: clothingItems,
  },
  electronics: {
    label: "Electronics Starter Inventory",
    description: "Accessories and audio basics.",
    items: electronicsItems,
  },
  grocery: {
    label: "Grocery Starter Inventory",
    description: "Daily essentials across dairy, produce, and beverages.",
    items: groceryItems,
  },
  pharmacy: {
    label: "Pharmacy Starter Inventory",
    description: "Common OTC medicines, vitamins, first aid, and medical devices.",
    items: pharmacyItems,
  },
  drugstore: {
    label: "Drugstore Starter Inventory",
    description: "Common OTC medicines, vitamins, first aid, and medical devices.",
    items: pharmacyItems,
  },
  perishable_goods: {
    label: "Palengke / Wet Market Starter Inventory",
    description: "Fresh meat, fish, vegetables, and fruits — sold by weight.",
    items: perishableItems,
  },
  grocery_enhanced: {
    label: "Sari-Sari / Grocery Starter Inventory",
    description: "Grains, canned goods, condiments, beverages, and household essentials.",
    items: groceryEnhancedItems,
  },
  bookstore: {
    label: "Bookstore Starter Inventory",
    description: "Books, stationery, and cards.",
    items: bookstoreItems,
  },
};

/** Returns the template that best matches a branch's businessType + subType. */
export function getSeedTemplate(
  businessType: string | null | undefined,
  businessSubType: string | null | undefined
): SeedTemplate | null {
  if (businessSubType && SEED_TEMPLATES[businessSubType]) {
    return SEED_TEMPLATES[businessSubType];
  }
  // Fallback by type when no subtype is chosen
  if (businessType === "food_beverage") return SEED_TEMPLATES.cafe;
  if (businessType === "services") return SEED_TEMPLATES.salon;
  if (businessType === "retail") return SEED_TEMPLATES.clothing;
  return null;
}
