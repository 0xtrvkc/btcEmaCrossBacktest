import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

function loadEngine(){
  const scripts=[...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
  const source=scripts.find(script=>script.includes('ENGINE_VERSION'));
  assert.ok(source,'main inline engine script is present');
  const document={addEventListener(){}};
  const context={
    __BTC_EMA_TEST__:true,console,Date,Math,Number,String,Boolean,Array,Object,Map,Set,JSON,RegExp,Error,TypeError,
    AbortController,TextEncoder,setTimeout,clearTimeout,document
  };
  context.window=context;
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'index.html'});
  assert.ok(context.BtcEmaEngine,'test API is exposed');
  return context.BtcEmaEngine;
}

const engine=loadEngine();

function baseConfig(overrides={}){
  return {
    mode:'buyonly',timeframe:'1d',initialCapital:1000,feePct:0,sizingPct:1,slippagePct:0,shortCarryRate:0,
    riskFreeRate:0,downsideTarget:0,mvrv:{mode:'off'},atrStop:{enabled:false,mult:3},volSizing:{enabled:false},
    atrSeries:[],volSeries:[],...overrides
  };
}

test('engine contract is versioned',()=>{
  assert.equal(engine.version,'quant-3.1.0');
});

test('literal DOM hooks exist once in the document',()=>{
  const markup=html.slice(0,html.lastIndexOf('<script>'));
  const ids=[...markup.matchAll(/\sid="([^"]+)"/g)].map(match=>match[1]);
  const counts=new Map();
  ids.forEach(id=>counts.set(id,(counts.get(id)||0)+1));
  assert.deepEqual([...counts.entries()].filter(([,count])=>count>1),[]);
  const literalHooks=[...html.matchAll(/\$\('([^']+)'\)/g)].map(match=>match[1]);
  const missing=[...new Set(literalHooks)].filter(id=>!counts.has(id));
  assert.deepEqual(missing,[]);
});

test('live-aligned costs are explicit defaults in the controls',()=>{
  assert.match(html,/id="inFee" value="0\.05"/);
  assert.match(html,/id="inSlippage" value="0\.05"/);
  assert.match(html,/class="pill active" data-execution-preset="live_aligned"/);
});

test('EMA uses an SMA seed and recursive updates',()=>{
  assert.deepEqual(Array.from(engine.computeEMA([1,2,3,4,5],3)),[null,null,2,3,4]);
});

test('signals require a strict cross, not an equality touch',()=>{
  const signals=engine.generateSignals([null,1,2,3,2,1],[null,2,2,2,2,2]);
  assert.deepEqual(JSON.parse(JSON.stringify(signals)),[{index:3,type:'buy'},{index:5,type:'sell'}]);
});

test('a completed-close signal fills at the next available close',()=>{
  const dates=['2026-01-01','2026-01-02','2026-01-03','2026-01-04','2026-01-05'];
  const prices=[10,11,12,13,10];
  const result=engine.runBacktest(dates,prices,new Array(dates.length).fill(null),[{index:1,type:'buy'},{index:3,type:'sell'}],baseConfig(),0);
  assert.equal(result.trades.length,1);
  const trade=result.trades[0];
  assert.equal(trade.signalDate,'2026-01-02');
  assert.equal(trade.entryDate,'2026-01-03');
  assert.equal(trade.exitSignalDate,'2026-01-04');
  assert.equal(trade.exitDate,'2026-01-05');
  assert.equal(trade.entryPrice,12);
  assert.equal(trade.exitPrice,10);
});

test('fees and adverse slippage reconcile to final equity',()=>{
  const dates=['2026-01-01','2026-01-02','2026-01-03','2026-01-04','2026-01-05'];
  const prices=[10,11,12,13,10];
  const cfg=baseConfig({feePct:.001,slippagePct:.001});
  const result=engine.runBacktest(dates,prices,new Array(dates.length).fill(null),[{index:1,type:'buy'},{index:3,type:'sell'}],cfg,0);
  assert.equal(result.trades.length,1);
  assert.ok(result.trades[0].entryPrice>prices[2]);
  assert.ok(result.trades[0].exitPrice<prices[4]);
  assert.ok(Math.abs(result.equity.at(-1)-(cfg.initialCapital+result.trades[0].pnlDollar))<1e-9);
});

test('MVRV becomes usable only after lag and expires by source age',()=>{
  const dates=['2026-01-01','2026-01-02','2026-01-03','2026-01-04','2026-01-05'];
  const records=[{observedAt:Date.UTC(2026,0,1),value:1.25}];
  assert.deepEqual(Array.from(engine.alignMvrv(dates,records,1,3)),[null,1.25,1.25,1.25,null]);
});

test('price normalization rejects observations off the selected UTC bar grid',()=>{
  assert.throws(()=>engine.normalizePrices({'2026-01-01T01:00:00Z':100,'2026-01-01T05:00:00Z':101},'4h'),/bar grid/);
});

test('drawdown starts from initial capital and tracks the running peak',()=>{
  const values=[100,120,90,108,130];
  const drawdown=engine.computeDrawdown(values,0,100);
  const expected=[0,0,-.25,-.1,0];
  Array.from(drawdown).forEach((value,index)=>assert.ok(Math.abs(value-expected[index])<1e-12));
});

test('Black-Scholes USD spot delta matches a known one-year ATM case',()=>{
  const delta=engine.blackScholesDelta(100,100,365.25,.2,0);
  assert.ok(Math.abs(delta.call-.53982784)<1e-6);
  assert.ok(Math.abs(delta.put-(-.46017216))<1e-6);
  assert.ok(Math.abs(delta.call-delta.put-1)<1e-12);
});

test('option delta uses explicit terminal values at expiry',()=>{
  assert.deepEqual(JSON.parse(JSON.stringify(engine.blackScholesDelta(101,100,0,.7,0))),{call:1,put:0,d1:null});
  assert.deepEqual(JSON.parse(JSON.stringify(engine.blackScholesDelta(99,100,0,.7,0))),{call:0,put:-1,d1:null});
  const atm=engine.blackScholesDelta(100,100,0,.7,0);
  assert.equal(atm.call,.5);
  assert.equal(atm.put,-.5);
});

test('delta USD sensitivity scales fractional BTC quantity',()=>{
  assert.equal(engine.deltaUsdChange(.5,.025,1000),12.5);
  assert.equal(engine.deltaUsdChange(-.5,.025,1000),-12.5);
});

test('historical delta checkpoint is capped at option expiry',()=>{
  const dates=['2026-01-01','2026-01-02','2026-01-03','2026-01-04','2026-01-05'];
  const prices=[100,110,90,120,80];
  engine.setTestData({dates,prices,timeframe:'1d'});
  const cfg={strikePct:1,dteDays:2,annualVol:.7,btcQuantity:.01,riskFreeRate:0};
  const result=engine.buildHistoricalDeltaCase(dates[0],dates[4],cfg,{number:1,side:'long',open:false});
  assert.equal(result.checkpoint,'expiry');
  assert.equal(result.referenceDate,'2026-01-03');
  assert.equal(result.referenceSpot,90);
  assert.equal(result.daysLeft,0);
  assert.equal(result.reference.call,0);
  assert.equal(result.reference.put,-1);
});

test('validation scenarios use the requested fixed window and nearby periods',()=>{
  const dates=[],prices=[];
  for(let i=0;i<800;i++){
    dates.push(new Date(Date.UTC(2020,0,1+i)).toISOString().slice(0,10));
    prices.push(100+i*.08+12*Math.sin(i/20));
  }
  engine.setTestData({dates,prices,timeframe:'1d'});
  const cfg=baseConfig({emaFast:10,emaSlow:30,atrSeries:new Array(800).fill(null),volSeries:new Array(800).fill(null)});
  const run=engine.computeScenario(cfg,40,799,{fast:10,slow:30});
  assert.equal(run.startIndex,40);
  assert.equal(run.endIndex,799);
  assert.ok(Number.isFinite(run.metrics.finalEquity));
  assert.deepEqual(Array.from(engine.neighborhoodValues(50,.2,2,300)),[40,50,60]);
  assert.deepEqual(Array.from(engine.neighborhoodValues(200,.2,3,500)),[160,200,240]);
});
