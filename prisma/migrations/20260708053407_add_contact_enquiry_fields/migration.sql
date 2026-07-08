-- AlterTable
ALTER TABLE "contact_messages" ADD COLUMN     "enquiry_type" VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "is_read" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phone" VARCHAR(20);
