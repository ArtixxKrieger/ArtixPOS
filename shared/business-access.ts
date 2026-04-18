export type BusinessAccessContext = {
  businessType?: string | null;
  businessSubType?: string | null;
};

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