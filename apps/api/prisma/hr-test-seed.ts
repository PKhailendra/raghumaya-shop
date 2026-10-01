/** Minimal HR test seed: shop + owner + 3 staff. Run: DATABASE_URL=... npx tsx prisma/hr-test-seed.ts */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { hashPassword } from '../src/lib/crypto';
import { DEFAULT_ROLE_PERMISSIONS, SHOP_PERMISSIONS } from '@raghumaya/shared';

const prisma = new PrismaClient();

async function main() {
  const mk = async (email: string, phone: string, pass: string, name: string) => {
    const existing = await prisma.account.findFirst({ where: { email } });
    if (existing) return existing;
    return prisma.account.create({
      data: { email, phone, passwordHash: await hashPassword(pass), fullName: name, status: 'ACTIVE', emailVerifiedAt: new Date(), phoneVerifiedAt: new Date() },
    });
  };
  const owner = await mk('owner@demo.shop', '9000000002', 'Owner@123', 'Demo Owner');
  const shop = await prisma.shop.upsert({
    where: { slug: 'hr-test-shop' },
    update: {},
    create: { name: 'HR Test Shop', slug: 'hr-test-shop', ownerAccountId: owner.id, status: 'ACTIVE' },
  });

  const addMember = async (email: string, phone: string, pass: string, name: string, role: 'OWNER' | 'MANAGER' | 'CASHIER' | 'STAFF') => {
    const acc = await mk(email, phone, pass, name);
    const perms = role === 'OWNER' ? [...SHOP_PERMISSIONS] : [...(DEFAULT_ROLE_PERMISSIONS[role as 'MANAGER'] ?? [])];
    await prisma.shopMembership.upsert({
      where: { shopId_accountId: { shopId: shop.id, accountId: acc.id } },
      update: { role, permissions: perms as never, status: 'ACTIVE', deletedAt: null },
      create: { shopId: shop.id, accountId: acc.id, role, permissions: perms as never, status: 'ACTIVE' },
    });
  };
  await addMember('owner@demo.shop', '9000000002', 'Owner@123', 'Demo Owner', 'OWNER');
  await addMember('manager@demo.shop', '9000000003', 'Manager@123', 'Test Manager', 'MANAGER');
  await addMember('cashier@demo.shop', '9000000004', 'Cashier@123', 'Test Cashier', 'CASHIER');
  await addMember('staff@demo.shop', '9000000005', 'Staff@123', 'Test Staff', 'STAFF');
  console.log('HR test seed done. shopId =', shop.id);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
