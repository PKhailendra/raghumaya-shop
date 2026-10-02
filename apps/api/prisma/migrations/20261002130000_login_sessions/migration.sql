-- Login session tracking for staff attendance (login/logout times)
CREATE TABLE "login_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "accountId" UUID NOT NULL,
  "shopId" UUID,
  "loginAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "logoutAt" TIMESTAMPTZ,
  "ipAddress" VARCHAR(50),
  "userAgent" VARCHAR(500),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "login_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "login_sessions_accountId_loginAt_idx" ON "login_sessions"("accountId", "loginAt");
CREATE INDEX "login_sessions_shopId_loginAt_idx" ON "login_sessions"("shopId", "loginAt");
