 https://0xtrvkc.github.io/btcEmaCrossBacktest/
# BTC EMA Cross · Backtest Terminal

A single-page, client-side backtesting terminal for a Bitcoin EMA(50/200) moving-average-cross strategy, with an optional MVRV valuation-regime filter layered on top.

**Live demo:** https://0xtrvkc.github.io/btcEmaCrossBacktest/

Everything runs in the browser — data is fetched from a public JSON dataset on page load, and the backtest math, charting, and metrics are all computed client-side. Nothing is sent to a server.

---

## What it does

The tool lets you configure and run a long/short EMA-crossover strategy against historical BTC/USD price data, then inspect the results through an interactive dashboard: price chart with signal markers, equity curve vs. buy-and-hold, drawdown and trade statistics, a trade log, and an on-chain MVRV valuation overlay.

### Core strategy — EMA cross
- Two exponential moving averages (**EMA Fast**, default 50, and **EMA Slow**, default 200) are computed on the price series.
- A **buy ("golden cross")** signal fires when the fast EMA crosses above the slow EMA; a **sell ("death cross")** signal fires when it crosses back below.
- EMAs are seeded with a simple moving average over the first *N* bars, then computed recursively.
- Three trading modes: **Buy Only**, **Short Only**, or **Buy & Short** (reverses position on every cross instead of just flattening).

### MVRV regime filter (optional)
An overlay based on MVRV (market value / realized value — an on-chain cost-basis ratio) that can gate or scale position sizing independently of the price-derived EMA signal:
- **Off** — pure EMA-cross strategy.
- **Gate** — blocks new entries once MVRV passes a "Reduce" threshold, and force-exits any open position once MVRV passes an "Exit" threshold (checked every bar, so it can act ahead of a lagging EMA cross).
- **Scale** — replaces the hard gate with a linear taper of position size between the Reduce and Exit thresholds.
- Separate thresholds for long-side euphoria (default Reduce 2.0 / Exit 3.0) and short-side capitulation (default Reduce 1.2 / Exit 0.7), calibrated against the four completed BTC halving cycles.
- Every recompute also silently runs an EMA-only baseline (filter forced off) over the same window, shown separately as **Filter Impact**, to isolate what the MVRV overlay is actually contributing.

### Entry Date Simulator
A draggable slider lets you pick any historical date as a hypothetical entry point and see price at entry vs. now, days held, return, and the EMA trend state at that moment — independent of the full backtest run.

### Configurable inputs
| Setting | Description |
|---|---|
| Initial Capital | Starting USD portfolio value |
| Fee / Trade | Round-trip friction, applied on both entry and exit notional |
| Sizing / Trade | % of current equity committed per position (remainder sits in uninvested cash) |
| EMA Fast / EMA Slow | Lookback periods in days |
| Backtest Start | Earliest allowed start date (actual start is this date or whenever the slow EMA first becomes valid, whichever is later) |
| Timeframe | 1H / 4H / 1D price granularity |

### Dashboard panels
- **Ticker strip** — live price, EMA fast/slow, current signal state, MVRV zone.
- **Price · EMA Cross · Signal Markers chart** — linear/log scale, selectable range (6M–All), halving-date markers.
- **MVRV Valuation chart** — MVRV series with the configured Reduce/Exit threshold lines.
- **Portfolio Growth** — strategy equity vs. buy-and-hold benchmark, linear/log.
- **Performance Metrics** — return profile, trade statistics, drawdown analysis, timing & streaks, and MVRV filter impact.
- **Rolling 1Y Return** — trailing 365-day return, strategy vs. buy-and-hold.
- **Holding vs. Trading** — net worth comparison and BTC-denominated gain/loss vs. a simple buy-and-hold of the initial capital.
- **Trade Log** — full list of entries/exits with side, dates, prices, hold time, return, and P&L.

---

## Data & execution assumptions

- **Data source:** [`0xtrvkc/dynamic-btc-analytics-dashboard`](https://github.com/0xtrvkc/dynamic-btc-analytics-dashboard) on GitHub — BTC/USD price series (1h/4h/1d) and MVRV, fetched fresh on load and re-run automatically against new data.
- **Fills:** trades execute at the closing price of the signal (or force-exit) bar — no next-bar delay, no slippage beyond the fee input.
- **Shorts:** modeled with linear, non-levered payoff (position value moves inversely to price return) — a simplification of real margin/funding mechanics.
- **Drawdown:** computed on the daily mark-to-market equity curve against its running all-time high.
- **Cash:** the uninvested portion of equity earns 0%.

> Historical backtest performance is not indicative of future results. This tool is for research and education only and is **not investment advice**.

---

## Tech stack

- Vanilla HTML/CSS/JavaScript — no build step, no framework.
- [Chart.js 4](https://www.chartjs.org/) for all charts.
- Google Fonts (Inter, JetBrains Mono).
- Dark/light theme toggle, fully responsive layout.

## Running locally

This is a single static file — no build or server required.

```bash
git clone https://github.com/0xtrvkc/btcEmaCrossBacktest.git
cd btcEmaCrossBacktest
open index.html   # or just double-click it / serve with any static file server
```

Since data is fetched via `fetch()` from GitHub, opening the file directly (`file://`) will generally work, but serving it locally (e.g. `python3 -m http.server`) avoids any browser CORS/file-protocol quirks.

## Disclaimer

This project is provided for educational and research purposes only. Nothing in this repository or the deployed tool constitutes financial or investment advice. Past performance, whether real or backtested, does not guarantee future results.
