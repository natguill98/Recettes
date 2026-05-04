// v2
const SUPABASE_URL = 'https://dsugwdwjjdmtwnyrukag.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzdWd3ZHdqamRtdHdueXJ1a2FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1ODY1MjAsImV4cCI6MjA5MzE2MjUyMH0.CU5yDSRgtn6Z_GSJ2IkD7cS8Y_vR4fauY4S-ee-DGek';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null, currentRole = null, allRecettes = [], selectedClient = null, selectedId = null;
let currentHex = '#cccccc';
let cameraStream = null;

// Marges par défaut (chargées depuis Supabase si disponibles)
let marges = { Pépin: 0.60, Disolac: 0.60, International: 0.55, Devoe: 0.55 };

// --------
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-err');
  const btn = document.getElementById('login-btn');
  errEl.style.display = 'none';
  if (!email||!pass) { errEl.textContent='Veuillez entrer votre courriel et mot de passe.'; errEl.style.display='block'; return; }
  btn.textContent='Connexion...'; btn.disabled=true;
  const {data,error} = await sb.auth.signInWithPassword({email,password:pass});
  if (error) { errEl.textContent='Courriel ou mot de passe incorrect.'; errEl.style.display='block'; btn.textContent='Se connecter'; btn.disabled=false; return; }
  await initApp(data.user);
}

async function doLogout() {
  stopCamera();
  await sb.auth.signOut();
  currentUser=null; currentRole=null; allRecettes=[]; selectedClient=null; selectedId=null;
  document.getElementById('app').style.display='none';
  document.getElementById('login-wrap').style.display='flex';
  document.getElementById('login-email').value='';
  document.getElementById('login-pass').value='';
  document.getElementById('login-btn').textContent='Se connecter';
  document.getElementById('login-btn').disabled=false;
}

async function initApp(user) {
  currentUser = user;
  const {data:profile} = await sb.from('profiles').select('role,nom').eq('id',user.id).single();
  currentRole = profile?.role||'production';
  document.getElementById('user-name').textContent = profile?.nom||user.email;
  const pill = document.getElementById('role-pill');
  pill.textContent = currentRole.charAt(0).toUpperCase()+currentRole.slice(1);
  pill.className = 'role-pill '+(currentRole==='admin'?'role-admin':currentRole==='comptoir'?'role-comptoir':'role-prod');
  document.getElementById('prix-section').style.display = canSeePrix()?'':'none';
  document.getElementById('tab-couts').style.display = canSeePrix()?'':'none';
  document.getElementById('login-wrap').style.display='none';
  document.getElementById('app').style.display='block';
  await loadMarges();
  await loadRecettes();
  showMainTab('clients');
}

sb.auth.getSession().then(({data:{session}})=>{ if(session?.user) initApp(session.user); });

// --------
function canSeePrix() { return ['admin','comptoir'].includes(currentRole); }
function ageDays(d) { return d?Math.floor((Date.now()-new Date(d))/86400000):9999; }
function fmtDate(s) {
  if(!s) return '—';
  const [y,m,d]=s.split('-');
  const mo=['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];
  return `${parseInt(d)} ${mo[parseInt(m)-1]}. ${y}`;
}
function dateBadge(dateStr) {
  if(!dateStr) return '';
  const d=ageDays(dateStr);
  const cls=d<=90?'date-fresh':d<=365?'date-old':'date-stale';
  return `<span class="date-badge ${cls}">● ${fmtDate(dateStr)}</span>`;
}
function marqueClass(m) {
  return {'Pépin':'badge-pepin','International':'badge-inter','Devoe':'badge-devoe','Disolac':'badge-disolac'}[m]||'badge-qty';
}
function initials(n) { return n.split(' ').map(w=>w[0]||'').join('').substring(0,2).toUpperCase(); }
function toast(msg,dur=2200) {
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),dur);
}

// --------
function calcPrix(marque, costTotal) {
  const div = marges[marque]||0.60;
  const gallon = costTotal / div;
  const pinte = (gallon / 4) * 1.10;
  const canette = (gallon / 24) + 14.95;
  return { gallon, pinte, canette, div, marge: Math.round((1-div)*100) };
}

function updatePrixPreview() {
  const marque = document.getElementById('f-marque').value;
  const cb = parseFloat(document.getElementById('f-cb')?.value)||0;
  const cc = parseFloat(document.getElementById('f-cc')?.value)||0;
  const ccat = parseFloat(document.getElementById('f-ccat')?.value)||0;
  const total = cb+cc+ccat;
  const preview = document.getElementById('prix-preview');
  if(!marque||total<=0) { if(preview) preview.style.display='none'; return; }
  const p = calcPrix(marque, total);
  if(preview) {
    preview.style.display='block';
    document.getElementById('prev-gal').textContent = p.gallon.toFixed(2)+' $';
    document.getElementById('prev-pinte').textContent = p.pinte.toFixed(2)+' $';
    document.getElementById('prev-can').textContent = p.canette.toFixed(2)+' $';
    document.getElementById('formule-display').innerHTML = `<strong>Formule ${marque} :</strong> Cost total ${total.toFixed(2)}$ ÷ ${p.div} = ${p.gallon.toFixed(2)}$/gal &nbsp;·&nbsp; Marge ${p.marge}%`;
  }
}

// --------
async function loadMarges() {
  const {data} = await sb.from('parametres').select('*').eq('type','marge');
  if(data&&data.length) {
    data.forEach(row=>{ marges[row.marque]=parseFloat(row.valeur); });
    updateMargesUI();
  }
}

function updateMargesUI() {
  ['pepin','disolac','inter','devoe'].forEach(key=>{
    const marqueKey = key==='pepin'?'Pépin':key==='disolac'?'Disolac':key==='inter'?'International':'Devoe';
    const div = marges[marqueKey];
    const curEl = document.getElementById('cur-'+key);
    const margeEl = document.getElementById('marge-'+key);
    if(curEl) curEl.textContent = div.toFixed(2);
    if(margeEl) margeEl.textContent = Math.round((1-div)*100)+'%';
    const inp = document.getElementById('div-'+key);
    if(inp) inp.value = div.toFixed(2);
  });
}

async function saveCouts() {
  const updates = [
    {type:'marge', marque:'Pépin', valeur: document.getElementById('div-pepin').value||'0.60'},
    {type:'marge', marque:'Disolac', valeur: document.getElementById('div-disolac').value||'0.60'},
    {type:'marge', marque:'International', valeur: document.getElementById('div-inter').value||'0.55'},
    {type:'marge', marque:'Devoe', valeur: document.getElementById('div-devoe').value||'0.55'},
  ];
  // Upsert dans Supabase
  for(const u of updates) {
    await sb.from('parametres').upsert({type:u.type, marque:u.marque, valeur:u.valeur}, {onConflict:'type,marque'});
    marges[u.marque] = parseFloat(u.valeur);
  }
  updateMargesUI();
  const saved = document.getElementById('couts-saved');
  saved.style.display='inline-block';
  setTimeout(()=>saved.style.display='none',3000);
  toast('Marges mises à jour!');
}

// --------
function setColourMethod(method, btn) {
  document.querySelectorAll('.colour-method-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('colour-input-picker').style.display = method==='picker'?'flex':'none';
  document.getElementById('colour-input-hex').style.display = method==='hex'?'flex':'none';
  document.getElementById('colour-input-camera').style.display = method==='camera'?'block':'none';
  if(method!=='camera') stopCamera();
}

function onColorPicker(hex) {
  currentHex = hex;
  updateColourPreview(hex);
}

function onHexInput(val) {
  val = val.trim();
  let hex = null;
  if(/^#?[0-9A-Fa-f]{6}$/.test(val)) {
    hex = val.startsWith('#')?val:'#'+val;
  } else if(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.test(val)) {
    const m = val.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    hex = '#'+[m[1],m[2],m[3]].map(n=>parseInt(n).toString(16).padStart(2,'0')).join('');
  }
  if(hex) { currentHex=hex; updateColourPreview(hex); }
}

function updateColourPreview(hex) {
  document.getElementById('colour-preview').style.background = hex;
  document.getElementById('hex-display').textContent = hex.toUpperCase();
  const picker = document.getElementById('color-picker');
  if(picker && /^#[0-9A-Fa-f]{6}$/.test(hex)) picker.value = hex;
}

async function startCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    const video = document.getElementById('camera-video');
    video.srcObject = cameraStream;
    video.style.display='block';
    document.getElementById('camera-controls').style.display='flex';
  } catch(e) {
    toast('Caméra non disponible — utilisez le sélecteur ou HEX');
  }
}

function stopCamera() {
  if(cameraStream) { cameraStream.getTracks().forEach(t=>t.stop()); cameraStream=null; }
  const video = document.getElementById('camera-video');
  if(video) { video.style.display='none'; video.srcObject=null; }
  const ctrl = document.getElementById('camera-controls');
  if(ctrl) ctrl.style.display='none';
}

function captureColour() {
  const video = document.getElementById('camera-video');
  const canvas = document.getElementById('camera-canvas');
  if(!video||!cameraStream) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video,0,0);
  // Prendre la couleur du centre de l'image
  const cx = Math.floor(canvas.width/2);
  const cy = Math.floor(canvas.height/2);
  // Moyenne sur une zone 20x20 au centre pour plus de précision
  let r=0,g=0,b=0,count=0;
  const size=20;
  const imgData = ctx.getImageData(cx-size/2, cy-size/2, size, size);
  for(let i=0;i<imgData.data.length;i+=4) { r+=imgData.data[i]; g+=imgData.data[i+1]; b+=imgData.data[i+2]; count++; }
  r=Math.round(r/count); g=Math.round(g/count); b=Math.round(b/count);
  const hex = '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
  currentHex = hex;
  updateColourPreview(hex);
  stopCamera();
  toast('Couleur capturée : '+hex.toUpperCase());
}

// --------
function showMainTab(name) {
  ['clients','produits','detail','ajouter','couts'].forEach(v=>document.getElementById('view-'+v).style.display=v===name?'':'none');
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  const tabMap = {clients:'tab-clients',produits:'tab-clients',detail:'tab-clients',ajouter:'tab-ajouter',couts:'tab-couts'};
  const activeTab = document.getElementById(tabMap[name]);
  if(activeTab) activeTab.classList.add('active');
  document.getElementById('tab-detail').style.display=name==='detail'?'':'none';
  if(name==='couts') loadCoutsBasesTable();
}

// --------
async function loadRecettes() {
  const {data,error} = await sb.from('recettes').select('*, colorants(*), prix(*)').order('client');
  if(error) return;
  allRecettes = data||[];
  renderClients();
}

// --------
function renderClients() {
  const q=(document.getElementById('search-client').value||'').toLowerCase();
  const clients={};
  allRecettes.forEach(r=>{ if(!q||r.client.toLowerCase().includes(q)){if(!clients[r.client])clients[r.client]=0;clients[r.client]++;} });
  const sorted=Object.entries(clients).sort((a,b)=>a[0].localeCompare(b[0]));
  document.getElementById('count-clients').textContent=sorted.length+' client'+(sorted.length!==1?'s':'');
  const g=document.getElementById('clients-grid');
  if(!sorted.length){g.innerHTML='<div class="empty">Aucun client trouvé</div>';return;}
  g.innerHTML=sorted.map(([name,count],i)=>`
    <div class="client-card" data-idx="${i}">
      <div class="client-initial">${initials(name)}</div>
      <div class="client-name">${name}</div>
      <div class="client-count">${count} recette${count!==1?'s':''}</div>
    </div>`).join('');
  // Attach events after render
  const clientNames = sorted.map(([name])=>name);
  g.querySelectorAll('.client-card').forEach((card,i)=>{
    card.addEventListener('click', ()=>openClient(clientNames[i]));
  });
}

// --------
function openClient(name) {
  selectedClient=name;
  document.getElementById('search-produit').value='';
  document.getElementById('filter-marque-produit').value='';
  renderProduits();
  showMainTab('produits');
}

function renderProduits() {
  const q=(document.getElementById('search-produit').value||'').toLowerCase();
  const marque=document.getElementById('filter-marque-produit').value;
  document.getElementById('breadcrumb-produits').innerHTML=`
    <span class="crumb" onclick="showMainTab('clients')">Recettes</span>
    <span class="sep">›</span>
    <span class="current">${selectedClient}</span>`;
  const recettesClient=allRecettes.filter(r=>{
    const mC=r.client===selectedClient;
    const mQ=!q||r.couleur.toLowerCase().includes(q)||(r.numero_couleur||'').toLowerCase().includes(q)||(r.produit||'').toLowerCase().includes(q);
    const mM=!marque||r.marque===marque;
    return mC&&mQ&&mM;
  });
  const produits={};
  recettesClient.forEach(r=>{ const k=r.produit||'(Sans produit)'; if(!produits[k])produits[k]=[]; produits[k].push(r); });
  const sorted=Object.entries(produits).sort((a,b)=>a[0].localeCompare(b[0]));
  document.getElementById('count-produits').textContent=`${recettesClient.length} recette${recettesClient.length!==1?'s':''} · ${sorted.length} produit${sorted.length!==1?'s':''}`;
  const list=document.getElementById('produits-list');
  if(!sorted.length){list.innerHTML='<div class="empty">Aucune recette trouvée</div>';return;}
  list.innerHTML=sorted.map(([produit,recs],pi)=>{
    const rows=recs.map(r=>{
      const p=r.prix?.[0];
      const swatch=r.couleur_hex?`<div class="couleur-swatch" style="background:${r.couleur_hex};"></div>`:'';
      const prixInfo=canSeePrix()&&p&&p.prix_gallon?`<span style="font-size:12px;font-weight:600;color:var(--amber);">${parseFloat(p.prix_gallon).toFixed(2)} $</span>`:'';
      const db=canSeePrix()&&p?dateBadge(p.date_prix):'';
      return `<div class="couleur-row" onclick="openDetail('${r.id}')">
        <div class="couleur-left">
          ${swatch}
          <div class="couleur-info">
            <div class="couleur-name">${r.couleur}</div>
            <div class="couleur-sub">${r.numero_couleur?'#'+r.numero_couleur+' · ':''}${r.quantite||'Gallon'} · ${r.marque}</div>
          </div>
        </div>
        <div class="couleur-right">${prixInfo}${db}<span style="color:var(--text-3);font-size:14px;">›</span></div>
      </div>`;
    }).join('');
    return `<div class="produit-card">
      <div class="produit-header" onclick="toggleProduit(${pi})">
        <div class="produit-name">${produit}</div>
        <div class="produit-meta"><span class="produit-count">${recs.length} couleur${recs.length!==1?'s':''}</span><span class="produit-chevron open" id="chevron-${pi}">›</span></div>
      </div>
      <div class="produit-body open" id="body-${pi}">${rows}</div>
    </div>`;
  }).join('');
}

function toggleProduit(pi) {
  const body=document.getElementById('body-'+pi);
  const chev=document.getElementById('chevron-'+pi);
  body.classList.toggle('open');
  chev.classList.toggle('open');
}

// --------
function openDetail(id) {
  selectedId=id;
  const r=allRecettes.find(x=>x.id===id);
  if(!r) return;
  const p=r.prix?.[0];
  const colorants=(r.colorants||[]).sort((a,b)=>a.ordre-b.ordre);
  const total=p?(parseFloat(p.cost_base||0)+parseFloat(p.cost_colorant||0)+parseFloat(p.cost_catalyseur||0)):0;
  const d=ageDays(p?.date_prix);
  const ageTxt=d<=90?'Récent':d<=365?'À vérifier':'À mettre à jour';
  const ageCls=d<=90?'date-fresh':d<=365?'date-old':'date-stale';
  // Recalcul prix avec marges actuelles
  const prixCalc=p?calcPrix(r.marque,total):null;
  const swatchBig=r.couleur_hex?`<div class="detail-swatch" style="background:${r.couleur_hex};"></div>`:'';
  document.getElementById('breadcrumb-detail').innerHTML=`
    <span class="crumb" onclick="showMainTab('clients')">Recettes</span>
    <span class="sep">›</span>
    <span class="crumb" onclick="openClient(this.dataset.client)" data-client="${r.client.replace(/"/g,'&quot;')}">${r.client}</span>
    <span class="sep">›</span>
    <span class="crumb" onclick="openClient(this.dataset.client)" data-client="${r.client.replace(/"/g,'&quot;')}">${r.produit||'Sans produit'}</span>
    <span class="sep">›</span>
    <span class="current">${r.couleur}</span>`;
  document.getElementById('detail-panel').innerHTML=`
    <div class="detail-head">
      <div class="detail-head-left">
        ${swatchBig}
        <div><div class="detail-title">${r.couleur}</div><div class="detail-sub">${r.client}${r.numero_couleur?' &nbsp;·&nbsp; #'+r.numero_couleur:''}</div>
        ${r.couleur_hex?`<div style="font-family:monospace;font-size:12px;color:var(--text-3);margin-top:2px;">${r.couleur_hex.toUpperCase()}</div>`:''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;">
        <span class="badge ${marqueClass(r.marque)}">${r.marque}</span>
        <span class="badge badge-qty">${r.quantite||'Gallon'}</span>
      </div>
    </div>
    <div class="section-title">Informations générales</div>
    <div class="info-grid">
      <div class="info-item"><div class="k">Produit</div><div class="v">${r.produit||'—'}</div></div>
      <div class="info-item"><div class="k">Numéro de base</div><div class="v">${r.numero_base||'—'}</div></div>
      <div class="info-item"><div class="k">Date recette</div><div class="v">${fmtDate(r.date_recette)}</div></div>
      <div class="info-item"><div class="k">OKÉ</div><div class="v">${r.oke||'—'}</div></div>
      ${r.notes?`<div class="info-item" style="grid-column:1/-1;"><div class="k">Notes</div><div class="v">${r.notes}</div></div>`:''}
    </div>
    <div class="section-title">Colorants</div>
    <table class="ctable">
      <thead><tr><th>Colorant</th><th style="text-align:right;">Quantité</th><th>Unité</th></tr></thead>
      <tbody>${colorants.map((c,i)=>`<tr style="${i%2===1?'background:var(--bg);':''}"><td><strong>${c.nom}</strong></td><td class="qty">${c.quantite||''}</td><td class="unit">${c.unite||''}</td></tr>`).join('')}</tbody>
    </table>
    ${canSeePrix()&&p?`
    <div class="prix-box">
      <div class="prix-box-head">
        <span class="prix-box-title">Prix — comptoir seulement</span>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="date-badge ${ageCls}">● ${fmtDate(p.date_prix)}</span>
          <span style="font-size:11px;color:var(--text-3);">${ageTxt}</span>
        </div>
      </div>
      <div class="prix-cards">
        <div class="prix-card"><div class="lbl">Cost base</div><div class="val">${parseFloat(p.cost_base||0).toFixed(2)} $</div></div>
        <div class="prix-card"><div class="lbl">Cost colorant</div><div class="val">${parseFloat(p.cost_colorant||0).toFixed(2)} $</div></div>
        <div class="prix-card"><div class="lbl">Cost catalyseur</div><div class="val">${parseFloat(p.cost_catalyseur||0).toFixed(2)} $</div></div>
        <div class="prix-card highlight"><div class="lbl">Total cost</div><div class="val">${total.toFixed(2)} $</div></div>
        ${prixCalc?`
        <div class="prix-card highlight"><div class="lbl">Prix gallon (calc.)</div><div class="val">${prixCalc.gallon.toFixed(2)} $</div></div>
        <div class="prix-card"><div class="lbl">Prix pinte (calc.)</div><div class="val">${prixCalc.pinte.toFixed(2)} $</div></div>
        <div class="prix-card"><div class="lbl">Prix canette (calc.)</div><div class="val">${prixCalc.canette.toFixed(2)} $</div></div>`:''}
      </div>
      ${prixCalc?`<div class="formule-box" style="margin-top:10px;">Formule ${r.marque} : ${total.toFixed(2)} $ ÷ ${prixCalc.div} = <strong>${prixCalc.gallon.toFixed(2)} $/gal</strong> &nbsp;·&nbsp; Marge ${prixCalc.marge}%</div>`:''}
    </div>`:!canSeePrix()?`<div class="hidden-box">Prix non disponibles — vue Production</div>`:''}
  `;
  document.getElementById('tab-detail').style.display='';
  showMainTab('detail');
}

// --------
function loadCoutsBasesTable() {
  // Résumé des costs par marque depuis les recettes existantes
  const byMarque={};
  allRecettes.forEach(r=>{
    const p=r.prix?.[0];
    if(p&&parseFloat(p.cost_base||0)>0){
      const k=r.marque;
      if(!byMarque[k]) byMarque[k]={total:0,count:0};
      byMarque[k].total+=parseFloat(p.cost_base);
      byMarque[k].count++;
    }
  });
  const tbody=document.getElementById('base-costs-tbody');
  const marques=['Pépin','International','Devoe','Disolac'];
  tbody.innerHTML=marques.map(m=>{
    const d=byMarque[m];
    const avg=d?d.total/d.count:0;
    return `<tr>
      <td><span class="marque-badge badge-${m==='Pépin'?'pepin':m==='International'?'inter':m==='Devoe'?'devoe':'disolac'}">${m}</span></td>
      <td style="color:var(--text-3);">Moyenne des recettes</td>
      <td>${d?avg.toFixed(2)+' $ ('+d.count+' recette'+( d.count!==1?'s':'')+')':"Aucune recette"}</td>
    </tr>`;
  }).join('');
}

// --------
function addCRow(nom='',qty='',unit='OZ') {
  const row=document.createElement('div');
  row.className='crow';
  row.innerHTML=`
    <input type="text" placeholder="Ex: STX42, 307LB..." class="c-nom" value="${nom}"/>
    <input type="text" placeholder="Ex: 2.5" class="c-qty" value="${qty}"/>
    <select class="c-unit">${['OZ','GR','1/48','1/64','1/128'].map(u=>`<option${u===unit?' selected':''}>${u}</option>`).join('')}</select>
    <button class="rm-btn" onclick="this.parentElement.remove()">×</button>`;
  document.getElementById('cform').appendChild(row);
}

async function saveRecette() {
  const client=document.getElementById('f-client').value.trim();
  const couleur=document.getElementById('f-couleur').value.trim();
  const marque=document.getElementById('f-marque').value;
  const errEl=document.getElementById('form-err');
  errEl.style.display='none';
  if(!client||!couleur||!marque){errEl.textContent='Client, couleur et marque sont requis.';errEl.style.display='block';return;}
  const btn=document.getElementById('save-btn');
  btn.textContent='Sauvegarde...';btn.disabled=true;
  const hexToSave=currentHex&&currentHex!=='#cccccc'?currentHex:null;
  const {data:rec,error:recErr}=await sb.from('recettes').insert({
    client,couleur,
    numero_couleur:document.getElementById('f-num').value.trim()||null,
    marque,
    produit:document.getElementById('f-produit').value.trim()||null,
    numero_base:document.getElementById('f-base').value.trim()||null,
    quantite:document.getElementById('f-qty').value,
    oke:document.getElementById('f-oke').value.trim()||null,
    notes:document.getElementById('f-notes').value.trim()||null,
    couleur_hex:hexToSave,
  }).select().single();
  if(recErr){errEl.textContent='Erreur: '+recErr.message;errEl.style.display='block';btn.textContent='Sauvegarder';btn.disabled=false;return;}
  const colorants=[];
  document.querySelectorAll('#cform .crow').forEach((row,i)=>{
    const nom=row.querySelector('.c-nom').value.trim();
    if(nom) colorants.push({recette_id:rec.id,nom,quantite:row.querySelector('.c-qty').value.trim(),unite:row.querySelector('.c-unit').value,ordre:i});
  });
  if(colorants.length) await sb.from('colorants').insert(colorants);
  if(canSeePrix()){
    const cb=parseFloat(document.getElementById('f-cb').value)||0;
    const cc=parseFloat(document.getElementById('f-cc').value)||0;
    const ccat=parseFloat(document.getElementById('f-ccat').value)||0;
    const total=cb+cc+ccat;
    if(total>0){
      const p=calcPrix(marque,total);
      await sb.from('prix').insert({
        recette_id:rec.id,cost_base:cb,cost_colorant:cc,cost_catalyseur:ccat,
        prix_gallon:parseFloat(p.gallon.toFixed(2)),
        prix_pinte:parseFloat(p.pinte.toFixed(2)),
        prix_canette:parseFloat(p.canette.toFixed(2)),
        date_prix:new Date().toISOString().slice(0,10)
      });
    }
  }
  toast('Recette sauvegardée!');
  btn.textContent='Sauvegarder';btn.disabled=false;
  currentHex='#cccccc';
  updateColourPreview('#cccccc');
  ['f-client','f-couleur','f-num','f-produit','f-base','f-oke','f-notes','f-cb','f-cc','f-ccat'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('f-marque').value='';
  document.getElementById('cform').innerHTML='';
  if(document.getElementById('prix-preview')) document.getElementById('prix-preview').style.display='none';
  addCRow();
  await loadRecettes();
  showMainTab('clients');
}

addCRow();
updateColourPreview('#cccccc');
