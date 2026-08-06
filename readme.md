# BTC EMA Cross · Backtest Terminal

A single-page, client-side backtesting terminal for a BTC/USD EMA crossover ("golden cross" / "death cross") strategy. No backend, no build step — everything runs in the browser.

**Live app:** https://0xtrvkc.github.io/btcEmaCrossBacktest/

![status](https://img.shields.io/badge/build-static%20HTML-informational)
![data](https://img.shields.io/badge/data-client--side-success)

## What it does

- Simulates a **dual-EMA crossover strategy** on historical BTC/USD price data: EMA(fast) crossing above EMA(slow) triggers a buy ("golden cross"), crossing below triggers a sell ("death cross").
- Supports **three modes**: Buy Only, Short Only, and Buy & Short.
- Runs on **1H, 4H, or 1D** candles, fetched live from a public dataset.
- Fully configurable strategy parameters: initial capital, fee per trade, position sizing %, EMA fast/slow lookback (in calendar days), and backtest start date.
- **Entry Date Simulator** — a draggable slider/chart overlay to preview how the strategy performs from any historical entry point.
- **Performance metrics** grouped into Return Profile, Trade Statistics, Drawdown Analysis, and Timing & Streaks.
- **Portfolio growth chart** (linear/log scale) comparing strategy equity vs. a buy-and-hold benchmark.
- **Rolling 1-year return chart** for strategy vs. buy-and-hold.
- **Holding vs. Trading** comparison panel (net worth, BTC amounts, gain/loss).
- **Trade log** with full entry/exit detail per trade.
- Light/dark theme toggle.

## Data source

Price data is fetched at page load (and re-fetched on timeframe switch) from:

```
https://raw.githubusercontent.com/0xtrvkc/dynamic-btc-analytics-dashboard/main/
  ├── btc_1h_price.json
  ├── btc_4h_price.json
  └── btc_daily_price.json
```

All computation (EMA calculation, signal generation, trade simulation, metrics) happens **entirely client-side** — nothing is sent to a server.

## Methodology

- **Signal** — EMA(fast) crossing above EMA(slow) = buy; crossing below = sell. EMAs are seeded with a simple moving average over the first *N* bars, then computed recursively.
- **Execution** — trades fill at the closing price of the signal bar (no next-bar delay; no slippage beyond the configured fee).
- **Sizing** — each entry commits *Sizing%* of current equity; the remainder sits as uninvested cash earning 0%. Fees are charged on notional at both entry and exit.
- **Shorts** — modeled with a linear (non-levered) payoff, a simplification of real margin/funding mechanics.
- **Drawdown** — computed on the daily mark-to-market equity curve against its running all-time high.
- **EMA periods** are entered in calendar days and automatically converted to the correct bar count for the active timeframe (1H/4H/1D), so "50" always means a 50-day EMA regardless of chart resolution.

## Usage

Just open the [live page](https://0xtrvkc.github.io/btcEmaCrossBacktest/) — no installation required. To run locally:

```bash
git clone https://github.com/0xtrvkc/btcEmaCrossBacktest.git
cd btcEmaCrossBacktest
# open index.html directly, or serve it:
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Tech stack

- Vanilla JS (no framework, no build tools)
- [Chart.js 4.4.1](https://www.chartjs.org/) for charting (loaded via CDN)
- Google Fonts (Inter, JetBrains Mono)

## Disclaimer

This tool is for research and education only. Historical backtest performance is not indicative of future results and this is not investment advice.

## License

Add a license of your choice (e.g. MIT) if you intend for others to reuse this code.
