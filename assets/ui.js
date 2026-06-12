(function(){
  'use strict';

  var DRAFT_KEY = 'workRecordDemoDrafts';
  var THEME_KEY = 'work-record-theme-mode';
  var DARK_CLASS = 'theme-dark';
  var DARK_MEDIA = '(prefers-color-scheme: dark)';
  var LIGHT_THEME_COLOR = '#2f4257';
  var DARK_THEME_COLOR = '#0b111c';

  function safeGet(key){try{return window.localStorage ? window.localStorage.getItem(key) : null;}catch(_err){return null;}}
  function safeSet(key,value){try{if(window.localStorage){window.localStorage.setItem(key,value);}}catch(_err){}}
  function prefersDark(){try{return window.matchMedia && window.matchMedia(DARK_MEDIA).matches;}catch(_err){return false;}}
  function readMode(){var saved=safeGet(THEME_KEY); if(saved==='dark'||saved==='light'){return saved;} return prefersDark()?'dark':'light';}
  function getThemeMeta(){return document.querySelector('meta[name="theme-color"]');}
  function updateThemeButtons(isDark){
    document.querySelectorAll('[data-theme-toggle]').forEach(function(btn){
      btn.textContent = isDark ? '明色' : '暗色';
      btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
      btn.setAttribute('aria-label', isDark ? 'ライトテーマに切り替える' : 'ダークテーマに切り替える');
      btn.title = isDark ? 'ライトテーマに切り替える' : 'ダークテーマに切り替える';
    });
  }
  function applyTheme(mode){
    var isDark = mode === 'dark';
    document.body.classList.toggle(DARK_CLASS, isDark);
    document.body.classList.toggle('dark', isDark);
    document.documentElement.classList.toggle(DARK_CLASS, isDark);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
    var meta=getThemeMeta(); if(meta){meta.setAttribute('content', isDark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);}
    updateThemeButtons(isDark);
  }
  function toggleTheme(){var next=document.body.classList.contains(DARK_CLASS)?'light':'dark'; safeSet(THEME_KEY,next); applyTheme(next);}
  function buildThemeButton(){
    var button=document.createElement('button');
    button.type='button';
    button.className='theme-toggle-btn';
    button.setAttribute('data-theme-toggle','');
    return button;
  }
  function insertThemeButton(){
    if(document.querySelector('[data-theme-toggle]')){return;}
    var nav=document.querySelector('.tool-nav');
    if(nav){nav.appendChild(buildThemeButton()); return;}
    var homeHeader=document.querySelector('.home-header');
    if(homeHeader){
      var row=document.createElement('div');
      row.className='home-theme-toggle-row';
      row.appendChild(buildThemeButton());
      homeHeader.appendChild(row);
    }
  }
  function bindThemeButtons(){
    document.querySelectorAll('[data-theme-toggle]').forEach(function(btn){
      if(btn.__workRecordThemeBound){return;}
      btn.__workRecordThemeBound=true;
      btn.addEventListener('click',toggleTheme);
    });
  }
  function updateFoldState(details){
    if(!details){return;}
    var span=details.querySelector('summary span');
    var mark=details.querySelector('summary b');
    var closed=details.getAttribute('data-fold-closed') || '詳細を見る';
    var opened=details.getAttribute('data-fold-open') || '詳細を閉じる';
    if(span){span.textContent = details.open ? opened : closed;}
    if(mark){mark.textContent = details.open ? '閉じる ▲' : '開く ▼';}
  }
  function bindFolds(){
    document.querySelectorAll('details[data-fold]').forEach(function(details){
      if(details.__workRecordFoldBound){return;}
      details.__workRecordFoldBound=true;
      details.addEventListener('toggle',function(){updateFoldState(details);});
      updateFoldState(details);
    });
  }

  window.__workRecordBindFolds = bindFolds;

  window.saveDemoDraft=function(formId){
    var form=document.getElementById(formId); if(!form){return;}
    var data={}; new FormData(form).forEach(function(v,k){data[k]=v;});
    data.savedAt=new Date().toLocaleString('ja-JP');
    var all=[]; try{all=JSON.parse(localStorage.getItem(DRAFT_KEY)||'[]');}catch(_err){all=[];}
    all.unshift(data);
    safeSet(DRAFT_KEY,JSON.stringify(all.slice(0,20)));
    var out=document.getElementById('save-result');
    if(out){out.textContent='下書き保存しました（この端末のブラウザ内だけの保存）: '+data.savedAt; out.className='notice';}
    if(window.loadDraftList){window.loadDraftList();}
  };
  window.loadDraftList=function(){
    var out=document.getElementById('draft-list'); if(!out){return;}
    var all=[]; try{all=JSON.parse(localStorage.getItem(DRAFT_KEY)||'[]');}catch(_err){all=[];}
    out.innerHTML = all.length ? all.map(function(d){return '<div><b>'+(d.kind||'作業')+'</b> '+(d.date||'')+' '+(d.target||'')+'<br><span class="muted">'+(d.savedAt||'')+' / '+(d.memo||'')+'</span></div>';}).join('') : '<div class="muted">まだ下書きはありません。</div>';
  };

  function boot(){
    insertThemeButton();
    bindThemeButtons();
    applyTheme(readMode());
    bindFolds();
    if(window.loadDraftList){window.loadDraftList();}
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',boot);}else{boot();}
})();
