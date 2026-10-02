-- Backfill HR permissions (ATTENDANCE_*, SALARY_*) for existing memberships.
-- Memberships created before the HR module have stored permission arrays
-- without the new keys. We ADD the role-default HR keys if missing;
-- we never remove existing permissions.

-- MANAGER: ATTENDANCE_VIEW, ATTENDANCE_MARK, SALARY_VIEW
UPDATE "ShopMembership"
SET permissions = ARRAY(
  SELECT DISTINCT unnest(permissions || ARRAY['ATTENDANCE_VIEW', 'ATTENDANCE_MARK', 'SALARY_VIEW'])
)
WHERE role = 'MANAGER'
  AND "deletedAt" IS NULL
  AND cardinality(permissions) > 0;

-- CASHIER: ATTENDANCE_VIEW
UPDATE "ShopMembership"
SET permissions = ARRAY(
  SELECT DISTINCT unnest(permissions || ARRAY['ATTENDANCE_VIEW'])
)
WHERE role = 'CASHIER'
  AND "deletedAt" IS NULL
  AND cardinality(permissions) > 0;

-- ACCOUNTANT: ATTENDANCE_VIEW, SALARY_VIEW, SALARY_MANAGE
UPDATE "ShopMembership"
SET permissions = ARRAY(
  SELECT DISTINCT unnest(permissions || ARRAY['ATTENDANCE_VIEW', 'SALARY_VIEW', 'SALARY_MANAGE'])
)
WHERE role = 'ACCOUNTANT'
  AND "deletedAt" IS NULL
  AND cardinality(permissions) > 0;

-- INVENTORY_STAFF: ATTENDANCE_VIEW
UPDATE "ShopMembership"
SET permissions = ARRAY(
  SELECT DISTINCT unnest(permissions || ARRAY['ATTENDANCE_VIEW'])
)
WHERE role = 'INVENTORY_STAFF'
  AND "deletedAt" IS NULL
  AND cardinality(permissions) > 0;

-- STAFF: ATTENDANCE_VIEW
UPDATE "ShopMembership"
SET permissions = ARRAY(
  SELECT DISTINCT unnest(permissions || ARRAY['ATTENDANCE_VIEW'])
)
WHERE role = 'STAFF'
  AND "deletedAt" IS NULL
  AND cardinality(permissions) > 0;
