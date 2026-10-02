-- Expense Tracker: add paidBy column to the existing expenses table
-- The standalone /api/v1/expenses module builds on the existing Expense model
-- (shopId-scoped, soft-delete, FinanceCategory relation) and adds who paid.

ALTER TABLE "expenses" ADD COLUMN "paidBy" VARCHAR(200);
