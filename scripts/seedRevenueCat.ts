import { createClient } from "@replit/revenuecat-sdk/client";
import {
  listProjects,
  createProject,
  listApps,
  createApp,
  listAppPublicApiKeys,
  listProducts,
  createProduct,
  listEntitlements,
  createEntitlement,
  attachProductsToEntitlement,
  listOfferings,
  createOffering,
  updateOffering,
  listPackages,
  createPackages,
  attachProductsToPackage,
  type App,
  type Product,
  type Project,
  type Entitlement,
  type Offering,
  type Package,
  type CreateProductData,
} from "@replit/revenuecat-sdk";

const SECRET_KEY = process.env.REVENUECAT_SECRET_KEY;
if (!SECRET_KEY) {
  console.error("REVENUECAT_SECRET_KEY is not set");
  process.exit(1);
}

const client = createClient({
  baseUrl: "https://api.revenuecat.com/v2",
  headers: {
    Authorization: `Bearer ${SECRET_KEY}`,
  },
});

const PROJECT_NAME = "ArtixPOS";

const PRODUCT_IDENTIFIER = "artixpos_pro_monthly";
const PLAY_STORE_PRODUCT_IDENTIFIER = "artixpos_pro_monthly:monthly";

const PRODUCT_DISPLAY_NAME = "ArtixPOS Pro Monthly";
const PRODUCT_USER_FACING_TITLE = "ArtixPOS Pro";
const PRODUCT_DURATION = "P1M";

const APP_STORE_APP_NAME = "ArtixPOS iOS";
const APP_STORE_BUNDLE_ID = "com.cafebara.app";
const PLAY_STORE_APP_NAME = "ArtixPOS Android";
const PLAY_STORE_PACKAGE_NAME = "com.cafebara.app";

const ENTITLEMENT_IDENTIFIER = "pro";
const ENTITLEMENT_DISPLAY_NAME = "ArtixPOS Pro Access";

const OFFERING_IDENTIFIER = "default";
const OFFERING_DISPLAY_NAME = "Default Offering";

const PACKAGE_IDENTIFIER = "$rc_monthly";
const PACKAGE_DISPLAY_NAME = "Monthly Subscription";

const PRODUCT_PRICES = [
  { amount_micros: 990000, currency: "USD" },
];

type TestStorePricesResponse = {
  object: string;
  prices: { amount_micros: number; currency: string }[];
};

async function seedRevenueCat() {
  let project: Project;
  const { data: existingProjects, error: listProjectsError } = await listProjects({
    client,
    query: { limit: 20 },
  });

  if (listProjectsError) throw new Error("Failed to list projects: " + JSON.stringify(listProjectsError));

  const existingProject = existingProjects.items?.find((p) => p.name === PROJECT_NAME);

  if (existingProject) {
    console.log("Project already exists:", existingProject.id);
    project = existingProject;
  } else {
    const { data: newProject, error: createProjectError } = await createProject({
      client,
      body: { name: PROJECT_NAME },
    });
    if (createProjectError) throw new Error("Failed to create project: " + JSON.stringify(createProjectError));
    console.log("Created project:", newProject.id);
    project = newProject;
  }

  const { data: apps, error: listAppsError } = await listApps({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });

  if (listAppsError || !apps || apps.items.length === 0) {
    throw new Error("No apps found in project");
  }

  let testStoreApp: App | undefined = apps.items.find((a) => a.type === "test_store");
  let appStoreApp: App | undefined = apps.items.find((a) => a.type === "app_store");
  let playStoreApp: App | undefined = apps.items.find((a) => a.type === "play_store");

  if (!testStoreApp) {
    throw new Error("No test store app found. Every new RevenueCat project includes one automatically.");
  }
  console.log("Test Store app:", testStoreApp.id);

  if (!appStoreApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: {
        name: APP_STORE_APP_NAME,
        type: "app_store",
        app_store: { bundle_id: APP_STORE_BUNDLE_ID },
      },
    });
    if (error) throw new Error("Failed to create App Store app: " + JSON.stringify(error));
    appStoreApp = newApp;
    console.log("Created App Store app:", appStoreApp.id);
  } else {
    console.log("App Store app found:", appStoreApp.id);
  }

  if (!playStoreApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: {
        name: PLAY_STORE_APP_NAME,
        type: "play_store",
        play_store: { package_name: PLAY_STORE_PACKAGE_NAME },
      },
    });
    if (error) throw new Error("Failed to create Play Store app: " + JSON.stringify(error));
    playStoreApp = newApp;
    console.log("Created Play Store app:", playStoreApp.id);
  } else {
    console.log("Play Store app found:", playStoreApp.id);
  }

  const { data: existingProducts, error: listProductsError } = await listProducts({
    client,
    path: { project_id: project.id },
    query: { limit: 100 },
  });

  if (listProductsError) throw new Error("Failed to list products");

  const ensureProduct = async (
    targetApp: App,
    label: string,
    productIdentifier: string,
    isTestStore: boolean
  ): Promise<Product> => {
    const existing = existingProducts.items?.find(
      (p) => p.store_identifier === productIdentifier && p.app_id === targetApp.id
    );
    if (existing) {
      console.log(`${label} product already exists:`, existing.id);
      return existing;
    }

    const body: CreateProductData["body"] = {
      store_identifier: productIdentifier,
      app_id: targetApp.id,
      type: "subscription",
      display_name: PRODUCT_DISPLAY_NAME,
    };

    if (isTestStore) {
      body.subscription = { duration: PRODUCT_DURATION };
      body.title = PRODUCT_USER_FACING_TITLE;
    }

    const { data: created, error } = await createProduct({
      client,
      path: { project_id: project.id },
      body,
    });
    if (error) throw new Error(`Failed to create ${label} product: ` + JSON.stringify(error));
    console.log(`Created ${label} product:`, created.id);
    return created;
  };

  const testStoreProduct = await ensureProduct(testStoreApp, "Test Store", PRODUCT_IDENTIFIER, true);
  const appStoreProduct = await ensureProduct(appStoreApp, "App Store", PRODUCT_IDENTIFIER, false);
  const playStoreProduct = await ensureProduct(playStoreApp, "Play Store", PLAY_STORE_PRODUCT_IDENTIFIER, false);

  const { data: _priceData, error: priceError } = await client.post<TestStorePricesResponse>({
    url: "/projects/{project_id}/products/{product_id}/test_store_prices",
    path: { project_id: project.id, product_id: testStoreProduct.id },
    body: { prices: PRODUCT_PRICES },
  });

  if (priceError) {
    if (typeof priceError === "object" && "type" in priceError && priceError["type"] === "resource_already_exists") {
      console.log("Test store prices already exist");
    } else {
      throw new Error("Failed to add test store prices: " + JSON.stringify(priceError));
    }
  } else {
    console.log("Added test store prices ($0.99/month for testing)");
  }

  let entitlement: Entitlement;
  const { data: existingEntitlements, error: listEntitlementsError } = await listEntitlements({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });

  if (listEntitlementsError) throw new Error("Failed to list entitlements");

  const existingEntitlement = existingEntitlements.items?.find((e) => e.lookup_key === ENTITLEMENT_IDENTIFIER);

  if (existingEntitlement) {
    console.log("Entitlement already exists:", existingEntitlement.id);
    entitlement = existingEntitlement;
  } else {
    const { data: newEntitlement, error } = await createEntitlement({
      client,
      path: { project_id: project.id },
      body: { lookup_key: ENTITLEMENT_IDENTIFIER, display_name: ENTITLEMENT_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create entitlement: " + JSON.stringify(error));
    console.log("Created entitlement:", newEntitlement.id);
    entitlement = newEntitlement;
  }

  const { error: attachEntitlementError } = await attachProductsToEntitlement({
    client,
    path: { project_id: project.id, entitlement_id: entitlement.id },
    body: { product_ids: [testStoreProduct.id, appStoreProduct.id, playStoreProduct.id] },
  });

  if (attachEntitlementError) {
    if (attachEntitlementError.type === "unprocessable_entity_error") {
      console.log("Products already attached to entitlement");
    } else {
      throw new Error("Failed to attach products to entitlement: " + JSON.stringify(attachEntitlementError));
    }
  } else {
    console.log("Attached products to entitlement");
  }

  let offering: Offering;
  const { data: existingOfferings, error: listOfferingsError } = await listOfferings({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });

  if (listOfferingsError) throw new Error("Failed to list offerings");

  const existingOffering = existingOfferings.items?.find((o) => o.lookup_key === OFFERING_IDENTIFIER);

  if (existingOffering) {
    console.log("Offering already exists:", existingOffering.id);
    offering = existingOffering;
  } else {
    const { data: newOffering, error } = await createOffering({
      client,
      path: { project_id: project.id },
      body: { lookup_key: OFFERING_IDENTIFIER, display_name: OFFERING_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create offering: " + JSON.stringify(error));
    console.log("Created offering:", newOffering.id);
    offering = newOffering;
  }

  if (!offering.is_current) {
    const { error } = await updateOffering({
      client,
      path: { project_id: project.id, offering_id: offering.id },
      body: { is_current: true },
    });
    if (error) throw new Error("Failed to set offering as current");
    console.log("Set offering as current");
  }

  let pkg: Package;
  const { data: existingPackages, error: listPackagesError } = await listPackages({
    client,
    path: { project_id: project.id, offering_id: offering.id },
    query: { limit: 20 },
  });

  if (listPackagesError) throw new Error("Failed to list packages");

  const existingPackage = existingPackages.items?.find((p) => p.lookup_key === PACKAGE_IDENTIFIER);

  if (existingPackage) {
    console.log("Package already exists:", existingPackage.id);
    pkg = existingPackage;
  } else {
    const { data: newPackage, error } = await createPackages({
      client,
      path: { project_id: project.id, offering_id: offering.id },
      body: { lookup_key: PACKAGE_IDENTIFIER, display_name: PACKAGE_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create package: " + JSON.stringify(error));
    console.log("Created package:", newPackage.id);
    pkg = newPackage;
  }

  const { error: attachPackageError } = await attachProductsToPackage({
    client,
    path: { project_id: project.id, package_id: pkg.id },
    body: {
      products: [
        { product_id: testStoreProduct.id, eligibility_criteria: "all" },
        { product_id: appStoreProduct.id, eligibility_criteria: "all" },
        { product_id: playStoreProduct.id, eligibility_criteria: "all" },
      ],
    },
  });

  if (attachPackageError) {
    if (
      attachPackageError.type === "unprocessable_entity_error" &&
      attachPackageError.message?.includes("Cannot attach product")
    ) {
      console.log("Skipping package attach: already has incompatible product");
    } else {
      throw new Error("Failed to attach products to package: " + JSON.stringify(attachPackageError));
    }
  } else {
    console.log("Attached products to package");
  }

  const { data: testKeys, error: testKeysError } = await listAppPublicApiKeys({
    client,
    path: { project_id: project.id, app_id: testStoreApp.id },
  });
  if (testKeysError) throw new Error("Failed to get test store public keys");

  const { data: iosKeys, error: iosKeysError } = await listAppPublicApiKeys({
    client,
    path: { project_id: project.id, app_id: appStoreApp.id },
  });
  if (iosKeysError) throw new Error("Failed to get App Store public keys");

  const { data: androidKeys, error: androidKeysError } = await listAppPublicApiKeys({
    client,
    path: { project_id: project.id, app_id: playStoreApp.id },
  });
  if (androidKeysError) throw new Error("Failed to get Play Store public keys");

  console.log("\n==================================================");
  console.log("RevenueCat setup complete! Add these to your environment:");
  console.log("==================================================");
  console.log("REVENUECAT_PROJECT_ID=" + project.id);
  console.log("VITE_REVENUECAT_TEST_API_KEY=" + (testKeys?.items?.[0]?.key ?? "N/A"));
  console.log("VITE_REVENUECAT_IOS_API_KEY=" + (iosKeys?.items?.[0]?.key ?? "N/A"));
  console.log("VITE_REVENUECAT_ANDROID_API_KEY=" + (androidKeys?.items?.[0]?.key ?? "N/A"));
  console.log("==================================================\n");
  console.log("Entitlement identifier: " + ENTITLEMENT_IDENTIFIER);
  console.log("Product identifier:     " + PRODUCT_IDENTIFIER);
}

seedRevenueCat().catch(console.error);
