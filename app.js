'use strict';

/* ============ Constants ============ */
const RAW = window.PLAYERS_2026 || [];
const POSITIONS = ['QB','RB','WR','TE','K','DST'];
const STARTER_SLOTS = ['QB','RB','RB','WR','WR','TE','FLEX','K','DST'];
const REQUIRED = { QB:1, RB:2, WR:2, TE:1, K:1, DST:1 };
const LS_KEY = 'ff26_draft_v1';

/* ============ State ============ */
let state = null;
let players = [];
const byId = {};
const ui = { pos:'ALL', q:'', hideTaken:false, view:'room' };
let currentAssign = null;
let toastTimer = null;

function defaultState(){
  return {
    v:1,
    settings:{ leagueName:'My League', numTeams:10, rounds:16, myTeamIdx:0, myTeamName:'My Team', teamNames:[] },
    picks:[], queue:[], custom:[], history:[]
  };
}
function loadState(){
  try{ const s=JSON.parse(localStorage.getItem(LS_KEY)); if(s && s.v===1 && s.settings) return s; }catch(e){}
  return null;
}
function save(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch(e){} }

/* ============ Players ============ */
function rebuildPlayers(){
  players = RAW.map(p=>({
    id:'p'+p.r, rank:p.r, tier:p.t||0, name:p.n, pos:p.p, team:p.tm, bye:p.bye||0,
    sleeper:!!p.s, tag:p.tag||'', adp:p.adp||0, note:p.note||'', custom:false
  }));
  state.custom.forEach((c,i)=>players.push({
    id:c.id, rank:100000+i, tier:0, name:c.name, pos:c.pos, team:'—', bye:0,
    sleeper:false, tag:'', adp:0, note:'', custom:true
  }));
  const cnt={};
  players.slice().sort((a,b)=>a.rank-b.rank).forEach(p=>{ cnt[p.pos]=(cnt[p.pos]||0)+1; p.posRank=cnt[p.pos]; });
  players.forEach(p=>{ byId[p.id]=p; });
}

/* ============ Draft math ============ */
function totalSlots(){ return state.settings.numTeams*state.settings.rounds; }
function slotInfo(slot){
  const n=state.settings.numTeams, r=Math.floor(slot/n), c=slot%n;
  return { slot:slot, round:r+1, pick:c+1, teamIdx:(r%2===0)?c:(n-1-c) };
}
function orderInfo(round, teamIdx){
  const n=state.settings.numTeams;
  const c=((round-1)%2===0)?teamIdx:(n-1-teamIdx);
  return slotInfo((round-1)*n+c);
}
function pickAtSlot(slot){ return state.picks.find(p=>p.slot===slot); }
function pickOf(id){ return state.picks.find(p=>p.id===id); }
function nextEmpty(){
  for(let s=0;s<totalSlots();s++){ if(!pickAtSlot(s)) return slotInfo(s); }
  return null;
}
function nextEmptyFor(teamIdx){
  for(let s=0;s<totalSlots();s++){ const si=slotInfo(s); if(si.teamIdx===teamIdx&&!pickAtSlot(s)) return si; }
  return null;
}
function teamName(i){ return i===state.settings.myTeamIdx ? state.settings.myTeamName : (state.settings.teamNames[i]||('Team '+(i+1))); }
function pickLabel(si){ return si.round+'.'+String(si.pick).padStart(2,'0'); }
function shortName(p){
  const suf=['II','III','IV','Jr.','Sr.','V'];
  const parts=p.name.split(' ');
  while(parts.length>1 && suf.indexOf(parts[parts.length-1])>-1) parts.pop();
  return parts[parts.length-1]+' · '+p.pos;
}

/* ============ Actions ============ */
function draftPlayer(id, teamIdx){
  const p=byId[id]; if(!p) return;
  if(pickOf(id)){ toast(p.name+' is already off the board.'); return; }
  const si=nextEmptyFor(teamIdx);
  if(!si){ toast(teamName(teamIdx)+' has no picks left.'); return; }
  state.picks.push({ id:id, teamIdx:teamIdx, slot:si.slot });
  state.history.push({ t:'addPick', id:id, teamIdx:teamIdx, slot:si.slot });
  save(); renderAll();
  toast(teamIdx===state.settings.myTeamIdx
    ? ('✅ '+p.name+' → your team ('+pickLabel(si)+')')
    : ('❌ '+p.name+' → '+teamName(teamIdx)+' ('+pickLabel(si)+')'));
}
function removePick(id){
  const i=state.picks.findIndex(p=>p.id===id); if(i<0) return;
  const pk=state.picks.splice(i,1)[0];
  state.history.push({ t:'removePick', id:pk.id, teamIdx:pk.teamIdx, slot:pk.slot });
  save(); renderAll(); toast('Removed '+(byId[pk.id]?byId[pk.id].name:'player'));
}
function undo(){
  const h=state.history.pop();
  if(!h){ toast('Nothing to undo.'); return; }
  if(h.t==='addPick') state.picks=state.picks.filter(p=>p.slot!==h.slot);
  else if(h.t==='removePick') state.picks.push({ id:h.id, teamIdx:h.teamIdx, slot:h.slot });
  else if(h.t==='queueAdd') state.queue=state.queue.filter(x=>x!==h.id);
  else if(h.t==='queueRemove') state.queue.push(h.id);
  save(); renderAll(); toast('Undone.');
}
function toggleQueue(id){
  const i=state.queue.indexOf(id);
  if(i>-1){ state.queue=state.queue.filter(x=>x!==id); state.history.push({t:'queueRemove',id:id}); }
  else{ state.queue.push(id); state.history.push({t:'queueAdd',id:id}); }
  save(); renderAll();
}
function addCustomPlayer(name, pos, teamIdx){
  name=(name||'').trim();
  if(!name){ toast('Type a name first.'); return; }
  const id='c'+Date.now()+'_'+Math.floor(Math.random()*10000);
  state.custom.push({ id:id, name:name, pos:pos });
  rebuildPlayers();
  draftPlayer(id, teamIdx);
}

/* ============ Roster ============ */
function fits(p, slot){ return slot==='FLEX' ? (p.pos==='RB'||p.pos==='WR'||p.pos==='TE') : p.pos===slot; }
function myPlayers(){
  return state.picks.filter(p=>p.teamIdx===state.settings.myTeamIdx)
    .map(p=>byId[p.id]).filter(Boolean).sort((a,b)=>a.rank-b.rank);
}
function myRoster(){
  const mine=myPlayers(); const used=new Set(); const starters=[];
  STARTER_SLOTS.forEach(function(slot){
    const p=mine.find(x=>!used.has(x.id)&&fits(x,slot));
    if(p){ used.add(p.id); starters.push({slot:slot,p:p}); } else starters.push({slot:slot,p:null});
  });
  return { starters:starters, bench:mine.filter(x=>!used.has(x.id)) };
}

/* ============ Render helpers ============ */
const $=function(s){ return document.querySelector(s); };
function esc(s){
  return String(s).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function posBadge(p){ return '<span class="pb pos-'+p.pos.toLowerCase()+'">'+(p.custom?p.pos:p.pos+p.posRank)+'</span>'; }
function tagsHtml(p){
  let h='';
  if(p.tag==='T') h+='<span class="tag tag-t" title="Value pick vs ADP (PrizePicks, Aug 29 2026)">TGT</span>';
  if(p.tag==='A') h+='<span class="tag tag-a" title="Fade vs ADP (PrizePicks, Aug 29 2026)">AVD</span>';
  if(p.sleeper) h+='<span class="tag tag-s" title="Sleeper">💤</span>';
  return h;
}
function metaHtml(p){
  const bits=[esc(p.team)];
  bits.push(p.bye?('Bye '+p.bye):'Bye –');
  if(p.tier) bits.push('Tier '+p.tier);
  if(p.adp) bits.push('ADP '+p.adp);
  return bits.join(' · ');
}

/* ============ Renderers ============ */
function topAvailable(){
  return players.filter(p=>!pickOf(p.id)).sort((a,b)=>a.rank-b.rank)[0];
}
function renderQuickbar(ne, my){
  const qb=$('#quickbar');
  const top=ne&&ne.teamIdx===my?topAvailable():null;
  if(!top){ qb.innerHTML=''; qb.classList.add('hidden'); return; }
  qb.classList.remove('hidden');
  qb.innerHTML='<button class="btn qd-btn" id="btn-quickdraft" data-id="'+top.id+'">'+
    '⚡ On the clock — Draft '+esc(top.name)+' <span class="qd-meta">'+posBadge(top)+' #'+top.rank+'</span>'+
    '</button>';
}
function renderClock(){
  const el=$('#clockinfo'); const my=state.settings.myTeamIdx;
  const ne=nextEmpty();
  if(!ne){
    el.innerHTML='<div class="c1"><b>Draft complete</b></div><div class="c2">'+state.picks.length+' picks logged</div>';
    renderQuickbar(null, my);
    return;
  }
  const myNext=nextEmptyFor(my);
  let untilTxt='';
  if(myNext&&myNext.slot>ne.slot){
    const d=myNext.slot-ne.slot;
    untilTxt=' (in '+d+' pick'+(d===1?'':'s')+')';
  }
  el.innerHTML='<div class="c1">Pick <b>'+pickLabel(ne)+'</b> · '+
    (ne.teamIdx===my?'<b class="mine-txt">YOU are on the clock</b>':'On the clock: <b>'+esc(teamName(ne.teamIdx))+'</b>')+
    '</div><div class="c2">'+state.picks.length+' / '+totalSlots()+' picks logged'+
    (myNext?(' · your next: <b>'+pickLabel(myNext)+'</b>'+untilTxt):'')+'</div>';
  renderQuickbar(ne, my);
}

function renderBest(){
  const avail=players.filter(p=>!p.custom&&!pickOf(p.id)).sort((a,b)=>a.rank-b.rank).slice(0,14);
  $('#best-available').innerHTML=avail.map(p=>
    '<div class="chip" data-id="'+p.id+'">'+
      '<span class="chipmain">'+posBadge(p)+'<span class="cr">#'+p.rank+'</span>'+esc(p.name)+'</span>'+
      '<button class="chipact mine" title="Draft to my team">＋</button>'+
      '<button class="chipact take" title="Mark taken">✕</button>'+
    '</div>'
  ).join('');
}

function renderPosTabs(){
  const counts={}; POSITIONS.forEach(p=>counts[p]=0);
  let total=0;
  players.forEach(p=>{ if(!pickOf(p.id)){ counts[p.pos]++; total++; } });
  const tabs=[['ALL',total]].concat(POSITIONS.map(p=>[p,counts[p]]));
  $('#pos-tabs').innerHTML=tabs.map(t=>
    '<button class="ptab'+(ui.pos===t[0]?' active':'')+'" data-pos="'+t[0]+'">'+t[0]+' <span class="cnt">'+t[1]+'</span></button>'
  ).join('');
}

function renderList(){
  const q=ui.q.trim().toLowerCase();
  const list=players.filter(p=>{
    if(ui.pos!=='ALL'&&p.pos!==ui.pos) return false;
    if(ui.hideTaken&&pickOf(p.id)) return false;
    if(q){
      const hay=(p.name+' '+p.team+' '+p.pos).toLowerCase();
      if(hay.indexOf(q)<0) return false;
    }
    return true;
  });
  list.sort((a,b)=>a.rank-b.rank);
  $('#player-list').innerHTML=list.length?list.map(rowHtml).join(''):'<div class="empty">No players match.</div>';
}

function rowHtml(p){
  const pk=pickOf(p.id);
  const mine=pk&&pk.teamIdx===state.settings.myTeamIdx;
  const queued=!pk&&state.queue.indexOf(p.id)>-1;
  let cls='prow';
  if(pk) cls+=mine?' st-mine':' st-taken';
  if(queued) cls+=' st-queued';
  let acts;
  if(pk){
    acts='<span class="pkinfo">'+(mine?'Yours':'➜ '+esc(teamName(pk.teamIdx)))+' · '+pickLabel(slotInfo(pk.slot))+'</span>'+
      '<button class="mini" data-act="unpick" title="Undo this pick">↩</button>';
  }else{
    acts='<button class="mini strong" data-act="mine" title="Draft to my team">＋ Mine</button>'+
      '<button class="mini'+(queued?' on':'')+'" data-act="queue" title="Add to queue">★</button>'+
      '<button class="mini" data-act="take" title="Cross off (taken by another team)">✕</button>';
  }
  return '<div class="'+cls+'" data-id="'+p.id+'">'+
    '<div class="prank">#'+p.rank+'</div>'+
    '<div class="pbadge">'+posBadge(p)+'</div>'+
    '<div class="pinfo">'+
      '<div class="pname">'+esc(p.name)+' '+tagsHtml(p)+'</div>'+
      '<div class="pmeta">'+metaHtml(p)+'</div>'+
      (p.note?'<div class="pnote">⚠ '+esc(p.note)+'</div>':'')+
    '</div>'+
    '<div class="pact">'+acts+'</div>'+
  '</div>';
}

function renderRoster(){
  const mineAll=myPlayers();
  const needs=POSITIONS.map(pos=>{
    const n=mineAll.filter(p=>p.pos===pos).length;
    const req=REQUIRED[pos]||0;
    return '<span class="needchip '+(n<req?'need':'ok')+'" title="You own '+n+' · need '+req+' for starters">'+pos+' '+n+'</span>';
  }).join('');
  const r=myRoster();
  const slots=r.starters.map(s=>s.p
    ?'<div class="slot filled"><span class="slabel">'+s.slot+'</span>'+posBadge(s.p)+'<span class="sname">'+esc(s.p.name)+'</span><button class="mini" data-unpick="'+s.p.id+'" title="Undo">↩</button></div>'
    :'<div class="slot"><span class="slabel">'+s.slot+'</span><span class="sempty">—</span></div>').join('');
  const bench=r.bench.length
    ?r.bench.map(b=>'<div class="slot filled"><span class="slabel">BN</span>'+posBadge(b)+'<span class="sname">'+esc(b.name)+'</span><button class="mini" data-unpick="'+b.id+'" title="Undo">↩</button></div>').join('')
    :'';
  $('#roster-box').innerHTML='<h3>Your team · '+esc(state.settings.myTeamName)+'</h3>'+
    '<div class="needs">'+needs+'</div>'+slots+bench+
    '<button class="btn wide" id="btn-addcustom">＋ Log a pick for your team</button>';
}

function renderQueue(){
  const items=state.queue.map(id=>byId[id]).filter(p=>p&&!pickOf(p.id));
  $('#queue-box').innerHTML='<h3>Queue ('+items.length+')</h3>'+
    (items.length
      ?items.map(p=>'<div class="qrow" data-id="'+p.id+'">'+
        '<span class="qrank">#'+p.rank+'</span>'+posBadge(p)+
        '<span class="qname">'+esc(p.name)+'</span>'+
        '<button class="mini" data-qact="up" title="Move up">▲</button>'+
        '<button class="mini" data-qact="down" title="Move down">▼</button>'+
        '<button class="mini strong" data-qact="draft" title="Draft to my team">＋</button>'+
        '<button class="mini" data-qact="rm" title="Remove">✕</button></div>').join('')
      :'<div class="sempty">Star ★ players to line them up here.</div>');
}

function renderBoard(){
  const s=state.settings, n=s.numTeams, ne=nextEmpty();
  let h='<table class="board"><thead><tr><th class="rnd">Rd</th>';
  for(let t=0;t<n;t++) h+='<th class="bteam'+(t===s.myTeamIdx?' me':'')+'">'+esc(teamName(t))+'</th>';
  h+='</tr></thead><tbody>';
  for(let r=1;r<=s.rounds;r++){
    h+='<tr><td class="rnd">'+r+'</td>';
    for(let t=0;t<n;t++){
      const si=orderInfo(r,t); const pk=pickAtSlot(si.slot);
      const isNext=ne&&ne.slot===si.slot;
      let cls='bcell'; if(pk) cls+=' filled'; if(isNext) cls+=' onclock';
      if(pk&&pk.teamIdx===s.myTeamIdx) cls+=' mine';
      let inner;
      if(pk){ const pl=byId[pk.id]; inner='<span class="bp">'+esc(pl?shortName(pl):'?')+'</span>'; }
      else if(isNext) inner='<span class="oc">on the clock</span>';
      else inner='<span class="open">'+pickLabel(si)+'</span>';
      h+='<td class="'+cls+'" data-slot="'+si.slot+'" data-team="'+t+'">'+inner+'</td>';
    }
    h+='</tr>';
  }
  h+='</tbody></table>';
  $('#board').innerHTML=h;
}

function renderAll(){
  rebuildPlayers();
  renderClock(); renderBest(); renderPosTabs(); renderList(); renderRoster(); renderQueue(); renderBoard();
  $('#btn-undo').textContent='↩ Undo'+(state.history.length?' ('+state.history.length+')':'');
}

/* ============ Toast ============ */
function toast(msg){
  const t=$('#toast');
  t.textContent=msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(function(){ t.classList.add('hidden'); },2600);
}

/* ============ Modals ============ */
function openModal(html){
  $('#modal').innerHTML=html;
  $('#modal').classList.remove('hidden');
  $('#backdrop').classList.remove('hidden');
}
function closeModal(){
  $('#modal').classList.add('hidden');
  $('#backdrop').classList.add('hidden');
  currentAssign=null;
}

function openAssignModal(opt){
  const s=state.settings; const ne=nextEmpty();
  if(opt.mode==='player'){
    const p=byId[opt.id]; if(!p) return;
    let btns='';
    for(let t=0;t<s.numTeams;t++){
      const has=!!nextEmptyFor(t); const def=ne&&ne.teamIdx===t;
      btns+='<button class="teambtn'+(def?' def':'')+(t===s.myTeamIdx?' me':'')+'" data-team="'+t+'"'+(has?'':' disabled')+'>'+
        '<span>'+esc(teamName(t))+'</span><span class="def-tag">'+(def?'on clock':(has?'':'full'))+'</span></button>';
    }
    openModal('<h3>Who took '+esc(p.name)+'?</h3>'+
      '<p class="modal-p">'+posBadge(p)+' '+esc(p.team)+' · Bye '+(p.bye||'–')+' · Rank #'+p.rank+(p.adp?(' · ADP '+p.adp):'')+'</p>'+
      (p.note?'<p class="modal-p warn-txt">⚠ '+esc(p.note)+'</p>':'')+
      '<div class="teamgrid">'+btns+'</div>'+
      '<div class="mbtns"><button class="btn" data-close>Cancel</button></div>');
    currentAssign={mode:'player',id:opt.id};
  }else{
    const teamIdx=opt.teamIdx;
    openModal('<h3>Log a pick for '+esc(teamName(teamIdx))+'</h3>'+
      '<input id="assign-search" class="wide-in" type="text" placeholder="Search available players…">'+
      '<div id="assign-results"></div>'+
      '<div class="customrow"><input id="custom-name" type="text" placeholder="…or add a name not on the board">'+
      '<select id="custom-pos">'+POSITIONS.map(x=>'<option>'+x+'</option>').join('')+'</select>'+
      '<button class="btn" id="custom-add">Add</button></div>'+
      '<div class="mbtns"><button class="btn" data-close>Cancel</button></div>');
    currentAssign={mode:'team',teamIdx:teamIdx};
    renderAssignResults('');
    $('#assign-search').addEventListener('input',e=>renderAssignResults(e.target.value));
    $('#custom-add').addEventListener('click',()=>{
      addCustomPlayer($('#custom-name').value,$('#custom-pos').value,teamIdx);
      closeModal();
    });
  }
}
function renderAssignResults(q){
  q=(q||'').trim().toLowerCase();
  const avail=players.filter(p=>!pickOf(p.id)&&(!q||(p.name+' '+p.team).toLowerCase().indexOf(q)>-1))
    .sort((a,b)=>a.rank-b.rank).slice(0,40);
  $('#assign-results').innerHTML=avail.length
    ?avail.map(p=>'<button class="resrow" data-pid="'+p.id+'">'+posBadge(p)+'<span class="cr">#'+p.rank+'</span>'+esc(p.name)+'<span class="dim">'+esc(p.team)+' · Bye '+(p.bye||'–')+'</span></button>').join('')
    :'<div class="sempty">No match — add a custom player below.</div>';
}
function openConfirmRemove(pk){
  openModal('<h3>Remove this pick?</h3>'+
    '<p class="modal-p">'+esc(byId[pk.id]?byId[pk.id].name:'player')+' → '+esc(teamName(pk.teamIdx))+' ('+pickLabel(slotInfo(pk.slot))+')</p>'+
    '<div class="mbtns"><button class="btn" data-close>Cancel</button><button class="btn danger" data-rm="'+pk.id+'">Remove</button></div>');
}
function openResetModal(){
  openModal('<h3>Reset everything?</h3>'+
    '<p class="modal-p">This clears all picks, your queue, and league settings. Export a backup first if you need one.</p>'+
    '<div class="mbtns"><button class="btn" data-close>Cancel</button><button class="btn danger" id="reset-yes">Reset</button></div>');
}

function openSettings(){
  const s=state.settings;
  openModal('<h3>League setup</h3>'+
    '<div class="setgrid">'+
      '<label>League name<input id="set-league" type="text" value="'+esc(s.leagueName)+'"></label>'+
      '<label>Your team name<input id="set-myname" type="text" value="'+esc(s.myTeamName)+'"></label>'+
      '<label>Teams in league<select id="set-nteams">'+[4,6,8,10,12,14,16].map(n=>'<option'+(n===s.numTeams?' selected':'')+'>'+n+'</option>').join('')+'</select></label>'+
      '<label>Draft rounds<select id="set-rounds">'+[10,12,14,15,16,17,18,20].map(n=>'<option'+(n===s.rounds?' selected':'')+'>'+n+'</option>').join('')+'</select></label>'+
      '<label>Your draft slot<select id="set-slot"></select></label>'+
    '</div>'+
    '<h4>Team names</h4><div class="teamnames" id="teamnames-box"></div>'+
    '<div class="mbtns"><button class="btn" data-close>Cancel</button><button class="btn primary" id="set-save">Save</button></div>');
  renderSettingsTeams(s.numTeams);
  $('#set-nteams').addEventListener('change',e=>renderSettingsTeams(+e.target.value));
  $('#set-slot').addEventListener('change',()=>renderSettingsTeams(+$('#set-nteams').value));
  $('#set-save').addEventListener('click',saveSettings);
}
function renderSettingsTeams(n){
  const s=state.settings;
  const cur=$('#set-slot').value;
  let opts='';
  for(let i=0;i<n;i++){
    const sel=(cur!==''&&cur!=null)?(String(i)===String(cur)):(i===s.myTeamIdx);
    opts+='<option value="'+i+'"'+(sel?' selected':'')+'>'+(i+1)+'</option>';
  }
  $('#set-slot').innerHTML=opts;
  const selIdx=+($('#set-slot').value||0);
  let rows='';
  for(let t=0;t<n;t++){
    const val=(t===selIdx)?s.myTeamName:(s.teamNames[t]||('Team '+(t+1)));
    rows+='<label class="tname-row"><span>'+(t+1)+(t===selIdx?' ← you':'')+'</span>'+
      '<input data-tname="'+t+'" type="text" value="'+esc(val)+'"'+(t===selIdx?' disabled':'')+'></label>';
  }
  $('#teamnames-box').innerHTML=rows;
}
function saveSettings(){
  const s=state.settings;
  const n=+$('#set-nteams').value, r=+$('#set-rounds').value;
  const structural=(n!==s.numTeams||r!==s.rounds);
  if(structural&&state.picks.length){
    if(!window.confirm('Changing teams or rounds clears the draft board and history. Continue?')) return;
    state.picks=[]; state.history=[];
  }
  s.leagueName=$('#set-league').value.trim()||'My League';
  s.myTeamName=$('#set-myname').value.trim()||'My Team';
  s.numTeams=n; s.rounds=r;
  s.myTeamIdx=Math.min(+($('#set-slot').value||0),n-1);
  const names=(s.teamNames||[]).slice();
  document.querySelectorAll('[data-tname]').forEach(inp=>{
    const idx=+inp.getAttribute('data-tname');
    if(!inp.disabled) names[idx]=inp.value.trim()||('Team '+(idx+1));
  });
  s.teamNames=names.slice(0,n);
  while(s.teamNames.length<n) s.teamNames.push('Team '+(s.teamNames.length+1));
  save(); renderAll(); closeModal();
  toast('League settings saved.');
}

/* ============ Export / Import ============ */
function dl(blob,name){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },500);
}
function exportJson(){
  dl(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),'ff26-draft-backup.json');
  toast('Backup downloaded.');
}
function exportCsv(){
  const rows=[['Slot','Round','Pick','Team','Player','Pos','Rank']];
  state.picks.slice().sort((a,b)=>a.slot-b.slot).forEach(p=>{
    const si=slotInfo(p.slot); const pl=byId[p.id];
    rows.push([si.slot,si.round,si.pick,teamName(p.teamIdx),pl?pl.name:'?',pl?pl.pos:'?',pl?pl.rank:'']);
  });
  const csv=rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
  dl(new Blob([csv],{type:'text/csv'}),'ff26-picks.csv');
  toast('Pick list downloaded.');
}
function exportYahooCsv(){
  // Yahoo's offline-draft entry screen has no bulk import — the commissioner fills
  // each team's roster one player at a time. Grouping by team, in draft order,
  // matches that flow so they can work straight down the list per team.
  const s=state.settings;
  const rows=[['Team','Pick','Player','Pos','NFL Team']];
  for(let t=0;t<s.numTeams;t++){
    state.picks.filter(p=>p.teamIdx===t).sort((a,b)=>a.slot-b.slot).forEach(p=>{
      const si=slotInfo(p.slot); const pl=byId[p.id];
      rows.push([teamName(t),pickLabel(si),pl?pl.name:'?',pl?pl.pos:'?',pl?pl.team:'']);
    });
  }
  const csv=rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
  dl(new Blob([csv],{type:'text/csv'}),'ff26-picks-for-yahoo.csv');
  toast('Yahoo-ready pick list downloaded (grouped by team).');
}

/* ============ Navigation ============ */
function switchView(v){
  ui.view=v;
  document.querySelectorAll('#viewtabs button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  $('#view-room').classList.toggle('active',v==='room');
  $('#view-board').classList.toggle('active',v==='board');
}
function gotoPlayer(id){
  ui.pos='ALL'; ui.q=''; ui.hideTaken=false;
  $('#search').value=''; $('#hide-taken').checked=false;
  if(ui.view!=='room') switchView('room');
  renderPosTabs(); renderList();
  const el=document.querySelector('.prow[data-id="'+id+'"]');
  if(el){
    el.scrollIntoView({behavior:'smooth',block:'center'});
    el.classList.add('flash');
    setTimeout(()=>el.classList.remove('flash'),1600);
  }
}

/* ============ Events ============ */
function bindEvents(){
  $('#btn-undo').addEventListener('click',undo);
  $('#btn-settings').addEventListener('click',openSettings);
  $('#btn-reset').addEventListener('click',openResetModal);
  $('#btn-export').addEventListener('click',exportJson);
  $('#btn-import').addEventListener('click',()=>$('#import-file').click());
  $('#btn-csv').addEventListener('click',exportCsv);
  $('#btn-yahoo-csv').addEventListener('click',exportYahooCsv);
  $('#import-file').addEventListener('change',e=>{
    const f=e.target.files[0]; if(!f) return;
    const rd=new FileReader();
    rd.onload=()=>{
      try{
        const s=JSON.parse(rd.result);
        if(s&&s.v===1&&s.settings&&Array.isArray(s.picks)){
          state=s; rebuildPlayers(); save(); renderAll(); toast('Draft imported.');
        }else toast('Not a valid FF-26 backup.');
      }catch(err){ toast('Could not read that file.'); }
    };
    rd.readAsText(f);
    e.target.value='';
  });

  document.querySelectorAll('#viewtabs button').forEach(b=>
    b.addEventListener('click',()=>switchView(b.dataset.view)));

  $('#search').addEventListener('input',e=>{ ui.q=e.target.value; renderList(); });
  $('#hide-taken').addEventListener('change',e=>{ ui.hideTaken=e.target.checked; renderList(); });
  $('#pos-tabs').addEventListener('click',e=>{
    const b=e.target.closest('.ptab'); if(!b) return;
    ui.pos=b.dataset.pos; renderPosTabs(); renderList();
  });

  $('#player-list').addEventListener('click',e=>{
    const btn=e.target.closest('button'); if(!btn) return;
    const row=e.target.closest('.prow'); if(!row) return;
    const id=row.dataset.id; const act=btn.dataset.act;
    if(act==='mine') draftPlayer(id,state.settings.myTeamIdx);
    else if(act==='queue') toggleQueue(id);
    else if(act==='take') openAssignModal({mode:'player',id:id});
    else if(act==='unpick') removePick(id);
  });

  $('#quickbar').addEventListener('click',e=>{
    const b=e.target.closest('#btn-quickdraft'); if(!b) return;
    draftPlayer(b.dataset.id, state.settings.myTeamIdx);
  });

  $('#best-available').addEventListener('click',e=>{
    const chip=e.target.closest('.chip'); if(!chip) return;
    const id=chip.dataset.id;
    const actBtn=e.target.closest('.chipact');
    if(actBtn){
      if(actBtn.classList.contains('mine')) draftPlayer(id,state.settings.myTeamIdx);
      else openAssignModal({mode:'player',id:id});
      return;
    }
    gotoPlayer(id);
  });

  $('#roster-box').addEventListener('click',e=>{
    const b=e.target.closest('button'); if(!b) return;
    if(b.id==='btn-addcustom') openAssignModal({mode:'team',teamIdx:state.settings.myTeamIdx});
    else if(b.getAttribute('data-unpick')) removePick(b.getAttribute('data-unpick'));
  });

  $('#queue-box').addEventListener('click',e=>{
    const b=e.target.closest('button'); if(!b) return;
    const row=e.target.closest('.qrow'); if(!row) return;
    const id=row.dataset.id; const a=b.dataset.qact; const i=state.queue.indexOf(id);
    if(a==='draft') draftPlayer(id,state.settings.myTeamIdx);
    else if(a==='rm'){ state.queue.splice(i,1); state.history.push({t:'queueRemove',id:id}); save(); renderAll(); }
    else if(a==='up'&&i>0){ const tmp=state.queue[i-1]; state.queue[i-1]=state.queue[i]; state.queue[i]=tmp; save(); renderQueue(); }
    else if(a==='down'&&i<state.queue.length-1){ const tmp=state.queue[i+1]; state.queue[i+1]=state.queue[i]; state.queue[i]=tmp; save(); renderQueue(); }
  });

  $('#board').addEventListener('click',e=>{
    const cell=e.target.closest('.bcell'); if(!cell) return;
    const slot=+cell.getAttribute('data-slot'); const teamIdx=+cell.getAttribute('data-team');
    const pk=pickAtSlot(slot);
    if(pk) openConfirmRemove(pk);
    else openAssignModal({mode:'team',teamIdx:teamIdx});
  });

  $('#modal').addEventListener('click',e=>{
    const b=e.target.closest('button'); if(!b) return;
    if(b.hasAttribute('data-close')){ closeModal(); return; }
    if(b.hasAttribute('data-rm')){ removePick(b.getAttribute('data-rm')); closeModal(); return; }
    if(b.id==='reset-yes'){
      state=defaultState(); rebuildPlayers(); save(); renderAll(); closeModal();
      toast('Everything reset.'); return;
    }
    if(b.hasAttribute('data-team')&&currentAssign&&currentAssign.mode==='player'){
      draftPlayer(currentAssign.id,+b.getAttribute('data-team')); closeModal(); return;
    }
    if(b.hasAttribute('data-pid')&&currentAssign&&currentAssign.mode==='team'){
      draftPlayer(b.getAttribute('data-pid'),currentAssign.teamIdx); closeModal(); return;
    }
  });
  $('#backdrop').addEventListener('click',closeModal);

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape') closeModal();
    if(e.key==='/'&&document.activeElement&&document.activeElement.tagName!=='INPUT'&&document.activeElement.tagName!=='SELECT'){
      e.preventDefault(); switchView('room'); $('#search').focus();
    }
  });
}

/* ============ Init ============ */
(function init(){
  const saved=loadState();
  state=saved||defaultState();
  const s=state.settings;
  if(!Array.isArray(s.teamNames)||!s.teamNames.length){
    s.teamNames=Array.from({length:s.numTeams},(_,i)=>'Team '+(i+1));
  }
  rebuildPlayers();
  bindEvents();
  renderAll();
  if(!saved){
    openSettings();
    toast('Welcome! Set your league info, then start drafting.');
  }
})();
