// Line-level GST math (mirrors server rules: gross -> discount -> taxable -> GST).
export interface InvoiceLineInput {
  quantity: number;
  unitPrice: number;
  discountRate: number; // percent
  gstRate: number; // percent
}

export interface InvoiceLineComputed extends InvoiceLineInput {
  gross: number;
  discountAmount: number;
  taxable: number;
  gstAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  lineTotal: number;
}

export function computeLine(input: InvoiceLineInput, isInterState: boolean): InvoiceLineComputed {
  const gross = input.quantity * input.unitPrice;
  const discountAmount = (gross * input.discountRate) / 100;
  const taxable = gross - discountAmount;
  const gstAmount = (taxable * input.gstRate) / 100;
  return {
    ...input,
    gross,
    discountAmount,
    taxable,
    gstAmount,
    cgst: isInterState ? 0 : gstAmount / 2,
    sgst: isInterState ? 0 : gstAmount / 2,
    igst: isInterState ? gstAmount : 0,
    lineTotal: taxable + gstAmount,
  };
}

export function computeTotals(lines: InvoiceLineComputed[]) {
  const subtotal = lines.reduce((s, l) => s + l.taxable, 0);
  const discountTotal = lines.reduce((s, l) => s + l.discountAmount, 0);
  const cgstTotal = lines.reduce((s, l) => s + l.cgst, 0);
  const sgstTotal = lines.reduce((s, l) => s + l.sgst, 0);
  const igstTotal = lines.reduce((s, l) => s + l.igst, 0);
  const grandTotal = subtotal + cgstTotal + sgstTotal + igstTotal;
  return { subtotal, discountTotal, cgstTotal, sgstTotal, igstTotal, grandTotal };
}
