-- AlterTable
ALTER TABLE "lost_relic" ADD COLUMN     "appraisal_cost" INTEGER,
ADD COLUMN     "appraisal_result_item_id" INTEGER;

-- AddForeignKey
ALTER TABLE "lost_relic" ADD CONSTRAINT "lost_relic_appraisal_result_item_id_fkey" FOREIGN KEY ("appraisal_result_item_id") REFERENCES "item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
