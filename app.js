/* ===== Fête Supplier Console ===== */
const DB = window.DB;
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = s => (s==null?'':String(s)).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const SERVICE_OPTIONS = ['Entertainment','Balloon Decor','Magic Show','Party Package','Cake','Catering','Photography','Rental','Venue','Art Party'];

const state = {
  view: 'directory',
  layout: 'cards',
  search: '',
  brand: '', cat: '', conf: '', pmodel: '',
  wa: false, email: false, priced: false,
  enquiry: null,
  sort: {key:null, dir:1},
  shortlist: [], // {id,type,provider,label,min,max,phone,whatsapp,email,website}
};

/* ---------- init ---------- */
function init(){
  // theme
  const savedTheme = 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  $('#themeBtn').onclick = ()=>{
    const cur = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', cur==='dark'?'light':'dark');
  };
  // top stats
  const c = DB.meta.counts;
  $('#topStats').innerHTML = [
    [c.suppliers,'Suppliers'],[c.priced_services,'Priced Services'],
    [c.vendor_leads,'Vendor Leads'],[c.contacts,'Contacts']
  ].map(([n,l])=>`<div class="topstat"><b>${n}</b><span>${l}</span></div>`).join('');

  // enquiry event options
  $('#q_event').insertAdjacentHTML('beforeend',
    DB.meta.event_types.map(e=>`<option>${esc(e)}</option>`).join(''));
  // service chips
  $('#q_services').innerHTML = SERVICE_OPTIONS.map(s=>`<span class="chip" data-svc="${esc(s)}">${esc(s)}</span>`).join('');
  $$('#q_services .chip').forEach(ch=>ch.onclick=()=>ch.classList.toggle('on'));

  // filter dropdowns
  fill('#f_brand', DB.meta.brand_tags);
  fill('#f_cat', DB.meta.service_categories);
  fill('#f_conf', ['High','Medium','Lead']);
  fill('#f_pmodel', DB.meta.pricing_models);

  // events
  $('#search').oninput = e=>{state.search=e.target.value.toLowerCase();render()};
  $('#f_brand').onchange = e=>{state.brand=e.target.value;render()};
  $('#f_cat').onchange = e=>{state.cat=e.target.value;render()};
  $('#f_conf').onchange = e=>{state.conf=e.target.value;render()};
  $('#f_pmodel').onchange = e=>{state.pmodel=e.target.value;render()};
  $$('.togglepill').forEach(p=>p.onclick=()=>{state[p.dataset.k]=!state[p.dataset.k];p.classList.toggle('on');render()});
  $$('#viewToggle button').forEach(b=>b.onclick=()=>{
    state.layout=b.dataset.layout;$$('#viewToggle button').forEach(x=>x.classList.remove('on'));b.classList.add('on');render();});
  $$('#tabs .tab').forEach(t=>t.onclick=()=>{
    state.view=t.dataset.view;$$('#tabs .tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');
    state.sort={key:null,dir:1};render();});

  $('#matchBtn').onclick = buildEnquiry;
  $('#clearBtn').onclick = clearEnquiry;
  $('#readmeBtn').onclick = ()=>{const b=$('#readmeBox');b.style.display=b.style.display==='none'?'block':'none'};
  $('#copyBtn').onclick = copySummary;
  $('#clearSlBtn').onclick = ()=>{state.shortlist=[];renderShortlist();toast('Shortlist cleared')};

  // mobile drawers
  $('#openIntake').onclick=()=>drawer('#intakePanel',true);
  $('#openShortlist').onclick=()=>drawer('#shortlistPanel',true);
  $('#scrim').onclick=()=>{drawer('#intakePanel',false);drawer('#shortlistPanel',false)};

  // modal close
  $('#overlay').onclick = e=>{if(e.target.id==='overlay')closeModal()};
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});

  render(); renderShortlist();
}
function fill(sel,arr){$(sel).insertAdjacentHTML('beforeend',arr.map(x=>`<option>${esc(x)}</option>`).join(''))}
function drawer(sel,open){$(sel).classList.toggle('open',open);$('#scrim').classList.toggle('on',
  $('#intakePanel').classList.contains('open')||$('#shortlistPanel').classList.contains('open'))}

/* ---------- enquiry matching ---------- */
function buildEnquiry(){
  const svcs = $$('#q_services .chip.on').map(c=>c.dataset.svc);
  state.enquiry = {
    event: $('#q_event').value,
    age: $('#q_age').value, pax: $('#q_pax').value,
    venue: $('#q_venue').value,
    bmin: parseFloat($('#q_budget_min').value)||null,
    bmax: parseFloat($('#q_budget_max').value)||null,
    theme: $('#q_theme').value.toLowerCase().trim(),
    services: svcs, notes: $('#q_notes').value,
  };
  // pre-set filters helpfully
  state.view='directory';
  $$('#tabs .tab').forEach(x=>x.classList.toggle('active',x.dataset.view==='directory'));
  render(); drawer('#intakePanel',false);
  toast('Suppliers matched & ranked by relevance');
}
function clearEnquiry(){
  ['q_age','q_pax','q_theme','q_notes','q_budget_min','q_budget_max'].forEach(id=>$('#'+id).value='');
  $('#q_event').value='';$('#q_venue').value='';
  $$('#q_services .chip').forEach(c=>c.classList.remove('on'));
  state.enquiry=null;render();
}
function matchScore(s){
  const e=state.enquiry; if(!e)return null;
  let sc=0;
  if(e.event && s.event_types.includes(e.event)) sc+=30;
  if(e.services.length){
    const hay=((s.service_categories_raw||'')+' '+(s.brand_tags.join(' '))+' '+(s.differentiators||'')+' '+(s.services||[]).map(x=>x.category+' '+x.service).join(' ')).toLowerCase();
    e.services.forEach(sv=>{if(hay.includes(sv.toLowerCase()))sc+=12});
  }
  if(e.theme){
    const hay=((s.differentiators||'')+' '+(s.event_types_raw||'')+' '+(s.services||[]).map(x=>x.service).join(' ')).toLowerCase();
    if(hay.includes(e.theme))sc+=18;
  }
  // budget fit
  if((e.bmin||e.bmax) && s.price_min!=null){
    const lo=e.bmin||0, hi=e.bmax||Infinity;
    if(s.price_min<=hi && (s.price_max||s.price_min)>=lo) sc+=15;
  }
  if(s.confidence==='High')sc+=6; else if(s.confidence==='Medium')sc+=3;
  return sc;
}

/* ---------- generic filtering ---------- */
function passText(obj, fields){
  if(!state.search)return true;
  const hay = fields.map(f=>obj[f]||'').join(' ').toLowerCase();
  return state.search.split(/\s+/).every(t=>hay.includes(t));
}
function filterSuppliers(){
  let list = DB.suppliers.slice();
  list = list.filter(s=>{
    if(state.brand && !s.brand_tags.includes(state.brand))return false;
    if(state.conf && s.confidence!==state.conf)return false;
    if(state.cat && !(s.services||[]).some(x=>x.category===state.cat))return false;
    if(state.pmodel && !(s.pricing_models||[]).includes(state.pmodel))return false;
    if(state.wa && !s.whatsapp)return false;
    if(state.email && !s.email)return false;
    if(state.priced && !s.has_pricing)return false;
    const flat={provider:s.provider,diff:s.differentiators,svc:(s.services||[]).map(x=>x.service).join(' '),
      cats:s.service_categories_raw,events:s.event_types_raw};
    if(!passText(flat,['provider','diff','svc','cats','events']))return false;
    return true;
  });
  if(state.enquiry){
    list.forEach(s=>s._score=matchScore(s));
    list.sort((a,b)=>b._score-a._score);
  }
  return list;
}

/* ---------- render router ---------- */
function render(){
  const tb=$('#toolbar');
  // pricing-model filter only relevant on directory/pricing
  $('#f_pmodel').style.display = (state.view==='directory'||state.view==='pricing')?'':'none';
  $('#f_cat').style.display = (state.view==='directory'||state.view==='pricing')?'':'none';
  $('#f_conf').style.display = (state.view==='directory')?'':'none';
  $('#viewToggle').style.display = (state.view==='directory')?'':'none';
  $$('.togglepill').forEach(p=>p.style.display=(state.view==='directory'||state.view==='contacts'||state.view==='vendors')?'':'none');
  if(state.view==='directory')renderDirectory();
  else if(state.view==='pricing')renderPricing();
  else if(state.view==='contacts')renderContacts();
  else if(state.view==='vendors')renderVendors();
}

/* ---------- directory ---------- */
function renderDirectory(){
  const list=filterSuppliers();
  $('#resultCount').textContent=`${list.length} supplier${list.length!==1?'s':''}`+(state.enquiry?' · ranked by enquiry match':'');
  const el=$('#results');
  if(!list.length){el.innerHTML=emptyMsg();return}
  if(state.layout==='table'){el.innerHTML=dirTable(list);wireTableSort('#dirTable',list,dirTable);wireRowActions();}
  else{el.innerHTML=`<div class="cards">${list.map(cardHTML).join('')}</div>`;wireCards();}
}
function priceLabel(s){
  if(s.price_min==null)return `<div class="price none">Quote only</div>`;
  const r=s.price_max&&s.price_max!==s.price_min?`${fmt(s.price_min)}–${fmt(s.price_max)}`:fmt(s.price_min);
  return `<div class="price"><span class="cur">SGD</span> ${r}</div>`;
}
function fmt(n){return n==null?'—':n.toLocaleString('en-SG',{maximumFractionDigits:0})}
function cardHTML(s){
  const inSl=state.shortlist.some(x=>x.id===slId(s.provider,'supplier'));
  return `<div class="card">
    <div class="card-head">
      <div>
        <h3 class="card-name">${esc(s.provider)}</h3>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">
        <span class="conf ${s.confidence}">${esc(s.confidence)}</span>
        ${s._score!=null?`<span class="matchscore">${s._score} match</span>`:''}
      </div>
    </div>
    <div class="card-tags">
      ${s.brand_tags.map(t=>`<span class="tag brand">${esc(t)}</span>`).join('')}
      ${s.event_types.slice(0,2).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}
    </div>
    ${priceLabel(s)}
    <div class="diff">${esc(s.differentiators||'No differentiator noted.')}</div>
    <div class="card-foot">
      ${contactIcons(s)}
      <span class="spacer"></span>
      <button class="btn ghost sm" data-detail="${esc(s.provider)}">Details</button>
      <button class="addbtn ${inSl?'added':''}" data-add="${esc(s.provider)}">${inSl?'✓ Added':'+ Shortlist'}</button>
    </div>
  </div>`;
}
function contactIcons(s){
  const wa=s.whatsapp_link, ph=s.phone?`tel:${s.phone.replace(/\s/g,'')}`:null, em=s.email?`mailto:${s.email}`:null, web=s.website;
  return `
    ${link(wa,'✆','WhatsApp')}
    ${link(ph,'☏','Call')}
    ${link(em,'✉','Email')}
    ${link(web,'⌂','Website')}`;
}
function link(href,ico,title){
  if(!href)return `<span class="contactbtn disabled" title="${title} n/a">${ico}</span>`;
  return `<a class="contactbtn" href="${esc(href)}" target="_blank" rel="noopener" title="${title}">${ico}</a>`;
}
function dirTable(list){
  const h=(k,l)=>`<th data-sort="${k}">${l}${sortArrow(k)}</th>`;
  return `<div class="tablewrap"><table id="dirTable"><thead><tr>
    ${h('provider','Provider')}${h('brand','Type')}${h('price_min','Price (SGD)')}
    <th>Model</th>${h('confidence','Conf.')}<th>Contact</th><th>Actions</th>
  </tr></thead><tbody>${list.map(s=>`<tr>
    <td class="td-name">${esc(s.provider)}<div class="svc-meta">${esc(s.event_types.join(', '))}</div></td>
    <td>${s.brand_tags.map(t=>`<span class="tag brand">${esc(t)}</span>`).join(' ')}</td>
    <td>${s.price_min==null?'<span style="color:var(--ink-3)">Quote</span>':fmt(s.price_min)+(s.price_max&&s.price_max!==s.price_min?'–'+fmt(s.price_max):'')}</td>
    <td class="svc-meta">${esc((s.pricing_models||[]).slice(0,2).join(', ')||'—')}</td>
    <td><span class="conf ${s.confidence}">${esc(s.confidence)}</span></td>
    <td class="td-actions">${contactIcons(s)}</td>
    <td class="td-actions">
      <button class="btn ghost sm" data-detail="${esc(s.provider)}">View</button>
      <button class="addbtn sm" data-add="${esc(s.provider)}">+</button>
    </td></tr>`).join('')}</tbody></table></div>`;
}

/* ---------- pricing view ---------- */
function renderPricing(){
  let list=DB.pricing.filter(p=>{
    if(state.cat && p.category!==state.cat)return false;
    if(state.pmodel && p.pricing_model!==state.pmodel)return false;
    return passText({a:p.provider,b:p.service,c:p.category,d:p.included},['a','b','c','d']);
  });
  if(state.sort.key){const k=state.sort.key,d=state.sort.dir;
    list.sort((a,b)=>{let x=a[k],y=b[k];if(x==null)return 1;if(y==null)return -1;
      return (typeof x==='number'?x-y:String(x).localeCompare(String(y)))*d})}
  $('#resultCount').textContent=`${list.length} priced service${list.length!==1?'s':''}`;
  const h=(k,l)=>`<th data-sort="${k}">${l}${sortArrow(k)}</th>`;
  $('#results').innerHTML=`<div class="tablewrap"><table id="priceTable"><thead><tr>
    ${h('provider','Provider')}${h('category','Category')}${h('service','Service / Package')}
    ${h('min','Price')}${h('pricing_model','Model')}<th>Duration</th><th>Included</th><th>Src</th>
  </tr></thead><tbody>${list.map(p=>`<tr>
    <td class="td-name">${esc(p.provider)}</td><td>${esc(p.category||'—')}</td>
    <td>${esc(p.service||'—')}</td>
    <td class="svc-price">${esc(p.price_text||(p.min!=null?'$'+fmt(p.min):'—'))}</td>
    <td class="svc-meta">${esc(p.pricing_model||'—')}</td>
    <td class="svc-meta">${esc(p.duration||'—')}</td>
    <td class="svc-meta">${esc(p.included||'—')}</td>
    <td>${p.source?`<a href="${esc(p.source)}" target="_blank" rel="noopener">↗</a>`:'—'}</td>
  </tr>`).join('')}</tbody></table></div>`;
  wireSort('#priceTable',renderPricing);
}

/* ---------- contacts view ---------- */
function renderContacts(){
  let list=DB.contacts.filter(c=>{
    if(state.brand && !c.brand_tags.includes(state.brand))return false;
    if(state.wa && !c.whatsapp)return false;
    if(state.email && !c.email)return false;
    return passText({a:c.provider,b:c.address,c:c.brand_type},['a','b','c']);
  });
  $('#resultCount').textContent=`${list.length} contact${list.length!==1?'s':''}`;
  $('#results').innerHTML=`<div class="tablewrap"><table><thead><tr>
    <th>Provider</th><th>Type</th><th>Phone</th><th>WhatsApp</th><th>Email</th><th>Website</th><th>Address</th>
  </tr></thead><tbody>${list.map(c=>`<tr>
    <td class="td-name">${esc(c.provider)}</td>
    <td>${c.brand_tags.map(t=>`<span class="tag">${esc(t)}</span>`).join(' ')}</td>
    <td>${c.phone?`<a href="tel:${esc(c.phone.replace(/\s/g,''))}">${esc(c.phone)}</a>`:'—'}</td>
    <td>${c.whatsapp_link?`<a href="${esc(c.whatsapp_link)}" target="_blank" rel="noopener">${esc(c.whatsapp||'chat')}</a>`:'—'}</td>
    <td>${c.email?`<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`:'—'}</td>
    <td>${c.website?`<a href="${esc(c.website)}" target="_blank" rel="noopener">↗ site</a>`:'—'}</td>
    <td class="svc-meta">${esc(c.address||'—')}</td>
  </tr>`).join('')}</tbody></table></div>`;
}

/* ---------- vendor leads view ---------- */
function renderVendors(){
  let list=DB.vendors.filter(v=>{
    if(state.brand && !v.brand_tags.includes(state.brand))return false;
    if(state.wa && !v.whatsapp_link)return false;
    if(state.email && !v.email)return false;
    return passText({a:v.provider,b:v.description,c:v.category_raw},['a','b','c']);
  });
  $('#resultCount').textContent=`${list.length} vendor lead${list.length!==1?'s':''} · not price-verified`;
  $('#results').innerHTML=`<div class="tablewrap"><table><thead><tr>
    <th>Company</th><th>Category</th><th>Description</th><th>Contact</th><th>Source</th>
  </tr></thead><tbody>${list.map(v=>`<tr>
    <td class="td-name">${esc(v.provider)}</td>
    <td>${v.brand_tags.map(t=>`<span class="tag">${esc(t)}</span>`).join(' ')||esc(v.category_raw||'—')}</td>
    <td class="svc-meta">${esc(v.description||'—')}</td>
    <td class="td-actions">
      ${link(v.whatsapp_link,'✆','WhatsApp')}
      ${link(v.phone?'tel:'+v.phone.replace(/\s/g,''):null,'☏','Call')}
      ${link(v.email?'mailto:'+v.email:null,'✉','Email')}
      ${link(v.website,'⌂','Website')}
    </td>
    <td>${(v.source||[]).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.label)}">↗</a>`).join(' ')||'—'}</td>
  </tr>`).join('')}</tbody></table></div>`;
}

/* ---------- sorting ---------- */
function sortArrow(k){return state.sort.key===k?(state.sort.dir>0?' ▲':' ▼'):''}
function wireSort(tableSel,rerender){
  $$(tableSel+' th[data-sort]').forEach(th=>th.onclick=()=>{
    const k=th.dataset.sort;
    if(state.sort.key===k)state.sort.dir*=-1;else{state.sort.key=k;state.sort.dir=1}
    rerender();});
}
function wireTableSort(sel,list,builder){
  $$(sel+' th[data-sort]').forEach(th=>th.onclick=()=>{
    const k=th.dataset.sort==='brand'?'brand_tags':th.dataset.sort;
    if(state.sort.key===k)state.sort.dir*=-1;else{state.sort.key=k;state.sort.dir=1}
    list.sort((a,b)=>{let x=a[k],y=b[k];if(Array.isArray(x))x=x[0];if(Array.isArray(y))y=y[0];
      if(x==null)return 1;if(y==null)return -1;
      return (typeof x==='number'?x-y:String(x).localeCompare(String(y)))*state.sort.dir});
    $('#results').innerHTML=builder(list);wireTableSort(sel,list,builder);wireRowActions();});
}
function wireRowActions(){
  $$('[data-detail]').forEach(b=>b.onclick=()=>openDetail(b.dataset.detail));
  $$('[data-add]').forEach(b=>b.onclick=()=>addSupplier(b.dataset.add));
}
function wireCards(){wireRowActions()}

/* ---------- detail modal ---------- */
function findSupplier(name){return DB.suppliers.find(s=>s.provider===name)}
function openDetail(name){
  const s=findSupplier(name); if(!s)return;
  const src=(s.source||[]).map(x=>`<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}</a>`).join(' · ')||'—';
  const svcRows=(s.services||[]).length?(s.services.map(x=>`<div class="svc-row">
      <div><div class="svc-name">${esc(x.service||'—')}</div><div class="svc-meta">${esc(x.category||'')}${x.duration?' · '+esc(x.duration):''}${x.capacity?' · '+esc(x.capacity):''}</div></div>
      <div class="svc-price">${esc(x.price_text||(x.min!=null?'$'+fmt(x.min):'Quote'))}</div>
    </div>`).join('')):'<div class="svc-meta">No published service pricing. Quote-only.</div>';
  $('#modal').innerHTML=`
    <div class="modal-head">
      <button class="modal-x" onclick="closeModal()">×</button>
      <h2 class="panel-title" style="font-size:24px">${esc(s.provider)}</h2>
      <div class="card-tags" style="margin-top:8px">
        ${s.brand_tags.map(t=>`<span class="tag brand">${esc(t)}</span>`).join('')}
        <span class="conf ${s.confidence}">${esc(s.confidence)}</span>
      </div>
    </div>
    <div class="modal-body">
      <dl class="detail-grid">
        <dt>Events</dt><dd>${esc(s.event_types_raw||s.event_types.join(', ')||'—')}</dd>
        <dt>Services</dt><dd>${esc(s.service_categories_raw||'—')}</dd>
        <dt>Price band</dt><dd>${s.price_min==null?'Quote only':'SGD '+fmt(s.price_min)+(s.price_max&&s.price_max!==s.price_min?'–'+fmt(s.price_max):'')}</dd>
        <dt>Phone</dt><dd>${s.phone?`<a href="tel:${esc(s.phone.replace(/\s/g,''))}">${esc(s.phone)}</a>`:'—'}</dd>
        <dt>WhatsApp</dt><dd>${s.whatsapp_link?`<a href="${esc(s.whatsapp_link)}" target="_blank" rel="noopener">${esc(s.whatsapp||'chat')}</a>`:'—'}</dd>
        <dt>Email</dt><dd>${s.email?`<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`:'—'}</dd>
        <dt>Website</dt><dd>${s.website?`<a href="${esc(s.website)}" target="_blank" rel="noopener">${esc(s.website)}</a>`:'—'}</dd>
        <dt>Instagram</dt><dd>${esc(s.instagram||'—')}</dd>
        <dt>Address</dt><dd>${esc(s.address||'—')}</dd>
        <dt>Source</dt><dd>${src}</dd>
      </dl>
      <div class="section-label">Differentiators</div>
      <div style="font-size:13px;color:var(--ink-2)">${esc(s.differentiators||'—')}</div>
      <div class="section-label">Published services & pricing (${(s.services||[]).length})</div>
      ${svcRows}
      <div class="form-actions" style="margin-top:18px">
        <button class="btn" onclick="addSupplier('${escq(s.provider)}');closeModal()">+ Add to shortlist</button>
        <button class="btn ghost" onclick="copyContact('${escq(s.provider)}')">Copy contact</button>
        <button class="btn ghost" onclick="filterSimilar('${escq(s.brand_tags[0]||'')}')">Filter similar</button>
      </div>
    </div>`;
  $('#overlay').classList.add('on');
}
function closeModal(){$('#overlay').classList.remove('on')}
function escq(s){return String(s||'').replace(/'/g,"\\'").replace(/"/g,'&quot;')}
function filterSimilar(tag){if(!tag)return;state.brand=tag;$('#f_brand').value=tag;closeModal();render();toast('Filtered: '+tag)}

/* ---------- shortlist ---------- */
function slId(provider,type){return type+'::'+provider}
function addSupplier(name){
  const s=findSupplier(name); if(!s)return;
  const id=slId(name,'supplier');
  if(state.shortlist.some(x=>x.id===id)){toast(name+' already in shortlist');return}
  state.shortlist.push({id,type:'supplier',provider:name,label:s.brand_tags.join(' / '),
    min:s.price_min,max:s.price_max,phone:s.phone,whatsapp:s.whatsapp_link,email:s.email,
    website:s.website,confidence:s.confidence});
  renderShortlist();render();toast(name+' added to shortlist');
}
function removeSl(id){state.shortlist=state.shortlist.filter(x=>x.id!==id);renderShortlist();render()}
function renderShortlist(){
  const el=$('#shortlistItems');
  if(!state.shortlist.length){
    el.innerHTML='<div class="sl-empty">No suppliers yet.<br>Add from the directory to build a working response.</div>';
    $('#shortlistTotal').innerHTML='';$('#shortlistActions').style.display='none';$('#shortlistActions2').style.display='none';return;
  }
  el.innerHTML=state.shortlist.map(x=>`<div class="sl-item">
    <div class="sl-item-head">
      <div>
        <div class="sl-item-name">${esc(x.provider)}</div>
        <div class="sl-item-meta">${esc(x.label||'')} · <span class="conf ${x.confidence||'Unknown'}" style="padding:1px 6px">${esc(x.confidence||'—')}</span></div>
      </div>
      <button class="sl-x" onclick="removeSl('${escq(x.id)}')" title="Remove">×</button>
    </div>
    <div class="sl-item-price">${x.min==null?'Quote only':'SGD '+fmt(x.min)+(x.max&&x.max!==x.min?'–'+fmt(x.max):'')}</div>
    <div class="td-actions" style="margin-top:7px">
      ${link(x.whatsapp,'✆','WhatsApp')}${link(x.phone?'tel:'+x.phone.replace(/\s/g,''):null,'☏','Call')}
      ${link(x.email?'mailto:'+x.email:null,'✉','Email')}${link(x.website,'⌂','Website')}
    </div>
  </div>`).join('');
  const mins=state.shortlist.filter(x=>x.min!=null).map(x=>x.min);
  const maxs=state.shortlist.filter(x=>x.min!=null).map(x=>x.max||x.min);
  const tmin=mins.reduce((a,b)=>a+b,0), tmax=maxs.reduce((a,b)=>a+b,0);
  const quoteOnly=state.shortlist.filter(x=>x.min==null).length;
  $('#shortlistTotal').innerHTML=`<div class="sl-total">
    <div class="sl-total-row"><span>Priced items</span><span>${mins.length}</span></div>
    ${quoteOnly?`<div class="sl-total-row"><span>Quote-only items</span><span>${quoteOnly}</span></div>`:''}
    <div class="sl-total-row big"><span>Indicative total</span><span>SGD ${fmt(tmin)}${tmax!==tmin?'–'+fmt(tmax):''}</span></div>
  </div>`;
  $('#shortlistActions').style.display='';$('#shortlistActions2').style.display='';
}
function copyContact(name){
  const s=findSupplier(name);if(!s)return;
  const t=[s.provider,s.phone&&'Tel: '+s.phone,s.whatsapp&&'WA: '+s.whatsapp,s.email&&'Email: '+s.email,s.website&&'Web: '+s.website].filter(Boolean).join('\n');
  copy(t,'Contact copied');
}
function copySummary(){
  const e=state.enquiry;
  let t='BACKEND — INTERNAL SUPPLIER SHORTLIST\n';
  if(e){t+=`\nEnquiry: ${[e.event,e.age&&('age '+e.age),e.pax&&(e.pax+' pax'),e.venue,e.theme].filter(Boolean).join(' · ')}\n`;
    if(e.bmin||e.bmax)t+=`Budget: SGD ${e.bmin||'?'}–${e.bmax||'?'}\n`;
    if(e.notes)t+=`Notes: ${e.notes}\n`;}
  t+='\n— Suppliers —\n';
  state.shortlist.forEach((x,i)=>{
    t+=`\n${i+1}. ${x.provider} (${x.label})\n`;
    t+=`   Price: ${x.min==null?'Quote only':'SGD '+fmt(x.min)+(x.max&&x.max!==x.min?'–'+fmt(x.max):'')}\n`;
    const c=[x.whatsapp&&'WA '+x.whatsapp,x.phone&&'Tel '+x.phone,x.email,x.website].filter(Boolean).join(' | ');
    if(c)t+=`   ${c}\n`;
  });
  const mins=state.shortlist.filter(x=>x.min!=null).map(x=>x.min);
  const maxs=state.shortlist.filter(x=>x.min!=null).map(x=>x.max||x.min);
  if(mins.length)t+=`\nIndicative total: SGD ${fmt(mins.reduce((a,b)=>a+b,0))}–${fmt(maxs.reduce((a,b)=>a+b,0))}\n`;
  t+='\n(Indicative only — re-confirm all pricing with suppliers before quoting.)';
  copy(t,'Summary copied to clipboard');
}
function copy(text,msg){
  navigator.clipboard.writeText(text).then(()=>toast(msg)).catch(()=>{
    const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy');toast(msg)}catch(e){toast('Copy failed')}ta.remove();});
}

/* ---------- misc ---------- */
function emptyMsg(){return `<div class="empty"><div class="big">No matches</div>Try clearing filters or search.</div>`}
let toastT;
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),2200)}

// expose for inline handlers
window.closeModal=closeModal;window.addSupplier=addSupplier;window.removeSl=removeSl;
window.copyContact=copyContact;window.filterSimilar=filterSimilar;

init();
