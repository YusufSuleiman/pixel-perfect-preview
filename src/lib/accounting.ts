/**
 * Investment accounting engine.
 *
 * Everything the UI shows is DERIVED from the raw ledgers (transactions +
 * cash movements + manual prices). Nothing aggregated is ever stored.
 *
 * Core conventions
 * ----------------
 * - Cost basis EXCLUDES commissions (commissions are tracked as their own
 *   expense ledger and never silently folded into capital or profit).
 * - Cash is split into two provenance pools that always sum to total cash:
 *     capitalCash  = money that originated from the user's own deposits
 *     profitCash   = money that originated from realized investment gains
 * - Buys draw funding from the pools proportionally (or by manual override).
 * - Sells return the sold shares' invested capital to the capital pool first;
 *   any surplus proceeds land in the profit pool. Losses therefore erode
 *   profit before capital, then capital.
 */

export type TxType = "BUY" | "SELL";
export type CostBasisMethod = "WAC" | "FIFO";
export type CashKind = "DEPOSIT" | "WITHDRAWAL" | "FEE";
export type PriceSource = "MANUAL" | "API" | "LAST_TRADE";

export interface Transaction {
  id: string;
  trade_date: string;
  type: TxType;
  ticker: string;
  company: string | null;
  shares: number;
  price: number;
  commission: number;
  source_override: boolean;
  capital_portion: number | null;
  profit_portion: number | null;
  notes: string | null;
  created_at: string;
}

export interface CashMovement {
  id: string;
  move_date: string;
  kind: CashKind;
  amount: number;
  description: string | null;
  created_at: string;
}

export interface MarketPrice {
  ticker: string;
  price: number;
  source: PriceSource;
  as_of: string;
}

export interface Lot {
  shares: number;
  costPerShare: number;
  capitalPerShare: number;
  profitPerShare: number;
}

export interface PositionState {
  ticker: string;
  company: string | null;
  shares: number;
  costBasis: number;
  capitalInvested: number;
  profitInvested: number;
  lots: Lot[];
  sharesBought: number;
  sharesSold: number;
  buyCommission: number;
  sellCommission: number;
  grossInvested: number;
  saleProceeds: number;
  realizedGross: number;
  realizedNet: number;
  lastTradeDate: string | null;
  lastTradePrice: number;
}

export interface Snapshot {
  cash: number;
  capitalCash: number;
  profitCash: number;
  shares: number;
  costBasis: number;
  avgCost: number;
}

export interface LedgerEntry {
  kind: "TRANSACTION" | "CASH";
  id: string;
  date: string;
  created_at: string;
  label: string;
  /** signed cash movement */
  cashDelta: number;
  transaction?: Transaction;
  cashMovement?: CashMovement;
  /** funding provenance for buys / withdrawals, source of funds */
  capitalPortion: number;
  profitPortion: number;
  gross: number;
  commission: number;
  realizedGross: number;
  realizedNet: number;
  costOfSharesSold: number;
  sharesAfter: number;
  before: Snapshot;
  after: Snapshot;
  warnings: string[];
}

export interface PositionSummary extends PositionState {
  avgCost: number;
  marketPrice: number | null;
  priceSource: PriceSource | "COST_BASIS";
  priceAsOf: string | null;
  marketValue: number;
  unrealized: number;
  unrealizedPct: number;
  totalCommission: number;
}

export interface Totals {
  totalDeposits: number;
  totalWithdrawals: number;
  capitalWithdrawn: number;
  profitWithdrawn: number;

  /** all new money the user personally added */
  grossCapital: number;
  /** capital still inside the system (cash + invested) */
  netCapital: number;
  capitalCash: number;
  capitalInvested: number;
  /** gross value of buys funded from own capital, before commissions */
  grossCapitalDeployed: number;
  netCapitalDeployed: number;

  realizedGrossProfit: number;
  realizedNetProfit: number;
  profitCash: number;
  profitReinvested: number;
  profitRemaining: number;

  unrealizedPL: number;
  unrealizedPct: number;

  buyCommission: number;
  sellCommission: number;
  otherFees: number;
  totalCommission: number;

  cash: number;
  costBasis: number;
  portfolioValue: number;
  portfolioValueAtCost: number;
  totalAccountValue: number;
  totalInvestedGross: number;
  totalSaleProceeds: number;
  sharesOwned: number;
  openPositions: number;

  overallPL: number;
  overallReturnPct: number;
  realizedReturnPct: number;
  pricedPositions: number;
  unpricedPositions: number;
}

export interface AccountingResult {
  ledger: LedgerEntry[];
  positions: PositionSummary[];
  totals: Totals;
  warnings: string[];
  reconciliation: {
    openingCash: number;
    deposits: number;
    saleProceeds: number;
    purchases: number;
    buyCommission: number;
    sellCommission: number;
    otherFees: number;
    withdrawals: number;
    computedCash: number;
    runningCash: number;
    balanced: boolean;
  };
}

const EPS = 1e-6;
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const clean = (n: number) => (Math.abs(n) < EPS ? 0 : n);

function chronological(a: { date: string; created_at: string }, b: { date: string; created_at: string }) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

function emptyPosition(ticker: string, company: string | null): PositionState {
  return {
    ticker,
    company,
    shares: 0,
    costBasis: 0,
    capitalInvested: 0,
    profitInvested: 0,
    lots: [],
    sharesBought: 0,
    sharesSold: 0,
    buyCommission: 0,
    sellCommission: 0,
    grossInvested: 0,
    saleProceeds: 0,
    realizedGross: 0,
    realizedNet: 0,
    lastTradeDate: null,
    lastTradePrice: 0,
  };
}

/** Split an amount across the capital / profit pools proportionally. */
function splitProportional(amount: number, capital: number, profit: number) {
  const total = capital + profit;
  if (amount <= 0) return { capital: 0, profit: 0 };
  if (total <= EPS) return { capital: amount, profit: 0 };
  if (amount >= total - EPS) return { capital, profit: amount - capital };
  const fromCapital = (amount * capital) / total;
  return { capital: fromCapital, profit: amount - fromCapital };
}

export function computeAccounting(
  transactions: Transaction[],
  cashMovements: CashMovement[],
  prices: MarketPrice[] = [],
  method: CostBasisMethod = "WAC",
): AccountingResult {
  const events: Array<{ date: string; created_at: string; tx?: Transaction; cm?: CashMovement }> = [
    ...transactions.map((t) => ({ date: t.trade_date, created_at: t.created_at, tx: t })),
    ...cashMovements.map((c) => ({ date: c.move_date, created_at: c.created_at, cm: c })),
  ].sort(chronological);

  const positions = new Map<string, PositionState>();
  const ledger: LedgerEntry[] = [];
  const warnings: string[] = [];

  let cash = 0;
  let capitalCash = 0;
  let profitCash = 0;

  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let capitalWithdrawn = 0;
  let profitWithdrawn = 0;
  let grossCapitalDeployed = 0;
  let profitDeployed = 0;
  let buyCommission = 0;
  let sellCommission = 0;
  let otherFees = 0;
  let realizedGrossProfit = 0;
  let realizedNetProfit = 0;
  let totalInvestedGross = 0;
  let totalSaleProceeds = 0;

  const snap = (pos?: PositionState): Snapshot => ({
    cash: clean(cash),
    capitalCash: clean(capitalCash),
    profitCash: clean(profitCash),
    shares: pos ? clean(pos.shares) : 0,
    costBasis: pos ? clean(pos.costBasis) : 0,
    avgCost: pos && pos.shares > EPS ? pos.costBasis / pos.shares : 0,
  });

  for (const ev of events) {
    const entryWarnings: string[] = [];

    if (ev.cm) {
      const cm = ev.cm;
      const before = snap();
      let capitalPortion = 0;
      let profitPortion = 0;
      let cashDelta = 0;

      if (cm.kind === "DEPOSIT") {
        cash += cm.amount;
        capitalCash += cm.amount;
        totalDeposits += cm.amount;
        capitalPortion = cm.amount;
        cashDelta = cm.amount;
      } else {
        if (cm.amount > cash + EPS) {
          entryWarnings.push(
            `${cm.kind === "FEE" ? "Fee" : "Withdrawal"} of ${cm.amount} exceeds available cash of ${round2(cash)}.`,
          );
        }
        const split = splitProportional(cm.amount, capitalCash, profitCash);
        capitalCash -= split.capital;
        profitCash -= split.profit;
        cash -= cm.amount;
        capitalPortion = split.capital;
        profitPortion = split.profit;
        cashDelta = -cm.amount;
        if (cm.kind === "WITHDRAWAL") {
          totalWithdrawals += cm.amount;
          capitalWithdrawn += split.capital;
          profitWithdrawn += split.profit;
        } else {
          otherFees += cm.amount;
        }
      }

      ledger.push({
        kind: "CASH",
        id: cm.id,
        date: cm.move_date,
        created_at: cm.created_at,
        label: cm.kind,
        cashDelta,
        cashMovement: cm,
        capitalPortion,
        profitPortion,
        gross: cm.amount,
        commission: 0,
        realizedGross: 0,
        realizedNet: 0,
        costOfSharesSold: 0,
        sharesAfter: 0,
        before,
        after: snap(),
        warnings: entryWarnings,
      });
      warnings.push(...entryWarnings);
      continue;
    }

    const tx = ev.tx!;
    const key = tx.ticker.trim().toUpperCase();
    const pos = positions.get(key) ?? emptyPosition(key, tx.company);
    if (tx.company) pos.company = tx.company;
    positions.set(key, pos);

    const before = snap(pos);
    const gross = tx.shares * tx.price;

    if (tx.type === "BUY") {
      const funding = gross + tx.commission;
      if (funding > cash + EPS) {
        entryWarnings.push(
          `Purchase needs ${round2(funding)} but only ${round2(cash)} cash was available on ${tx.trade_date}. Add a deposit dated on or before this trade.`,
        );
      }

      let split = splitProportional(funding, capitalCash, profitCash);
      if (tx.source_override && tx.capital_portion != null && tx.profit_portion != null) {
        const sum = tx.capital_portion + tx.profit_portion;
        if (Math.abs(sum - funding) > 0.01) {
          entryWarnings.push(
            `Manual funding split (${round2(sum)}) does not equal the cash required (${round2(funding)}).`,
          );
        }
        split = { capital: tx.capital_portion, profit: tx.profit_portion };
      }

      capitalCash -= split.capital;
      profitCash -= split.profit;
      cash -= funding;

      // Commission is an expense: it is funded, but never becomes cost basis.
      const capitalToShares = gross <= EPS ? 0 : (split.capital * gross) / funding;
      const profitToShares = gross - capitalToShares;

      pos.shares += tx.shares;
      pos.costBasis += gross;
      pos.capitalInvested += capitalToShares;
      pos.profitInvested += profitToShares;
      pos.lots.push({
        shares: tx.shares,
        costPerShare: tx.price,
        capitalPerShare: tx.shares > 0 ? capitalToShares / tx.shares : 0,
        profitPerShare: tx.shares > 0 ? profitToShares / tx.shares : 0,
      });
      pos.sharesBought += tx.shares;
      pos.buyCommission += tx.commission;
      pos.grossInvested += gross;
      pos.lastTradeDate = tx.trade_date;
      pos.lastTradePrice = tx.price;

      buyCommission += tx.commission;
      grossCapitalDeployed += capitalToShares;
      profitDeployed += profitToShares;
      totalInvestedGross += gross;

      ledger.push({
        kind: "TRANSACTION",
        id: tx.id,
        date: tx.trade_date,
        created_at: tx.created_at,
        label: "BUY",
        cashDelta: -funding,
        transaction: tx,
        capitalPortion: split.capital,
        profitPortion: split.profit,
        gross,
        commission: tx.commission,
        realizedGross: 0,
        realizedNet: 0,
        costOfSharesSold: 0,
        sharesAfter: clean(pos.shares),
        before,
        after: snap(pos),
        warnings: entryWarnings,
      });
      warnings.push(...entryWarnings);
      continue;
    }

    // SELL
    let sharesToSell = tx.shares;
    if (sharesToSell > pos.shares + EPS) {
      entryWarnings.push(
        `Sold ${tx.shares} ${key} shares on ${tx.trade_date} but only ${round2(pos.shares)} were held. Check the ledger order.`,
      );
      sharesToSell = Math.min(sharesToSell, pos.shares);
    }

    let costOfSold = 0;
    let capitalOfSold = 0;
    let profitOfSold = 0;

    if (method === "FIFO") {
      let remaining = sharesToSell;
      while (remaining > EPS && pos.lots.length > 0) {
        const lot = pos.lots[0]!;
        const take = Math.min(lot.shares, remaining);
        costOfSold += take * lot.costPerShare;
        capitalOfSold += take * lot.capitalPerShare;
        profitOfSold += take * lot.profitPerShare;
        lot.shares -= take;
        remaining -= take;
        if (lot.shares <= EPS) pos.lots.shift();
      }
    } else {
      const frac = pos.shares > EPS ? sharesToSell / pos.shares : 0;
      costOfSold = pos.costBasis * frac;
      capitalOfSold = pos.capitalInvested * frac;
      profitOfSold = pos.profitInvested * frac;
      // keep the lot list consistent with the average-cost view
      const remainingShares = pos.shares - sharesToSell;
      pos.lots =
        remainingShares > EPS
          ? [
              {
                shares: remainingShares,
                costPerShare: (pos.costBasis - costOfSold) / remainingShares,
                capitalPerShare: (pos.capitalInvested - capitalOfSold) / remainingShares,
                profitPerShare: (pos.profitInvested - profitOfSold) / remainingShares,
              },
            ]
          : [];
    }

    const grossSale = tx.shares * tx.price;
    const proceeds = grossSale - tx.commission;
    const realizedGross = grossSale - costOfSold;
    const realizedNet = realizedGross - tx.commission;

    pos.shares = clean(pos.shares - sharesToSell);
    pos.costBasis = clean(pos.costBasis - costOfSold);
    pos.capitalInvested = clean(pos.capitalInvested - capitalOfSold);
    pos.profitInvested = clean(pos.profitInvested - profitOfSold);
    if (pos.shares <= EPS) {
      pos.shares = 0;
      pos.costBasis = 0;
      pos.capitalInvested = 0;
      pos.profitInvested = 0;
      pos.lots = [];
    }
    pos.sharesSold += tx.shares;
    pos.sellCommission += tx.commission;
    pos.saleProceeds += proceeds;
    pos.realizedGross += realizedGross;
    pos.realizedNet += realizedNet;
    pos.lastTradeDate = tx.trade_date;
    pos.lastTradePrice = tx.price;

    // Return the sold shares' own capital first; the surplus is profit.
    const capitalBack = Math.max(0, Math.min(capitalOfSold, proceeds));
    const profitBack = proceeds - capitalBack;
    cash += proceeds;
    capitalCash += capitalBack;
    profitCash += profitBack;

    // Reinvested profit that came back out of the position is no longer "reinvested".
    profitDeployed = Math.max(0, profitDeployed - profitOfSold);
    grossCapitalDeployed = Math.max(0, grossCapitalDeployed - capitalOfSold);

    sellCommission += tx.commission;
    realizedGrossProfit += realizedGross;
    realizedNetProfit += realizedNet;
    totalSaleProceeds += proceeds;

    ledger.push({
      kind: "TRANSACTION",
      id: tx.id,
      date: tx.trade_date,
      created_at: tx.created_at,
      label: "SELL",
      cashDelta: proceeds,
      transaction: tx,
      capitalPortion: capitalBack,
      profitPortion: profitBack,
      gross: grossSale,
      commission: tx.commission,
      realizedGross,
      realizedNet,
      costOfSharesSold: costOfSold,
      sharesAfter: pos.shares,
      before,
      after: snap(pos),
      warnings: entryWarnings,
    });
    warnings.push(...entryWarnings);
  }

  const priceMap = new Map(prices.map((p) => [p.ticker.trim().toUpperCase(), p]));

  const summaries: PositionSummary[] = [...positions.values()]
    .map((pos) => {
      const avgCost = pos.shares > EPS ? pos.costBasis / pos.shares : 0;
      const mp = priceMap.get(pos.ticker);
      const hasPrice = !!mp && pos.shares > EPS;
      const priceUsed = mp ? mp.price : pos.shares > EPS ? avgCost : 0;
      const marketValue = pos.shares * priceUsed;
      const unrealized = pos.shares > EPS ? marketValue - pos.costBasis : 0;
      return {
        ...pos,
        avgCost,
        marketPrice: mp ? mp.price : null,
        priceSource: (mp ? mp.source : "COST_BASIS") as PriceSource | "COST_BASIS",
        priceAsOf: mp ? mp.as_of : null,
        marketValue,
        unrealized,
        unrealizedPct: pos.costBasis > EPS ? (unrealized / pos.costBasis) * 100 : 0,
        totalCommission: pos.buyCommission + pos.sellCommission,
        ...(hasPrice ? {} : {}),
      };
    })
    .sort((a, b) => b.marketValue - a.marketValue || a.ticker.localeCompare(b.ticker));

  const open = summaries.filter((p) => p.shares > EPS);
  const portfolioValue = open.reduce((s, p) => s + p.marketValue, 0);
  const portfolioValueAtCost = open.reduce((s, p) => s + p.costBasis, 0);
  const unrealizedPL = portfolioValue - portfolioValueAtCost;
  const capitalInvested = open.reduce((s, p) => s + p.capitalInvested, 0);
  const profitReinvested = open.reduce((s, p) => s + p.profitInvested, 0);
  const totalAccountValue = cash + portfolioValue;
  const netContributed = totalDeposits - totalWithdrawals;
  const overallPL = totalAccountValue - netContributed;

  const computedCash =
    totalDeposits + totalSaleProceeds - (totalInvestedGross + buyCommission) - totalWithdrawals - otherFees;

  const totals: Totals = {
    totalDeposits: clean(totalDeposits),
    totalWithdrawals: clean(totalWithdrawals),
    capitalWithdrawn: clean(capitalWithdrawn),
    profitWithdrawn: clean(profitWithdrawn),
    grossCapital: clean(totalDeposits),
    netCapital: clean(capitalCash + capitalInvested),
    capitalCash: clean(capitalCash),
    capitalInvested: clean(capitalInvested),
    grossCapitalDeployed: clean(grossCapitalDeployed),
    netCapitalDeployed: clean(grossCapitalDeployed - buyCommission > 0 ? grossCapitalDeployed - buyCommission : 0),
    realizedGrossProfit: clean(realizedGrossProfit),
    realizedNetProfit: clean(realizedNetProfit),
    profitCash: clean(profitCash),
    profitReinvested: clean(profitReinvested),
    profitRemaining: clean(profitCash + profitReinvested),
    unrealizedPL: clean(unrealizedPL),
    unrealizedPct: portfolioValueAtCost > EPS ? (unrealizedPL / portfolioValueAtCost) * 100 : 0,
    buyCommission: clean(buyCommission),
    sellCommission: clean(sellCommission),
    otherFees: clean(otherFees),
    totalCommission: clean(buyCommission + sellCommission + otherFees),
    cash: clean(cash),
    costBasis: clean(portfolioValueAtCost),
    portfolioValue: clean(portfolioValue),
    portfolioValueAtCost: clean(portfolioValueAtCost),
    totalAccountValue: clean(totalAccountValue),
    totalInvestedGross: clean(totalInvestedGross),
    totalSaleProceeds: clean(totalSaleProceeds),
    sharesOwned: clean(open.reduce((s, p) => s + p.shares, 0)),
    openPositions: open.length,
    overallPL: clean(overallPL),
    overallReturnPct: totalDeposits > EPS ? (overallPL / totalDeposits) * 100 : 0,
    realizedReturnPct: totalDeposits > EPS ? (realizedNetProfit / totalDeposits) * 100 : 0,
    pricedPositions: open.filter((p) => p.marketPrice != null).length,
    unpricedPositions: open.filter((p) => p.marketPrice == null).length,
  };

  if (Math.abs(clean(capitalCash + profitCash - cash)) > 0.01) {
    warnings.push("Capital and profit cash pools do not sum to available cash. Run a recalculation.");
  }

  return {
    ledger,
    positions: summaries,
    totals,
    warnings,
    reconciliation: {
      openingCash: 0,
      deposits: clean(totalDeposits),
      saleProceeds: clean(totalSaleProceeds),
      purchases: clean(totalInvestedGross),
      buyCommission: clean(buyCommission),
      sellCommission: clean(sellCommission),
      otherFees: clean(otherFees),
      withdrawals: clean(totalWithdrawals),
      computedCash: clean(computedCash),
      runningCash: clean(cash),
      balanced: Math.abs(computedCash - cash) < 0.01,
    },
  };
}
