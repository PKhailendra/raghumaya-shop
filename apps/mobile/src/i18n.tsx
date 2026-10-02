import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';

export type Lang = 'en' | 'hi';

const STRINGS: Record<string, { en: string; hi: string }> = {
  Dashboard: { en: 'Dashboard', hi: 'डैशबोर्ड' },
  Billing: { en: 'Billing', hi: 'बिलिंग' },
  Inventory: { en: 'Inventory', hi: 'स्टॉक सामान' },
  Customers: { en: 'Customers', hi: 'ग्राहक' },
  More: { en: 'More', hi: 'और' },
  Expenses: { en: 'Expenses', hi: 'खर्चे' },
  'Daily Closing': { en: 'Daily Closing', hi: 'दिन का हिसाब' },
  Attendance: { en: 'Attendance', hi: 'हाज़िरी' },
  Salary: { en: 'Salary', hi: 'तनख्वाह' },
  Team: { en: 'Team', hi: 'स्टाफ' },
  Save: { en: 'Save', hi: 'सेव करें' },
  Cancel: { en: 'Cancel', hi: 'रद्द करें' },
  Delete: { en: 'Delete', hi: 'हटाएं' },
  Add: { en: 'Add', hi: 'जोड़ें' },
  Search: { en: 'Search', hi: 'खोजें' },
  Settings: { en: 'Settings', hi: 'सेटिंग्स' },
  'Total Sales': { en: 'Total Sales', hi: 'कुल बिक्री' },
  Collected: { en: 'Collected', hi: 'वसूली' },
  'New Due': { en: 'New Due', hi: 'नया उधार' },
  'Salary Paid': { en: 'Salary Paid', hi: 'तनख्वाह दी' },
  'Net Cash': { en: 'Net Cash', hi: 'शुद्ध नकद' },
  Language: { en: 'Language', hi: 'भाषा' },
  Present: { en: 'Present', hi: 'उपस्थित' },
  Absent: { en: 'Absent', hi: 'अनुपस्थित' },
  'Half day': { en: 'Half day', hi: 'आधा दिन' },
  Leave: { en: 'Leave', hi: 'छुट्टी' },
  'Weekly off': { en: 'Weekly off', hi: 'साप्ताहिक छुट्टी' },
  'All present': { en: 'All present', hi: 'सब उपस्थित' },
  'Mark attendance': { en: 'Mark attendance', hi: 'हाज़िरी लगाएं' },
  'Pay salary': { en: 'Pay salary', hi: 'तनख्वाह दें' },
  Bonus: { en: 'Bonus', hi: 'बोनस' },
  Deductions: { en: 'Deductions', hi: 'कटौती' },
  'Payment mode': { en: 'Payment mode', hi: 'भुगतान का तरीका' },
  'Add expense': { en: 'Add expense', hi: 'खर्चा जोड़ें' },
  Amount: { en: 'Amount', hi: 'राशि' },
  Date: { en: 'Date', hi: 'तारीख' },
  'No data': { en: 'No data', hi: 'कोई डेटा नहीं' },
};

const LANG_KEY = 'rms-lang';

interface LangCtxValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const LangCtx = createContext<LangCtxValue>({ lang: 'en', setLang: () => {}, t: (k) => k });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    SecureStore.getItemAsync(LANG_KEY).then((v) => {
      if (v === 'hi' || v === 'en') setLangState(v);
    });
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    SecureStore.setItemAsync(LANG_KEY, l).catch(() => {});
  };

  const t = (key: string) => STRINGS[key]?.[lang] ?? key;

  return <LangCtx.Provider value={{ lang, setLang, t }}>{children}</LangCtx.Provider>;
}

export function useLang(): LangCtxValue {
  return useContext(LangCtx);
}
