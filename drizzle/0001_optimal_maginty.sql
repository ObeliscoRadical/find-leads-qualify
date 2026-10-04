ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "source_external_id" varchar(255);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_leads_source_external" ON "leads" USING btree ("organization_id","source_type","source_external_id");
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "contact_name" varchar(255);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "contact_phone" varchar(50);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "source_fields" text;
