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

  private readonly tickerSubject = new BehaviorSubject<TickerItem[]>(this.defaultItems());
  readonly ticker$: Observable<TickerItem[]> = this.tickerSubject.asObservable();

  private cryptoSub?: Subscription;
  private forexSub?: Subscription;

  // Cached previous forex rates for computing % change
  private prevForexRates: Record<string, number> | null = null;

  // ── API URLs ──────────────────────────────────────────────
  private readonly COINGECKO =
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,pax-gold,solana,ripple,binancecoin&vs_currencies=usd&include_24hr_change=true';
  private readonly EXCHANGE_RATE = 'https://open.er-api.com/v6/latest/USD';

  constructor(private http: HttpClient) {
    this.startPolling();
  }

  // ── Polling ───────────────────────────────────────────────
  private startPolling(): void {
    // Crypto: refresh every 60 seconds
    this.cryptoSub = timer(0, 60_000)
      .pipe(switchMap(() => this.fetchCrypto()))
      .subscribe(items => this.merge('crypto', items));

    // Forex: refresh every 30 minutes (open API updates once per day)
    this.forexSub = timer(0, 30 * 60_000)
      .pipe(switchMap(() => this.fetchForex()))
      .subscribe(items => this.merge('forex', items));
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

  // ── Fetch Forex (ExchangeRate-API open access) ────────────
  private fetchForex(): Observable<TickerItem[]> {
    return this.http.get<ExchangeRateResponse>(this.EXCHANGE_RATE).pipe(
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
            // Compute % change vs previously cached rates
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

        // Store current as "previous" for next poll
        this.prevForexRates = { ...res.rates };
        return items;
      }),
      catchError(() => of([] as TickerItem[])),
    );
  }

  // ── Merge partial updates into the full list ──────────────
  private cryptoItems: TickerItem[] = [];
  private forexItems: TickerItem[] = [];

  private merge(source: 'crypto' | 'forex', items: TickerItem[]): void {
    if (source === 'crypto' && items.length) this.cryptoItems = items;
    if (source === 'forex' && items.length) this.forexItems = items;

    const merged = [...this.forexItems, ...this.cryptoItems];
    if (merged.length > 0) {
      this.tickerSubject.next(merged);
    }
  }

  // ── Defaults (shown until first API response) ─────────────
  private defaultItems(): TickerItem[] {
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

  ngOnDestroy(): void {
    this.cryptoSub?.unsubscribe();
    this.forexSub?.unsubscribe();
  }
}
