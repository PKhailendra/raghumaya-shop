import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

export interface InvoicePdfData {
  invoiceNumber: string;
  status: string;
  issueDate: string;
  dueDate?: string | null;
  shop: { name: string; address?: string | null; phone?: string | null; gstNumber?: string | null };
  customer?: { name: string; phone?: string | null; address?: string | null; gstNumber?: string | null } | null;
  items: Array<{
    description: string;
    hsnCode?: string | null;
    quantity: string;
    unitPrice: string;
    discountAmount: string;
    taxableAmount: string;
    gstAmount: string;
    lineTotal: string;
  }>;
  totals: {
    subtotal: string;
    discountTotal: string;
    taxableTotal: string;
    cgstTotal: string;
    sgstTotal: string;
    igstTotal: string;
    taxTotal: string;
    totalAmount: string;
    paidAmount: string;
  };
  notes?: string | null;
  terms?: string | null;
}

/** Generate an invoice PDF with pdfkit and return the absolute file path. */
export async function generateInvoicePdf(invoiceId: string, data: InvoicePdfData): Promise<string> {
  const dir = path.join(env.STORAGE_DIR, 'invoices');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${invoiceId}.pdf`);

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(20).font('Helvetica-Bold').text(data.shop.name, { align: 'left' });
    doc.fontSize(9).font('Helvetica');
    if (data.shop.address) doc.text(data.shop.address);
    if (data.shop.phone) doc.text(`Phone: ${data.shop.phone}`);
    if (data.shop.gstNumber) doc.text(`GSTIN: ${data.shop.gstNumber}`);
    doc.moveDown();

    doc.fontSize(16).font('Helvetica-Bold').text('TAX INVOICE', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Invoice No: ${data.invoiceNumber}`);
    doc.text(`Status: ${data.status}`);
    doc.text(`Issue Date: ${data.issueDate}`);
    if (data.dueDate) doc.text(`Due Date: ${data.dueDate}`);
    if (data.customer) {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text('Bill To:');
      doc.font('Helvetica').text(data.customer.name);
      if (data.customer.phone) doc.text(`Phone: ${data.customer.phone}`);
      if (data.customer.address) doc.text(data.customer.address);
      if (data.customer.gstNumber) doc.text(`GSTIN: ${data.customer.gstNumber}`);
    }
    doc.moveDown();

    const startX = 40;
    const cols = [startX, 270, 330, 390, 450, 510];
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('Item', cols[0], doc.y, { width: 220 });
    doc.text('Qty', cols[1], doc.y - 11, { width: 50, align: 'right' });
    doc.text('Price', cols[2], doc.y - 11, { width: 55, align: 'right' });
    doc.text('Disc', cols[3], doc.y - 11, { width: 55, align: 'right' });
    doc.text('GST', cols[4], doc.y - 11, { width: 55, align: 'right' });
    doc.text('Total', cols[5], doc.y - 11, { width: 60, align: 'right' });
    doc.moveDown(0.4);
    doc.font('Helvetica');
    for (const item of data.items) {
      const y = doc.y;
      doc.text(item.description, cols[0], y, { width: 220 });
      doc.text(item.quantity, cols[1], y, { width: 50, align: 'right' });
      doc.text(item.unitPrice, cols[2], y, { width: 55, align: 'right' });
      doc.text(item.discountAmount, cols[3], y, { width: 55, align: 'right' });
      doc.text(item.gstAmount, cols[4], y, { width: 55, align: 'right' });
      doc.text(item.lineTotal, cols[5], y, { width: 60, align: 'right' });
      doc.moveDown(0.3);
    }
    doc.moveDown(0.5);

    const t = data.totals;
    const rows: Array<[string, string]> = [
      ['Subtotal', t.subtotal],
      ['Discount', `-${t.discountTotal}`],
      ['Taxable', t.taxableTotal],
    ];
    if (Number(t.cgstTotal) > 0) rows.push(['CGST', t.cgstTotal]);
    if (Number(t.sgstTotal) > 0) rows.push(['SGST', t.sgstTotal]);
    if (Number(t.igstTotal) > 0) rows.push(['IGST', t.igstTotal]);
    rows.push(['Tax Total', t.taxTotal]);
    rows.push(['Paid', t.paidAmount]);
    doc.fontSize(10);
    for (const [label, value] of rows) {
      doc.font('Helvetica').text(label, 380, doc.y, { width: 120, align: 'right' });
      doc.text(value, 500, doc.y - 12, { width: 70, align: 'right' });
      doc.moveDown(0.2);
    }
    doc.font('Helvetica-Bold').fontSize(12);
    doc.text('Grand Total', 380, doc.y, { width: 120, align: 'right' });
    doc.text(t.totalAmount, 500, doc.y - 14, { width: 70, align: 'right' });
    doc.moveDown();

    if (data.notes) {
      doc.fontSize(9).font('Helvetica-Bold').text('Notes:');
      doc.font('Helvetica').text(data.notes);
    }
    if (data.terms) {
      doc.fontSize(9).font('Helvetica-Bold').text('Terms:');
      doc.font('Helvetica').text(data.terms);
    }
    doc.moveDown();
    doc.fontSize(8).font('Helvetica-Oblique').text('Generated by RaghuMayaShop', { align: 'center' });

    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });

  return filePath;
}
