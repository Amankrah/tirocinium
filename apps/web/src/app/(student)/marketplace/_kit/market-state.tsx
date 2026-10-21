"use client";

// What the project marketplace remembers while a student moves between its
// pages (decisions 0100 and 0101): the basket, the quotation the server priced
// from it, and the comparison tray. It lives in the marketplace layout, so it
// survives every navigation inside /marketplace and is gone on a reload or on
// leaving, which is the "nothing is kept" of decision 0100 made literal.
//
// The basket is quantities only. Every change goes to the server, which prices
// it at list prices and says what it did (a quantity raised to a minimum order
// comes back as a notice); the basket then follows what was priced, so the
// next edit starts from the figure on screen. A client that priced anything
// would be a second account of the money.
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import type { ProjectQuotation, QuoteLine, Result } from "@/lib/api/marketplace";
import { strings } from "../../strings";
import { TRAY_LIMIT } from "./limits";

export { TRAY_LIMIT };

export type Addable = { sku: string; moq: number; name: string };

type Market = {
  basket: QuoteLine[];
  quotation: ProjectQuotation | null;
  pending: boolean;
  failure: string | null;
  inBasket: (sku: string) => boolean;
  add: (line: Addable) => void;
  addMany: (lines: Addable[]) => void;
  setQuantity: (sku: string, quantity: number) => void;
  setCut: (sku: string, cut: boolean) => void;
  setCuts: (sku: string, cuts: number) => void;
  remove: (sku: string) => void;
  clear: () => void;
  tray: string[];
  inTray: (sku: string) => boolean;
  toggleTray: (sku: string) => void;
  setTray: (skus: string[]) => void;
  clearTray: () => void;
};

const MarketContext = createContext<Market | null>(null);

export function useMarket(): Market {
  const market = useContext(MarketContext);
  if (!market) throw new Error("useMarket is only available inside the marketplace");
  return market;
}

type Announcement = { text: string; link: boolean; id: number };

export function MarketProvider({
  price,
  children,
}: {
  price: (lines: QuoteLine[]) => Promise<Result<ProjectQuotation>>;
  children: ReactNode;
}) {
  const s = strings.project;
  const [basket, setBasket] = useState<QuoteLine[]>([]);
  const [quotation, setQuotation] = useState<ProjectQuotation | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [tray, setTrayState] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [pending, startTransition] = useTransition();
  const sequence = useRef(0);

  const announce = useCallback((text: string, link = false) => {
    sequence.current += 1;
    setAnnouncement({ text, link, id: sequence.current });
  }, []);

  const commit = useCallback(
    (next: QuoteLine[]) => {
      setBasket(next);
      if (next.length === 0) {
        setQuotation(null);
        setFailure(null);
        return;
      }
      startTransition(async () => {
        const result = await price(next);
        if (result.ok) {
          setQuotation(result.data);
          setBasket(
            result.data.lines.map((line) => ({
              sku: line.sku,
              quantity: line.quantity,
              cut_to_length: line.cut_to_length,
              cut_count: line.cut_count,
            })),
          );
          setFailure(null);
        } else {
          setFailure(result.detail || strings.marketplace.offline);
        }
      });
    },
    [price],
  );

  const inBasket = useCallback((sku: string) => basket.some((line) => line.sku === sku), [basket]);

  const add = useCallback(
    (line: Addable) => {
      if (basket.some((item) => item.sku === line.sku)) return;
      commit([...basket, { sku: line.sku, quantity: line.moq, cut_to_length: false, cut_count: 1 }]);
      announce(s.added(line.name), true);
    },
    [basket, commit, announce, s],
  );

  const addMany = useCallback(
    (lines: Addable[]) => {
      const fresh = lines.filter((line) => !basket.some((item) => item.sku === line.sku));
      if (fresh.length === 0) return;
      commit([
        ...basket,
        ...fresh.map((line) => ({
          sku: line.sku,
          quantity: line.moq,
          cut_to_length: false,
          cut_count: 1,
        })),
      ]);
      announce(s.addedMany(fresh.length), true);
    },
    [basket, commit, announce, s],
  );

  const update = useCallback(
    (sku: string, change: Partial<QuoteLine>) =>
      commit(basket.map((line) => (line.sku === sku ? { ...line, ...change } : line))),
    [basket, commit],
  );

  const toggleTray = useCallback(
    (sku: string) => {
      if (tray.includes(sku)) {
        setTrayState(tray.filter((item) => item !== sku));
        return;
      }
      if (tray.length >= TRAY_LIMIT) {
        announce(strings.marketplace.compareFull);
        return;
      }
      setTrayState([...tray, sku]);
    },
    [tray, announce],
  );

  const market = useMemo<Market>(
    () => ({
      basket,
      quotation,
      pending,
      failure,
      inBasket,
      add,
      addMany,
      setQuantity: (sku, quantity) => update(sku, { quantity }),
      setCut: (sku, cut) => update(sku, { cut_to_length: cut }),
      setCuts: (sku, cuts) => update(sku, { cut_count: Math.max(1, Math.round(cuts)) }),
      remove: (sku) => commit(basket.filter((line) => line.sku !== sku)),
      clear: () => commit([]),
      tray,
      inTray: (sku) => tray.includes(sku),
      toggleTray,
      setTray: (skus) => setTrayState(skus.slice(0, TRAY_LIMIT)),
      clearTray: () => setTrayState([]),
    }),
    [basket, quotation, pending, failure, inBasket, add, addMany, update, commit, tray, toggleTray],
  );

  return (
    <MarketContext.Provider value={market}>
      {children}
      <Announcer announcement={announcement} onDone={() => setAnnouncement(null)} />
    </MarketContext.Provider>
  );
}

// A quiet confirmation that something happened, with the way to it. Polite,
// so it never interrupts a screen reader mid-sentence; it clears itself.
function Announcer({
  announcement,
  onDone,
}: {
  announcement: Announcement | null;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!announcement) return;
    const timer = setTimeout(onDone, 4000);
    return () => clearTimeout(timer);
  }, [announcement, onDone]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 print:hidden"
    >
      {announcement ? (
        <p
          key={announcement.id}
          className="pointer-events-auto flex items-center gap-3 rounded-lg border border-rule-line bg-surface px-4 py-2.5 text-sm shadow-floating"
        >
          {announcement.text}
          {announcement.link ? (
            <Link
              href="/marketplace/quote"
              className="font-medium text-link"
            >
              {strings.project.viewQuote}
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
