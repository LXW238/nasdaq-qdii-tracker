import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { DEFAULT_WATCHLIST } from '../constants/defaultFunds';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { FundCategory, HoldingRecord, WatchlistItem } from '../types';

const LOCAL_WATCHLIST_KEY = 'nasdaq_select_watchlist_v1';
const LOCAL_HOLDINGS_KEY = 'nasdaq_select_holdings_v1';

const FUND_CODE_RE = /^[0-9]{6}$/;
const VALID_CATEGORIES = new Set<FundCategory>(['index_ndx', 'global_active', 'qdii_other']);

function sanitizeFundCode(code: string): string {
  const cleaned = code.trim();
  if (!FUND_CODE_RE.test(cleaned)) {
    throw new Error('基金代码必须为6位数字');
  }
  return cleaned;
}

function sanitizeName(name: string, fallbackCode: string): string {
  const trimmed = name.trim().slice(0, 80);
  return trimmed.length > 0 ? trimmed : `基金 ${fallbackCode}`;
}

function sanitizeCategory(category: FundCategory): FundCategory {
  return VALID_CATEGORIES.has(category) ? category : 'qdii_other';
}

function sanitizeBeta(beta: number): number {
  const num = Number(beta);
  if (!Number.isFinite(num)) return 0.9;
  return Number(Math.min(2.0, Math.max(0.1, num)).toFixed(2));
}

function sanitizeShares(shares: number): number {
  const num = Number(shares);
  if (!Number.isFinite(num) || num <= 0 || num > 1_000_000_000) {
    throw new Error('持有份额需为大于 0 且不超过 10 亿的有效数字');
  }
  return Number(num.toFixed(4));
}

function sanitizeCostNav(costNav: number): number {
  const num = Number(costNav);
  if (!Number.isFinite(num) || num <= 0 || num > 100_000) {
    throw new Error('持仓成本净值需为大于 0 的有效数字');
  }
  return Number(num.toFixed(4));
}

function sanitizeNote(note: string): string {
  return note.trim().slice(0, 200);
}

// Local storage helpers for unauthenticated guest mode
export function loadLocalWatchlist(): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_WATCHLIST_KEY);
    if (!raw) return DEFAULT_WATCHLIST;
    const parsed = JSON.parse(raw) as WatchlistItem[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_WATCHLIST;
    return parsed.filter((item) => FUND_CODE_RE.test(item.fundCode));
  } catch {
    return DEFAULT_WATCHLIST;
  }
}

export function saveLocalWatchlist(items: WatchlistItem[]): void {
  try {
    localStorage.setItem(LOCAL_WATCHLIST_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage quota issues in private browsing
  }
}

export function loadLocalHoldings(): Record<string, HoldingRecord> {
  try {
    const raw = localStorage.getItem(LOCAL_HOLDINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, HoldingRecord>;
    if (!parsed || typeof parsed !== 'object') return {};
    const valid: Record<string, HoldingRecord> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (FUND_CODE_RE.test(k) && v && v.shares > 0 && v.costNav > 0) {
        valid[k] = v;
      }
    }
    return valid;
  } catch {
    return {};
  }
}

export function saveLocalHoldings(holdings: Record<string, HoldingRecord>): void {
  try {
    localStorage.setItem(LOCAL_HOLDINGS_KEY, JSON.stringify(holdings));
  } catch {
    // Ignore storage quota issues
  }
}

// Ensure parent /users/{uid} exists (Master Gate requirement) and migrate local data on first sign-in
export async function ensureUserProfileAndMigrate(
  user: User,
  localWatchlist: WatchlistItem[],
  localHoldings: Record<string, HoldingRecord>
): Promise<void> {
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  const displayName = (user.displayName || user.email?.split('@')[0] || '投资者')
    .trim()
    .slice(0, 80);

  try {
    const existingSnap = await getDoc(userRef);
    if (!existingSnap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        displayName: displayName || '投资者',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        displayName: displayName || '投资者',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  // Check if cloud watchlist is empty; if so, seed with local/default watchlist
  const watchlistColPath = `users/${user.uid}/watchlist`;
  try {
    const wlQuery = query(
      collection(db, 'users', user.uid, 'watchlist'),
      where('ownerId', '==', user.uid)
    );
    const wlSnap = await getDocs(wlQuery);
    if (wlSnap.empty) {
      const seed = localWatchlist.length > 0 ? localWatchlist : DEFAULT_WATCHLIST;
      for (const item of seed) {
        await upsertWatchlistItemCloud(user.uid, item);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, watchlistColPath);
  }

  // Migrate any guest holdings if they do not exist yet in cloud
  const holdingsEntries = Object.values(localHoldings);
  if (holdingsEntries.length > 0) {
    const holdingsColPath = `users/${user.uid}/holdings`;
    try {
      const hQuery = query(
        collection(db, 'users', user.uid, 'holdings'),
        where('ownerId', '==', user.uid)
      );
      const hSnap = await getDocs(hQuery);
      const cloudCodes = new Set(hSnap.docs.map((d) => d.id));
      for (const h of holdingsEntries) {
        if (!cloudCodes.has(h.fundCode)) {
          await upsertHoldingCloud(user.uid, h);
        }
      }
      // Clear local guest holdings after successful cloud merge
      saveLocalHoldings({});
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, holdingsColPath);
    }
  }
}

export async function upsertWatchlistItemCloud(
  uid: string,
  item: WatchlistItem
): Promise<void> {
  const fundCode = sanitizeFundCode(item.fundCode);
  const path = `users/${uid}/watchlist/${fundCode}`;
  const ref = doc(db, 'users', uid, 'watchlist', fundCode);

  try {
    const snap = await getDoc(ref);
    const name = sanitizeName(item.name, fundCode);
    const category = sanitizeCategory(item.category);
    const beta = sanitizeBeta(item.beta);

    if (!snap.exists()) {
      await setDoc(ref, {
        ownerId: uid,
        fundCode,
        name,
        category,
        beta,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        name,
        category,
        beta,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function removeWatchlistItemCloud(uid: string, fundCode: string): Promise<void> {
  const cleanCode = sanitizeFundCode(fundCode);
  const path = `users/${uid}/watchlist/${cleanCode}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'watchlist', cleanCode));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function upsertHoldingCloud(
  uid: string,
  holding: HoldingRecord
): Promise<void> {
  const fundCode = sanitizeFundCode(holding.fundCode);
  const path = `users/${uid}/holdings/${fundCode}`;
  const ref = doc(db, 'users', uid, 'holdings', fundCode);

  try {
    const snap = await getDoc(ref);
    const name = sanitizeName(holding.name, fundCode);
    const shares = sanitizeShares(holding.shares);
    const costNav = sanitizeCostNav(holding.costNav);
    const note = sanitizeNote(holding.note || '');

    if (!snap.exists()) {
      await setDoc(ref, {
        ownerId: uid,
        fundCode,
        name,
        shares,
        costNav,
        note,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        name,
        shares,
        costNav,
        note,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function removeHoldingCloud(uid: string, fundCode: string): Promise<void> {
  const cleanCode = sanitizeFundCode(fundCode);
  const path = `users/${uid}/holdings/${cleanCode}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'holdings', cleanCode));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserWatchlist(
  uid: string,
  onData: (items: WatchlistItem[]) => void
): () => void {
  const path = `users/${uid}/watchlist`;
  const q = query(
    collection(db, 'users', uid, 'watchlist'),
    where('ownerId', '==', uid)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items: WatchlistItem[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          fundCode: String(data.fundCode || d.id),
          name: String(data.name || d.id),
          category: sanitizeCategory(data.category as FundCategory),
          beta: sanitizeBeta(Number(data.beta)),
          createdAt: data.createdAt?.toMillis?.() ?? 0,
          updatedAt: data.updatedAt?.toMillis?.() ?? 0,
        };
      });
      items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeUserHoldings(
  uid: string,
  onData: (holdings: Record<string, HoldingRecord>) => void
): () => void {
  const path = `users/${uid}/holdings`;
  const q = query(
    collection(db, 'users', uid, 'holdings'),
    where('ownerId', '==', uid)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const map: Record<string, HoldingRecord> = {};
      for (const d of snapshot.docs) {
        const data = d.data();
        const code = String(data.fundCode || d.id);
        map[code] = {
          fundCode: code,
          name: String(data.name || code),
          shares: Number(data.shares) || 0,
          costNav: Number(data.costNav) || 0,
          note: String(data.note || ''),
          createdAt: data.createdAt?.toMillis?.() ?? 0,
          updatedAt: data.updatedAt?.toMillis?.() ?? 0,
        };
      }
      onData(map);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}
