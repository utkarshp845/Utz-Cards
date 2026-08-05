CREATE TYPE "public"."inventory_status" AS ENUM('intake', 'identified', 'available', 'listed', 'sold', 'shipped');--> statement-breakpoint
CREATE TYPE "public"."price_kind" AS ENUM('ask', 'sold');--> statement-breakpoint
CREATE TYPE "public"."price_source" AS ENUM('ebay_active', 'sportscardspro', 'manual_comp');--> statement-breakpoint
CREATE TABLE "card_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"model" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sport" text NOT NULL,
	"year" integer NOT NULL,
	"brand" text,
	"set_name" text NOT NULL,
	"card_number" text NOT NULL,
	"player_name" text NOT NULL,
	"variation" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"image_url" text,
	"source" text NOT NULL,
	"source_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cards_natural_key" UNIQUE NULLS NOT DISTINCT("year","set_name","card_number","player_name","variation")
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"card_id" uuid,
	"status" "inventory_status" DEFAULT 'intake' NOT NULL,
	"condition" text,
	"grader" text,
	"grade" text,
	"cert_number" text,
	"acquisition_cost_cents" integer,
	"acquired_at" timestamp with time zone,
	"front_image_path" text,
	"back_image_path" text,
	"intake_extraction" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"source" "price_source" NOT NULL,
	"kind" "price_kind" NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"grader" text,
	"grade" text,
	"condition" text,
	"url" text,
	"raw" jsonb,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_id" uuid NOT NULL,
	"sale_price_cents" integer NOT NULL,
	"fees_cents" integer DEFAULT 0 NOT NULL,
	"shipping_charged_cents" integer DEFAULT 0 NOT NULL,
	"channel" text NOT NULL,
	"buyer_ref" text,
	"sold_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"carrier" text,
	"service" text,
	"tracking_number" text,
	"label_cost_cents" integer,
	"easypost_shipment_id" text,
	"label_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_embeddings" ADD CONSTRAINT "card_embeddings_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_inventory_id_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventory"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "card_embeddings_card_model_key" ON "card_embeddings" USING btree ("card_id","model");--> statement-breakpoint
CREATE INDEX "card_embeddings_hnsw_idx" ON "card_embeddings" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16,ef_construction=64);--> statement-breakpoint
CREATE INDEX "cards_player_idx" ON "cards" USING btree ("player_name");--> statement-breakpoint
CREATE INDEX "cards_set_idx" ON "cards" USING btree ("year","set_name");--> statement-breakpoint
CREATE INDEX "cards_player_trgm_idx" ON "cards" USING gin ("player_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "cards_fts_idx" ON "cards" USING gin (to_tsvector('english',
        "player_name" || ' ' ||
        "set_name" || ' ' ||
        "card_number" || ' ' ||
        coalesce("variation", '') || ' ' ||
        "year"::text
      ));--> statement-breakpoint
CREATE INDEX "inventory_owner_status_idx" ON "inventory" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "inventory_card_idx" ON "inventory" USING btree ("card_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_cert_key" ON "inventory" USING btree ("grader","cert_number");--> statement-breakpoint
CREATE INDEX "price_obs_card_observed_idx" ON "price_observations" USING btree ("card_id","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "price_obs_kind_idx" ON "price_observations" USING btree ("card_id","kind","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sales_sold_at_idx" ON "sales" USING btree ("sold_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "shipments_tracking_idx" ON "shipments" USING btree ("tracking_number");