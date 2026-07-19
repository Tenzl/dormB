CREATE TABLE "merchant_shipper_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"vehicle_type" text NOT NULL,
	"availability" text NOT NULL,
	"experience" text NOT NULL,
	"note" text,
	"status" text NOT NULL,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"merchant_id" text,
	"trip_id" text,
	"event_type" text NOT NULL,
	"payload_json" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"pickup_point_name" text NOT NULL,
	"pickup_latitude" double precision NOT NULL,
	"pickup_longitude" double precision NOT NULL,
	"map_x_ratio" double precision NOT NULL,
	"map_y_ratio" double precision NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "buildings_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_json" text NOT NULL,
	"status_code" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_shippers" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"is_active" boolean NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mock_location_states" (
	"trip_id" text PRIMARY KEY NOT NULL,
	"waypoint_index" integer NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"map_x_ratio" double precision NOT NULL,
	"map_y_ratio" double precision NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"playback_status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mock_gps_waypoints" (
	"id" text PRIMARY KEY NOT NULL,
	"route_key" text NOT NULL,
	"waypoint_index" integer NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"map_x_ratio" double precision NOT NULL,
	"map_y_ratio" double precision NOT NULL,
	"offset_seconds" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "in_app_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"trip_id" text,
	"stop_id" text,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"deduplication_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "in_app_notifications_deduplication_key_unique" UNIQUE("deduplication_key")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"building_id" text NOT NULL,
	"product_id" text NOT NULL,
	"status" text NOT NULL,
	"ready_at" timestamp with time zone,
	"delivery_attempt" integer DEFAULT 1 NOT NULL,
	"trip_id" text,
	"stop_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"price" integer NOT NULL,
	"category" text NOT NULL,
	"freshness_risk" text NOT NULL,
	"is_available" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"recommendation_type" text NOT NULL,
	"snapshot_json" text NOT NULL,
	"policy_json" text NOT NULL,
	"current_route_json" text NOT NULL,
	"proposed_route_json" text NOT NULL,
	"solver_metrics_json" text NOT NULL,
	"explanation_json" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"activated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "delivery_stops" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"building_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"pass_type" text NOT NULL,
	"status" text NOT NULL,
	"temporarily_unavailable" boolean DEFAULT false NOT NULL,
	"arrived_at" timestamp with time zone,
	"minimum_wait_ends_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_trips" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"shipper_student_id" text NOT NULL,
	"status" text NOT NULL,
	"current_stop_id" text,
	"route_version" integer DEFAULT 1 NOT NULL,
	"countdown_ends_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"password_hash" text NOT NULL,
	"roles_json" text NOT NULL,
	"building_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "applications_merchant_status_idx" ON "merchant_shipper_applications" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "audit_merchant_created_idx" ON "audit_events" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_trip_created_idx" ON "audit_events" USING btree ("trip_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_actor_action_key" ON "idempotency_records" USING btree ("actor_user_id","action","key");--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_membership" ON "merchant_shippers" USING btree ("student_id") WHERE "merchant_shippers"."is_active" = true;--> statement-breakpoint
CREATE INDEX "memberships_merchant_id_idx" ON "merchant_shippers" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "merchants_owner_user_id_idx" ON "merchants" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "merchants_status_idx" ON "merchants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "in_app_notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_merchant_status_trip_idx" ON "orders" USING btree ("merchant_id","status","trip_id");--> statement-breakpoint
CREATE INDEX "orders_student_id_idx" ON "orders" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "orders_trip_id_idx" ON "orders" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "products_merchant_id_idx" ON "products" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "recommendations_trip_status_idx" ON "route_recommendations" USING btree ("trip_id","status");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stops_trip_pass_building" ON "delivery_stops" USING btree ("trip_id","pass_type","building_id");--> statement-breakpoint
CREATE INDEX "stops_trip_sequence_idx" ON "delivery_stops" USING btree ("trip_id","sequence");--> statement-breakpoint
CREATE INDEX "trips_shipper_status_idx" ON "delivery_trips" USING btree ("shipper_student_id","status");--> statement-breakpoint
CREATE INDEX "trips_merchant_status_idx" ON "delivery_trips" USING btree ("merchant_id","status");