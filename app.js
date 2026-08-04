/* ===== OurKampung Backend · Concierge Matcher ===== */
const DB = window.DB;
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = s => (s==null?'':String(s)).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ourkampung.com service categories -> vendor brand_tags
const SERVICES = [
  {label:'Styling & Décor', tags:['Balloon & Decor']},
  {label:'Entertainment',   tags:['Entertainer']},
  {label:'Cake & Catering', tags:['Cake','Catering']},
  {label:'Photography',     tags:['Photography']},
  {label:'Party Favours',   tags:['Party Supplies']},
  {label:'Venue',           tags:['Venue']},
  {label:'Rental',          tags:['Rental']},
  {label:'Planning',        tags:['Planner']},
];
const TAG_TO_SERVICE = {}; SERVICES.forEach(s=>s.tags.forEach(t=>TAG_TO_SERVICE[t]=s.label));

const state = {
  brief: null,
  search:'', brand:'', vetted:false, reach:false,
  shortlist: [],
};

function reachable(v){return !!(v.website && (v.phone||v.whatsapp_link||v.email||v.instagram))}

/* ---------- init ---------- */
function init(){
  document.documentElement.setAttribute('data-theme','light');
  $('#themeBtn').onclick=()=>{const c=document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme',c==='dark'?'light':'dark')};

  const c=DB.meta.counts;
  $('#topStats').innerHTML=[[c.vendors,'Suppliers'],[c.vetted,'Vetted'],[c.reachable,'Reachable']]
    .map(([n,l])=>`<div class="topstat"><b>${n}</b><span>${l}</span></div>`).join('');

  $('#q_event').insertAdjacentHTML('beforeend', DB.meta.event_types.map(e=>`<option>${esc(e)}</option>`).join(''));
  $('#q_services').innerHTML = SERVICES.map(s=>`<span class="chip" data-svc="${esc(s.label)}">${esc(s.label)}</span>`).join('');
  $$('#q_services .chip').forEach(ch=>ch.onclick=()=>ch.classList.toggle('on'));
  fill('#f_brand', DB.meta.brand_tags);

  $('#search').oninput=e=>{state.search=e.target.value.toLowerCase();render()};
  $('#f_brand').onchange=e=>{state.brand=e.target.value;render()};
  $('#t_vetted').onclick=()=>{state.vetted=!state.vetted;$('#t_vetted').classList.toggle('on');render()};
  $('#t_reach').onclick=()=>{state.reach=!state.reach;$('#t_reach').classList.toggle('on');render()};
  $('#matchBtn').onclick=buildBrief;
  $('#clearBtn').onclick=clearBrief;
  $('#readmeBtn').onclick=()=>{const b=$('#readmeBox');b.style.display=b.style.display==='none'?'block':'none'};
  $('#copyBtn').onclick=copyOutreach;
  $('#clearSlBtn').onclick=()=>{state.shortlist=[];renderShortlist();render();toast('Shortlist cleared')};

  $('#openIntake').onclick=()=>drawer('#intakePanel',true);
  $('#openShortlist').onclick=()=>drawer('#shortlistPanel',true);
  $('#scrim').onclick=()=>{drawer('#intakePanel',false);drawer('#shortlistPanel',false)};
  $('#overlay').onclick=e=>{if(e.target.id==='overlay')closeModal()};
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});

  render(); renderShortlist();
}
function fill(sel,arr){$(sel).insertAdjacentHTML('beforeend',arr.map(x=>`<option>${esc(x)}</option>`).join(''))}
function drawer(sel,open){$(sel).classList.toggle('open',open);$('#scrim').classList.toggle('on',
  $('#intakePanel').classList.contains('open')||$('#shortlistPanel').classList.contains('open'))}

/* ---------- brief ---------- */
function buildBrief(){
  const svcs=$$('#q_services .chip.on').map(c=>c.dataset.svc);
  state.brief={
    event:$('#q_event').value, age:$('#q_age').value, pax:$('#q_pax').value,
    venue:$('#q_venue').value,
    bmin:parseFloat($('#q_budget_min').value)||null, bmax:parseFloat($('#q_budget_max').value)||null,
    theme:$('#q_theme').value.toLowerCase().trim(), services:svcs, notes:$('#q_notes').value,
  };
  render(); drawer('#intakePanel',false); toast('Matched suppliers for this brief');
}
function clearBrief(){
  ['q_age','q_pax','q_theme','q_notes','q_budget_min','q_budget_max'].forEach(id=>$('#'+id).value='');
  $('#q_event').value='';$('#q_venue').value='';
  $$('#q_services .chip').forEach(c=>c.classList.remove('on'));
  state.brief=null;render();
}

/* ---------- matching ---------- */
function scoreVendor(v){
  const b=state.brief; const reasons=[];
  let sc=0;
  if(v.vetted){sc+=8;reasons.push('vetted')}
  if(reachable(v)){sc+=5} else {sc-=3}
  if(b){
    if(b.event && (v.event_types||[]).includes(b.event)){sc+=6;reasons.push(b.event)}
    const hay=((v.description||'')+' '+(v.category_raw||'')).toLowerCase();
    if(b.theme && hay.includes(b.theme)){sc+=10;reasons.push('theme: '+b.theme)}
    if(b.venue){const vk=b.venue.toLowerCase().split(/[\/ ]+/)[0]; if(vk && hay.includes(vk)){sc+=3}}
    if((b.bmin||b.bmax) && v.price_min!=null){
      const lo=b.bmin||0, hi=b.bmax||Infinity;
      if(v.price_min<=hi && (v.price_max||v.price_min)>=lo){sc+=6;reasons.push('budget fit')}
    }
  }
  if(v.confidence==='High')sc+=3; else if(v.confidence==='Medium')sc+=1;
  return {score:sc, reasons};
}
function baseFilter(v){
  if(state.vetted && !v.vetted)return false;
  if(state.reach && !reachable(v))return false;
  if(state.brand && !(v.brand_tags||[]).includes(state.brand))return false;
  if(state.search){
    const hay=((v.provider||'')+' '+(v.description||'')+' '+(v.category_raw||'')+' '+(v.brand_tags||[]).join(' ')).toLowerCase();
    if(!state.search.split(/\s+/).every(t=>hay.includes(t)))return false;
  }
  return true;
}

/* ---------- render ---------- */
function render(){
  const b=state.brief;
  const results=$('#results');
  if(b && b.services.length){
    let html=''; let totalShown=0;
    b.services.forEach(svcLabel=>{
      const svc=SERVICES.find(s=>s.label===svcLabel); if(!svc)return;
      let list=DB.vendors.filter(v=>baseFilter(v) && (v.brand_tags||[]).some(t=>svc.tags.includes(t)));
      list=list.map(v=>({v,...scoreVendor(v)}))
        .sort((a,z)=> z.score-a.score || (z.v.vetted?1:0)-(a.v.vetted?1:0) || a.v.provider.localeCompare(z.v.provider));
      totalShown+=list.length;
      html+=`<div class="group"><div class="group-head">${esc(svcLabel)}<span class="group-count">${list.length}</span></div>`;
      html+= list.length
        ? `<div class="cards">${list.map(x=>cardHTML(x.v,x.reasons)).join('')}</div>`
        : `<div class="empty-sm">No suppliers in this category with current filters.</div>`;
      html+=`</div>`;
    });
    $('#resultCount').textContent=`${totalShown} match${totalShown!==1?'es':''} across ${b.services.length} service${b.services.length!==1?'s':''}`+briefSummary();
    results.innerHTML=html||emptyMsg();
  } else {
    let list=DB.vendors.filter(baseFilter);
    list=list.map(v=>({v,...scoreVendor(v)}))
      .sort((a,z)=> (z.v.vetted?1:0)-(a.v.vetted?1:0) || (reachable(z.v)?1:0)-(reachable(a.v)?1:0) || a.v.provider.localeCompare(z.v.provider));
    $('#resultCount').textContent=`${list.length} supplier${list.length!==1?'s':''}`+(b?' · add services to the brief to group by category':'');
    results.innerHTML=list.length?`<div class="cards">${list.map(x=>cardHTML(x.v,x.reasons)).join('')}</div>`:emptyMsg();
  }
  wireCards();
}
function emptyMsg(){return `<div class="empty">No suppliers match the current filters.</div>`}
function briefSummary(){
  const b=state.brief; if(!b)return'';
  const bits=[b.event,b.age&&('age '+b.age),b.pax&&(b.pax+' pax'),b.venue,b.theme].filter(Boolean);
  return bits.length?` · ${esc(bits.join(' · '))}`:'';
}

/* ---------- cards ---------- */
function badge(v){
  if(v.vetted)return `<span class="conf High" title="Vetted supplier">✓ Vetted</span>`;
  if(reachable(v))return `<span class="tag">Reachable</span>`;
  return `<span class="tag" style="opacity:.55">Lead</span>`;
}
function cardHTML(v,reasons){
  const inSl=state.shortlist.some(x=>x.provider===v.provider);
  const priceHint = v.price_min!=null
    ? `<div class="price"><span class="cur">SGD</span> ${fmt(v.price_min)}${v.price_max&&v.price_max!==v.price_min?'–'+fmt(v.price_max):''}</div>` : '';
  return `<div class="card">
    <div class="card-head">
      <div><h3 class="card-name">${esc(v.provider)}</h3></div>
      <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">${badge(v)}</div>
    </div>
    <div class="card-tags">${(v.brand_tags||[]).map(t=>`<span class="tag brand">${esc(t)}</span>`).join('')}</div>
    ${priceHint}
    ${reasons&&reasons.length?`<div class="why">▸ ${reasons.map(esc).join(' · ')}</div>`:''}
    <div class="diff">${esc(v.description||'—')}</div>
    <div class="card-foot">
      ${contactIcons(v)}
      <span class="spacer"></span>
      <button class="btn ghost sm" data-detail="${esc(v.provider)}">Details</button>
      <button class="addbtn ${inSl?'added':''}" data-add="${esc(v.provider)}">${inSl?'✓ Added':'+ Shortlist'}</button>
    </div>
  </div>`;
}
function fmt(n){return n==null?'—':n.toLocaleString('en-SG',{maximumFractionDigits:0})}
function igUrl(ig){ if(!ig)return null; if(ig.startsWith('http'))return ig; return 'https://'+ig.replace(/^@/,'instagram.com/'); }
function contactIcons(v){
  const wa=v.whatsapp_link, ph=v.phone?`tel:${v.phone.replace(/\s/g,'')}`:null,
        em=v.email?`mailto:${v.email}`:null, ig=igUrl(v.instagram), web=v.website;
  return `${link(wa,'✆','WhatsApp')}${link(ph,'☏','Call')}${link(em,'✉','Email')}${link(ig,'☺','Instagram')}${link(web,'⌂','Website')}`;
}
function link(href,ico,title){
  if(!href)return `<span class="contactbtn disabled" title="${title} n/a">${ico}</span>`;
  return `<a class="contactbtn" href="${esc(href)}" target="_blank" rel="noopener" title="${title}">${ico}</a>`;
}
function findVendor(name){return DB.vendors.find(v=>v.provider===name)}
function wireCards(){
  $$('[data-detail]').forEach(b=>b.onclick=()=>openDetail(b.dataset.detail));
  $$('[data-add]').forEach(b=>b.onclick=()=>addToShortlist(b.dataset.add));
}

/* ---------- detail modal ---------- */
function openDetail(name){
  const v=findVendor(name); if(!v)return;
  const src=(v.source||[]).map(x=>`<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}</a>`).join(' · ')||'—';
  $('#modal').innerHTML=`
    <div class="modal-head">
      <button class="modal-x" onclick="closeModal()">×</button>
      <h2 class="panel-title" style="font-size:24px">${esc(v.provider)}</h2>
      <div class="card-tags" style="margin-top:8px">${(v.brand_tags||[]).map(t=>`<span class="tag brand">${esc(t)}</span>`).join('')}${badge(v)}</div>
    </div>
    <div class="modal-body">
      <dl class="detail-grid">
        <dt>Category</dt><dd>${esc(v.category_raw||'—')}</dd>
        <dt>Events</dt><dd>${esc((v.event_types||[]).join(', ')||'—')}</dd>
        ${v.price_min!=null?`<dt>Price band</dt><dd>SGD ${fmt(v.price_min)}${v.price_max&&v.price_max!==v.price_min?'–'+fmt(v.price_max):''}</dd>`:''}
        <dt>Phone</dt><dd>${v.phone?`<a href="tel:${esc(v.phone.replace(/\s/g,''))}">${esc(v.phone)}</a>`:'—'}</dd>
        <dt>WhatsApp</dt><dd>${v.whatsapp_link?`<a href="${esc(v.whatsapp_link)}" target="_blank" rel="noopener">chat</a>`:'—'}</dd>
        <dt>Email</dt><dd>${v.email?`<a href="mailto:${esc(v.email)}">${esc(v.email)}</a>`:'—'}</dd>
        <dt>Website</dt><dd>${v.website?`<a href="${esc(v.website)}" target="_blank" rel="noopener">${esc(v.website)}</a>`:'—'}</dd>
        <dt>Instagram</dt><dd>${v.instagram?`<a href="${esc(igUrl(v.instagram))}" target="_blank" rel="noopener">${esc(v.instagram)}</a>`:'—'}</dd>
        <dt>Source</dt><dd>${src}</dd>
      </dl>
      <div class="section-label">Description</div>
      <div style="font-size:13px;color:var(--ink-2)">${esc(v.description||'—')}</div>
      <div class="form-actions" style="margin-top:18px">
        <button class="btn" onclick="addToShortlist('${escq(v.provider)}');closeModal()">+ Add to shortlist</button>
        <button class="btn ghost" onclick="copyContact('${escq(v.provider)}')">Copy contact</button>
      </div>
    </div>`;
  $('#overlay').classList.add('on');
}
function closeModal(){$('#overlay').classList.remove('on')}
function escq(s){return String(s||'').replace(/'/g,"\\'").replace(/"/g,'&quot;')}

/* ---------- shortlist ---------- */
function primaryCategory(v){const t=(v.brand_tags||[])[0]; return TAG_TO_SERVICE[t]||t||'Other'}
function addToShortlist(name){
  const v=findVendor(name); if(!v)return;
  if(state.shortlist.some(x=>x.provider===name)){toast(name+' already added');return}
  state.shortlist.push({provider:v.provider, cat:primaryCategory(v), vetted:v.vetted,
    phone:v.phone, whatsapp:v.whatsapp_link, email:v.email, website:v.website, instagram:v.instagram});
  renderShortlist(); render(); toast(name+' added');
}
function removeSl(name){state.shortlist=state.shortlist.filter(x=>x.provider!==name);renderShortlist();render()}
function renderShortlist(){
  const el=$('#shortlistItems');
  if(!state.shortlist.length){
    el.innerHTML='<div class="sl-empty">No suppliers yet.<br>Add from the matches to build an outreach list.</div>';
    $('#shortlistTotal').innerHTML='';$('#shortlistActions').style.display='none';$('#shortlistActions2').style.display='none';return;
  }
  const groups={}; state.shortlist.forEach(x=>{(groups[x.cat]=groups[x.cat]||[]).push(x)});
  el.innerHTML=Object.keys(groups).map(cat=>`<div class="sl-group"><div class="sl-group-head">${esc(cat)}</div>`+
    groups[cat].map(x=>`<div class="sl-item">
      <div class="sl-item-head">
        <div><div class="sl-item-name">${esc(x.provider)}</div>
        <div class="sl-item-meta">${x.vetted?'✓ vetted':'&nbsp;'}</div></div>
        <button class="sl-x" onclick="removeSl('${escq(x.provider)}')" title="Remove">×</button>
      </div>
      <div class="td-actions" style="margin-top:7px">${link(x.whatsapp,'✆','WhatsApp')}${link(x.phone?'tel:'+x.phone.replace(/\s/g,''):null,'☏','Call')}${link(x.email?'mailto:'+x.email:null,'✉','Email')}${link(x.website,'⌂','Website')}</div>
    </div>`).join('')+`</div>`).join('');
  $('#shortlistTotal').innerHTML=`<div class="sl-total"><div class="sl-total-row big"><span>Suppliers to contact</span><span>${state.shortlist.length}</span></div></div>`;
  $('#shortlistActions').style.display='';$('#shortlistActions2').style.display='';
}
function copyContact(name){
  const v=findVendor(name);if(!v)return;
  const t=[v.provider,v.phone&&'Tel: '+v.phone,v.whatsapp_link&&'WA: '+v.whatsapp_link,v.email&&'Email: '+v.email,v.website&&'Web: '+v.website].filter(Boolean).join('\n');
  copy(t,'Contact copied');
}
function copyOutreach(){
  const b=state.brief;
  let t='OURKAMPUNG — SUPPLIER OUTREACH SHORTLIST\n';
  if(b){t+=`\nBrief: ${[b.event,b.age&&('age '+b.age),b.pax&&(b.pax+' pax'),b.venue,b.theme].filter(Boolean).join(' · ')}\n`;
    if(b.bmin||b.bmax)t+=`Budget: SGD ${b.bmin||'?'}–${b.bmax||'?'}\n`;
    if(b.notes)t+=`Notes: ${b.notes}\n`;}
  const groups={}; state.shortlist.forEach(x=>{(groups[x.cat]=groups[x.cat]||[]).push(x)});
  Object.keys(groups).forEach(cat=>{
    t+=`\n— ${cat} —\n`;
    groups[cat].forEach(x=>{
      const c=[x.whatsapp&&'WA '+x.whatsapp,x.phone&&'Tel '+x.phone,x.email,x.website].filter(Boolean).join(' | ');
      t+=`• ${x.provider}${x.vetted?' (vetted)':''}${c?' — '+c:''}\n`;
    });
  });
  t+='\n(Contact shortlist only — confirm availability & price with each supplier.)';
  copy(t,'Outreach sheet copied');
}
function copy(text,msg){
  navigator.clipboard.writeText(text).then(()=>toast(msg)).catch(()=>{
    const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy');toast(msg)}catch(e){toast('Copy failed')}ta.remove();});
}

/* ---------- misc ---------- */
let toastT;
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),2200)}

window.closeModal=closeModal;window.addToShortlist=addToShortlist;window.removeSl=removeSl;window.copyContact=copyContact;

init();
