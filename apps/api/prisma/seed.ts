/**
 * RaghuMayaShop demo seed.
 * Run with: npm run db:seed
 * Idempotent-ish: skips if the demo shop already exists.
 *
 * Creates:
 * - super admin admin@raghumaya.shop / Admin@123
 * - demo owner owner@demo.shop / Owner@123 + shop "Raghu Maya General Store"
 * - 4 subscription plans, PROFESSIONAL trial for the demo shop
 * - 4 categories, ~25 Indian general-store products with stock ledger entries
 * - 10 customers, 15 invoices (PAID / PARTIALLY_PAID / ISSUED) with items + payments
 * - finance categories + sample revenues/expenses/assets/liabilities
 * - a referral code for the demo shop
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { hashPassword } from '../src/lib/crypto';

const prisma = new PrismaClient();
const D = (v: string | number) => new Prisma.Decimal(v);

const PRODUCTS: Array<{
  name: string; category: string; unit: string; purchasePrice: string; sellingPrice: string;
  mrp: string; taxRate: string; hsn: string; stock: string; reorder: string;
}> = [
  { name: 'Aashirvaad Atta 10kg', category: 'Grocery', unit: 'bag', purchasePrice: '385', sellingPrice: '440', mrp: '488', taxRate: '0', hsn: '11010000', stock: '42', reorder: '10' },
  { name: 'India Gate Basmati Rice 5kg', category: 'Grocery', unit: 'bag', purchasePrice: '545', sellingPrice: '625', mrp: '699', taxRate: '0', hsn: '10063020', stock: '30', reorder: '8' },
  { name: 'Fortune Sunflower Oil 1L', category: 'Grocery', unit: 'bottle', purchasePrice: '128', sellingPrice: '149', mrp: '165', taxRate: '5', hsn: '15121910', stock: '60', reorder: '12' },
  { name: 'Tata Salt 1kg', category: 'Grocery', unit: 'packet', purchasePrice: '24', sellingPrice: '28', mrp: '32', taxRate: '0', hsn: '25010010', stock: '120', reorder: '20' },
  { name: 'Toor Dal Unpolished 1kg', category: 'Grocery', unit: 'packet', purchasePrice: '142', sellingPrice: '165', mrp: '185', taxRate: '0', hsn: '07136000', stock: '48', reorder: '10' },
  { name: 'Parle-G Gold 200g', category: 'Snacks', unit: 'packet', purchasePrice: '22', sellingPrice: '25', mrp: '30', taxRate: '18', hsn: '19053100', stock: '200', reorder: '40' },
  { name: 'Maggi Noodles 12-pack', category: 'Snacks', unit: 'pack', purchasePrice: '145', sellingPrice: '168', mrp: '180', taxRate: '18', hsn: '19023010', stock: '90', reorder: '20' },
  { name: 'Haldiram Bhujia 400g', category: 'Snacks', unit: 'packet', purchasePrice: '98', sellingPrice: '115', mrp: '130', taxRate: '18', hsn: '21069099', stock: '75', reorder: '15' },
  { name: 'Balaji Wafers Masala 150g', category: 'Snacks', unit: 'packet', purchasePrice: '32', sellingPrice: '38', mrp: '45', taxRate: '18', hsn: '20052000', stock: '110', reorder: '25' },
  { name: 'Amul Taaza Milk 500ml', category: 'Dairy', unit: 'packet', purchasePrice: '30', sellingPrice: '33', mrp: '35', taxRate: '0', hsn: '04012000', stock: '80', reorder: '30' },
  { name: 'Amul Butter 100g', category: 'Dairy', unit: 'pack', purchasePrice: '52', sellingPrice: '58', mrp: '62', taxRate: '12', hsn: '04051000', stock: '55', reorder: '15' },
  { name: 'Mother Dairy Curd 400g', category: 'Dairy', unit: 'cup', purchasePrice: '38', sellingPrice: '42', mrp: '45', taxRate: '0', hsn: '04031000', stock: '65', reorder: '20' },
  { name: 'Amul Cheese Slices 200g', category: 'Dairy', unit: 'pack', purchasePrice: '128', sellingPrice: '142', mrp: '150', taxRate: '12', hsn: '04061000', stock: '35', reorder: '10' },
  { name: 'Coca-Cola 750ml', category: 'Beverages', unit: 'bottle', purchasePrice: '36', sellingPrice: '42', mrp: '45', taxRate: '28', hsn: '22021010', stock: '140', reorder: '30' },
  { name: 'Tata Tea Gold 500g', category: 'Beverages', unit: 'packet', purchasePrice: '245', sellingPrice: '275', mrp: '300', taxRate: '5', hsn: '09023010', stock: '52', reorder: '12' },
  { name: 'Nescafe Classic 100g', category: 'Beverages', unit: 'jar', purchasePrice: '295', sellingPrice: '330', mrp: '360', taxRate: '18', hsn: '21011110', stock: '38', reorder: '10' },
  { name: 'Real Mango Juice 1L', category: 'Beverages', unit: 'pack', purchasePrice: '105', sellingPrice: '118', mrp: '130', taxRate: '18', hsn: '20097900', stock: '70', reorder: '15' },
  { name: 'Surf Excel Easy Wash 1kg', category: 'Grocery', unit: 'packet', purchasePrice: '118', sellingPrice: '135', mrp: '150', taxRate: '18', hsn: '34025000', stock: '58', reorder: '12' },
  { name: 'Vim Bar 200g (Pack of 3)', category: 'Grocery', unit: 'pack', purchasePrice: '88', sellingPrice: '99', mrp: '110', taxRate: '18', hsn: '34012000', stock: '85', reorder: '20' },
  { name: 'Colgate MaxFresh 150g', category: 'Grocery', unit: 'tube', purchasePrice: '92', sellingPrice: '105', mrp: '118', taxRate: '18', hsn: '33061010', stock: '66', reorder: '15' },
  { name: 'Lifebuoy Soap 100g (Pack of 4)', category: 'Grocery', unit: 'pack', purchasePrice: '108', sellingPrice: '122', mrp: '135', taxRate: '18', hsn: '34011110', stock: '72', reorder: '18' },
  { name: 'Harpic 1L', category: 'Grocery', unit: 'bottle', purchasePrice: '178', sellingPrice: '198', mrp: '215', taxRate: '18', hsn: '34025000', stock: '44', reorder: '10' },
  { name: 'Dabur Amla Hair Oil 200ml', category: 'Grocery', unit: 'bottle', purchasePrice: '128', sellingPrice: '145', mrp: '160', taxRate: '18', hsn: '33059011', stock: '40', reorder: '10' },
  { name: 'Nivea Soft Cream 100ml', category: 'Grocery', unit: 'jar', purchasePrice: '165', sellingPrice: '185', mrp: '205', taxRate: '18', hsn: '33049910', stock: '33', reorder: '8' },
  { name: 'Clinic Plus Shampoo 650ml', category: 'Grocery', unit: 'bottle', purchasePrice: '345', sellingPrice: '385', mrp: '425', taxRate: '18', hsn: '33051010', stock: '28', reorder: '8' },
];

const CUSTOMERS = [
  { name: 'Ramesh Gupta', phone: '9876501001', address: '12 MG Road', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' },
  { name: 'Sunita Sharma', phone: '9876501002', address: '45 Nehru Nagar', city: 'Jaipur', state: 'Rajasthan', pincode: '302002' },
  { name: 'Amit Verma', phone: '9876501003', address: '78 Station Road', city: 'Jaipur', state: 'Rajasthan', pincode: '302003' },
  { name: 'Priya Singh', phone: '9876501004', address: '23 Gandhi Chowk', city: 'Jaipur', state: 'Rajasthan', pincode: '302004' },
  { name: 'Vikash Yadav', phone: '9876501005', address: '9 Patel Marg', city: 'Jaipur', state: 'Rajasthan', pincode: '302005' },
  { name: 'Meena Kumari', phone: '9876501006', address: '56 Shastri Nagar', city: 'Jaipur', state: 'Rajasthan', pincode: '302006' },
  { name: 'Rahul Jain', phone: '9876501007', address: '34 Johari Bazaar', city: 'Jaipur', state: 'Rajasthan', pincode: '302007' },
  { name: 'Kavita Meena', phone: '9876501008', address: '67 Vaishali Nagar', city: 'Jaipur', state: 'Rajasthan', pincode: '302008' },
  { name: 'Suresh Choudhary', phone: '9876501009', address: '89 Malviya Nagar', city: 'Jaipur', state: 'Rajasthan', pincode: '302009' },
  { name: 'Anita Agarwal', phone: '9876501010', address: '21 C-Scheme', city: 'Jaipur', state: 'Rajasthan', pincode: '302010' },
];

function gstSplit(taxable: Prisma.Decimal, gstRate: Prisma.Decimal) {
  const gst = taxable.mul(gstRate).div(100);
  const half = gst.div(2);
  return { cgst: half, sgst: gst.sub(half), gst };
}

async function main() {
  const existing = await prisma.shop.findFirst({ where: { name: 'Raghu Maya General Store', deletedAt: null } });
  if (existing) {
    console.log('Demo shop already exists — skipping seed.');
    return;
  }

  /* ------------------------------ plans ------------------------------ */
  const planDefs = [
    { code: 'FREE' as const, name: 'Free', monthlyPrice: '0', yearlyPrice: '0', trialDays: 0, features: ['inventory', 'basic-billing'], limits: { maxProducts: 50, maxInvoicesPerMonth: 20, maxUsers: 2, maxShops: 1, maxCustomers: 100 }, sortOrder: 0 },
    { code: 'STARTER' as const, name: 'Starter', monthlyPrice: '499', yearlyPrice: '4990', trialDays: 14, features: ['inventory', 'basic-billing', 'customers', 'finance'], limits: { maxProducts: 500, maxInvoicesPerMonth: 200, maxUsers: 5, maxShops: 1, maxCustomers: 1000 }, sortOrder: 1 },
    { code: 'PROFESSIONAL' as const, name: 'Professional', monthlyPrice: '999', yearlyPrice: '9990', trialDays: 14, features: ['inventory', 'basic-billing', 'customers', 'finance', 'analytics', 'barcode', 'multi-warehouse', 'reminders'], limits: { maxProducts: 5000, maxInvoicesPerMonth: 2000, maxUsers: 15, maxShops: 3, maxCustomers: 10000 }, sortOrder: 2 },
    { code: 'ENTERPRISE' as const, name: 'Enterprise', monthlyPrice: '2499', yearlyPrice: '24990', trialDays: 30, features: ['inventory', 'basic-billing', 'customers', 'finance', 'analytics', 'barcode', 'multi-warehouse', 'reminders', 'api-access', 'priority-support'], limits: { maxProducts: 100000, maxInvoicesPerMonth: 50000, maxUsers: 100, maxShops: 20, maxCustomers: 1000000 }, sortOrder: 3 },
  ];
  for (const p of planDefs) {
    await prisma.subscriptionPlan.upsert({
      where: { code: p.code },
      update: {},
      create: { code: p.code, name: p.name, monthlyPrice: D(p.monthlyPrice), yearlyPrice: D(p.yearlyPrice), trialDays: p.trialDays, features: p.features, limits: p.limits, sortOrder: p.sortOrder },
    });
  }

  /* --------------------------- super admin --------------------------- */
  await prisma.admin.upsert({
    where: { email: 'admin@raghumaya.shop' },
    update: {},
    create: { fullName: 'Platform Super Admin', email: 'admin@raghumaya.shop', phone: '9000000001', passwordHash: await hashPassword('Admin@123'), role: 'SUPER_ADMIN', status: 'ACTIVE', emailVerifiedAt: new Date() },
  });

  /* --------------------------- demo owner ---------------------------- */
  const owner = await prisma.account.upsert({
    where: { email: 'owner@demo.shop' },
    update: {},
    create: { fullName: 'Demo Owner', email: 'owner@demo.shop', phone: '9000000002', passwordHash: await hashPassword('Owner@123'), status: 'ACTIVE', emailVerifiedAt: new Date(), phoneVerifiedAt: new Date() },
  });

  /* ------------------------------ shop ------------------------------- */
  const shop = await prisma.shop.create({
    data: {
      name: 'Raghu Maya General Store',
      ownerAccountId: owner.id,
      phone: '9000000003',
      email: 'store@demo.shop',
      address: '123 Bazaar Road, Johari Bazaar',
      city: 'Jaipur',
      state: 'Rajasthan',
      pincode: '302003',
      gstNumber: '08ABCDE1234F1Z5',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
    },
  });
  await prisma.shopMembership.create({
    data: { shopId: shop.id, accountId: owner.id, role: 'OWNER', status: 'ACTIVE', permissions: [], joinedAt: new Date() },
  });
  const warehouse = await prisma.warehouse.create({ data: { shopId: shop.id, name: 'Main Warehouse', code: 'MAIN', isDefault: true } });

  /* -------------------------- subscription --------------------------- */
  const proPlan = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { code: 'PROFESSIONAL' } });
  await prisma.subscription.create({
    data: { shopId: shop.id, planId: proPlan.id, status: 'TRIAL', billingCycle: 'MONTHLY', startDate: new Date(), trialEndsAt: new Date(Date.now() + 14 * 86400000), amount: D(0), autoRenew: true },
  });

  /* --------------------------- categories ---------------------------- */
  // Four demo categories; household & personal-care SKUs live under Grocery (general store).
  const catNames = ['Grocery', 'Snacks', 'Dairy', 'Beverages'];
  const catMap = new Map<string, string>();
  for (const name of catNames) {
    const c = await prisma.category.create({ data: { shopId: shop.id, name, description: `${name} items` } });
    catMap.set(name, c.id);
  }

  /* ---------------------------- products ----------------------------- */
  const productIds: string[] = [];
  for (const p of PRODUCTS) {
    const product = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: catMap.get(p.category)!,
        name: p.name,
        sku: `RMS-${p.name.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X')}-${productIds.length + 1}`,
        unit: p.unit,
        purchasePrice: D(p.purchasePrice),
        sellingPrice: D(p.sellingPrice),
        mrp: D(p.mrp),
        taxRate: D(p.taxRate),
        hsnCode: p.hsn,
        currentStock: D(0),
        reorderLevel: D(p.reorder),
      },
    });
    productIds.push(product.id);
    // ledger-first stock-in
    const qty = D(p.stock);
    await prisma.stockMovement.create({
      data: { shopId: shop.id, warehouseId: warehouse.id, productId: product.id, type: 'IN', quantity: qty, unitCost: D(p.purchasePrice), referenceType: 'MANUAL', notes: 'Opening stock (seed)', createdById: owner.id },
    });
    await prisma.stockLevel.create({
      data: { shopId: shop.id, warehouseId: warehouse.id, productId: product.id, quantity: qty },
    });
    await prisma.product.update({ where: { id: product.id }, data: { currentStock: qty } });
  }

  /* ---------------------------- customers ---------------------------- */
  const customerIds: string[] = [];
  for (const c of CUSTOMERS) {
    const customer = await prisma.customer.create({ data: { shopId: shop.id, ...c, creditLimit: D(5000) } });
    customerIds.push(customer.id);
  }

  /* ---------------------------- invoices ----------------------------- */
  const year = new Date().getFullYear();
  const states: Array<'PAID' | 'PARTIALLY_PAID' | 'ISSUED'> = ['PAID', 'PAID', 'PAID', 'PAID', 'PAID', 'PAID', 'PARTIALLY_PAID', 'PARTIALLY_PAID', 'PARTIALLY_PAID', 'PARTIALLY_PAID', 'ISSUED', 'ISSUED', 'ISSUED', 'ISSUED', 'ISSUED'];
  const seededProducts = await prisma.product.findMany({ where: { id: { in: productIds } } });
  for (let i = 0; i < 15; i++) {
    const customerId = customerIds[i % customerIds.length];
    const status = states[i];
    const itemCount = 2 + (i % 3);
    const items: Array<{ productId: string; description: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; gstRate: Prisma.Decimal; hsnCode: string | null }> = [];
    for (let j = 0; j < itemCount; j++) {
      const prod = seededProducts[(i * 3 + j) % seededProducts.length];
      items.push({ productId: prod.id, description: prod.name, quantity: D(String(1 + ((i + j) % 4))), unitPrice: prod.sellingPrice, gstRate: prod.taxRate, hsnCode: prod.hsnCode });
    }
    let subtotal = D(0), discountTotal = D(0), taxableTotal = D(0), cgst = D(0), sgst = D(0), taxTotal = D(0);
    const lineData = items.map((it) => {
      const gross = it.quantity.mul(it.unitPrice);
      const taxable = gross;
      const split = gstSplit(taxable, it.gstRate);
      const lineTotal = taxable.add(split.gst);
      subtotal = subtotal.add(gross);
      taxableTotal = taxableTotal.add(taxable);
      cgst = cgst.add(split.cgst);
      sgst = sgst.add(split.sgst);
      taxTotal = taxTotal.add(split.gst);
      return { ...it, lineGross: gross, discountAmount: D(0), taxableAmount: taxable, gstAmount: split.gst, cgstAmount: split.cgst, sgstAmount: split.sgst, igstAmount: D(0), lineTotal };
    });
    const totalAmount = taxableTotal.add(taxTotal);
    const invoice = await prisma.invoice.create({
      data: {
        shopId: shop.id,
        customerId,
        invoiceNumber: `INV-${year}-${String(i + 1).padStart(4, '0')}`,
        status,
        issueDate: new Date(Date.now() - (14 - i) * 86400000),
        dueDate: new Date(Date.now() + (15 - i) * 86400000),
        placeOfSupply: 'Rajasthan',
        subtotal, discountTotal, taxableTotal, cgstTotal: cgst, sgstTotal: sgst, igstTotal: D(0), taxTotal, totalAmount,
        paidAmount: D(0),
        createdById: owner.id,
        items: { create: lineData },
      },
    });
    // stock OUT movements for the sale
    for (const it of items) {
      await prisma.stockMovement.create({
        data: { shopId: shop.id, warehouseId: warehouse.id, productId: it.productId, type: 'SALE', quantity: it.quantity, referenceType: 'SALE', referenceId: invoice.id, notes: `Sale via ${invoice.invoiceNumber}`, createdById: owner.id },
      });
      const level = await prisma.stockLevel.findFirst({ where: { shopId: shop.id, warehouseId: warehouse.id, productId: it.productId, variantId: null, batchId: null } });
      if (level) await prisma.stockLevel.update({ where: { id: level.id }, data: { quantity: level.quantity.sub(it.quantity) } });
      await prisma.product.update({ where: { id: it.productId }, data: { currentStock: { decrement: it.quantity } } });
    }
    // payments
    let paid = D(0);
    if (status === 'PAID') paid = totalAmount;
    else if (status === 'PARTIALLY_PAID') paid = totalAmount.div(2);
    if (paid.gt(0)) {
      await prisma.payment.create({
        data: { shopId: shop.id, invoiceId: invoice.id, customerId, amount: paid, mode: i % 2 === 0 ? 'UPI' : 'CASH', direction: 'IN', paymentDate: new Date(), receivedById: owner.id },
      });
      await prisma.invoice.update({ where: { id: invoice.id }, data: { paidAmount: paid } });
      await prisma.customer.update({ where: { id: customerId }, data: { outstandingBalance: { increment: totalAmount.sub(paid) } } });
    } else {
      await prisma.customer.update({ where: { id: customerId }, data: { outstandingBalance: { increment: totalAmount } } });
    }
  }

  /* ----------------------------- finance ----------------------------- */
  const finCats = [
    { name: 'Sales Income', type: 'INCOME' },
    { name: 'Service Income', type: 'INCOME' },
    { name: 'Rent', type: 'EXPENSE' },
    { name: 'Salaries', type: 'EXPENSE' },
    { name: 'Utilities', type: 'EXPENSE' },
    { name: 'Inventory Purchase', type: 'EXPENSE' },
  ];
  const finCatMap = new Map<string, string>();
  for (const c of finCats) {
    const row = await prisma.financeCategory.create({ data: { shopId: shop.id, name: c.name, type: c.type } });
    finCatMap.set(c.name, row.id);
  }
  const revSamples: Array<[string, string, string]> = [
    ['Service Income', 'Repair service charges', '2500'],
    ['Service Income', 'Delivery charges collected', '1200'],
    ['Sales Income', 'Bulk order advance', '15000'],
  ];
  for (const [cat, title, amount] of revSamples) {
    await prisma.revenue.create({ data: { shopId: shop.id, categoryId: finCatMap.get(cat)!, title, amount: D(amount), revenueDate: new Date(Date.now() - 5 * 86400000), source: 'MANUAL', receivedById: owner.id } });
  }
  const expSamples: Array<[string, string, string]> = [
    ['Rent', 'Shop rent - September', '12000'],
    ['Salaries', 'Staff salary - September', '25000'],
    ['Utilities', 'Electricity bill', '3200'],
    ['Inventory Purchase', 'Wholesale stock purchase', '45000'],
  ];
  for (const [cat, title, amount] of expSamples) {
    await prisma.expense.create({ data: { shopId: shop.id, categoryId: finCatMap.get(cat)!, title, amount: D(amount), expenseDate: new Date(Date.now() - 3 * 86400000), paymentMode: 'BANK_TRANSFER', createdById: owner.id } });
  }
  await prisma.asset.create({ data: { shopId: shop.id, name: 'Refrigerator - Godrej', assetType: 'Equipment', purchaseValue: D(35000), currentValue: D(30000), purchaseDate: new Date('2025-06-01'), status: 'ACTIVE' } });
  await prisma.asset.create({ data: { shopId: shop.id, name: 'Billing Counter Setup', assetType: 'Furniture', purchaseValue: D(20000), currentValue: D(18000), purchaseDate: new Date('2025-07-15'), status: 'ACTIVE' } });
  await prisma.liability.create({ data: { shopId: shop.id, name: 'Wholesaler credit - Sharma Traders', liabilityType: 'Supplier Credit', totalAmount: D(60000), outstandingAmount: D(25000), dueDate: new Date(Date.now() + 20 * 86400000), status: 'OPEN' } });

  /* ---------------------------- referral ----------------------------- */
  await prisma.referralCode.create({
    data: { shopId: shop.id, code: 'RAGHU10', createdByType: 'account', createdById: owner.id, status: 'ACTIVE', rewardAmount: D(500) },
  });

  console.log('Seed complete:');
  console.log('  super admin: admin@raghumaya.shop / Admin@123');
  console.log('  demo owner:  owner@demo.shop / Owner@123');
  console.log(`  shop: ${shop.name} (${shop.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
