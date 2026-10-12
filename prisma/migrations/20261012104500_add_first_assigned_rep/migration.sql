-- AlterTable
ALTER TABLE "leads" ADD COLUMN "first_assigned_rep_id" UUID,
ADD COLUMN "first_assigned_at" TIMESTAMPTZ(6);

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_first_assigned_rep_id_fkey" FOREIGN KEY ("first_assigned_rep_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
