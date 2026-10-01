-- HR: attendance + salary. Also converts shop_memberships.permissions from a
-- native enum array to a plain text array so new permission keys never need
-- enum ALTERs (which cannot run inside a transaction).

-- AlterTable
ALTER TABLE "shop_memberships" ALTER COLUMN "permissions" TYPE TEXT[] USING "permissions"::text[];

-- NOTE: the old "ShopPermission" enum type is intentionally NOT dropped here.
-- Dropping it in the same transaction as the column rewrite trips a Postgres
-- catalog-cache bug ("cache lookup failed for type ..."). The type is simply
-- left unused; permission keys are validated by the API from now on.

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'HALF_DAY', 'PAID_LEAVE', 'WEEKLY_OFF');

-- CreateEnum
CREATE TYPE "SalaryPaymentStatus" AS ENUM ('PENDING', 'PAID');

-- CreateTable
CREATE TABLE "attendance" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "markedById" UUID,
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_structures" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "monthlySalary" DECIMAL(12,2) NOT NULL,
    "effectiveFrom" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_advances" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "advanceDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" VARCHAR(500),
    "givenById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_payments" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "monthlySalary" DECIMAL(12,2) NOT NULL,
    "totalDays" INTEGER NOT NULL,
    "presentDays" DECIMAL(5,2) NOT NULL,
    "absentDays" DECIMAL(5,2) NOT NULL,
    "leaveDays" DECIMAL(5,2) NOT NULL,
    "unmarkedDays" INTEGER NOT NULL DEFAULT 0,
    "grossPayable" DECIMAL(12,2) NOT NULL,
    "advances" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bonus" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netPayable" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "SalaryPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "paidById" UUID,
    "mode" VARCHAR(20),
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_shopId_membershipId_date_key" ON "attendance"("shopId", "membershipId", "date");

-- CreateIndex
CREATE INDEX "attendance_shopId_date_idx" ON "attendance"("shopId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "salary_structures_membershipId_key" ON "salary_structures"("membershipId");

-- CreateIndex
CREATE INDEX "salary_structures_shopId_idx" ON "salary_structures"("shopId");

-- CreateIndex
CREATE INDEX "salary_advances_shopId_advanceDate_idx" ON "salary_advances"("shopId", "advanceDate");

-- CreateIndex
CREATE INDEX "salary_advances_membershipId_idx" ON "salary_advances"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "salary_payments_shopId_membershipId_year_month_key" ON "salary_payments"("shopId", "membershipId", "year", "month");

-- CreateIndex
CREATE INDEX "salary_payments_shopId_year_month_idx" ON "salary_payments"("shopId", "year", "month");

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_advances" ADD CONSTRAINT "salary_advances_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
