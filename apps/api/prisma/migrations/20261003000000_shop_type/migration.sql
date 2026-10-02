-- Shop type classification for tenant shops (shown in super-admin panel, selectable at shop creation)
CREATE TYPE "ShopType" AS ENUM ('RETAIL', 'WHOLESALE', 'DISTRIBUTOR', 'SERVICE', 'MANUFACTURING', 'ONLINE', 'OTHER');
ALTER TABLE "shops" ADD COLUMN "shopType" "ShopType" NOT NULL DEFAULT 'RETAIL';
