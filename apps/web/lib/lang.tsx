"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type Lang = "en" | "hi";

const STRINGS: Record<string, { en: string; hi: string }> = {
  Dashboard: { en: "Dashboard", hi: "डैशबोर्ड" },
  Billing: { en: "Billing", hi: "बिलिंग" },
  Inventory: { en: "Inventory", hi: "स्टॉक सामान" },
  Stock: { en: "Stock", hi: "स्टॉक" },
  Purchases: { en: "Purchases", hi: "खरीदारी" },
  Customers: { en: "Customers", hi: "ग्राहक" },
  Finance: { en: "Finance", hi: "हिसाब" },
  Attendance: { en: "Attendance", hi: "हाज़िरी" },
  Salary: { en: "Salary", hi: "तनख्वाह" },
  Team: { en: "Team", hi: "स्टाफ" },
  Subscription: { en: "Subscription", hi: "सब्सक्रिप्शन" },
  Settings: { en: "Settings", hi: "सेटिंग्स" },
  Expenses: { en: "Expenses", hi: "खर्चे" },
  Reports: { en: "Reports", hi: "रिपोर्ट" },
  "Daily Closing": { en: "Daily Closing", hi: "दिन का हिसाब" },
  Save: { en: "Save", hi: "सेव करें" },
  Cancel: { en: "Cancel", hi: "रद्द करें" },
  Delete: { en: "Delete", hi: "हटाएं" },
  Edit: { en: "Edit", hi: "बदलें" },
  Add: { en: "Add", hi: "जोड़ें" },
  Search: { en: "Search", hi: "खोजें" },
  Logout: { en: "Logout", hi: "लॉगआउट" },
};

const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string }>({
  lang: "en",
  setLang: () => {},
  t: (k) => k,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    const s = localStorage.getItem("rms-lang");
    if (s === "hi" || s === "en") setLangState(s);
  }, []);
  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("rms-lang", l);
  };
  const t = (key: string) => STRINGS[key]?.[lang] ?? key;
  return <LangCtx.Provider value={{ lang, setLang, t }}>{children}</LangCtx.Provider>;
}

export function useLang() {
  return useContext(LangCtx);
}
