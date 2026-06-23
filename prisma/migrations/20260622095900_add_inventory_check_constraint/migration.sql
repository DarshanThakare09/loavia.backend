-- AlterTable
ALTER TABLE "inventories" ADD CONSTRAINT "chk_available_qty_positive" CHECK (available_qty >= 0);
