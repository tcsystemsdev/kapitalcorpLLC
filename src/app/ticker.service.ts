import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, timer, Subscription } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

export interface TickerItem {
  symbol: string;
  change: number;       // percentage change
  price?: number;       // current price
  direction: 'up' | 'down';
}

// --- CoinGecko simple/price response shape ---
interface CoinGeckoResponse {
  [id: string]: {
    usd: number;
    usd_24h_change: number;
  };
}

// --- ExchangeRate-API open access response ---
interface ExchangeRateResponse {
  result: string;
  rates: Record<string, number>;
}

@Injectable({ providedIn: 'root' })
export class TickerService implements OnDestroy {

  // ── Global ticker (crypto + forex) ────────────────────────
  private readonly tickerSubject = new BehaviorSubject<TickerItem[]>(this.defaultGlobalItems());
  readonly ticker$: Observable<TickerItem[]> = this.tickerSubject.asObservable();

  // ── LKR ticker (Sri Lankan Rupee vs major currencies) ─────
  private readonly lkrSubject = new BehaviorSubject<TickerItem[]>(this.defaultLkrItems());
  readonly lkrTicker$: Observable<TickerItem[]> = this.lkrSubject.asObservable();

  private cryptoSub?: Subscription;
  private forexSub?: Subscription;
  private lkrSub?: Subscription;

  // Cached previous rates for computing % change
  private prevForexRates: Record<string, number> | null = null;
  private prevLkrRates: Record<string, number> | null = null;

  // ── API URLs ──────────────────────────────────────────────
  private readonly COINGECKO =
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,pax-gold,solana,ripple,binancecoin&vs_currencies=usd&include_24hr_change=true';
  private readonly EXCHANGE_RATE_USD = 'https://open.er-api.com/v6/latest/USD';
  private readonly EXCHANGE_RATE_LKR = 'https://open.er-api.com/v6/latest/LKR';

  constructor(private http: HttpClient) {
    this.startPolling();
  }

  // ── Polling ───────────────────────────────────────────────
  private startPolling(): void {
    // Crypto: refresh every 60 seconds
    this.cryptoSub = timer(0, 60_000)
      .pipe(switchMap(() => this.fetchCrypto()))
      .subscribe(items => this.mergeGlobal('crypto', items));

    // Forex (USD base): refresh every 30 minutes
    this.forexSub = timer(0, 30 * 60_000)
      .pipe(switchMap(() => this.fetchForex()))
      .subscribe(items => this.mergeGlobal('forex', items));

    // LKR rates: refresh every 30 minutes
    this.lkrSub = timer(0, 30 * 60_000)
      .pipe(switchMap(() => this.fetchLkr()))
      .subscribe(items => {
        if (items.length > 0) {
          this.lkrSubject.next(items);
        }
      });
  }

  // ── Fetch Crypto (CoinGecko — has 24h % change built-in) ──
  private fetchCrypto(): Observable<TickerItem[]> {
    return this.http.get<CoinGeckoResponse>(this.COINGECKO).pipe(
      map(res => {
        const items: TickerItem[] = [];
        const coins: { id: string; label: string }[] = [
          { id: 'bitcoin', label: 'BTC/USD' },
          { id: 'ethereum', label: 'ETH/USD' },
          { id: 'pax-gold', label: 'GOLD' },
          { id: 'solana', label: 'SOL/USD' },
          { id: 'ripple', label: 'XRP/USD' },
          { id: 'binancecoin', label: 'BNB/USD' },
        ];

        for (const coin of coins) {
          const data = res[coin.id];
          if (data) {
            const change = data.usd_24h_change ?? 0;
            items.push({
              symbol: coin.label,
              change: Math.abs(+change.toFixed(2)),
              price: data.usd,
              direction: change >= 0 ? 'up' : 'down',
            });
          }
        }
        return items;
      }),
      catchError(() => of([] as TickerItem[])),
    );
  }

  // ── Fetch Forex USD base (ExchangeRate-API) ───────────────
  private fetchForex(): Observable<TickerItem[]> {
    return this.http.get<ExchangeRateResponse>(this.EXCHANGE_RATE_USD).pipe(
      map(res => {
        if (res.result !== 'success') return [];

        const items: TickerItem[] = [];
        const pairs: { key: string; label: string }[] = [
          { key: 'EUR', label: 'USD/EUR' },
          { key: 'GBP', label: 'USD/GBP' },
          { key: 'JPY', label: 'USD/JPY' },
          { key: 'AED', label: 'USD/AED' },
          { key: 'CHF', label: 'USD/CHF' },
        ];

        for (const pair of pairs) {
          const currentRate = res.rates[pair.key];
          if (currentRate != null) {
            let pctChange = 0;
            if (this.prevForexRates && this.prevForexRates[pair.key]) {
              const prev = this.prevForexRates[pair.key];
              pctChange = ((currentRate - prev) / prev) * 100;
            }
            items.push({
              symbol: pair.label,
              change: Math.abs(+pctChange.toFixed(2)),
              price: currentRate,
              direction: pctChange >= 0 ? 'up' : 'down',
            });
          }
        }

        this.prevForexRates = { ...res.rates };
        return items;
      }),
      catchError(() => of([] as TickerItem[])),
    );
  }

  // ── Fetch LKR rates (ExchangeRate-API, LKR base) ─────────
  private fetchLkr(): Observable<TickerItem[]> {
    return this.http.get<ExchangeRateResponse>(this.EXCHANGE_RATE_LKR).pipe(
      map(res => {
        if (res.result !== 'success') return [];

        const items: TickerItem[] = [];
        // Pairs: show "how many LKR per 1 unit of foreign currency"
        const pairs: { key: string; label: string }[] = [
          { key: 'USD', label: 'USD/LKR' },
          { key: 'EUR', label: 'EUR/LKR' },
          { key: 'GBP', label: 'GBP/LKR' },
          { key: 'AED', label: 'AED/LKR' },
          { key: 'INR', label: 'INR/LKR' },
          { key: 'JPY', label: 'JPY/LKR' },
          { key: 'AUD', label: 'AUD/LKR' },
          { key: 'SGD', label: 'SGD/LKR' },
          { key: 'CNY', label: 'CNY/LKR' },
        ];

        for (const pair of pairs) {
          const lkrToForeign = res.rates[pair.key];
          if (lkrToForeign != null && lkrToForeign !== 0) {
            // Invert: LKR→foreign rate to get "1 foreign = X LKR"
            const foreignToLkr = +(1 / lkrToForeign).toFixed(2);

            let pctChange = 0;
            if (this.prevLkrRates && this.prevLkrRates[pair.key]) {
              const prev = this.prevLkrRates[pair.key];
              pctChange = ((foreignToLkr - prev) / prev) * 100;
            }

            items.push({
              symbol: pair.label,
              change: Math.abs(+pctChange.toFixed(2)),
              price: foreignToLkr,
              direction: pctChange >= 0 ? 'up' : 'down',
            });
          }
        }

        // Store inverted rates for next comparison
        const invertedRates: Record<string, number> = {};
        for (const pair of pairs) {
          const rate = res.rates[pair.key];
          if (rate != null && rate !== 0) {
            invertedRates[pair.key] = +(1 / rate).toFixed(2);
          }
        }
        this.prevLkrRates = invertedRates;

        return items;
      }),
      catchError(() => of([] as TickerItem[])),
    );
  }

  // ── Merge global ticker updates ───────────────────────────
  private cryptoItems: TickerItem[] = [];
  private forexItems: TickerItem[] = [];

  private mergeGlobal(source: 'crypto' | 'forex', items: TickerItem[]): void {
    if (source === 'crypto' && items.length) this.cryptoItems = items;
    if (source === 'forex' && items.length) this.forexItems = items;

    const merged = [...this.forexItems, ...this.cryptoItems];
    if (merged.length > 0) {
      this.tickerSubject.next(merged);
    }
  }

  // ── Default items ─────────────────────────────────────────
  private defaultGlobalItems(): TickerItem[] {
    return [
      { symbol: 'BTC/USD', change: 0, direction: 'up' },
      { symbol: 'ETH/USD', change: 0, direction: 'up' },
      { symbol: 'GOLD', change: 0, direction: 'up' },
      { symbol: 'SOL/USD', change: 0, direction: 'up' },
      { symbol: 'XRP/USD', change: 0, direction: 'up' },
      { symbol: 'BNB/USD', change: 0, direction: 'up' },
      { symbol: 'USD/EUR', change: 0, direction: 'up' },
      { symbol: 'USD/GBP', change: 0, direction: 'up' },
      { symbol: 'USD/JPY', change: 0, direction: 'up' },
      { symbol: 'USD/AED', change: 0, direction: 'up' },
      { symbol: 'USD/CHF', change: 0, direction: 'up' },
    ];
  }

  private defaultLkrItems(): TickerItem[] {
    return [
      { symbol: 'USD/LKR', change: 0, price: 334.07, direction: 'up' },
      { symbol: 'EUR/LKR', change: 0, price: 382.26, direction: 'up' },
      { symbol: 'GBP/LKR', change: 0, price: 443.21, direction: 'up' },
      { symbol: 'AED/LKR', change: 0, price: 90.97, direction: 'up' },
      { symbol: 'INR/LKR', change: 0, price: 3.53, direction: 'up' },
      { symbol: 'JPY/LKR', change: 0, price: 2.07, direction: 'up' },
      { symbol: 'AUD/LKR', change: 0, price: 233.88, direction: 'up' },
      { symbol: 'SGD/LKR', change: 0, price: 258.11, direction: 'up' },
      { symbol: 'CNY/LKR', change: 0, price: 49.25, direction: 'up' },
    ];
  }

  ngOnDestroy(): void {
    this.cryptoSub?.unsubscribe();
    this.forexSub?.unsubscribe();
    this.lkrSub?.unsubscribe();
  }
}
