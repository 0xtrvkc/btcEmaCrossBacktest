# BTC EMA Cross · Backtest Terminal

A client-side research terminal for Sirapob's core Bitcoin rule: EMA 50/200 on the 4-hour chart, buy after a golden cross and return to cash after a death cross.

**Live demo:** https://0xtrvkc.github.io/btcEmaCrossBacktest/

The app runs entirely in the browser. It fetches public BTC close and MVRV data, validates the observations, calculates the strategy, and renders the report without sending portfolio settings to a server.

## What changed in engine v3

The research workflow was strengthened using the parts of [QuantDinger](https://github.com/OpenByteInc/QuantDinger) that fit a focused static backtester:

- explicit Exploration, Live-aligned, and Custom execution-cost presets;
- a Validation tab with chronological holdout, EMA-neighborhood sensitivity, and execution-cost stress checks;
- a versioned JSON run manifest containing settings, assumptions, results, trades, source URLs, and dataset hashes;
- deterministic engine tests and a Node.js 24 GitHub Actions workflow;
- clearer separation between research assumptions and observed market data.

The app deliberately does not copy QuantDinger's broker execution, accounts, database, workers, AI layer, or full-stack infrastructure. Those would add complexity without improving this repo's purpose.

## Default research setup

| Setting | Default |
|---|---:|
| Timeframe | 4H |
| Strategy | Buy Only |
| Fast / slow EMA | 50 / 200 bars |
| Position budget | 100% of available cash |
| MVRV filter | Off |
| ATR trailing stop | Off |
| Volatility-targeted sizing | Off |
| Execution preset | Live-aligned |
| Fee per fill | 0.05% |
| Adverse slippage per fill | 0.05% |
| Leverage | None; exposure is capped at 100% |

### Execution presets

| Preset | Fee / fill | Slippage / fill | Purpose |
|---|---:|---:|---|
| Exploration | 0.05% | 0.00% | Explore the rule with commission but no assumed price impact |
| Live-aligned | 0.05% | 0.05% | More conservative default inspired by QuantDinger's live-aligned backtest contract |
| Custom | User input | User input | Test a specific venue or stress assumption |

Preset values are transparent inputs. Changing either cost field away from a known preset switches the label to Custom; it never silently overwrites a manual value.

## Strategy and execution contract

1. Fast and slow EMAs are seeded with an SMA over their first complete lookback windows.
2. A signal requires a strict cross. Touching the other EMA is not a cross.
3. The decision uses a completed close.
4. The order fills at the next available close with the configured adverse slippage and fee.
5. A signal on the final loaded bar remains unfilled.
6. Buy Only starts a long after a golden cross and exits after a death cross. It does not open a short.
7. Backtests start in cash and wait for a new crossover; they do not assume a position from a signal that occurred before the selected start.
8. Position cost, including the entry fee, must fit within available cash. Exposure is capped at 100%.
9. An open position is marked to the final close. The engine does not invent a final liquidation or exit fee.

Short Only and Buy & Short are available as research modes. Shorts use fixed BTC quantity and linear USD P&L, with optional annual carry. This is not a margin, liquidation, or historical funding-rate simulator.

## Validation Lab

One good equity curve can be luck or parameter selection. The Validation tab challenges the current setup without changing its rule.

### 1. Chronological holdout

- Splits the selected history by elapsed time, 70% earlier and 30% later by default.
- Never shuffles observations.
- Resets each block to the same starting capital and waits for the next cross.
- Reports full, earlier, and later CAGR, drawdown, Sharpe, profit factor, win rate, and trade count.
- EMA values at every bar use current and earlier prices only.

This is a fixed-rule time split. It becomes a true out-of-sample test only if the EMA and filter settings were chosen without inspecting the later block.

### 2. EMA parameter neighborhood

- Tests a 3×3 grid around the selected fast and slow periods; the default radius is ±20%.
- Uses one common start date based on the longest slow EMA in the grid, so longer lookbacks do not receive a different test window.
- Shows CAGR, maximum drawdown, final equity, profit factor, and trade count for each valid pair.

A broad region of similar results is more reassuring than one isolated winning pair. It still does not prove future predictive power.

### 3. Execution-cost stress

- Multiplies fee, adverse slippage, and short carry together; 2× is the default.
- Leaves signals, MVRV rules, stops, and sizing unchanged.
- Compares final equity, CAGR, maximum drawdown, Sharpe, and explicit fees plus carry.

Slippage is a scenario assumption embedded in execution prices. It is not reconstructed from historical spreads or an order book.

## MVRV and risk overlays

### MVRV regime filter

- **Off:** pure EMA strategy.
- **Gate:** blocks a new position beyond the Reduce threshold and queues an exit beyond the Exit threshold.
- **Scale:** tapers the size of a new entry between Reduce and Exit.
- Daily MVRV receives a configurable publication delay and becomes unavailable after a configurable maximum age.
- Missing or stale MVRV blocks a new filtered entry and queues the exit of an open filtered position.
- Every filtered run is compared with the same setup with MVRV disabled, isolating the filter's contribution.

### Risk controls

- Optional close-based Wilder volatility trailing stop. It is not textbook ATR because the feed contains no high/low observations.
- Optional volatility-targeted sizing using 14 complete UTC daily returns.
- Configurable risk-free rate for Sharpe and target return for Sortino.
- No leverage and no exposure above available cash.

## Reports and metrics

The terminal includes:

- price, EMA, crossover, fill, halving, and MVRV regime visualization;
- strategy equity against fee-adjusted buy and hold;
- bar-level and rolling drawdown;
- drawdown episodes, recovery requirements, and time underwater;
- CAGR, full-calendar-year mean return, Sharpe, Sortino, Calmar, and Ulcer Index;
- profit factor, win rate, streaks, holding time, realized P&L, and open P&L;
- monthly return and underwater heatmaps;
- trade P&L distribution and holding-time scatter;
- full trade log with signal dates, execution dates, fees, carry, and exit reasons;
- RSI, MACD, Kaufman efficiency ratio, close-based volatility, and Bollinger analysis;
- JPG summary snapshot and machine-readable JSON run export.

Risk-adjusted statistics use complete, consecutive UTC daily observations. Missing or partial daily intervals are excluded rather than fabricated. Square-root annualization does not correct serial dependence or establish statistical significance.

## Reproducible run JSON

Use **Run JSON** in the header or Validation tab. Each export includes:

- schema and engine versions;
- the complete public configuration;
- requested and actual dates;
- next-close, no-leverage, and open-position valuation assumptions;
- price and MVRV source metadata and SHA-256 content hashes when supported;
- strategy, buy-and-hold, and EMA-only baseline metrics;
- costs, open position, and closed trade records;
- current validation results, or a stale/not-run status.

The source hash makes it possible to tell whether two apparently identical runs used identical fetched bytes.

## Data and future updates

Price and MVRV data come from [`0xtrvkc/dynamic-btc-analytics-dashboard`](https://github.com/0xtrvkc/dynamic-btc-analytics-dashboard):

- `btc_1h_price.json`
- `btc_4h_price.json`
- `btc_daily_price.json`
- `mvrv.json`

The latest files are fetched when the page loads, when the timeframe changes, or when Refresh is pressed. The page does not stream live prices. New valid observations and future cycles are consumed automatically; no hard-coded final date is used.

Validation rejects non-positive prices, malformed timestamps, off-grid bars, invalid MVRV values, and conflicting duplicate MVRV observations. Missing expected price bars are counted and disclosed. They are not forward-filled.

## Run locally

```bash
git clone https://github.com/0xtrvkc/btcEmaCrossBacktest.git
cd btcEmaCrossBacktest
python3 -m http.server 8000
```

Open `http://localhost:8000`. Serving the directory avoids file-protocol and cross-origin quirks.

## Test the engine

Node.js 24 is used in CI, with no package installation required:

```bash
node --test tests/*.test.mjs
```

The contract tests cover SMA-seeded EMA values, strict crossover detection, next-close execution, fee/slippage accounting, MVRV availability delay, timestamp-grid validation, and drawdown math.

## Repository layout

```text
index.html                         Browser application and versioned engine
readme.md                          Methodology and usage guide
tests/engine.test.mjs              Deterministic engine contract tests
.github/workflows/engine-ci.yml    Node.js 24 CI
.github/dependabot.yml             Monthly GitHub Actions maintenance
```

## Limitations

- Close-only data cannot reproduce intrabar stops, bid/ask spreads, market impact, partial fills, latency, or order-book capacity.
- Short carry is a user-defined annual rate, not historical exchange funding.
- MVRV publication timing depends on the upstream source; the configured lag is a research assumption.
- Backtests describe a historical rule. They do not establish causality, statistical significance, or future returns.

## Disclaimer

For research and education only. Historical and simulated results are not investment advice and do not guarantee future performance.
