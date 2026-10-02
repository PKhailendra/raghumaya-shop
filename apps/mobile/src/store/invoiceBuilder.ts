import { create } from 'zustand';
import { Customer, Product } from '../api/types';
import { computeLine, InvoiceLineComputed } from '../utils/gst';

export interface DraftItem extends InvoiceLineComputed {
  key: string;
  productId?: string;
  description: string;
}

interface InvoiceBuilderState {
  customer: Customer | null;
  isInterState: boolean;
  items: DraftItem[];
  notes: string;

  setCustomer: (c: Customer | null) => void;
  setIsInterState: (v: boolean) => void;
  addItemFromProduct: (p: Product, quantity?: number) => void;
  updateItem: (key: string, patch: Partial<InvoiceLineComputed>) => void;
  removeItem: (key: string) => void;
  setNotes: (v: string) => void;
  clear: () => void;
}

let seq = 0;

export const useInvoiceBuilder = create<InvoiceBuilderState>()((set, get) => ({
  customer: null,
  isInterState: false,
  items: [],
  notes: '',

  setCustomer: (customer) => set({ customer }),
  setIsInterState: (isInterState) => {
    const { items } = get();
    set({
      isInterState,
      items: items.map((it) => ({
        ...computeLine(
          { quantity: it.quantity, unitPrice: it.unitPrice, discountRate: it.discountRate, gstRate: it.gstRate },
          isInterState,
        ),
        key: it.key,
        productId: it.productId,
        description: it.description,
      })),
    });
  },

  addItemFromProduct: (p, quantity = 1) => {
    const { isInterState, items } = get();
    const existing = items.find((i) => i.productId === p.id);
    if (existing) {
      // Same product scanned again → bump quantity by the scanned amount
      const line = computeLine(
        {
          quantity: existing.quantity + quantity,
          unitPrice: existing.unitPrice,
          discountRate: existing.discountRate,
          gstRate: existing.gstRate,
        },
        isInterState,
      );
      set({
        items: items.map((it) =>
          it.key === existing.key
            ? { ...line, key: it.key, productId: it.productId, description: it.description }
            : it,
        ),
      });
      return;
    }
    const line = computeLine(
      {
        quantity,
        unitPrice: parseFloat(p.sellingPrice),
        discountRate: 0,
        gstRate: p.gstRate ? parseFloat(p.gstRate) : 0,
      },
      isInterState,
    );
    seq += 1;
    set({
      items: [...items, { ...line, key: `item-${seq}`, productId: p.id, description: p.name }],
    });
  },

  updateItem: (key, patch) => {
    const { isInterState, items } = get();
    set({
      items: items.map((it) => {
        if (it.key !== key) return it;
        const merged = { ...it, ...patch };
        const line = computeLine(
          { quantity: merged.quantity, unitPrice: merged.unitPrice, discountRate: merged.discountRate, gstRate: merged.gstRate },
          isInterState,
        );
        return { ...line, key: it.key, productId: it.productId, description: merged.description };
      }),
    });
  },

  removeItem: (key) => set({ items: get().items.filter((i) => i.key !== key) }),
  setNotes: (notes) => set({ notes }),
  clear: () => set({ customer: null, isInterState: false, items: [], notes: '' }),
}));
