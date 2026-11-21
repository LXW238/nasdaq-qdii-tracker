import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const FUND_CODE_RE = /^[0-9]{6}$/;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const fundDetailCache = new Map<string, CacheEntry<ParsedFundData>>();
const fundGzCache = new Map<string, CacheEntry<OfficialIntraday | null>>();
let benchmarkCache: CacheEntry<BenchmarkPayload> | null = null;

interface OfficialIntraday {
  gsz: number;
  gszzl: number;
  gztime: string;
}

interface ParsedFundData {
  fundCode: string;
  name: string;
  managerName: string;
  sourceRate: string;
  rate: string;
  minPurchase: string;
  officialNav: number;
  acNav: number | null;
  officialChangePct: number;
  navDate: string;
  isUsdClass: boolean;
  returns: {
    m1: number | null;
    m3: number | null;
    m6: number | null;
    y1: number | null;
  };
  history: Array<{
    date: string;
    nav: number;
    dailyReturn: number;
    acNav: number | null;
  }>;
}

interface BenchmarkQuote {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePct: number;
  marketState: string;
  tradeDate: string;
  updatedAt: number;
}

interface BenchmarkPayload {
  ndx: BenchmarkQuote | null;
  qqq: BenchmarkQuote | null;
  nqFutures: BenchmarkQuote | null;
  usdcny: BenchmarkQuote | null;
  ndxHistory: Array<{ date: string; close: number }>;
  fetchedAt: number;
}

function toBeijingDate(timestampMs: number): string {
  const bj = new Date(timestampMs + 8 * 3600 * 1000);
  return bj.toISOString().slice(0, 10);
}

function toNewYorkDate(timestampSec: number): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(timestampSec * 1000));
    return parts;
  } catch {
    return new Date(timestampSec * 1000).toISOString().slice(0, 10);
  }
}

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: '*/*',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function parseOptionalNumber(raw: string | undefined): number | null {
  if (!raw || raw.trim() === '') return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function extractStringVar(source: string, varName: string): string {
  const re = new RegExp(`var\\s+${varName}\\s*=\\s*"([^"]*)"`);
  const match = source.match(re);
  return match ? match[1] : '';
}

function extractJsonVar<T>(source: string, varName: string): T | null {
  const startToken = `var ${varName} =`;
  const idx = source.indexOf(startToken);
  if (idx === -1) return null;
  let cursor = idx + startToken.length;
  while (cursor < source.length && /\s/.test(source[cursor])) cursor++;
  const openChar = source[cursor];
  if (openChar !== '[' && openChar !== '{') return null;
  const closeChar = openChar === '[' ? ']' : '}';

  let depth = 0;
  let inString = false;
  let escaped = false;
  let endIdx = -1;

  for (let i = cursor; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === openChar) {
      depth++;
    } else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }

  if (endIdx === -1) return null;
  try {
    return JSON.parse(source.slice(cursor, endIdx + 1)) as T;
  } catch {
    return null;
  }
}

async function fetchFundPingzhong(code: string): Promise<ParsedFundData> {
  const now = Date.now();
  const cached = fundDetailCache.get(code);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const url = `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Math.floor(now / 60000)}`;
  const res = await fetchWithTimeout(url, 9000);
  if (!res.ok) {
    throw new Error(`Upstream EastMoney returned HTTP ${res.status}`);
  }
  const text = await res.text();
  if (!text.includes('fS_name')) {
    throw new Error(`Fund ${code} not found`);
  }

  const name = extractStringVar(text, 'fS_name') || `基金 ${code}`;
  const sourceRate = extractStringVar(text, 'fund_sourceRate') || '--';
  const rate = extractStringVar(text, 'fund_Rate') || '--';
  const minPurchase = extractStringVar(text, 'fund_minsg') || '10';

  const syl1n = parseOptionalNumber(extractStringVar(text, 'syl_1n'));
  const syl6y = parseOptionalNumber(extractStringVar(text, 'syl_6y'));
  const syl3y = parseOptionalNumber(extractStringVar(text, 'syl_3y'));
  const syl1y = parseOptionalNumber(extractStringVar(text, 'syl_1y'));

  const managers =
    extractJsonVar<Array<{ name?: string }>>(text, 'Data_currentFundManager') || [];
  const managerName = managers
    .map((m) => m.name)
    .filter(Boolean)
    .slice(0, 2)
    .join(' / ');

  const netWorthRaw =
    extractJsonVar<Array<{ x: number; y: number; equityReturn?: number | string }>>(
      text,
      'Data_netWorthTrend'
    ) || [];
  const acWorthRaw = extractJsonVar<Array<[number, number]>>(text, 'Data_ACWorthTrend') || [];

  const acMap = new Map<string, number>();
  for (const pair of acWorthRaw) {
    if (Array.isArray(pair) && pair.length >= 2 && Number.isFinite(pair[1])) {
      acMap.set(toBeijingDate(pair[0]), pair[1]);
    }
  }

  const history = netWorthRaw
    .filter((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y) && pt.y > 0)
    .map((pt, idx, arr) => {
      const date = toBeijingDate(pt.x);
      let dailyReturn = Number(pt.equityReturn);
      if (!Number.isFinite(dailyReturn)) {
        const prev = idx > 0 ? arr[idx - 1].y : pt.y;
        dailyReturn = prev > 0 ? Number((((pt.y - prev) / prev) * 100).toFixed(2)) : 0;
      }
      return {
        date,
        nav: Number(pt.y.toFixed(4)),
        dailyReturn: Number(dailyReturn.toFixed(2)),
        acNav: acMap.has(date) ? Number(acMap.get(date)!.toFixed(4)) : null,
      };
    });

  const latest = history[history.length - 1];
  const parsed: ParsedFundData = {
    fundCode: code,
    name,
    managerName: managerName || '基金经理',
    sourceRate,
    rate,
    minPurchase,
    officialNav: latest ? latest.nav : 1,
    acNav: latest ? latest.acNav : null,
    officialChangePct: latest ? latest.dailyReturn : 0,
    navDate: latest ? latest.date : '',
    isUsdClass: /美元|现汇|现钞|USD/i.test(name),
    returns: {
      m1: syl1y,
      m3: syl3y,
      m6: syl6y,
      y1: syl1n,
    },
    history,
  };

  fundDetailCache.set(code, { data: parsed, expiresAt: now + 10 * 60 * 1000 });
  return parsed;
}

async function fetchFundGz(code: string): Promise<OfficialIntraday | null> {
  const now = Date.now();
  const cached = fundGzCache.get(code);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  try {
    const res = await fetchWithTimeout(
      `https://fundgz.1234567.com.cn/js/${code}.js?rt=${now}`,
      3500
    );
    if (!res.ok) {
      fundGzCache.set(code, { data: null, expiresAt: now + 120_000 });
      return null;
    }
    const text = await res.text();
    const match = text.match(/jsonpgz\((\{[\s\S]*?\})\);?/);
    if (!match) {
      fundGzCache.set(code, { data: null, expiresAt: now + 120_000 });
      return null;
    }
    const obj = JSON.parse(match[1]) as {
      gsz?: string;
      gszzl?: string;
      gztime?: string;
    };
    const gsz = Number(obj.gsz);
    const gszzl = Number(obj.gszzl);
    if (!Number.isFinite(gsz) || !Number.isFinite(gszzl) || gsz <= 0) {
      fundGzCache.set(code, { data: null, expiresAt: now + 120_000 });
      return null;
    }
    const result: OfficialIntraday = {
      gsz: Number(gsz.toFixed(4)),
      gszzl: Number(gszzl.toFixed(2)),
      gztime: obj.gztime || '',
    };
    fundGzCache.set(code, { data: result, expiresAt: now + 60_000 });
    return result;
  } catch {
    fundGzCache.set(code, { data: null, expiresAt: now + 60_000 });
    return null;
  }
}

function inferUsMarketState(): string {
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
    const day = parts.weekday;
    if (day === 'Sat' || day === 'Sun') return 'CLOSED';
    const mins = Number(parts.hour) * 60 + Number(parts.minute);
    if (mins >= 570 && mins < 960) return 'REGULAR'; // 09:30 - 16:00 ET
    if (mins >= 240 && mins < 570) return 'PRE'; // 04:00 - 09:30 ET
    if (mins >= 960 && mins < 1200) return 'POST'; // 16:00 - 20:00 ET
    return 'CLOSED';
  } catch {
    return 'CLOSED';
  }
}

async function fetchSinaBenchmarks(): Promise<{
  ndx: BenchmarkQuote | null;
  qqq: BenchmarkQuote | null;
  nqFutures: BenchmarkQuote | null;
  usdcny: BenchmarkQuote | null;
}> {
  const url = 'https://hq.sinajs.cn/list=gb_ndx,gb_qqq,hf_NQ,fx_susdcny';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Referer: 'https://finance.sina.com.cn/',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) {
      return { ndx: null, qqq: null, nqFutures: null, usdcny: null };
    }
    const text = await res.text();
    const map = new Map<string, string[]>();
    for (const line of text.split('\n')) {
      const m = line.match(/hq_str_([^=]+)="([^"]*)"/);
      if (m) map.set(m[1], m[2].split(','));
    }

    const now = Date.now();
    const marketState = inferUsMarketState();
    const usDateNow = toNewYorkDate(Math.floor(now / 1000));

    const parseGb = (key: string, symbol: string, name: string): BenchmarkQuote | null => {
      const p = map.get(key);
      if (!p || p.length < 6) return null;
      const price = Number(p[1]);
      const changePct = Number(p[2]);
      const change = Number(p[4]);
      if (!Number.isFinite(price) || price <= 0) return null;
      const prevClose = Number.isFinite(change) ? Number((price - change).toFixed(4)) : price;
      // p[3] is Beijing time "YYYY-MM-DD HH:mm:ss"; convert to US date (~13h behind)
      let tradeDate = usDateNow;
      if (p[3] && /^\d{4}-\d{2}-\d{2}/.test(p[3])) {
        const bjDate = new Date(`${p[3].replace(' ', 'T')}+08:00`);
        if (!Number.isNaN(bjDate.getTime())) {
          tradeDate = toNewYorkDate(Math.floor(bjDate.getTime() / 1000));
        }
      }
      return {
        symbol,
        name,
        price: Number(price.toFixed(4)),
        previousClose: prevClose,
        change: Number.isFinite(change) ? Number(change.toFixed(4)) : 0,
        changePct: Number.isFinite(changePct) ? Number(changePct.toFixed(2)) : 0,
        marketState,
        tradeDate,
        updatedAt: now,
      };
    };

    const parseNq = (): BenchmarkQuote | null => {
      const p = map.get('hf_NQ');
      if (!p || p.length < 8) return null;
      const price = Number(p[0]);
      const prevSettle = Number(p[7]);
      if (!Number.isFinite(price) || price <= 0) return null;
      const base = Number.isFinite(prevSettle) && prevSettle > 0 ? prevSettle : price;
      const change = Number((price - base).toFixed(4));
      const changePct = base > 0 ? Number(((change / base) * 100).toFixed(2)) : 0;
      return {
        symbol: 'NQ=F',
        name: '纳指100期货',
        price: Number(price.toFixed(2)),
        previousClose: Number(base.toFixed(2)),
        change,
        changePct,
        marketState,
        tradeDate: usDateNow,
        updatedAt: now,
      };
    };

    const parseFx = (): BenchmarkQuote | null => {
      const p = map.get('fx_susdcny');
      if (!p || p.length < 9) return null;
      const price = Number(p[8]) || Number(p[1]);
      const prevClose = Number(p[3]) || Number(p[5]) || price;
      if (!Number.isFinite(price) || price <= 0) return null;
      const change = Number((price - prevClose).toFixed(4));
      const pctRaw = Number(p[10]);
      const changePct =
        Number.isFinite(pctRaw) && Math.abs(pctRaw) > 0.0001
          ? Number(pctRaw.toFixed(2))
          : prevClose > 0
          ? Number(((change / prevClose) * 100).toFixed(2))
          : 0;
      return {
        symbol: 'USDCNY',
        name: '美元/人民币',
        price: Number(price.toFixed(4)),
        previousClose: Number(prevClose.toFixed(4)),
        change,
        changePct,
        marketState: 'REGULAR',
        tradeDate: usDateNow,
        updatedAt: now,
      };
    };

    return {
      ndx: parseGb('gb_ndx', '^NDX', '纳斯达克100'),
      qqq: parseGb('gb_qqq', 'QQQ', '纳指ETF (QQQ)'),
      nqFutures: parseNq(),
      usdcny: parseFx(),
    };
  } catch {
    return { ndx: null, qqq: null, nqFutures: null, usdcny: null };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTencentNdxHistory(): Promise<Array<{ date: string; close: number }>> {
  try {
    const url =
      'https://web.ifzq.gtimg.cn/appstock/app/usfqkline/get?param=usNDX,day,,,260,qfq';
    const res = await fetchWithTimeout(url, 7000);
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: {
        usNDX?: {
          day?: Array<Array<string | number>>;
        };
      };
    };
    const rows = json.data?.usNDX?.day || [];
    const history: Array<{ date: string; close: number }> = [];
    for (const row of rows) {
      if (Array.isArray(row) && row.length >= 3) {
        const date = String(row[0]);
        const close = Number(row[2]);
        if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(close) && close > 0) {
          history.push({ date, close: Number(close.toFixed(2)) });
        }
      }
    }
    return history;
  } catch {
    return [];
  }
}

async function getMarketBenchmark(): Promise<BenchmarkPayload> {
  const now = Date.now();
  if (benchmarkCache && benchmarkCache.expiresAt > now) {
    return benchmarkCache.data;
  }

  const prev = benchmarkCache?.data;
  const [sina, ndxHistory] = await Promise.all([
    fetchSinaBenchmarks(),
    prev && prev.ndxHistory.length > 0 ? Promise.resolve(prev.ndxHistory) : fetchTencentNdxHistory(),
  ]);

  const payload: BenchmarkPayload = {
    ndx: sina.ndx ?? prev?.ndx ?? null,
    qqq: sina.qqq ?? prev?.qqq ?? null,
    nqFutures: sina.nqFutures ?? prev?.nqFutures ?? null,
    usdcny: sina.usdcny ?? prev?.usdcny ?? null,
    ndxHistory: ndxHistory.length > 0 ? ndxHistory : prev?.ndxHistory ?? [],
    fetchedAt: now,
  };

  benchmarkCache = { data: payload, expiresAt: now + 30_000 };
  return payload;
}

function classifyFundMeta(name: string, ftype: string): {
  category: 'index_ndx' | 'global_active' | 'qdii_other';
  defaultBeta: number;
} {
  const text = `${name} ${ftype}`;
  if (/纳斯达克|纳指/i.test(text)) {
    if (/科技/i.test(text)) {
      return { category: 'index_ndx', defaultBeta: 1.08 };
    }
    return { category: 'index_ndx', defaultBeta: 0.95 };
  }
  if (/全球|精选|美国|标普|科技|互联网|海外/i.test(text)) {
    return { category: 'global_active', defaultBeta: 0.85 };
  }
  return { category: 'qdii_other', defaultBeta: 0.7 };
}

async function createAppServer() {
  const app = express();
  app.use(express.json());

  // 1. Live Nasdaq-100, QQQ, Futures & USD/CNY Benchmark API
  app.get('/api/market/benchmark', async (_req, res) => {
    try {
      const data = await getMarketBenchmark();
      res.json(data);
    } catch (err) {
      console.error('Benchmark API error:', err);
      res.status(502).json({ error: '行情基准拉取失败，请稍后重试' });
    }
  });

  // 2. Live Fund Search API (EastMoney FundSearch)
  app.get('/api/funds/search', async (req, res) => {
    const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!rawQuery || rawQuery.length > 40) {
      res.json({ results: [] });
      return;
    }

    try {
      const url = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(
        rawQuery
      )}`;
      const upstream = await fetchWithTimeout(url, 7000);
      if (!upstream.ok) {
        throw new Error(`Search HTTP ${upstream.status}`);
      }
      const json = (await upstream.json()) as {
        Datas?: Array<{
          CODE?: string;
          NAME?: string;
          CATEGORY?: number;
          FundBaseInfo?: {
            FCODE?: string;
            SHORTNAME?: string;
            JJGS?: string;
            FTYPE?: string;
            JJJL?: string;
            DWJZ?: number | string;
            FSRQ?: string;
          };
        }>;
      };

      const seen = new Set<string>();
      const results = (json.Datas || [])
        .filter((item) => {
          const code = item.CODE || item.FundBaseInfo?.FCODE || '';
          if (!FUND_CODE_RE.test(code) || seen.has(code)) return false;
          if (item.CATEGORY !== undefined && item.CATEGORY !== 700) return false;
          seen.add(code);
          return true;
        })
        .slice(0, 15)
        .map((item) => {
          const base = item.FundBaseInfo;
          const code = (item.CODE || base?.FCODE || '').trim();
          const name = (base?.SHORTNAME || item.NAME || '').trim();
          const ftype = (base?.FTYPE || '开放式基金').trim();
          const meta = classifyFundMeta(name, ftype);
          const navNum = Number(base?.DWJZ);
          return {
            fundCode: code,
            name,
            company: base?.JJGS || '',
            fundType: ftype,
            manager: base?.JJJL || '',
            latestNav: Number.isFinite(navNum) && navNum > 0 ? navNum : null,
            navDate: base?.FSRQ || '',
            category: meta.category,
            defaultBeta: meta.defaultBeta,
          };
        });

      res.json({ results });
    } catch (err) {
      console.error('Fund search error:', err);
      res.status(502).json({ error: '基金搜索服务暂时不可用', results: [] });
    }
  });

  // 3. Batch Fund Snapshots (Official NAV + Sparkline + Optional Official Intraday)
  app.get('/api/funds/batch', async (req, res) => {
    const rawCodes = typeof req.query.codes === 'string' ? req.query.codes : '';
    const codes = Array.from(
      new Set(
        rawCodes
          .split(',')
          .map((c) => c.trim())
          .filter((c) => FUND_CODE_RE.test(c))
      )
    ).slice(0, 25);

    if (codes.length === 0) {
      res.json({ funds: {} });
      return;
    }

    const entries = await Promise.all(
      codes.map(async (code) => {
        try {
          const [detail, gz] = await Promise.all([
            fetchFundPingzhong(code),
            fetchFundGz(code),
          ]);
          const sparkline = detail.history.slice(-30).map((pt) => ({
            date: pt.date,
            nav: pt.nav,
          }));
          return [
            code,
            {
              fundCode: detail.fundCode,
              name: detail.name,
              officialNav: detail.officialNav,
              acNav: detail.acNav,
              officialChangePct: detail.officialChangePct,
              navDate: detail.navDate,
              returns: detail.returns,
              managerName: detail.managerName,
              officialIntraday: gz,
              sparkline,
              isUsdClass: detail.isUsdClass,
            },
          ] as const;
        } catch (err) {
          return [
            code,
            {
              fundCode: code,
              name: `基金 ${code}`,
              officialNav: 0,
              acNav: null,
              officialChangePct: 0,
              navDate: '',
              returns: { m1: null, m3: null, m6: null, y1: null },
              managerName: '',
              officialIntraday: null,
              sparkline: [],
              isUsdClass: false,
              error: err instanceof Error ? err.message : '数据获取失败',
            },
          ] as const;
        }
      })
    );

    const funds: Record<string, unknown> = {};
    for (const [code, data] of entries) {
      funds[code] = data;
    }
    res.json({ funds, fetchedAt: Date.now() });
  });

  // 4. Full Fund History & Metadata
  app.get('/api/funds/:code/history', async (req, res) => {
    const code = (req.params.code || '').trim();
    if (!FUND_CODE_RE.test(code)) {
      res.status(400).json({ error: '无效的6位基金代码' });
      return;
    }

    try {
      const detail = await fetchFundPingzhong(code);
      res.json({
        fundCode: detail.fundCode,
        name: detail.name,
        managerName: detail.managerName,
        sourceRate: detail.sourceRate,
        rate: detail.rate,
        minPurchase: detail.minPurchase,
        returns: detail.returns,
        history: detail.history,
      });
    } catch (err) {
      console.error(`Fund history error (${code}):`, err);
      res.status(502).json({ error: '无法加载该基金的历史净值数据' });
    }
  });

  // Vite Dev Middleware or Production Static Files
  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

createAppServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
