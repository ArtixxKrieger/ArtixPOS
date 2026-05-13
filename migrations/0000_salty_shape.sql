CREATE TABLE "ai_memories" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"business_type" text,
	"content" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"importance_score" integer DEFAULT 5 NOT NULL,
	"access_count" integer DEFAULT 0 NOT NULL,
	"last_accessed_at" text,
	"created_at" text,
	"expires_at" text
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"branch_id" integer,
	"customer_id" integer,
	"staff_id" integer,
	"room_id" integer,
	"title" text NOT NULL,
	"service_type" text,
	"date" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text,
	"duration" integer DEFAULT 60,
	"status" text DEFAULT 'scheduled',
	"notes" text,
	"price" text DEFAULT '0',
	"tip" text DEFAULT '0',
	"reminder_sent" boolean DEFAULT false,
	"deleted_at" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"metadata" jsonb,
	"previous_hash" text,
	"record_hash" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"phone" text,
	"email" text,
	"website" text,
	"description" text,
	"color" text,
	"timezone" text,
	"tax_rate" text,
	"opening_hours" jsonb,
	"is_active" boolean DEFAULT true,
	"is_main" boolean DEFAULT false,
	"business_type" text,
	"business_sub_type" text,
	"deleted_at" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"notes" text,
	"total_spent" text DEFAULT '0',
	"visit_count" integer DEFAULT 0,
	"loyalty_points" integer DEFAULT 0,
	"lifetime_points" integer DEFAULT 0,
	"tier" text DEFAULT 'none',
	"birthday" text,
	"stamp_count" integer DEFAULT 0,
	"referred_by" integer,
	"deleted_at" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "discount_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"code" text NOT NULL,
	"type" text DEFAULT 'percentage' NOT NULL,
	"value" text NOT NULL,
	"min_order" text DEFAULT '0',
	"max_uses" integer,
	"used_count" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"deleted_at" text,
	"expires_at" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"branch_id" integer,
	"category" text DEFAULT 'General' NOT NULL,
	"description" text NOT NULL,
	"amount" text NOT NULL,
	"deleted_at" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"branch_id" integer,
	"name" text NOT NULL,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"stock_qty" text DEFAULT '0' NOT NULL,
	"low_stock_threshold" text DEFAULT '0',
	"cost_per_unit" text DEFAULT '0',
	"notes" text,
	"deleted_at" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "invite_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"token" text NOT NULL,
	"role" text NOT NULL,
	"branch_ids" jsonb,
	"created_by" text NOT NULL,
	"used_by" text,
	"used_at" text,
	"expires_at" text NOT NULL,
	"created_at" text,
	CONSTRAINT "invite_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "loyalty_points_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"customer_id" integer NOT NULL,
	"delta" integer NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"reason" text DEFAULT 'purchase' NOT NULL,
	"sale_id" integer,
	"reward_id" integer,
	"note" text,
	"expires_at" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "loyalty_rewards" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'discount_fixed' NOT NULL,
	"points_cost" integer DEFAULT 100 NOT NULL,
	"value" text DEFAULT '0' NOT NULL,
	"product_id" integer,
	"is_active" boolean DEFAULT true,
	"deleted_at" text,
	"max_redemptions" integer,
	"redemption_count" integer DEFAULT 0,
	"expires_at" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "loyalty_tiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"min_lifetime_points" integer DEFAULT 0 NOT NULL,
	"multiplier" text DEFAULT '1' NOT NULL,
	"color" text DEFAULT '#CD7F32' NOT NULL,
	"perks" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"deleted_at" text
);
--> statement-breakpoint
CREATE TABLE "membership_check_ins" (
	"id" serial PRIMARY KEY NOT NULL,
	"membership_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"notes" text,
	"checked_in_at" text
);
--> statement-breakpoint
CREATE TABLE "membership_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" text DEFAULT '0' NOT NULL,
	"billing_cycle" text DEFAULT 'monthly',
	"duration_days" integer DEFAULT 30,
	"features" jsonb,
	"max_check_ins" integer,
	"is_active" boolean DEFAULT true,
	"deleted_at" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"customer_id" integer NOT NULL,
	"plan_id" integer,
	"plan_name" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text,
	"status" text DEFAULT 'active',
	"check_ins_used" integer DEFAULT 0,
	"total_paid" text DEFAULT '0',
	"notes" text,
	"deleted_at" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text,
	"product_id" integer,
	"read_at" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "or_sequences" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"next_val" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_id" integer NOT NULL,
	"employee_user_id" text NOT NULL,
	"employee_name" text NOT NULL,
	"wage_type" text DEFAULT 'hourly' NOT NULL,
	"wage_rate" text DEFAULT '0' NOT NULL,
	"hours_worked" text DEFAULT '0',
	"base_amount" text DEFAULT '0' NOT NULL,
	"commission_amount" text DEFAULT '0',
	"tip_amount" text DEFAULT '0',
	"bonus_amount" text DEFAULT '0',
	"deduction_amount" text DEFAULT '0',
	"advance_amount" text DEFAULT '0',
	"net_amount" text DEFAULT '0' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "payroll_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_amount" text DEFAULT '0',
	"notes" text,
	"created_at" text,
	"finalized_at" text,
	"paid_at" text,
	"deleted_at" text
);
--> statement-breakpoint
CREATE TABLE "pending_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"branch_id" integer,
	"cashier_id" text,
	"customer_id" integer,
	"customer_name" text,
	"table_id" integer,
	"order_number" integer,
	"kitchen_status" text DEFAULT 'pending',
	"items" jsonb NOT NULL,
	"subtotal" text NOT NULL,
	"tax" text DEFAULT '0',
	"discount" text DEFAULT '0',
	"discount_code" text,
	"loyalty_discount" text DEFAULT '0',
	"tip" text DEFAULT '0',
	"total" text NOT NULL,
	"payment_method" text DEFAULT 'cash',
	"payment_amount" text,
	"change_amount" text,
	"status" text DEFAULT 'unpaid',
	"notes" text,
	"order_type" text,
	"deleted_at" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "product_modifiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"modifier_name" text NOT NULL,
	"price" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_recipes" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"ingredient_id" integer NOT NULL,
	"quantity" text DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_sizes" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"size_name" text NOT NULL,
	"price" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"branch_id" integer,
	"name" text NOT NULL,
	"price" text DEFAULT '0' NOT NULL,
	"category" text,
	"sku" text,
	"barcode" text,
	"tax_rate" text,
	"track_stock" boolean DEFAULT false,
	"stock" integer DEFAULT 0,
	"low_stock_threshold" integer DEFAULT 10,
	"has_sizes" boolean DEFAULT false,
	"has_modifiers" boolean DEFAULT false,
	"sizes" jsonb,
	"modifiers" jsonb,
	"expiry_date" text,
	"batch_number" text,
	"requires_prescription" boolean DEFAULT false,
	"generic_name" text,
	"deleted_at" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_order_id" integer NOT NULL,
	"product_id" integer,
	"product_name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_cost" text DEFAULT '0' NOT NULL,
	"total_cost" text DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"supplier_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"total_amount" text DEFAULT '0' NOT NULL,
	"notes" text,
	"expected_delivery_at" text,
	"ordered_at" text,
	"received_at" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" serial PRIMARY KEY NOT NULL,
	"sale_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"items" jsonb,
	"amount" text NOT NULL,
	"reason" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "revoked_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"jti" text NOT NULL,
	"user_id" text NOT NULL,
	"revoked_at" text,
	"expires_at" text NOT NULL,
	CONSTRAINT "revoked_tokens_jti_unique" UNIQUE("jti")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"role" text NOT NULL,
	"max_discount_percent" integer DEFAULT 100,
	"can_refund" boolean DEFAULT true,
	"can_delete_sale" boolean DEFAULT true,
	"can_void_order" boolean DEFAULT true,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tenant_id" text,
	"branch_id" integer,
	"cashier_id" text,
	"receipt_number" text,
	"or_number" text,
	"invoice_number" text,
	"customer_id" integer,
	"customer_name" text,
	"table_id" integer,
	"items" jsonb NOT NULL,
	"subtotal" text NOT NULL,
	"tax" text DEFAULT '0',
	"discount" text DEFAULT '0',
	"discount_code" text,
	"loyalty_discount" text DEFAULT '0',
	"tip" text DEFAULT '0',
	"total" text NOT NULL,
	"payment_method" text DEFAULT 'cash',
	"payment_amount" text,
	"change_amount" text,
	"notes" text,
	"deleted_at" text,
	"deleted_by" text,
	"void_reason" text,
	"refunded_at" text,
	"refunded_by" text,
	"discount_type" text DEFAULT 'regular',
	"sc_pwd_id" text,
	"vatable_sales" text DEFAULT '0',
	"vat_exempt_sales" text DEFAULT '0',
	"zero_rated_sales" text DEFAULT '0',
	"sale_hash" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "service_rooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"branch_id" integer,
	"name" text NOT NULL,
	"type" text DEFAULT 'room',
	"status" text DEFAULT 'available',
	"notes" text,
	"deleted_at" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "service_staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"branch_id" integer,
	"name" text NOT NULL,
	"specialty" text,
	"phone" text,
	"email" text,
	"color" text DEFAULT '#6366f1',
	"is_active" boolean DEFAULT true,
	"notes" text,
	"deleted_at" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"branch_id" integer,
	"status" text DEFAULT 'open' NOT NULL,
	"opening_balance" text DEFAULT '0' NOT NULL,
	"closing_balance" text,
	"total_sales" text DEFAULT '0',
	"total_expenses" text DEFAULT '0',
	"sales_count" integer DEFAULT 0,
	"notes" text,
	"opened_at" text,
	"closed_at" text
);
--> statement-breakpoint
CREATE TABLE "stock_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"previous_stock" integer NOT NULL,
	"new_stock" integer NOT NULL,
	"delta" integer NOT NULL,
	"reason" text DEFAULT 'manual',
	"note" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "subscription_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"plan" text NOT NULL,
	"billing_cycle" text NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paymongo_checkout_id" text,
	"checkout_url" text,
	"paid_at" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "supplier_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"unit_cost" text DEFAULT '0' NOT NULL,
	"min_order_qty" integer DEFAULT 1 NOT NULL,
	"lead_days" integer,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"contact_person" text,
	"phone" text,
	"email" text,
	"address" text,
	"notes" text,
	"deleted_at" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "tables" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"branch_id" integer,
	"name" text NOT NULL,
	"seats" integer DEFAULT 4,
	"status" text DEFAULT 'available' NOT NULL,
	"deleted_at" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "tenant_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"billing_cycle" text,
	"status" text DEFAULT 'active' NOT NULL,
	"current_period_start" text,
	"current_period_end" text,
	"cancel_at_period_end" boolean DEFAULT false,
	"created_at" text,
	"updated_at" text,
	CONSTRAINT "tenant_subscriptions_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" text,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "time_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"branch_id" integer,
	"clock_in" text NOT NULL,
	"clock_out" text,
	"notes" text,
	"deleted_at" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "user_branches" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"branch_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"store_name" text,
	"currency" text,
	"tax_rate" text,
	"address" text,
	"phone" text,
	"email_contact" text,
	"receipt_footer" text,
	"timezone" text,
	"loyalty_points_per_unit" text DEFAULT '1',
	"loyalty_redemption_rate" text DEFAULT '100',
	"loyalty_expiry_days" integer DEFAULT 0,
	"loyalty_birthday_bonus" integer DEFAULT 0,
	"loyalty_referral_bonus" integer DEFAULT 0,
	"loyalty_stamp_target" integer DEFAULT 10,
	"loyalty_stamp_enabled" integer DEFAULT 0,
	"business_type" text,
	"business_sub_type" text,
	"onboarding_complete" integer DEFAULT 0,
	"payment_methods" jsonb,
	"monthly_revenue_goal" text,
	"receipt_width" text DEFAULT '58mm',
	"receipt_title" text DEFAULT 'OFFICIAL RECEIPT',
	"receipt_header_text" text,
	"receipt_website" text,
	"receipt_show_address" integer DEFAULT 1,
	"receipt_show_phone" integer DEFAULT 1,
	"receipt_show_email" integer DEFAULT 0,
	"receipt_show_website" integer DEFAULT 0,
	"receipt_show_order_number" integer DEFAULT 1,
	"receipt_show_cashier" integer DEFAULT 0,
	"receipt_show_unit_price" integer DEFAULT 0,
	"receipt_show_powered_by" integer DEFAULT 1,
	"print_darkness" integer DEFAULT 65000,
	"receipt_font_size" integer DEFAULT 15,
	"wifi_ssid" text,
	"wifi_password" text,
	"wifi_duration_minutes" integer DEFAULT 60,
	"wifi_auto_issue" integer DEFAULT 0,
	"tin" text,
	"ptu_number" text,
	"accreditation_number" text,
	"accreditation_date" text,
	"machine_serial_number" text,
	"vat_registered" integer DEFAULT 1,
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"name" text,
	"avatar" text,
	"provider" text NOT NULL,
	"provider_id" text NOT NULL,
	"tenant_id" text,
	"role" text DEFAULT 'owner',
	"password_hash" text,
	"is_banned" boolean DEFAULT false,
	"banned_at" text,
	"ban_reason" text,
	"last_seen_at" text,
	"reset_token" text,
	"reset_token_expires" text,
	"wage_type" text DEFAULT 'none',
	"wage_rate" text DEFAULT '0',
	"commission_percent" text DEFAULT '0',
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "wifi_vouchers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"branch_id" integer,
	"code" text NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"status" text DEFAULT 'unused' NOT NULL,
	"sale_id" integer,
	"customer_name" text,
	"customer_email" text,
	"redeemed_at" text,
	"expires_at" text,
	"created_at" text
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_staff_id_service_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."service_staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_room_id_service_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."service_rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_tokens" ADD CONSTRAINT "invite_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_tokens" ADD CONSTRAINT "invite_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_tokens" ADD CONSTRAINT "invite_tokens_used_by_users_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_points_log" ADD CONSTRAINT "loyalty_points_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_points_log" ADD CONSTRAINT "loyalty_points_log_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_points_log" ADD CONSTRAINT "loyalty_points_log_reward_id_loyalty_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."loyalty_rewards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_tiers" ADD CONSTRAINT "loyalty_tiers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_check_ins" ADD CONSTRAINT "membership_check_ins_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_check_ins" ADD CONSTRAINT "membership_check_ins_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_check_ins" ADD CONSTRAINT "membership_check_ins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_plan_id_membership_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_period_id_payroll_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_employee_user_id_users_id_fk" FOREIGN KEY ("employee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_orders" ADD CONSTRAINT "pending_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_orders" ADD CONSTRAINT "pending_orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_orders" ADD CONSTRAINT "pending_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_orders" ADD CONSTRAINT "pending_orders_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_recipes" ADD CONSTRAINT "product_recipes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_recipes" ADD CONSTRAINT "product_recipes_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_rooms" ADD CONSTRAINT "service_rooms_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_rooms" ADD CONSTRAINT "service_rooms_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_staff" ADD CONSTRAINT "service_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_staff" ADD CONSTRAINT "service_staff_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_logs" ADD CONSTRAINT "stock_logs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_logs" ADD CONSTRAINT "stock_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tables" ADD CONSTRAINT "tables_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tables" ADD CONSTRAINT "tables_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_logs" ADD CONSTRAINT "time_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_logs" ADD CONSTRAINT "time_logs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wifi_vouchers" ADD CONSTRAINT "wifi_vouchers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wifi_vouchers" ADD CONSTRAINT "wifi_vouchers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wifi_vouchers" ADD CONSTRAINT "wifi_vouchers_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;