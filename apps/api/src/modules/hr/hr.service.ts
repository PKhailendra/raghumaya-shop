import { Prisma } from '@prisma/client';
import {
  type AttendanceStatus,
} from '@raghumaya/shared';
import { prisma } from '../../lib/prisma';
import { HttpError } from '../../middleware/errorHandler';

const D = (v: string | number) => new Prisma.Decimal(v);

interface StaffMember {
  membershipId: string;
  accountId: string;
  name: string;
  email?: string;
  phone?: string;
  role: string;
}

/** Active non-owner staff for attendance/salary. */
export async function staffList(shopId: string): Promise<StaffMember[]> {
  const rows = await prisma.shopMembership.findMany({
    where: { shopId, deletedAt: null, status: 'ACTIVE', role: { not: 'OWNER' } },
    include: { account: { select: { id: true, fullName: true, email: true, phone: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((m) => ({
    membershipId: m.id,
    accountId: m.accountId,
    name: m.account?.fullName ?? '',
    email: m.account?.email ?? undefined,
    phone: m.account?.phone ?? undefined,
    role: m.role,
  }));
}

async function ensureMember(shopId: string, membershipId: string) {
  const m = await prisma.shopMembership.findFirst({
    where: { id: membershipId, shopId, deletedAt: null, status: 'ACTIVE' },
  });
  if (!m) throw new HttpError(404, 'MEMBER_NOT_FOUND', 'Staff member not found in this shop');
  return m;
}

function parseDate(s: string): Date {
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, 'INVALID_DATE', 'Date must be YYYY-MM-DD');
  return d;
}

export async function getAttendance(
  shopId: string,
  q: { date?: string; fromDate?: string; toDate?: string; membershipId?: string },
  scopeMembershipId?: string,
) {
  const staff = await staffList(shopId);
  const visible = scopeMembershipId ? staff.filter((s) => s.membershipId === scopeMembershipId) : staff;
  const where: Prisma.AttendanceWhereInput = { shopId };
  if (q.date) where.date = parseDate(q.date);
  else {
    if (q.fromDate || q.toDate) {
      where.date = {};
      if (q.fromDate) (where.date as { gte?: Date }).gte = parseDate(q.fromDate);
      if (q.toDate) (where.date as { lte?: Date }).lte = parseDate(q.toDate);
    }
  }
  if (q.membershipId) where.membershipId = q.membershipId;
  const ids = new Set(visible.map((s) => s.membershipId));
  const rows = await prisma.attendance.findMany({
    where: { ...where, membershipId: { in: [...ids] } },
    orderBy: [{ date: 'asc' }],
  });
  const byMember = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.membershipId;
    if (!byMember.has(k)) byMember.set(k, []);
    byMember.get(k)!.push(r);
  }
  return visible.map((s) => ({
    member: s,
    records: (byMember.get(s.membershipId) ?? []).map((r) => ({
      id: r.id,
      date: r.date.toISOString().slice(0, 10),
      status: r.status as AttendanceStatus,
      notes: r.notes,
    })),
  }));
}

export async function markAttendance(
  shopId: string,
  input: { date: string; records: { membershipId: string; status: AttendanceStatus; notes?: string }[] },
  markedById?: string,
) {
  const date = parseDate(input.date);
  // Security M1: no future dates, and no dates older than 60 days (prevent backdating fraud)
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const minDate = new Date(today);
  minDate.setUTCDate(minDate.getUTCDate() - 60);
  if (date > today) throw new HttpError(400, 'INVALID_DATE', 'Cannot mark attendance for future dates');
  if (date < minDate) throw new HttpError(400, 'INVALID_DATE', 'Cannot mark attendance older than 60 days');
  const staffIds = new Set((await staffList(shopId)).map((s) => s.membershipId));
  const results: { membershipId: string; status: AttendanceStatus }[] = [];
  for (const r of input.records) {
    if (!staffIds.has(r.membershipId)) {
      throw new HttpError(404, 'MEMBER_NOT_FOUND', `Staff member ${r.membershipId} not found`);
    }
    const rec = await prisma.attendance.upsert({
      where: {
        shopId_membershipId_date: { shopId, membershipId: r.membershipId, date },
      },
      create: {
        shopId,
        membershipId: r.membershipId,
        date,
        status: r.status,
        notes: r.notes,
        markedById,
      },
      update: { status: r.status, notes: r.notes, markedById },
    });
    results.push({ membershipId: rec.membershipId, status: rec.status as AttendanceStatus });
  }
  return { date: input.date, marked: results.length, records: results };
}

export async function getSalaryStructures(shopId: string) {
  const staff = await staffList(shopId);
  const rows = await prisma.salaryStructure.findMany({ where: { shopId } });
  const byId = new Map(rows.map((r) => [r.membershipId, r]));
  return staff.map((s) => {
    const r = byId.get(s.membershipId);
    return {
      member: s,
      structure: r
        ? {
            id: r.id,
            monthlySalary: r.monthlySalary.toString(),
            effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
          }
        : null,
    };
  });
}

export async function setSalaryStructure(
  shopId: string,
  membershipId: string,
  input: { monthlySalary: string; effectiveFrom?: string },
  createdById?: string,
) {
  await ensureMember(shopId, membershipId);
  const rec = await prisma.salaryStructure.upsert({
    where: { membershipId },
    create: {
      shopId,
      membershipId,
      monthlySalary: D(input.monthlySalary),
      effectiveFrom: input.effectiveFrom ? parseDate(input.effectiveFrom) : new Date(),
      createdById,
    },
    update: {
      monthlySalary: D(input.monthlySalary),
      ...(input.effectiveFrom ? { effectiveFrom: parseDate(input.effectiveFrom) } : {}),
    },
  });
  return {
    id: rec.id,
    monthlySalary: rec.monthlySalary.toString(),
    effectiveFrom: rec.effectiveFrom.toISOString().slice(0, 10),
  };
}

export async function recordAdvance(
  shopId: string,
  input: { membershipId: string; amount: string; advanceDate?: string; notes?: string },
  givenById?: string,
) {
  await ensureMember(shopId, input.membershipId);
  const rec = await prisma.salaryAdvance.create({
    data: {
      shopId,
      membershipId: input.membershipId,
      amount: D(input.amount),
      advanceDate: input.advanceDate ? parseDate(input.advanceDate) : new Date(),
      notes: input.notes,
      givenById,
    },
  });
  return { id: rec.id, amount: rec.amount.toString() };
}

export async function listAdvances(shopId: string, q: { year?: number; month?: number }) {
  const staff = await staffList(shopId);
  const nameById = new Map(staff.map((s) => [s.membershipId, s.name]));
  const where: Prisma.SalaryAdvanceWhereInput = { shopId };
  if (q.year && q.month) {
    const from = new Date(Date.UTC(q.year, q.month - 1, 1));
    const to = new Date(Date.UTC(q.year, q.month, 1));
    where.advanceDate = { gte: from, lt: to };
  }
  const rows = await prisma.salaryAdvance.findMany({
    where,
    orderBy: { advanceDate: 'desc' },
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id,
    membershipId: r.membershipId,
    memberName: nameById.get(r.membershipId) ?? '',
    amount: r.amount.toString(),
    advanceDate: r.advanceDate.toISOString().slice(0, 10),
    notes: r.notes,
  }));
}

const STATUS_WEIGHT: Record<AttendanceStatus, number> = {
  PRESENT: 1,
  ABSENT: 0,
  HALF_DAY: 0.5,
  PAID_LEAVE: 1,
  WEEKLY_OFF: 1,
};

export interface SalarySlip {
  member: StaffMember;
  year: number;
  month: number;
  monthlySalary: string;
  totalDays: number;
  presentDays: number;
  absentDays: number;
  halfDays: number;
  leaveDays: number;
  unmarkedDays: number;
  grossPayable: string;
  advances: string;
  bonus: string;
  deductions: string;
  netPayable: string;
  payment: null | {
    id: string;
    status: string;
    paidAmount: string;
    paidAt: string | null;
    mode: string | null;
  };
}

export async function getSalarySlips(
  shopId: string,
  year: number,
  month: number,
  scopeMembershipId?: string,
): Promise<SalarySlip[]> {
  const staff = await staffList(shopId);
  const visible = scopeMembershipId ? staff.filter((s) => s.membershipId === scopeMembershipId) : staff;
  const ids = visible.map((s) => s.membershipId);

  const [structures, advances, payments, attendance] = await Promise.all([
    prisma.salaryStructure.findMany({ where: { shopId, membershipId: { in: ids } } }),
    prisma.salaryAdvance.findMany({
      where: {
        shopId,
        membershipId: { in: ids },
        advanceDate: { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) },
      },
    }),
    prisma.salaryPayment.findMany({ where: { shopId, year, month, membershipId: { in: ids } } }),
    prisma.attendance.findMany({
      where: {
        shopId,
        membershipId: { in: ids },
        date: { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) },
      },
    }),
  ]);

  const structById = new Map(structures.map((s) => [s.membershipId, s]));
  const advById = new Map<string, number>();
  for (const a of advances) {
    advById.set(a.membershipId, (advById.get(a.membershipId) ?? 0) + Number(a.amount));
  }
  const payById = new Map(payments.map((p) => [p.membershipId, p]));
  const attById = new Map<string, typeof attendance>();
  for (const a of attendance) {
    if (!attById.has(a.membershipId)) attById.set(a.membershipId, []);
    attById.get(a.membershipId)!.push(a);
  }

  const totalDays = new Date(Date.UTC(year, month, 0)).getDate();
  const today = new Date();
  const isCurrentMonth = today.getUTCFullYear() === year && today.getUTCMonth() + 1 === month;
  const elapsedDays = isCurrentMonth ? today.getUTCDate() : totalDays;

  return visible.map((s) => {
    const struct = structById.get(s.membershipId);
    const monthly = struct ? Number(struct.monthlySalary) : 0;
    const perDay = totalDays > 0 ? monthly / totalDays : 0;

    let present = 0;
    let absent = 0;
    let half = 0;
    let leave = 0;
    const markedDays = new Set<number>();
    for (const r of attById.get(s.membershipId) ?? []) {
      const day = r.date.getUTCDate();
      markedDays.add(day);
      const st = r.status as AttendanceStatus;
      if (st === 'PRESENT') present += 1;
      else if (st === 'ABSENT') absent += 1;
      else if (st === 'HALF_DAY') half += 1;
      else leave += 1; // PAID_LEAVE / WEEKLY_OFF
    }
    const unmarked = Math.max(0, elapsedDays - markedDays.size);
    const payableDays = present + half * 0.5 + leave;
    const gross = Math.round(perDay * payableDays * 100) / 100;
    const adv = Math.round((advById.get(s.membershipId) ?? 0) * 100) / 100;
    const pay = payById.get(s.membershipId);
    // Once paid, the slip reflects the frozen payment record (bonus/deductions/net as paid).
    const bonus = pay ? Number(pay.bonus) : 0;
    const deductions = pay ? Number(pay.deductions) : 0;
    const net = pay
      ? Number(pay.netPayable)
      : Math.max(0, Math.round((gross - adv) * 100) / 100);
    return {
      member: s,
      year,
      month,
      monthlySalary: monthly.toFixed(2),
      totalDays,
      presentDays: present,
      absentDays: absent,
      halfDays: half,
      leaveDays: leave,
      unmarkedDays: unmarked,
      grossPayable: gross.toFixed(2),
      advances: adv.toFixed(2),
      bonus: bonus.toFixed(2),
      deductions: deductions.toFixed(2),
      netPayable: net.toFixed(2),
      payment: pay
        ? {
            id: pay.id,
            status: pay.status,
            paidAmount: pay.paidAmount.toString(),
            paidAt: pay.paidAt ? pay.paidAt.toISOString() : null,
            mode: pay.mode,
          }
        : null,
    };
  });
}

export async function paySalary(
  shopId: string,
  input: {
    membershipId: string;
    year: number;
    month: number;
    bonus?: string;
    deductions?: string;
    mode?: string;
    notes?: string;
  },
  paidById?: string,
) {
  await ensureMember(shopId, input.membershipId);
  const slips = await getSalarySlips(shopId, input.year, input.month, input.membershipId);
  const slip = slips[0];
  if (!slip) throw new HttpError(404, 'MEMBER_NOT_FOUND', 'Staff member not found');
  if (slip.payment) throw new HttpError(409, 'SALARY_ALREADY_PAID', 'Salary for this month is already recorded');

  const bonus = Number(input.bonus ?? 0);
  const deductions = Number(input.deductions ?? 0);
  const net = Math.max(0, Math.round((Number(slip.netPayable) + bonus - deductions) * 100) / 100);

  // Carry forward excess advance to next month (user requirement 2026-10-02):
  // if advances exceed the gross payable, the remainder becomes an advance
  // for the following month instead of being forgiven.
  const gross = Number(slip.grossPayable);
  const totalAdv = Number(slip.advances);
  const excess = Math.round((totalAdv - gross) * 100) / 100;

  let rec;
  try {
    rec = await prisma.salaryPayment.create({
      data: {
        shopId,
        membershipId: input.membershipId,
        year: input.year,
        month: input.month,
        monthlySalary: D(slip.monthlySalary),
        totalDays: slip.totalDays,
        presentDays: D(slip.presentDays),
        absentDays: D(slip.absentDays),
        leaveDays: D(slip.leaveDays),
        unmarkedDays: slip.unmarkedDays,
        grossPayable: D(slip.grossPayable),
        advances: D(slip.advances),
        bonus: D(bonus.toFixed(2)),
        deductions: D(deductions.toFixed(2)),
        netPayable: D(net.toFixed(2)),
        paidAmount: D(net.toFixed(2)),
        status: 'PAID',
        paidAt: new Date(),
        paidById,
        mode: input.mode,
        notes: input.notes,
      },
    });
  } catch (e) {
    // Race condition: parallel pay requests — DB unique constraint wins, return clean 409
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new HttpError(409, 'SALARY_ALREADY_PAID', 'Salary for this month is already recorded');
    }
    throw e;
  }

  let carriedForward = 0;
  if (excess > 0) {
    const nextMonth = input.month === 12 ? 1 : input.month + 1;
    const nextYear = input.month === 12 ? input.year + 1 : input.year;
    await prisma.salaryAdvance.create({
      data: {
        shopId,
        membershipId: input.membershipId,
        amount: D(excess.toFixed(2)),
        advanceDate: new Date(Date.UTC(nextYear, nextMonth - 1, 1)),
        notes: `Carried forward from ${input.year}-${String(input.month).padStart(2, '0')} (advance exceeded gross)`,
        givenById: paidById,
      },
    });
    carriedForward = excess;
  }

  return {
    id: rec.id,
    memberName: slip.member.name,
    year: rec.year,
    month: rec.month,
    netPayable: rec.netPayable.toString(),
    status: rec.status,
    carriedForward: carriedForward.toFixed(2),
  };
}

export async function listPayments(
  shopId: string,
  year?: number,
  month?: number,
  scopeMembershipId?: string,
) {
  const staff = await staffList(shopId);
  const nameById = new Map(staff.map((s) => [s.membershipId, s.name]));
  const rows = await prisma.salaryPayment.findMany({
    where: {
      shopId,
      ...(year ? { year } : {}),
      ...(month ? { month } : {}),
      ...(scopeMembershipId ? { membershipId: scopeMembershipId } : {}),
    },
    orderBy: [{ year: 'desc' }, { month: 'desc' }, { paidAt: 'desc' }],
    take: 500,
  });
  return rows.map((r) => ({
    id: r.id,
    membershipId: r.membershipId,
    memberName: nameById.get(r.membershipId) ?? '',
    year: r.year,
    month: r.month,
    monthlySalary: r.monthlySalary.toString(),
    grossPayable: r.grossPayable.toString(),
    advances: r.advances.toString(),
    bonus: r.bonus.toString(),
    deductions: r.deductions.toString(),
    netPayable: r.netPayable.toString(),
    paidAmount: r.paidAmount.toString(),
    status: r.status,
    mode: r.mode,
    notes: r.notes,
    paidAt: r.paidAt ? r.paidAt.toISOString() : null,
  }));
}
