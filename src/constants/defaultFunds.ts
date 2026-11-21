import { FundCategory, WatchlistItem } from '../types';

export const DEFAULT_WATCHLIST: WatchlistItem[] = [
  {
    fundCode: '012920',
    name: '易方达全球成长精选混合(QDII)人民币A',
    category: 'global_active',
    beta: 0.88,
  },
  {
    fundCode: '270023',
    name: '广发全球精选股票(QDII)人民币A',
    category: 'global_active',
    beta: 0.9,
  },
  {
    fundCode: '161130',
    name: '易方达纳斯达克100ETF联接(QDII-LOF)A',
    category: 'index_ndx',
    beta: 0.95,
  },
  {
    fundCode: '270042',
    name: '广发纳斯达克100ETF联接人民币(QDII)A',
    category: 'index_ndx',
    beta: 0.95,
  },
  {
    fundCode: '017091',
    name: '景顺长城纳斯达克科技ETF联接(QDII)A',
    category: 'index_ndx',
    beta: 1.08,
  },
  {
    fundCode: '160213',
    name: '国泰纳斯达克100指数',
    category: 'index_ndx',
    beta: 0.95,
  },
  {
    fundCode: '000834',
    name: '大成纳斯达克100ETF联接(QDII)A',
    category: 'index_ndx',
    beta: 0.95,
  },
];

export const QUICK_SEARCH_PRESETS = [
  { code: '012920', label: '易方达全球成长精选' },
  { code: '270023', label: '广发全球精选' },
  { code: '161130', label: '易方达纳指100' },
  { code: '017091', label: '景顺纳指科技' },
  { code: '050025', label: '博时标普500' },
  { code: '118001', label: '易方达亚洲精选' },
];

export const CATEGORY_LABELS: Record<FundCategory, string> = {
  index_ndx: '纳指指数',
  global_active: '全球精选',
  qdii_other: '海外QDII',
};
