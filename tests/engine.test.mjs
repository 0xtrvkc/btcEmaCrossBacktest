import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

function loadEngine(testDocument=null){
  const scripts=[...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
  const source=scripts.find(script=>script.includes('ENGINE_VERSION'));
  assert.ok(source,'main inline engine script is present');
  const document=testDocument||{addEventListener(){}};
  const context={
    __BTC_EMA_TEST__:true,console,Date,Math,Number,String,Boolean,Array,Object,Map,Set,JSON,RegExp,Error,TypeError,
    AbortController,TextEncoder,setTimeout,clearTimeout,requestAnimationFrame:fn=>setTimeout(fn,0),document
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
  assert.equal(engine.version,'quant-3.3.0');
});

test('Kelly analysis uses net percentage wins and losses',()=>{
  const trades=[
    {pnlPct:.20,pnlDollar:200,entryAmount:1000},
    {pnlPct:.10,pnlDollar:100,entryAmount:1000},
    {pnlPct:-.10,pnlDollar:-100,entryAmount:1000},
    {pnlPct:-.10,pnlDollar:-100,entryAmount:1000}
  ];
  const result=engine.computeKellyAnalysis(trades,0);
  assert.ok(Math.abs(result.winProbability-.5)<1e-12);
  assert.ok(Math.abs(result.payoffRatio-1.5)<1e-12);
  assert.ok(Math.abs(result.raw-(1/6))<1e-12);
  assert.ok(Math.abs(result.half-(1/12))<1e-12);
  assert.ok(Math.abs(result.quarter-(1/24))<1e-12);
});

test('Kelly analysis reports no edge and respects no-leverage bounds',()=>{
  const losing=[
    {pnlPct:.05,pnlDollar:50,entryAmount:1000},
    {pnlPct:-.20,pnlDollar:-200,entryAmount:1000},
    {pnlPct:-.20,pnlDollar:-200,entryAmount:1000}
  ];
  const result=engine.computeKellyAnalysis(losing,0);
  assert.ok(result.raw<0);
  assert.equal(result.constrained,0);
  assert.equal(result.interpretation,'no_estimated_edge');
});

test('Kelly bootstrap range is deterministic and bounded',()=>{
  const trades=Array.from({length:40},(_,i)=>({pnlPct:i%3===0?-.08:.12,pnlDollar:i%3===0?-80:120,entryAmount:1000}));
  const first=engine.computeKellyAnalysis(trades,300),second=engine.computeKellyAnalysis(trades,300);
  assert.deepEqual(first.bootstrap95,second.bootstrap95);
  assert.ok(first.bootstrap95.low>=0&&first.bootstrap95.high<=1);
  assert.ok(first.bootstrap95.low<=first.bootstrap95.high);
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

test('floating P&L and open/close events remain aligned to execution bars and months',()=>{
  const dates=['2026-01-30','2026-01-31','2026-02-01','2026-02-02','2026-02-03'];
  const prices=[10,11,12,15,14];
  const result=engine.runBacktest(dates,prices,new Array(dates.length).fill(null),[{index:1,type:'buy'},{index:3,type:'sell'}],baseConfig(),0);
  assert.equal(result.floatingPnl[2],0);
  assert.equal(result.floatingPnl[3],250);
  assert.equal(result.floatingPnl[4],null);
  assert.deepEqual(JSON.parse(JSON.stringify(result.markers.map(({index,kind,side})=>({index,kind,side})))),[
    {index:2,kind:'open',side:'long'},
    {index:4,kind:'close',side:'long'}
  ]);
  const contexts=engine.monthlyTradeContexts(dates,result.floatingPnl,result.markers,0);
  assert.equal(contexts.get('2026-01').floatingPnl,null);
  assert.equal(contexts.get('2026-01').hadPosition,false);
  assert.equal(contexts.get('2026-02').floatingPnl,null);
  assert.equal(contexts.get('2026-02').hadPosition,true);
  assert.deepEqual(JSON.parse(JSON.stringify(contexts.get('2026-02').events.map(({kind,date})=>({kind,date})))),[
    {kind:'open',date:'2026-02-01'},
    {kind:'close',date:'2026-02-03'}
  ]);
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


test('walk-forward folds never overlap training with test and cover later data once',()=>{
  const dates=Array.from({length:1000},(_,i)=>new Date(Date.UTC(2020,0,1+i)).toISOString().slice(0,10));
  const folds=engine.walkForwardWindows(dates,40,999,.6,4);
  assert.equal(folds.at(-1).testEnd,999);
  for(let i=0;i<folds.length;i++){
    assert.equal(folds[i].trainStart,40);
    assert.equal(folds[i].trainEnd+1,folds[i].testStart);
    if(i)assert.equal(folds[i-1].testEnd+1,folds[i].testStart);
  }
  assert.throws(()=>engine.walkForwardWindows(dates,950,999,.7,4),/60 training days/);
});

test('training selection ignores insufficient trades and prefers configured pair on ties',()=>{
  const selected=engine.selectTrainingPair([
    {fast:5,slow:20,metrics:{finalEquity:10000,totalTrades:2}},
    {fast:8,slow:25,metrics:{finalEquity:1100,totalTrades:3}},
    {fast:10,slow:30,metrics:{finalEquity:1100,totalTrades:4}}
  ],{fast:10,slow:30});
  assert.equal(selected.fast,10);assert.equal(selected.slow,30);assert.equal(selected.fallback,false);
  const fallback=engine.selectTrainingPair([],{fast:50,slow:200});
  assert.equal(fallback.fallback,true);assert.equal(fallback.fast,50);
});

test('later price mutations cannot alter the first walk-forward selection',async()=>{
  const dates=Array.from({length:800},(_,i)=>new Date(Date.UTC(2020,0,1+i)).toISOString().slice(0,10));
  const prices=dates.map((_,i)=>100+i*.08+12*Math.sin(i/20));
  const cfg=baseConfig({emaFast:10,emaSlow:30});
  engine.setTestData({dates,prices,timeframe:'1d'});
  const first=await engine.computeWalkForward(cfg,40,799,.6,[8,10,12],[24,30,36],2);
  const boundary=engine.walkForwardWindows(dates,40,799,.6,2)[0].testStart;
  engine.setTestData({dates,prices:prices.map((v,i)=>i<boundary?v:v*(1+(i-boundary)/100)),timeframe:'1d'});
  const mutated=await engine.computeWalkForward(cfg,40,799,.6,[8,10,12],[24,30,36],2);
  assert.deepEqual(first.rows[0].selectedPair,mutated.rows[0].selectedPair);
  assert.equal(first.rows[0].trainEnd,mutated.rows[0].trainEnd);
});

function bootstrapRows(n=100){return Array.from({length:n},(_,i)=>({day:Date.UTC(2020,0,1+i),strategy:i%7<3?-.02:.025,hold:i%7<3?-.02:.025}));}

test('paired block bootstrap is deterministic and never calls ties a benchmark win',async()=>{
  const settings={paths:100,blockDays:7,seed:42};
  const first=await engine.blockBootstrap(bootstrapRows(),settings),second=await engine.blockBootstrap(bootstrapRows(),settings);
  assert.deepEqual(first,second);assert.equal(first.beatHoldFraction,0);
  assert.equal(first.histogram.reduce((s,h)=>s+h.count,0),100);
  assert.ok(first.return95.low<=first.return95.median&&first.return95.median<=first.return95.high);
  assert.ok(first.drawdown95>=0&&first.drawdown95<=1);
});

test('bootstrap blocks never bridge missing days',async()=>{
  const rows=bootstrapRows(80);rows.forEach((r,i)=>{if(i>=40)r.day+=86400000;});
  const result=await engine.blockBootstrap(rows,{paths:20,blockDays:7,seed:0});
  assert.equal(result.availableBlocks,68); // Two 40-day segments, 34 starts each.
  const isolated=rows.map((r,i)=>({...r,day:Date.UTC(2020,0,1+i*2)}));
  await assert.rejects(engine.blockBootstrap(isolated,{paths:20,blockDays:2}),/No contiguous/);
});

test('constant zero returns have zero drawdown and undefined Sharpe',async()=>{
  const rows=bootstrapRows().map(r=>({...r,strategy:0,hold:0}));
  const result=await engine.blockBootstrap(rows,{paths:20,blockDays:7});
  assert.equal(result.drawdown95,0);assert.equal(result.return95.low,0);assert.equal(result.validSharpePaths,0);assert.equal(result.sharpe95.low,null);
  await assert.rejects(engine.blockBootstrap(rows.slice(0,20)),/at least 60/);
});

test('paired daily inputs exclude partial UTC days and missing-day returns',()=>{
  const dates=Array.from({length:20},(_,i)=>new Date(Date.UTC(2020,0,1,4+i*4)).toISOString());
  const eq=dates.map((_,i)=>1000+i);
  const rows=engine.pairedDailyReturns(dates,eq,eq,0,baseConfig({timeframe:'4h'}));
  assert.equal(rows.length,2);assert.ok(rows.every(r=>r.strategy===r.hold));
});

test('validation controls populate research and Run JSON with the same seeded settings',async()=>{
  const nodes=new Map([...html.matchAll(/\sid="([^"]+)"/g)].map(m=>[m[1],{value:'',textContent:'',innerHTML:'',style:{},classList:{add(){},remove(){}},setAttribute(){}}]));
  for(const m of html.matchAll(/<input\b[^>]*>/g)){
    const id=m[0].match(/id="([^"]+)"/)?.[1],value=m[0].match(/value="([^"]*)"/)?.[1];if(id&&value)nodes.get(id).value=value;
  }
  nodes.get('inStartDate').value='2020-01-01';nodes.get('inBootstrapPaths').value='200';
  const local=loadEngine({addEventListener(){},getElementById:id=>nodes.get(id)});
  const dates=Array.from({length:1500},(_,i)=>new Date(Date.UTC(2020,0,1+i)).toISOString().slice(0,10));
  local.setTestData({dates,prices:dates.map((_,i)=>100+i*.08+20*Math.sin(i/20)),timeframe:'1d'});
  local.prepareTestRun();await local.runValidationSuite();
  assert.match(nodes.get('validationStatus').textContent,/Validated/);
  const manifest=local.buildRunManifest();assert.equal(manifest.validation.status,'current');
  assert.equal(manifest.validation.research.walkForward.rows.length,4);
  assert.equal(manifest.validation.research.bootstrap.paths,200);
  assert.equal(manifest.validation.research.bootstrap.seed,42);
  assert.notEqual(nodes.get('bootReturn').textContent,'—');
  assert.match(nodes.get('walkForwardBody').innerHTML,/fallback|<tr>/);
});
