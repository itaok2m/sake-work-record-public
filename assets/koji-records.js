(() => {
'use strict';

const KR_STORAGE_KEY = 'workRecordKojiRecordsV1';
const KR_SCHEMA = 'workRecordKojiLedgerV01';
const KR_DEFAULT_OPERATIONS = ['引込','種切','切返','盛','仲仕事','仕舞仕事','最高温度','出麹'];
const KR_OPERATIONS = [...KR_DEFAULT_OPERATIONS,'最高積替','積替','その他'];

const KR_BASE_DEFAULTS = {
  BY:'', use:'', lot:'', sourceRef:'', riceType:'', variety:'', polishing:'', whiteRiceKg:'',
  hikikomiDate:'', hikikomiTime:'', taneKoji:'', destination:'',
  dekoujiDate:'', dekoujiTime:'', dekoujiKg:'', note:''
};

function krEsc(value){return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function krEscXml(value){return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));}
function krText(value){return String(value ?? '').trim();}
function krNow(){return new Date().toISOString();}
function krId(prefix='koji'){return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;}
function krYmd(){const d=new Date();return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;}
function krFmtDate(value){const m=krText(value).match(/^(\d{4})-(\d{2})-(\d{2})/);return m ? `${m[1]}/${m[2]}/${m[3]}` : krText(value);}
function krReadRaw(){try{const parsed=JSON.parse(localStorage.getItem(KR_STORAGE_KEY) || '[]');return Array.isArray(parsed) ? parsed : [];}catch(_e){return [];}}
function krWriteRaw(records){localStorage.setItem(KR_STORAGE_KEY, JSON.stringify(records));}

function krLegacyBase(fields={}){
  return {
    ...KR_BASE_DEFAULTS,
    BY:krText(fields.BY), use:krText(fields['用途']), lot:krText(fields['記号・順号']), sourceRef:krText(fields['原料処理参照ID']),
    riceType:krText(fields['原料米']), variety:krText(fields['品種']), polishing:krText(fields['精米歩合']), whiteRiceKg:krText(fields['白米数量kg']),
    hikikomiDate:krText(fields['引込日']), hikikomiTime:krText(fields['引込時刻']), taneKoji:krText(fields['種麹']), destination:krText(fields['使用先']),
    dekoujiDate:krText(fields['出麹日']), dekoujiTime:krText(fields['出麹時刻']), dekoujiKg:krText(fields['出麹数量kg']), note:krText(fields['備考'])
  };
}

function krNormalizeEvent(event={}){
  return {
    event_id:event.event_id || krId('koji_event'), operation:krText(event.operation), date:krText(event.date), time:krText(event.time), hours:krText(event.hours),
    productTemp:krText(event.productTemp), roomTemp:krText(event.roomTemp), humidity:krText(event.humidity), dryBulb:krText(event.dryBulb), wetBulb:krText(event.wetBulb),
    appearance:krText(event.appearance), note:krText(event.note)
  };
}

function krLegacyEvents(fields={}){
  const event = krNormalizeEvent({
    operation:fields['操作'], date:fields['操作日'], time:fields['操作時刻'], hours:fields['在室時間h'], productTemp:fields['品温℃'], roomTemp:fields['室温℃'],
    humidity:fields['湿度%'], dryBulb:fields['乾球℃'], wetBulb:fields['湿球℃'], appearance:fields['状貌'], note:fields['備考']
  });
  return Object.entries(event).some(([key,value]) => key !== 'event_id' && krText(value)) ? [event] : [];
}

function krNormalize(record){
  if(record && record.schema === KR_SCHEMA && record.base && Array.isArray(record.events)){
    return {
      ...record,
      record_id:record.record_id || krId(), schema:KR_SCHEMA, process:'koji', label:'麹製造',
      base:{...KR_BASE_DEFAULTS, ...record.base}, events:record.events.map(krNormalizeEvent), legacy_source:false
    };
  }
  const fields = record?.fields || {};
  return {
    record_id:record?.record_id || krId(), schema:KR_SCHEMA, process:'koji', label:'麹製造',
    created_at:record?.created_at || krNow(), updated_at:record?.updated_at || record?.created_at || krNow(),
    base:krLegacyBase(fields), events:krLegacyEvents(fields), candidate_imports:Array.isArray(record?.candidate_imports) ? record.candidate_imports : [],
    legacy_source:true
  };
}

function krRecords(){return krReadRaw().map(krNormalize);}
function krRecordTitle(record){return [record.base.lot, record.base.use].filter(Boolean).join(' / ') || '記号・用途未入力';}
function krEventSort(events){return [...events].sort((a,b) => `${a.date || ''} ${a.time || ''}`.localeCompare(`${b.date || ''} ${b.time || ''}`));}
function krRecordDate(record){return record.base.hikikomiDate || record.events[0]?.date || record.created_at || '';}
function krSortRecords(records, sort='desc'){
  return [...records].sort((a,b) => sort === 'asc' ? krRecordDate(a).localeCompare(krRecordDate(b)) : krRecordDate(b).localeCompare(krRecordDate(a)));
}
function krFilter(records, filters={}){
  const query=krText(filters.q).toLowerCase();
  return krSortRecords(records, filters.sort || 'desc').filter(record => {
    const base=record.base;
    if(filters.BY && base.BY !== filters.BY) return false;
    if(filters.use && base.use !== filters.use) return false;
    if(filters.month && !krRecordDate(record).startsWith(filters.month)) return false;
    if(query){
      const haystack=[base.lot,base.destination,base.riceType,base.variety,base.sourceRef,base.note,...record.events.flatMap(e=>[e.operation,e.appearance,e.note])].join(' ').toLowerCase();
      if(!haystack.includes(query)) return false;
    }
    return true;
  });
}

function krBaseRows(record){
  const b=record.base;
  return [
    ['BY',b.BY,'用途',b.use,'記号・順号',b.lot,'使用先',b.destination],
    ['原料米',b.riceType,'品種',b.variety,'精米歩合 %',b.polishing,'白米数量 kg',b.whiteRiceKg],
    ['引込',`${krFmtDate(b.hikikomiDate)} ${b.hikikomiTime}`.trim(),'種麹',b.taneKoji,'出麹',`${krFmtDate(b.dekoujiDate)} ${b.dekoujiTime}`.trim(),'出麹数量 kg',b.dekoujiKg]
  ];
}

function krLedgerHtml(record,{withActions=false}={}){
  const actions=withActions ? `<div class="record-actions no-print"><a class="btn" href="koji.html?id=${encodeURIComponent(record.record_id)}">編集</a><a class="btn" href="reports-koji.html?id=${encodeURIComponent(record.record_id)}">この記録を出力</a></div>` : '';
  const baseRows=krBaseRows(record).map(row=>`<tr>${row.map((v,i)=>i%2===0?`<th>${krEsc(v)}</th>`:`<td>${krEsc(v)}</td>`).join('')}</tr>`).join('');
  const events=krEventSort(record.events || []);
  const eventRows=events.map(e=>`<tr><td>${krEsc(e.operation)}</td><td>${krEsc(krFmtDate(e.date))}</td><td>${krEsc(e.time)}</td><td>${krEsc(e.hours)}</td><td>${krEsc(e.productTemp)}</td><td>${krEsc(e.roomTemp)}</td><td>${krEsc(e.humidity)}</td><td>${krEsc(e.dryBulb)}</td><td>${krEsc(e.wetBulb)}</td><td class="text-left">${krEsc(e.appearance)}</td><td class="text-left">${krEsc(e.note)}</td></tr>`).join('');
  return `<article class="koji-ledger" data-record-id="${krEsc(record.record_id)}"><header class="koji-ledger-head"><div><h3>${krEsc(krRecordTitle(record))}</h3><span class="card-meta">引込 ${krEsc(krFmtDate(record.base.hikikomiDate) || '未入力')} / ${krEsc(record.base.whiteRiceKg || '数量未入力')} kg${record.legacy_source ? ' / 旧形式を読取' : ''}</span></div>${actions}</header><div class="data-table-wrap"><table class="data-table koji-base-table"><tbody>${baseRows}</tbody></table></div><div class="data-table-wrap koji-progress-wrap"><table class="data-table koji-progress-table"><thead><tr><th>操作</th><th>月日</th><th>時刻</th><th>在室h</th><th>品温℃</th><th>室温℃</th><th>湿度%</th><th>乾球℃</th><th>湿球℃</th><th>状貌</th><th>備考</th></tr></thead><tbody>${eventRows || '<tr><td colspan="11">経過未入力</td></tr>'}</tbody></table></div>${record.base.note ? `<p class="koji-ledger-note"><b>製造単位メモ：</b>${krEsc(record.base.note)}</p>` : ''}</article>`;
}

function krEventOptions(selected=''){const operations=selected&&!KR_OPERATIONS.includes(selected)?[...KR_OPERATIONS,selected]:KR_OPERATIONS;return operations.map(op=>`<option${op===selected?' selected':''}>${krEsc(op)}</option>`).join('');}
function krEventRowHtml(event={}){
  const e=krNormalizeEvent(event);
  return `<tr data-event-id="${krEsc(e.event_id)}"><td><select data-event-field="operation">${krEventOptions(e.operation)}</select></td><td><input data-event-field="date" type="date" value="${krEsc(e.date)}"></td><td><input data-event-field="time" type="time" step="1" value="${krEsc(e.time)}"></td><td><input data-event-field="hours" inputmode="decimal" value="${krEsc(e.hours)}"></td><td><input data-event-field="productTemp" inputmode="decimal" value="${krEsc(e.productTemp)}"></td><td><input data-event-field="roomTemp" inputmode="decimal" value="${krEsc(e.roomTemp)}"></td><td><input data-event-field="humidity" inputmode="decimal" value="${krEsc(e.humidity)}"></td><td><input data-event-field="dryBulb" inputmode="decimal" value="${krEsc(e.dryBulb)}"></td><td><input data-event-field="wetBulb" inputmode="decimal" value="${krEsc(e.wetBulb)}"></td><td><textarea data-event-field="appearance">${krEsc(e.appearance)}</textarea></td><td><textarea data-event-field="note">${krEsc(e.note)}</textarea></td><td><button class="btn small-btn" type="button" data-remove-event>行を外す</button></td></tr>`;
}
function krAddEvent(event={}){const body=document.getElementById('kr-event-body');if(body) body.insertAdjacentHTML('beforeend',krEventRowHtml(event));}
function krStandardEvents(){return KR_DEFAULT_OPERATIONS.map(operation=>krNormalizeEvent({operation}));}
function krBaseElements(){return [...document.querySelectorAll('[data-base]')];}
function krSetBase(base){krBaseElements().forEach(el=>{el.value=base?.[el.dataset.base] ?? '';});}
function krGetBase(){const base={...KR_BASE_DEFAULTS};krBaseElements().forEach(el=>{base[el.dataset.base]=krText(el.value);});return base;}
function krSetEvents(events){const body=document.getElementById('kr-event-body');if(!body)return;body.innerHTML='';(events?.length ? events : krStandardEvents()).forEach(krAddEvent);}
function krGetEvents(){
  const base=krGetBase();
  return [...document.querySelectorAll('#kr-event-body tr')].map(row=>{
    const event={event_id:row.dataset.eventId || krId('koji_event')};
    row.querySelectorAll('[data-event-field]').forEach(el=>{event[el.dataset.eventField]=krText(el.value);});
    if(!event.hours && event.date && (base.hikikomiDate || event.operation==='引込')) event.hours=krCalcHours(base.hikikomiDate,base.hikikomiTime,event.date,event.time,event.operation);
    return krNormalizeEvent(event);
  });
}
function krCalcHours(startDate,startTime,eventDate,eventTime,operation){
  if(operation==='引込') return '0.0';
  if(!startDate || !eventDate) return '';
  const start=new Date(`${startDate}T${startTime || '00:00:00'}`);const end=new Date(`${eventDate}T${eventTime || '00:00:00'}`);
  const value=(end-start)/3600000;return Number.isFinite(value) && value>=0 ? value.toFixed(1) : '';
}
function krSetInputStatus(text){const el=document.getElementById('kr-input-status');if(el)el.textContent=text;}
function krSetEditMode(record){
  const id=document.getElementById('kr-record-id');if(id)id.value=record?.record_id || '';
  const title=document.getElementById('kr-edit-target');if(title)title.textContent=record ? `${krRecordTitle(record)}を編集中${record.legacy_source?'（旧形式読取）':''}` : '新しい製造単位を入力中';
  const danger=document.getElementById('kr-delete-current-wrap');if(danger)danger.hidden=!record;
}
function krLoadInput(record){krSetBase(record?.base || KR_BASE_DEFAULTS);krSetEvents(record?.events?.length ? record.events : krStandardEvents());krSetEditMode(record || null);krSetInputStatus(record ? '保存済み記録を開きました。保存すると同じ記録IDで更新します。' : '新しい麹製造を入力します。');window.scrollTo({top:0,behavior:'smooth'});}
function krResetInput(){krLoadInput(null);history.replaceState(null,'','koji.html');}
function krSaveInput(){
  const base=krGetBase();
  if(!base.lot){alert('記号・順号を入力してください。');return;}
  if(!base.hikikomiDate){alert('引込日を入力してください。');return;}
  const currentId=krText(document.getElementById('kr-record-id')?.value);
  const raw=krReadRaw();const currentRaw=raw.find(r=>r.record_id===currentId);const current=currentRaw ? krNormalize(currentRaw) : null;
  const record={record_id:currentId || krId(),schema:KR_SCHEMA,process:'koji',label:'麹製造',created_at:current?.created_at || krNow(),updated_at:krNow(),base,events:krGetEvents(),candidate_imports:current?.candidate_imports || [],notes:'製造台帳型の麹製造記録。原料処理候補取り込みは未接続。'};
  const index=raw.findIndex(r=>r.record_id===record.record_id);if(index>=0)raw[index]=record;else raw.unshift(record);krWriteRaw(raw);krLoadInput(record);krSetInputStatus(`麹製造を${index>=0?'更新':'保存'}しました。端末内保存 ${raw.length}件。正本化は全工程バックアップJSONで行います。`);
}
function krDeleteCurrent(){
  const id=krText(document.getElementById('kr-record-id')?.value);if(!id)return;
  const record=krRecords().find(r=>r.record_id===id);if(!record)return;
  if(!confirm(`「${krRecordTitle(record)}」を削除しますか？`))return;
  if(!confirm('削除すると元に戻せません。全工程バックアップを確認したうえで削除しますか？'))return;
  krWriteRaw(krReadRaw().filter(r=>r.record_id!==id));krResetInput();krSetInputStatus('麹製造記録を削除しました。');
}

function krGetFilters(){return {BY:krText(document.getElementById('kr-filter-by')?.value),use:krText(document.getElementById('kr-filter-use')?.value),month:krText(document.getElementById('kr-filter-month')?.value),q:krText(document.getElementById('kr-filter-q')?.value),sort:krText(document.getElementById('kr-filter-sort')?.value)||'desc'};}
function krConditionLabel(filters,count){const p=[];if(filters.BY)p.push(filters.BY);if(filters.use)p.push(filters.use);if(filters.month)p.push(filters.month);if(filters.q)p.push(`検索:${filters.q}`);p.push(filters.sort==='asc'?'古い引込順':'新しい引込順');return `${p.join(' / ')} / ${count}件`;}
function krFillFilterOptions(){
  const month=document.getElementById('kr-filter-month');if(!month)return;
  const values=[...new Set(krRecords().map(krRecordDate).filter(d=>/^\d{4}-\d{2}/.test(d)).map(d=>d.slice(0,7)))].sort().reverse();
  month.innerHTML='<option value="">すべて</option>'+values.map(v=>`<option value="${krEsc(v)}">${krEsc(v.replace('-','年'))}月</option>`).join('');
}
function krRenderList(targetId,{withActions=false}={}){
  const target=document.getElementById(targetId);if(!target)return;
  let records=krFilter(krRecords(),krGetFilters());
  const id=new URLSearchParams(location.search).get('id');if(id)records=records.filter(r=>r.record_id===id);
  target.innerHTML=records.map(r=>krLedgerHtml(r,{withActions})).join('') || '<div class="empty-note">条件に該当する麹製造記録はありません。</div>';
  const status=document.getElementById('kr-list-status');if(status)status.textContent=krConditionLabel(krGetFilters(),records.length);
}
function krClearFilters(){['kr-filter-by','kr-filter-use','kr-filter-month','kr-filter-q'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});const sort=document.getElementById('kr-filter-sort');if(sort)sort.value='desc';if(document.body.dataset.page==='koji-report')krRenderList('kr-report-preview');else krRenderList('kr-check-list',{withActions:true});}
function krPrint(){window.print();}

function krDownload(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();const url=a.href;a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function krNumberOrText(v){const s=krText(v).replace(/[０-９．]/g,ch=>ch==='．'?'.':String.fromCharCode(ch.charCodeAt(0)-0xFEE0));return s!==''&&Number.isFinite(Number(s))?Number(s):s;}
function krExcelSheets(records){
  const ledger=[['こうじ製造帳']];
  records.forEach((r,index)=>{
    ledger.push([],['記録ID',r.record_id,'更新日時',r.updated_at],...krBaseRows(r));
    ledger.push(['操作','月日','時刻','在室h','品温℃','室温℃','湿度%','乾球℃','湿球℃','状貌','備考']);
    krEventSort(r.events).forEach(e=>ledger.push([e.operation,e.date,e.time,krNumberOrText(e.hours),krNumberOrText(e.productTemp),krNumberOrText(e.roomTemp),krNumberOrText(e.humidity),krNumberOrText(e.dryBulb),krNumberOrText(e.wetBulb),e.appearance,e.note]));
    if(r.base.note)ledger.push(['製造単位メモ',r.base.note]);if(index<records.length-1)ledger.push([]);
  });
  const progress=[['記録ID','BY','用途','記号・順号','使用先','操作','月日','時刻','在室h','品温℃','室温℃','湿度%','乾球℃','湿球℃','状貌','備考']];
  records.forEach(r=>krEventSort(r.events).forEach(e=>progress.push([r.record_id,r.base.BY,r.base.use,r.base.lot,r.base.destination,e.operation,e.date,e.time,krNumberOrText(e.hours),krNumberOrText(e.productTemp),krNumberOrText(e.roomTemp),krNumberOrText(e.humidity),krNumberOrText(e.dryBulb),krNumberOrText(e.wetBulb),e.appearance,e.note])));
  const filters=krGetFilters();
  const info=[['項目','内容'],['出力日時',new Date().toLocaleString('ja-JP')],['出力件数',records.length],['条件',krConditionLabel(filters,records.length)],['用途','人が読む確認・印刷・Excel資料'],['注意','Excelを編集してもアプリ内記録には戻りません。正本バックアップは全工程JSONです。']];
  return [{name:'1_こうじ製造帳',rows:ledger,widths:[18,22,16,18,16,18,16,18,14,28,34]},{name:'2_製麹経過',rows:progress,widths:[24,10,12,18,18,14,12,12,12,12,12,12,12,12,24,30]},{name:'3_出力情報',rows:info,widths:[18,58]}];
}
function krColName(index){let result='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))result=String.fromCharCode(65+((n-1)%26))+result;return result;}
function krU16(a,v){a.push(v&255,(v>>>8)&255);}function krU32(a,v){a.push(v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255);}
function krCrc32(bytes){let table=krCrc32.table;if(!table){table=krCrc32.table=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);table[i]=c>>>0;}}let crc=0xffffffff;for(const b of bytes)crc=table[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function krZip(entries){
  const enc=new TextEncoder(),parts=[],central=[];let offset=0;const d=new Date(),time=(d.getHours()<<11)|(d.getMinutes()<<5)|Math.floor(d.getSeconds()/2),date=((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate();
  for(const entry of entries){const name=enc.encode(entry.name),data=enc.encode(entry.content),crc=krCrc32(data),local=[];krU32(local,0x04034b50);krU16(local,20);krU16(local,0);krU16(local,0);krU16(local,time);krU16(local,date);krU32(local,crc);krU32(local,data.length);krU32(local,data.length);krU16(local,name.length);krU16(local,0);parts.push(Uint8Array.from(local),name,data);const c=[];krU32(c,0x02014b50);krU16(c,20);krU16(c,20);krU16(c,0);krU16(c,0);krU16(c,time);krU16(c,date);krU32(c,crc);krU32(c,data.length);krU32(c,data.length);krU16(c,name.length);krU16(c,0);krU16(c,0);krU16(c,0);krU16(c,0);krU32(c,0);krU32(c,offset);central.push(Uint8Array.from(c),name);offset+=local.length+name.length+data.length;}
  const centralSize=central.reduce((s,p)=>s+p.length,0),end=[];krU32(end,0x06054b50);krU16(end,0);krU16(end,0);krU16(end,entries.length);krU16(end,entries.length);krU32(end,centralSize);krU32(end,offset);krU16(end,0);const all=[...parts,...central,Uint8Array.from(end)],out=new Uint8Array(all.reduce((s,p)=>s+p.length,0));let pos=0;all.forEach(p=>{out.set(p,pos);pos+=p.length;});return out;
}
function krStylesXml(){return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="10"/><name val="Meiryo"/></font><font><b/><sz val="10"/><name val="Meiryo"/></font><font><b/><sz val="14"/><name val="Meiryo"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7F4EC"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF3F8"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF9AA4AE"/></left><right style="thin"><color rgb="FF9AA4AE"/></right><top style="thin"><color rgb="FF9AA4AE"/></top><bottom style="thin"><color rgb="FF9AA4AE"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs></styleSheet>`;}
function krSheetXml(sheet){
  const rows=sheet.rows || [],widths=sheet.widths || [],count=Math.max(widths.length,...rows.map(r=>r.length));
  const cols=`<cols>${Array.from({length:count},(_,i)=>`<col min="${i+1}" max="${i+1}" width="${widths[i]||14}" customWidth="1"/>`).join('')}</cols>`;
  const data=rows.map((row,ri)=>{const title=ri===0&&row.length===1;const header=ri===0||['操作','項目','記録ID'].includes(row[0]);return `<row r="${ri+1}" ht="${title?27:header?23:21}" customHeight="1">${Array.from({length:count},(_,ci)=>{const value=ci<row.length?row[ci]:'';const ref=`${krColName(ci)}${ri+1}`,style=title?1:header?3:4;return typeof value==='number'?`<c r="${ref}" s="${style}"><v>${value}</v></c>`:`<c r="${ref}" t="inlineStr" s="${style}"><is><t>${krEscXml(value)}</t></is></c>`;}).join('')}</row>`;}).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${data}</sheetData></worksheet>`;
}
function krBuildXlsx(sheets){
  const contentTypes=['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',...sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`),'</Types>'].join('');
  const workbook=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${krEscXml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`;
  const rootRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbookRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const entries=[{name:'[Content_Types].xml',content:contentTypes},{name:'_rels/.rels',content:rootRels},{name:'xl/workbook.xml',content:workbook},{name:'xl/_rels/workbook.xml.rels',content:workbookRels},{name:'xl/styles.xml',content:krStylesXml()},...sheets.map((s,i)=>({name:`xl/worksheets/sheet${i+1}.xml`,content:krSheetXml(s)}))];
  return new Blob([krZip(entries)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function krExportExcel(){let records=krFilter(krRecords(),krGetFilters());const id=new URLSearchParams(location.search).get('id');if(id)records=records.filter(r=>r.record_id===id);if(!records.length){alert('条件に該当する麹製造記録がありません。');return;}krDownload(krBuildXlsx(krExcelSheets(records)),`work_record_koji_${krYmd()}.xlsx`);const status=document.getElementById('kr-list-status');if(status)status.textContent=`${krConditionLabel(krGetFilters(),records.length)}をExcel出力しました。`;}

function krInitInput(){
  const id=new URLSearchParams(location.search).get('id');const record=id?krRecords().find(r=>r.record_id===id):null;krLoadInput(record || null);
  document.getElementById('kr-add-event')?.addEventListener('click',()=>krAddEvent({operation:'その他'}));
  document.getElementById('kr-event-body')?.addEventListener('click',event=>{const button=event.target.closest('[data-remove-event]');if(!button)return;const row=button.closest('tr');if(document.querySelectorAll('#kr-event-body tr').length<=1){row.querySelectorAll('input,textarea').forEach(el=>el.value='');row.querySelector('select').value='その他';}else row.remove();});
}
function krInitCheck(){krFillFilterOptions();krRenderList('kr-check-list',{withActions:true});}
function krInitReport(){krFillFilterOptions();krRenderList('kr-report-preview');}

window.krSaveInput=krSaveInput;window.krResetInput=krResetInput;window.krDeleteCurrent=krDeleteCurrent;window.krRenderCheck=()=>krRenderList('kr-check-list',{withActions:true});window.krRenderReport=()=>krRenderList('kr-report-preview');window.krClearFilters=krClearFilters;window.krPrint=krPrint;window.krExportExcel=krExportExcel;
window.addEventListener('DOMContentLoaded',()=>{const page=document.body.dataset.page;if(page==='koji-input')krInitInput();if(page==='koji-check')krInitCheck();if(page==='koji-report')krInitReport();});
})();
