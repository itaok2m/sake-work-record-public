(() => {
'use strict';

const SR_STORAGE_KEY = 'workRecordShuboRecordsV1';
const SR_ANALYSIS_KEY = 'workRecordAnalysisRecordsV1';
const SR_SCHEMA = 'workRecordShuboLedgerV02';
const SR_ACCEPTED_SCHEMAS = new Set(['workRecordShuboLedgerV01', 'workRecordShuboLedgerV02']);
const SR_DEFAULT_OPS = ['前日汲水', '汲水', '水麹', '仕込', '撹拌', '荒櫂', '検温', '暖気', '休', '卸'];
const SR_BASE = {
  BY:'R7BY', symbol:'', sequence:'', tankNo:'', shuboType:'', sakeType:'', riceSummary:'', destinationBatch:'', note:'',
  kakemaiKg:'', kakemaiDetail:'', kojimaiKg:'', kojimaiDetail:'', waterL:'', startDepthMm:'', lacticMl:'',
  yeast:'', yeastAmount:'', startDate:'', startVolumeL:'', matureDepthMm:'', productionVolumeL:'',
  transferDate:'', transferVolumeL:'', afterDepthMm:'', remainingVolumeL:'', destinationTank:'',
  moromiSequence:'', moromiSymbol:'', transferSakeType:''
};

function srText(value){ return String(value ?? '').trim(); }
function srEsc(value){ return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function srEscXml(value){ return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch])); }
function srNow(){ return new Date().toISOString(); }
function srId(prefix='shubo'){ return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function srYmd(){ const d=new Date(); return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`; }
function srFmtDate(value){ const m=srText(value).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}/${m[2]}/${m[3]}` : srText(value); }
function srNum(value){ const n=Number(srText(value).replace(/,/g,'')); return Number.isFinite(n) ? n : null; }
function srStableHash(value){ let h=2166136261; for(const ch of String(value)){ h^=ch.codePointAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(36); }
function srLegacyStableId(record){ const fields=record?.fields || {}; return `shubo_legacy_${srStableHash(JSON.stringify([record?.created_at || '', fields]))}`; }
function srReadRaw(){ try{ const parsed=JSON.parse(localStorage.getItem(SR_STORAGE_KEY) || '[]'); return Array.isArray(parsed) ? parsed : []; }catch(_e){ return []; } }
function srWriteRaw(records){ localStorage.setItem(SR_STORAGE_KEY, JSON.stringify(records)); }
function srReadAnalysis(){ try{ const parsed=JSON.parse(localStorage.getItem(SR_ANALYSIS_KEY) || '[]'); return Array.isArray(parsed) ? parsed : []; }catch(_e){ return []; } }

function srNormToken(value){
  let text=srText(value);
  if(text.normalize) text=text.normalize('NFKC');
  return text.replace(/\s+/g,'').replace(/号$/,'').replace(/^T\.?No\.?/i,'').replace(/^No\.?/i,'');
}
function srNormSequence(value){ return srNormToken(value).replace(/[^0-9A-Za-z一-龠ぁ-んァ-ヶ_-]/g,''); }
function srNormTank(value){ return srNormToken(value).toUpperCase(); }

function srLegacyBase(fields={}){
  return {
    ...SR_BASE,
    BY:srText(fields.BY || 'R7BY'), symbol:srText(fields['仕込記号']), sequence:srText(fields['仕込順号'] || fields['酒母番号']),
    tankNo:srText(fields['タンク'] || fields['容器番号']), shuboType:srText(fields['酒母種類']), sakeType:srText(fields['酒種類']),
    destinationBatch:srText(fields['仕込号']), startDate:srText(fields['開始日'] || fields['月日']), note:srText(fields['備考'])
  };
}
function srNormEvent(event={}){
  return {
    day:srText(event.day), date:srText(event.date), time:srText(event.time), operation:srText(event.operation), addWaterL:srText(event.addWaterL),
    appearance:srText(event.appearance), progressNote:srText(event.progressNote), roomTemp:srText(event.roomTemp), productTemp:srText(event.productTemp),
    outsideTemp:srText(event.outsideTemp), tankNo:srText(event.tankNo), depthMm:srText(event.depthMm), volumeL:srText(event.volumeL),
    sourceColumn:srText(event.sourceColumn)
  };
}
function srLegacyEvents(fields={}){
  return [srNormEvent({
    day:fields['日順'], date:fields['月日'] || fields['開始日'], time:fields['時刻'], operation:fields['操作'],
    appearance:fields['備考'], roomTemp:fields['室温℃'], productTemp:fields['品温℃'], tankNo:fields['タンク']
  })];
}
function srNormSample(sample={}){
  return {
    sampleDate:srText(sample.sampleDate), analysisDate:srText(sample.analysisDate), collectedMl:srText(sample.collectedMl), usedMl:srText(sample.usedMl),
    discardedMl:srText(sample.discardedMl), disposal:srText(sample.disposal), note:srText(sample.note), sourceColumn:srText(sample.sourceColumn)
  };
}
function srNormTransfer(transfer={}, order=1){
  return {
    transferOrder:Number(transfer.transferOrder) || order, transferDate:srText(transfer.transferDate), transferVolumeL:srText(transfer.transferVolumeL),
    afterDepthMm:srText(transfer.afterDepthMm), remainingVolumeL:srText(transfer.remainingVolumeL), destinationTank:srText(transfer.destinationTank),
    moromiSequence:srText(transfer.moromiSequence), moromiSymbol:srText(transfer.moromiSymbol), alcoholPct:srText(transfer.alcoholPct),
    sakeType:srText(transfer.sakeType || transfer.transferSakeType), note:srText(transfer.note), sourceColumn:srText(transfer.sourceColumn)
  };
}
function srTransferFromBase(base={}){
  const transfer=srNormTransfer({
    transferDate:base.transferDate, transferVolumeL:base.transferVolumeL, afterDepthMm:base.afterDepthMm, remainingVolumeL:base.remainingVolumeL,
    destinationTank:base.destinationTank, moromiSequence:base.moromiSequence, moromiSymbol:base.moromiSymbol, sakeType:base.transferSakeType
  }, 1);
  return Object.entries(transfer).some(([key,value]) => !['transferOrder','sourceColumn'].includes(key) && srText(value)) ? [transfer] : [];
}
function srMirrorFirstTransfer(base, transfers){
  const first=transfers?.[0] || {};
  return {
    ...base,
    transferDate:srText(first.transferDate), transferVolumeL:srText(first.transferVolumeL), afterDepthMm:srText(first.afterDepthMm),
    remainingVolumeL:srText(first.remainingVolumeL), destinationTank:srText(first.destinationTank), moromiSequence:srText(first.moromiSequence),
    moromiSymbol:srText(first.moromiSymbol), transferSakeType:srText(first.sakeType)
  };
}
function srNormalize(record={}){
  if(SR_ACCEPTED_SCHEMAS.has(record.schema) && record.base && Array.isArray(record.events)){
    const base={...SR_BASE, ...record.base};
    const transfers=(Array.isArray(record.transfers) ? record.transfers : srTransferFromBase(base)).map((item,index)=>srNormTransfer(item,index+1));
    return {
      ...record,
      record_id:record.record_id || srLegacyStableId(record), schema:SR_SCHEMA, process:'shubo', label:'酒母製造',
      base:srMirrorFirstTransfer(base,transfers), events:record.events.map(srNormEvent), samples:(record.samples || []).map(srNormSample),
      transfers, candidate_imports:Array.isArray(record.candidate_imports) ? record.candidate_imports : [], legacy_source:false
    };
  }
  const fields=record.fields || {};
  const base=srLegacyBase(fields);
  const transfers=srTransferFromBase(base);
  return {
    record_id:record.record_id || srLegacyStableId(record), schema:SR_SCHEMA, process:'shubo', label:'酒母製造',
    created_at:record.created_at || srNow(), updated_at:record.updated_at || record.created_at || srNow(),
    base:srMirrorFirstTransfer(base,transfers), events:srLegacyEvents(fields), samples:[], transfers,
    candidate_imports:Array.isArray(record.candidate_imports) ? record.candidate_imports : [], legacy_source:true
  };
}
function srRecords(){ return srReadRaw().map(srNormalize); }
function srTitle(record){ return [record.base.symbol, record.base.sequence && `${record.base.sequence}号`, record.base.shuboType].filter(Boolean).join(' / ') || '仕込記号・順号未入力'; }
function srTotalRice(base){ const a=srNum(base.kakemaiKg), b=srNum(base.kojimaiKg); return a===null && b===null ? '' : (a || 0) + (b || 0); }
function srMaturity(base){ const p=srNum(base.productionVolumeL), w=srNum(base.waterL), rice=srTotalRice(base); return p===null || w===null || !rice ? '' : ((p-w)/rice*100).toFixed(1); }
function srTransferTotal(transfers){ return transfers.reduce((sum,item)=>sum+(srNum(item.transferVolumeL)||0),0); }

function srEventRow(event={}){
  const e=srNormEvent(event);
  const fields=['day','date','time','operation','addWaterL','appearance','progressNote','roomTemp','productTemp','outsideTemp','tankNo','depthMm','volumeL'];
  return `<tr class="sr-event-row">${fields.map((key,index)=>{
    if(index===1) return `<td><input type="date" data-event="${key}" value="${srEsc(e[key])}"></td>`;
    if(index===2) return `<td><input type="time" step="1" data-event="${key}" value="${srEsc(e[key])}"></td>`;
    return `<td><input data-event="${key}" value="${srEsc(e[key])}"></td>`;
  }).join('')}<td><button class="btn small-btn" type="button" data-remove-row>削除</button></td></tr>`;
}
function srSampleRow(sample={}){
  const s=srNormSample(sample);
  const fields=['sampleDate','analysisDate','collectedMl','usedMl','discardedMl','disposal','note'];
  return `<tr class="sr-sample-row">${fields.map((key,index)=>`<td><input ${index<2?'type="date"':''} data-sample="${key}" value="${srEsc(s[key])}"></td>`).join('')}<td><button class="btn small-btn" type="button" data-remove-row>削除</button></td></tr>`;
}
function srTransferRow(transfer={},index=0){
  const t=srNormTransfer(transfer,index+1);
  const fields=['transferDate','transferVolumeL','afterDepthMm','remainingVolumeL','destinationTank','moromiSequence','moromiSymbol','alcoholPct','sakeType','note'];
  return `<tr class="sr-transfer-row"><td class="sr-transfer-order">${index+1}</td>${fields.map((key,fieldIndex)=>`<td><input ${fieldIndex===0?'type="date"':''} data-transfer="${key}" value="${srEsc(t[key])}"></td>`).join('')}<td><button class="btn small-btn" type="button" data-remove-row>削除</button></td></tr>`;
}
function srAddEvent(event={}){ document.getElementById('sr-event-body')?.insertAdjacentHTML('beforeend',srEventRow(event)); }
function srAddSample(sample={}){ document.getElementById('sr-sample-body')?.insertAdjacentHTML('beforeend',srSampleRow(sample)); }
function srAddTransfer(transfer={}){
  const body=document.getElementById('sr-transfer-body');
  if(!body) return;
  body.insertAdjacentHTML('beforeend',srTransferRow(transfer,body.querySelectorAll('tr').length));
  srRenumberTransfers();
}
function srRenumberTransfers(){ document.querySelectorAll('.sr-transfer-row').forEach((row,index)=>{ row.querySelector('.sr-transfer-order').textContent=String(index+1); }); }
function srGetBase(){ const base={...SR_BASE}; document.querySelectorAll('[data-base]').forEach(el=>{ base[el.dataset.base]=srText(el.value); }); return base; }
function srSetBase(base){ document.querySelectorAll('[data-base]').forEach(el=>{ el.value=base?.[el.dataset.base] ?? ''; }); srUpdateCalcs(); }
function srRows(selector,key){
  return [...document.querySelectorAll(selector)].map(row=>{
    const value={}; row.querySelectorAll(`[data-${key}]`).forEach(el=>{ value[el.dataset[key]]=srText(el.value); }); return value;
  }).filter(value=>Object.values(value).some(Boolean));
}
function srUpdateCalcs(){
  const base=srGetBase();
  const total=document.getElementById('sr-total-rice');
  const maturity=document.getElementById('sr-maturity-rate');
  if(total) total.value=srTotalRice(base);
  if(maturity) maturity.value=srMaturity(base);
}
function srLoad(record){
  srSetBase(record?.base || SR_BASE);
  const eventBody=document.getElementById('sr-event-body');
  const sampleBody=document.getElementById('sr-sample-body');
  const transferBody=document.getElementById('sr-transfer-body');
  if(eventBody){ eventBody.innerHTML=''; (record?.events?.length ? record.events : SR_DEFAULT_OPS.map(operation=>({operation}))).forEach(srAddEvent); }
  if(sampleBody){ sampleBody.innerHTML=''; (record?.samples?.length ? record.samples : [{}]).forEach(srAddSample); }
  if(transferBody){ transferBody.innerHTML=''; (record?.transfers?.length ? record.transfers : [{}]).forEach(srAddTransfer); }
  const id=document.getElementById('sr-record-id'); if(id) id.value=record?.record_id || '';
  const title=document.getElementById('sr-edit-target');
  if(title) title.textContent=record ? `${srTitle(record)}を編集中${record.legacy_source?'（旧形式読取）':''}` : '新しい酒母記録を入力中';
  const danger=document.getElementById('sr-delete-current-wrap'); if(danger) danger.hidden=!record;
}
function srResetInput(){ srLoad(null); history.replaceState(null,'','shubo.html'); const status=document.getElementById('sr-input-status'); if(status) status.textContent='新しい酒母製造を入力します。'; }
function srSaveInput(){
  const id=srText(document.getElementById('sr-record-id')?.value);
  const raw=srReadRaw();
  const oldRaw=raw.find(item=>item.record_id===id);
  const old=oldRaw ? srNormalize(oldRaw) : null;
  const transfers=srRows('.sr-transfer-row','transfer').map((item,index)=>srNormTransfer(item,index+1));
  const base=srMirrorFirstTransfer(srGetBase(),transfers);
  const record={
    record_id:id || srId(), schema:SR_SCHEMA, process:'shubo', label:'酒母製造', created_at:old?.created_at || srNow(), updated_at:srNow(),
    base, events:srRows('.sr-event-row','event').map(srNormEvent), samples:srRows('.sr-sample-row','sample').map(srNormSample), transfers,
    candidate_imports:old?.candidate_imports || [], notes:'酒母製造台帳型。分析値は分析記録を正本として参照し重複保存しない。'
  };
  const index=raw.findIndex(item=>item.record_id===record.record_id);
  if(index>=0) raw[index]=record; else raw.unshift(record);
  srWriteRaw(raw); srLoad(record);
  const status=document.getElementById('sr-input-status');
  if(status) status.textContent=`酒母製造を${index>=0?'更新':'保存'}しました。端末内保存 ${raw.length}件。正本化は全工程バックアップJSONで行います。`;
}
function srDeleteCurrent(){
  const id=srText(document.getElementById('sr-record-id')?.value);
  const record=srRecords().find(item=>item.record_id===id);
  if(!record) return;
  if(!confirm(`${srTitle(record)}を削除しますか。`)) return;
  if(!confirm('削除すると端末内保存から消えます。実行しますか。')) return;
  srWriteRaw(srReadRaw().filter(item=>item.record_id!==id)); srResetInput();
}

function srAnalysisFor(record){
  const sequence=srNormSequence(record.base.sequence || record.base.destinationBatch);
  const tank=srNormTank(record.base.tankNo);
  const candidateIds=new Set(record.candidate_imports || []);
  return srReadAnalysis().filter(item=>{
    const fields=item.fields || {};
    if(srText(fields['対象工程']) && !['酒母','酛'].includes(srText(fields['対象工程']))) return false;
    if(srText(fields['サンプル種類']) && !['酛','酒母'].includes(srText(fields['サンプル種類']))) return false;
    const analysisSequence=srNormSequence(fields['仕込号']);
    const analysisTank=srNormTank(fields['TNo']);
    const exactSequence=!sequence || analysisSequence===sequence;
    const exactTank=!tank || analysisTank===tank;
    if(exactSequence && exactTank && Boolean(sequence || tank)) return true;
    // Excel変換時の候補IDは、基本情報が欠ける旧記録だけの補助に限定する。
    return !sequence && !tank && candidateIds.has(item.record_id);
  }).sort((a,b)=>`${srText(a.fields?.['分析日'])} ${srText(a.fields?.['分析時刻'])}`.localeCompare(`${srText(b.fields?.['分析日'])} ${srText(b.fields?.['分析時刻'])}`));
}

function srGraphSvg(record){
  const events=record.events.filter(event=>[event.productTemp,event.roomTemp,event.outsideTemp].some(value=>srNum(value)!==null));
  if(events.length<2) return '<div class="ledger-graph-empty">温度グラフに必要な経過値が不足しています。</div>';
  const series=[
    {key:'productTemp',label:'品温',className:'graph-product'},
    {key:'roomTemp',label:'室温',className:'graph-room'},
    {key:'outsideTemp',label:'外気温',className:'graph-outside'}
  ];
  const values=events.flatMap(event=>series.map(item=>srNum(event[item.key])).filter(value=>value!==null));
  const min=Math.floor(Math.min(...values)-2), max=Math.ceil(Math.max(...values)+2), span=Math.max(1,max-min);
  const width=920,height=260,left=52,right=16,top=18,bottom=52,plotW=width-left-right,plotH=height-top-bottom;
  const x=index=>left+(events.length===1?plotW/2:index*plotW/(events.length-1));
  const y=value=>top+(max-value)*plotH/span;
  const grid=[];
  for(let i=0;i<=5;i++){ const value=max-span*i/5, yy=top+plotH*i/5; grid.push(`<line x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}" class="graph-grid"/><text x="${left-8}" y="${yy+4}" text-anchor="end" class="graph-label">${value.toFixed(1)}</text>`); }
  const lines=series.map(item=>{
    const points=events.map((event,index)=>{ const value=srNum(event[item.key]); return value===null ? null : `${x(index)},${y(value)}`; }).filter(Boolean);
    if(points.length<2) return '';
    return `<polyline points="${points.join(' ')}" class="graph-line ${item.className}" fill="none"/>`;
  }).join('');
  const dots=series.map(item=>events.map((event,index)=>{ const value=srNum(event[item.key]); return value===null?'':`<circle cx="${x(index)}" cy="${y(value)}" r="3" class="graph-dot ${item.className}"><title>${srEsc(item.label)} ${srEsc(value)}℃ / ${srEsc(event.date)} ${srEsc(event.time)}</title></circle>`; }).join('')).join('');
  const labels=events.map((event,index)=>{ if(index!==0 && index!==events.length-1 && events.length>10 && index%2) return ''; const label=event.day ? `${event.day}日` : srFmtDate(event.date).slice(5); return `<text x="${x(index)}" y="${height-24}" text-anchor="middle" class="graph-label">${srEsc(label)}</text>`; }).join('');
  const legend=series.map((item,index)=>`<g transform="translate(${left+index*110},${height-7})"><line x1="0" y1="0" x2="22" y2="0" class="graph-line ${item.className}"/><text x="28" y="4" class="graph-label">${item.label}</text></g>`).join('');
  return `<div class="ledger-graph"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="酒母の品温・室温・外気温推移"><text x="6" y="14" class="graph-axis-title">℃</text>${grid.join('')}<line x1="${left}" y1="${top}" x2="${left}" y2="${height-bottom}" class="graph-axis"/><line x1="${left}" y1="${height-bottom}" x2="${width-right}" y2="${height-bottom}" class="graph-axis"/>${lines}${dots}${labels}${legend}</svg></div>`;
}

function srBaseTable(record){
  const b=record.base;
  const rows=[
    ['BY',b.BY,'仕込記号',b.symbol,'仕込順号',b.sequence,'容器番号',b.tankNo],
    ['酒母種類',b.shuboType,'酒種類',b.sakeType,'使用先仕込号',b.destinationBatch,'仕込年月日',srFmtDate(b.startDate)],
    ['米品種・精米',b.riceSummary,'掛米',`${b.kakemaiKg||''} kg ${b.kakemaiDetail||''}`.trim(),'麹米',`${b.kojimaiKg||''} kg ${b.kojimaiDetail||''}`.trim(),'総米',`${srTotalRice(b)} kg`],
    ['汲水',`${b.waterL||''} L`,'乳酸',`${b.lacticMl||''} ml`,'酵母',[b.yeast,b.yeastAmount].filter(Boolean).join(' '),'仕込時数量',`${b.startVolumeL||''} L`]
  ];
  return `<table class="data-table shubo-base-table"><tbody>${rows.map(row=>`<tr>${row.map((value,index)=>index%2===0?`<th>${srEsc(value)}</th>`:`<td>${srEsc(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function srProgressTable(record){
  const rows=record.events.map(event=>`<tr><td>${srEsc(event.day)}</td><td>${srEsc(srFmtDate(event.date))}</td><td>${srEsc(event.time)}</td><td class="text-left">${srEsc(event.operation)}</td><td>${srEsc(event.addWaterL)}</td><td class="text-left">${srEsc(event.appearance)}</td><td class="text-left">${srEsc(event.progressNote)}</td><td>${srEsc(event.roomTemp)}</td><td>${srEsc(event.productTemp)}</td><td>${srEsc(event.outsideTemp)}</td><td>${srEsc(event.tankNo)}</td><td>${srEsc(event.depthMm)}</td><td>${srEsc(event.volumeL)}</td></tr>`).join('');
  return `<div class="data-table-wrap shubo-progress-wrap"><table class="data-table shubo-progress-table"><thead><tr><th>日順</th><th>月日</th><th>時刻</th><th>操作</th><th>追水L</th><th>状貌</th><th>経過簿</th><th>室温℃</th><th>品温℃</th><th>外気温℃</th><th>容器</th><th>深さmm</th><th>数量L</th></tr></thead><tbody>${rows||'<tr><td colspan="13">経過未入力</td></tr>'}</tbody></table></div>`;
}
function srAnalysisTable(record){
  const rows=srAnalysisFor(record).map(item=>{ const f=item.fields||{}; return `<tr><td>${srEsc(srFmtDate(f['分析日']))}</td><td>${srEsc(f['日数日順']||f['日数'])}</td><td>${srEsc(f['ボーメ日本酒度']||f['ボーメ']||f['日本酒度'])}</td><td>${srEsc(f['酸度ml']||f['酸'])}</td><td>${srEsc(f['アミノ酸度ml']||f['アミノ酸'])}</td><td>${srEsc(f['アルコール%']||f['アルコール'])}</td><td>${srEsc(f['グルコース'])}</td><td>${srEsc(f['品温℃'])}</td></tr>`; }).join('');
  return `<section class="ledger-subsection"><h4>分析記録参照</h4><p class="ledger-note">分析値は分析記録を正本とし、酒母記録へ重複保存していません。</p><div class="data-table-wrap"><table class="data-table shubo-analysis-table"><thead><tr><th>分析日</th><th>日数</th><th>ボーメ・日本酒度</th><th>酸度</th><th>アミノ酸度</th><th>アルコール%</th><th>グルコース</th><th>品温℃</th></tr></thead><tbody>${rows||'<tr><td colspan="8">仕込順号・T.Noが完全一致する分析記録はありません。</td></tr>'}</tbody></table></div></section>`;
}
function srSamplesTable(record){
  const rows=record.samples.map(item=>`<tr><td>${srEsc(srFmtDate(item.sampleDate))}</td><td>${srEsc(srFmtDate(item.analysisDate))}</td><td>${srEsc(item.collectedMl)}</td><td>${srEsc(item.usedMl)}</td><td>${srEsc(item.discardedMl)}</td><td>${srEsc(item.disposal)}</td><td class="text-left">${srEsc(item.note)}</td></tr>`).join('');
  return `<section class="ledger-subsection"><h4>採取管理</h4><div class="data-table-wrap"><table class="data-table"><thead><tr><th>採取日</th><th>分析日</th><th>採取量ml</th><th>使用量ml</th><th>廃棄量ml</th><th>処分内容</th><th>照合メモ</th></tr></thead><tbody>${rows||'<tr><td colspan="7">採取記録なし</td></tr>'}</tbody></table></div></section>`;
}
function srTransfersTable(record){
  const rows=record.transfers.map((item,index)=>`<tr><td>${index+1}</td><td>${srEsc(srFmtDate(item.transferDate))}</td><td>${srEsc(item.transferVolumeL)}</td><td>${srEsc(item.afterDepthMm)}</td><td>${srEsc(item.remainingVolumeL)}</td><td>${srEsc(item.destinationTank)}</td><td>${srEsc(item.moromiSequence)}</td><td>${srEsc(item.moromiSymbol)}</td><td>${srEsc(item.alcoholPct)}</td><td>${srEsc(item.sakeType)}</td><td class="text-left">${srEsc(item.note)}</td></tr>`).join('');
  return `<section class="ledger-subsection"><h4>払出明細</h4><div class="data-table-wrap"><table class="data-table shubo-transfer-table"><thead><tr><th>順</th><th>払出日</th><th>数量L</th><th>払出後深さmm</th><th>残数量L</th><th>払出先T.No</th><th>醪順号</th><th>醪記号</th><th>Alc%</th><th>酒種類</th><th>備考</th></tr></thead><tbody>${rows||'<tr><td colspan="11">払出未入力</td></tr>'}</tbody></table></div><div class="ledger-kpis"><span><b>熟成深</b>${srEsc(record.base.matureDepthMm||'—')} mm</span><span><b>製造数量</b>${srEsc(record.base.productionVolumeL||'—')} L</span><span><b>払出合計</b>${srEsc(srTransferTotal(record.transfers))} L</span><span><b>熟成歩合</b>${srEsc(srMaturity(record.base)||'—')} %</span></div></section>`;
}
function srLedger(record,withActions=false){
  const actions=withActions ? `<div class="record-actions no-print"><a class="btn" href="shubo.html?id=${encodeURIComponent(record.record_id)}">編集</a><a class="btn" href="reports-shubo.html?id=${encodeURIComponent(record.record_id)}">この記録を出力</a></div>` : '';
  return `<article class="shubo-ledger" data-record-id="${srEsc(record.record_id)}"><header class="shubo-ledger-head"><div><h3>${srEsc(srTitle(record))}</h3><span class="card-meta">仕込 ${srEsc(srFmtDate(record.base.startDate)||'未入力')} / 容器 ${srEsc(record.base.tankNo||'未入力')}${record.legacy_source?' / 旧形式を読取':''}</span></div>${actions}</header><div class="data-table-wrap">${srBaseTable(record)}</div><section class="ledger-subsection"><h4>温度経過グラフ</h4>${srGraphSvg(record)}</section>${srProgressTable(record)}${srAnalysisTable(record)}${srSamplesTable(record)}${srTransfersTable(record)}${record.base.note?`<section class="ledger-subsection"><h4>製造メモ</h4><p class="ledger-long-note">${srEsc(record.base.note).replace(/\n/g,'<br>')}</p></section>`:''}</article>`;
}

function srFilters(){ return {BY:srText(document.getElementById('sr-filter-by')?.value),type:srText(document.getElementById('sr-filter-type')?.value),month:srText(document.getElementById('sr-filter-month')?.value),q:srText(document.getElementById('sr-filter-q')?.value).toLowerCase(),sort:srText(document.getElementById('sr-filter-sort')?.value)||'desc'}; }
function srFiltered(){
  const filters=srFilters();
  let records=srRecords().filter(record=>(!filters.BY||record.base.BY===filters.BY)&&(!filters.type||record.base.shuboType===filters.type)&&(!filters.month||srText(record.base.startDate).startsWith(filters.month))&&(!filters.q||JSON.stringify([record.base,record.transfers]).toLowerCase().includes(filters.q)));
  records.sort((a,b)=>srText(a.base.startDate||a.created_at).localeCompare(srText(b.base.startDate||b.created_at))*(filters.sort==='asc'?1:-1));
  const id=new URLSearchParams(location.search).get('id'); return id ? records.filter(record=>record.record_id===id) : records;
}
function srFillFilters(){
  const records=srRecords();
  [['sr-filter-by','BY'],['sr-filter-type','shuboType']].forEach(([id,key])=>{
    const element=document.getElementById(id); if(!element) return;
    [...new Set(records.map(record=>record.base[key]).filter(Boolean))].sort().forEach(value=>element.insertAdjacentHTML('beforeend',`<option>${srEsc(value)}</option>`));
  });
}
function srRender(target,withActions){
  const records=srFiltered(), element=document.getElementById(target);
  if(element) element.innerHTML=records.map(record=>srLedger(record,withActions)).join('') || '<div class="empty-note">条件に該当する酒母記録はありません。</div>';
  const status=document.getElementById('sr-list-status'); if(status) status.textContent=`表示 ${records.length}件 / 端末内保存 ${srRecords().length}件`;
}
function srClearFilters(){
  ['sr-filter-by','sr-filter-type','sr-filter-month','sr-filter-q'].forEach(id=>{ const element=document.getElementById(id); if(element) element.value=''; });
  const sort=document.getElementById('sr-filter-sort'); if(sort) sort.value='desc';
  document.body.dataset.page==='shubo-report' ? srRender('sr-report-preview',false) : srRender('sr-check-list',true);
}
function srPrint(){ window.print(); }

function srDownload(blob,name){ const link=document.createElement('a'); link.href=URL.createObjectURL(blob); link.download=name; document.body.appendChild(link); link.click(); const url=link.href; link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
function srCol(index){ let value=''; for(let n=index+1;n>0;n=Math.floor((n-1)/26)) value=String.fromCharCode(65+(n-1)%26)+value; return value; }
function srU16(array,value){ array.push(value&255,value>>>8&255); }
function srU32(array,value){ array.push(value&255,value>>>8&255,value>>>16&255,value>>>24&255); }
function srCrc(bytes){ let table=srCrc.table; if(!table){ table=srCrc.table=new Uint32Array(256); for(let i=0;i<256;i++){ let c=i; for(let k=0;k<8;k++) c=c&1?0xedb88320^(c>>>1):c>>>1; table[i]=c>>>0; } } let c=0xffffffff; for(const byte of bytes) c=table[(c^byte)&255]^(c>>>8); return(c^0xffffffff)>>>0; }
function srZip(entries){
  const encoder=new TextEncoder(), parts=[], central=[]; let offset=0;
  for(const [name,data] of entries){
    const nameBytes=encoder.encode(name), bytes=typeof data==='string'?encoder.encode(data):data, crc=srCrc(bytes), header=[];
    srU32(header,0x04034b50); srU16(header,20); srU16(header,0); srU16(header,0); srU16(header,0); srU16(header,0); srU32(header,crc); srU32(header,bytes.length); srU32(header,bytes.length); srU16(header,nameBytes.length); srU16(header,0);
    parts.push(Uint8Array.from(header),nameBytes,bytes);
    const item=[]; srU32(item,0x02014b50); srU16(item,20); srU16(item,20); srU16(item,0); srU16(item,0); srU16(item,0); srU16(item,0); srU32(item,crc); srU32(item,bytes.length); srU32(item,bytes.length); srU16(item,nameBytes.length); srU16(item,0); srU16(item,0); srU16(item,0); srU16(item,0); srU32(item,0); srU32(item,offset); central.push(Uint8Array.from(item),nameBytes);
    offset+=header.length+nameBytes.length+bytes.length;
  }
  const centralSize=central.reduce((sum,part)=>sum+part.length,0), end=[];
  srU32(end,0x06054b50); srU16(end,0); srU16(end,0); srU16(end,entries.length); srU16(end,entries.length); srU32(end,centralSize); srU32(end,offset); srU16(end,0);
  const all=[...parts,...central,Uint8Array.from(end)], output=new Uint8Array(all.reduce((sum,part)=>sum+part.length,0));
  let position=0; all.forEach(part=>{ output.set(part,position); position+=part.length; });
  return new Blob([output],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function srSheet(rows,widths){
  const data=rows.map((row,rowIndex)=>`<row r="${rowIndex+1}">${row.map((value,columnIndex)=>{ const numeric=typeof value==='number'&&Number.isFinite(value); return `<c r="${srCol(columnIndex)}${rowIndex+1}" s="${rowIndex===0?2:4}"${numeric?'':' t="inlineStr"'}>${numeric?`<v>${value}</v>`:`<is><t xml:space="preserve">${srEscXml(value)}</t></is>`}</c>`; }).join('')}</row>`).join('');
  const columns=`<cols>${widths.map((width,index)=>`<col min="${index+1}" max="${index+1}" width="${width}" customWidth="1"/>`).join('')}</cols>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${columns}<sheetData>${data}</sheetData></worksheet>`;
}
function srXlsx(sheets){
  const contentTypes=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,index)=>`<Override PartName="/xl/worksheets/sheet${index+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  const workbook=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet,index)=>`<sheet name="${srEscXml(sheet.name)}" sheetId="${index+1}" r:id="rId${index+1}"/>`).join('')}</sheets></workbook>`;
  const rootRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbookRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,index)=>`<Relationship Id="rId${index+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Meiryo"/></font><font><b/><sz val="10"/><name val="Meiryo"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7F4EC"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="5"><xf/><xf fontId="1"/><xf fontId="1" fillId="2" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf/><xf borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs></styleSheet>`;
  return srZip([['[Content_Types].xml',contentTypes],['_rels/.rels',rootRels],['xl/workbook.xml',workbook],['xl/_rels/workbook.xml.rels',workbookRels],['xl/styles.xml',styles],...sheets.map((sheet,index)=>[`xl/worksheets/sheet${index+1}.xml`,srSheet(sheet.rows,sheet.widths)])]);
}
function srExportExcel(){
  const records=srFiltered(); if(!records.length){ alert('条件に該当する酒母製造記録がありません。'); return; }
  const ledger=[['記録ID','BY','仕込記号','仕込順号','容器番号','酒母種類','酒種類','米品種・精米','掛米kg','麹米kg','総米kg','汲水L','乳酸ml','酵母','仕込日','仕込数量L','製造数量L','払出合計L','熟成歩合%','メモ']];
  const progress=[['記録ID','BY','仕込記号','仕込順号','日順','月日','時刻','操作','追水L','状貌','経過簿','室温℃','品温℃','外気温℃','容器','深さmm','数量L']];
  const samples=[['記録ID','仕込記号','仕込順号','採取日','分析日','採取量ml','使用量ml','廃棄量ml','処分内容','照合メモ']];
  const transfers=[['記録ID','仕込記号','仕込順号','払出順','払出日','払出数量L','払出後深さmm','残数量L','払出先T.No','醪順号','醪記号','Alc%','酒種類','備考']];
  records.forEach(record=>{
    const b=record.base;
    ledger.push([record.record_id,b.BY,b.symbol,b.sequence,b.tankNo,b.shuboType,b.sakeType,b.riceSummary,b.kakemaiKg,b.kojimaiKg,srTotalRice(b),b.waterL,b.lacticMl,[b.yeast,b.yeastAmount].filter(Boolean).join(' '),b.startDate,b.startVolumeL,b.productionVolumeL,srTransferTotal(record.transfers),srMaturity(b),b.note]);
    record.events.forEach(e=>progress.push([record.record_id,b.BY,b.symbol,b.sequence,e.day,e.date,e.time,e.operation,e.addWaterL,e.appearance,e.progressNote,e.roomTemp,e.productTemp,e.outsideTemp,e.tankNo,e.depthMm,e.volumeL]));
    record.samples.forEach(s=>samples.push([record.record_id,b.symbol,b.sequence,s.sampleDate,s.analysisDate,s.collectedMl,s.usedMl,s.discardedMl,s.disposal,s.note]));
    record.transfers.forEach((t,index)=>transfers.push([record.record_id,b.symbol,b.sequence,index+1,t.transferDate,t.transferVolumeL,t.afterDepthMm,t.remainingVolumeL,t.destinationTank,t.moromiSequence,t.moromiSymbol,t.alcoholPct,t.sakeType,t.note]));
  });
  const info=[['項目','内容'],['出力日時',new Date().toLocaleString('ja-JP')],['出力件数',records.length],['注意','分析値は分析記録を正本とし、このExcelへ重複出力していません。'],['グラフ','画面および印刷/PDFには表示。Excelは経過データを出力。'],['正本','全工程バックアップJSON']];
  srDownload(srXlsx([
    {name:'1_酒母製造帳',rows:ledger,widths:Array(20).fill(16)},
    {name:'2_酒母経過',rows:progress,widths:Array(17).fill(15)},
    {name:'3_採取管理',rows:samples,widths:Array(10).fill(17)},
    {name:'4_払出明細',rows:transfers,widths:Array(14).fill(16)},
    {name:'5_出力情報',rows:info,widths:[18,58]}
  ]),`work_record_shubo_${srYmd()}.xlsx`);
}

function srInit(){
  if(document.body.dataset.page==='shubo-input'){
    document.getElementById('sr-add-event')?.addEventListener('click',()=>srAddEvent());
    document.getElementById('sr-add-sample')?.addEventListener('click',()=>srAddSample());
    document.getElementById('sr-add-transfer')?.addEventListener('click',()=>srAddTransfer());
    document.querySelectorAll('[data-base]').forEach(element=>element.addEventListener('input',srUpdateCalcs));
    document.querySelectorAll('#sr-event-body,#sr-sample-body,#sr-transfer-body').forEach(body=>body?.addEventListener('click',event=>{ const button=event.target.closest('[data-remove-row]'); if(!button) return; button.closest('tr')?.remove(); srRenumberTransfers(); }));
    const id=new URLSearchParams(location.search).get('id'); srLoad(id ? srRecords().find(record=>record.record_id===id) : null);
  }else{
    srFillFilters(); document.body.dataset.page==='shubo-report' ? srRender('sr-report-preview',false) : srRender('sr-check-list',true);
  }
}

document.addEventListener('DOMContentLoaded',srInit);
Object.assign(window,{srResetInput,srSaveInput,srDeleteCurrent,srRenderCheck:()=>srRender('sr-check-list',true),srRenderReport:()=>srRender('sr-report-preview',false),srClearFilters,srPrint,srExportExcel});
})();
