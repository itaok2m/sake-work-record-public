// 酒造作業記録ツール ui.js
// 共通UIの安全な補助のみ。各工程の保存処理は各HTML内の実装を優先する。
(function(){
  function updateFoldLabel(details){
    if(!details || !details.matches('details[data-fold]')) return;
    const summary=details.querySelector('summary');
    if(!summary) return;
    const span=summary.querySelector('span');
    const strong=summary.querySelector('b');
    const openText=details.getAttribute('data-fold-open') || '閉じる';
    const closedText=details.getAttribute('data-fold-closed') || '開く';
    if(span) span.textContent = details.open ? openText : closedText;
    if(strong) strong.textContent = details.open ? '閉じる ▲' : '開く ▼';
  }
  document.addEventListener('DOMContentLoaded', function(){
    document.documentElement.classList.add('js-ready');
    document.querySelectorAll('details[data-fold]').forEach(function(details){
      updateFoldLabel(details);
      details.addEventListener('toggle', function(){ updateFoldLabel(details); });
    });
  });
})();
