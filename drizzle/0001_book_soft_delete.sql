ALTER TABLE "books" ALTER COLUMN "home_shelf_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "deleted_at" timestamp with time zone;