const FOOD_RESTAURANT_FREE = new Set(["/kitchen", "/tables"]);
const FOOD_BAR_FREE = new Set(["/tables"]);
const SERVICE_BASE_FREE = new Set(["/appointments", "/staff"]);
const SERVICE_ROOM_FREE = new Set(["/rooms"]);
const SERVICE_MEMBERSHIP_FREE = new Set(["/memberships"]);
const SERVICE_RECORD_FREE = new Set(["/customers"]);

export function getEssentialBusinessUrls(
  businessType?: string | null,
  businessSubType?: string | null,
): Set<string> {
  const urls = new Set<string>();

  if (businessType === "food_beverage") {
    if (businessSubType === "restaurant") {
      FOOD_RESTAURANT_FREE.forEach((url) => urls.add(url));
    } else if (businessSubType === "bar") {
      FOOD_BAR_FREE.forEach((url) => urls.add(url));
    }
  }

  if (businessType === "services") {
    SERVICE_BASE_FREE.forEach((url) => urls.add(url));

    if (["spa", "photography", "massage", "nail_salon", "gym"].includes(businessSubType ?? "")) {
      SERVICE_ROOM_FREE.forEach((url) => urls.add(url));
    }

    if (businessSubType === "gym") {
      SERVICE_MEMBERSHIP_FREE.forEach((url) => urls.add(url));
    }

    if (["clinic", "dental"].includes(businessSubType ?? "")) {
      SERVICE_RECORD_FREE.forEach((url) => urls.add(url));
    }
  }

  return urls;
}

export function isEssentialBusinessUrl(
  url: string,
  businessType?: string | null,
  businessSubType?: string | null,
): boolean {
  return getEssentialBusinessUrls(businessType, businessSubType).has(url);
}

const EXPIRY_TRACKING_RETAIL_SUBTYPES = new Set([
  "pharmacy",
  "drugstore",
  "grocery",
  "grocery_enhanced",
  "perishable_goods",
]);

/**
 * Whether this business type/sub-type tracks product expiry dates
 * (pharmacies, groceries, and food & beverage businesses). Used to decide
 * whether to run expiry-related alerts (e.g. "product expiring soon" push
 * notifications) — irrelevant for services like salons or hotels.
 */
export function isExpiryTrackingBusiness(
  businessType?: string | null,
  businessSubType?: string | null,
): boolean {
  if (businessType === "food_beverage") return true;
  if (businessType === "retail") {
    return EXPIRY_TRACKING_RETAIL_SUBTYPES.has(businessSubType ?? "");
  }
  return false;
}