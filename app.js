// ═══════════════════════════════════════════════════════════
// STATE VARIABLES
// ═══════════════════════════════════════════════════════════
let curProv = "Kalimantan Timur";
let selKab  = new Set();
let charts  = {};
let uploadedKecData = {}; 
let drillKab = null; 
let viewAllKec = false;

// ═══════════════════════════════════════════════════════════
// INTERPOLATION & SAFE MATH
// ═══════════════════════════════════════════════════════════
function safeGr(curr, prev, power = 1) {
  if (prev == null || curr == null || prev <= 0 || curr <= 0) return 0;
  if (power === 1) return ((curr / prev) - 1) * 100;
  return (Math.pow(curr / prev, power) - 1) * 100;
}

function formatSafeGr(curr, prev, power = 1, fixed = 3) {
  if (prev == null || curr == null || prev <= 0 || curr <= 0) return "-";
  let gr = safeGr(curr, prev, power);
  return (gr >= 0 ? "+" : "") + gr.toFixed(fixed) + "%";
}

function geoInterp(p0, p1, t) {
  if (p0 <= 0 || p1 <= 0) return p0;
  return p0 * Math.exp(t / 5 * Math.log(p1 / p0));
}

function extendKab(kab, provTp, sf) {
  const res = [...kab.p];
  const provRatios = [3,4,5].map(i => (provTp[i+1]*sf[i+1]) / (provTp[i]*sf[i]));
  const kabLast  = kab.p[3] / kab.p[2];
  const provLast = provTp[3] / provTp[2];
  const rawDiff  = kabLast / provLast;
  const isIKN    = IKN_KAB.includes(kab.n);
  const capped   = Math.min(Math.max(rawDiff, isIKN?0.90:0.85), isIKN?1.15:1.30);
  const dampen   = isIKN ? 0.30 : 0.60;
  let diff = capped;
  for (let i = 0; i < 3; i++) {
    diff = 1 + (diff - 1) * dampen;
    res.push(res[res.length-1] * provRatios[i] * diff);
  }
  return res;
}

function buildAnnual(pops5) {
  const ann = [];
  for (let yr = 2020; yr <= 2030; yr++) {
    if (yr <= 2025) ann.push(geoInterp(pops5[0], pops5[1], yr - 2020));
    else            ann.push(geoInterp(pops5[1], pops5[2], yr - 2025));
  }
  return ann;
}

function getAnnSf(sf) {
  const ann = [];
  for(let yr = 2020; yr <= 2030; yr++) {
    if (yr <= 2025) ann.push(geoInterp(sf[0], sf[1], yr - 2020));
    else ann.push(geoInterp(sf[1], sf[2], yr - 2025));
  }
  return ann;
}

// ═══════════════════════════════════════════════════════════
// ENGINE PROYEKSI & DRILL-DOWN
// ═══════════════════════════════════════════════════════════
function getBaseProj(prov, forceSken = null) {
  const sken = forceSken || document.getElementById("sel-sken").value;
  const sf   = SF[sken];
  const pd   = PD[prov];
  
  let proj = KD_RAW[prov].map(k => {
    const p5  = extendKab(k, pd.tp, sf); 
    return { name: k.n, p5 };
  });

  for (let i = 1; i <= 6; i++) {
      let targetBPS = pd.tp[i] * sf[i]; 
      let rawTotal = 0;
      proj.forEach(kab => { rawTotal += kab.p5[i]; });
      
      if (rawTotal > 0 && targetBPS > 0) {
          let ratio = targetBPS / rawTotal;
          proj.forEach(kab => { kab.p5[i] = kab.p5[i] * ratio; });
      }
  }
  
  proj.forEach(kab => {
      kab.ann = buildAnnual(kab.p5);
  });

  return proj;
}

function getProj(forceSken = null) {
  const sken = forceSken || document.getElementById("sel-sken").value;
  const sf = SF[sken];
  const ann_sf = getAnnSf(sf);
  const baseProj = getBaseProj(curProv, sken);
  
  if (viewAllKec) {
    let result = [];
    baseProj.forEach(pKab => {
      if (!selKab.has(pKab.name)) return;
      const kecs = uploadedKecData[pKab.name];
      if (kecs && kecs.length > 0) {
        const projKec = kecs.map(kec => ({
          name: kec.n, 
          p5: kec.p5.map((v, i) => v * sf[i]), 
          ann: kec.ann.map((v, i) => v * ann_sf[i]), 
          isRes: false, 
          parentName: pKab.name
        }));
        result.push(...projKec);
      }
    });
    return result;
  }
  
  if (drillKab) {
    const pKab = baseProj.find(k => k.name === drillKab);
    if (!pKab) return baseProj;

    const kecs = uploadedKecData[drillKab] || [];
    const projKec = kecs.map(kec => ({
      name: kec.n, 
      p5: kec.p5.map((v, i) => v * sf[i]), 
      ann: kec.ann.map((v, i) => v * ann_sf[i]), 
      isRes: false
    }));

    const resP5 = pKab.p5.map((v, i) => Math.max(0, v - projKec.reduce((s, k) => s + k.p5[i], 0)));
    const resAnn = pKab.ann.map((v, i) => Math.max(0, v - projKec.reduce((s, k) => s + k.ann[i], 0)));
    
    projKec.push({ name: "Kecamatan Lainnya", p5: resP5, ann: resAnn, isRes: true });
    return projKec;
  }
  
  return baseProj;
}

// ═══════════════════════════════════════════════════════════
// UPLOAD DATA KECAMATAN
// ═══════════════════════════════════════════════════════════
function handleKecUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const data = new Uint8Array(e.target.result);
    const wb = XLSX.read(data, {type: 'array'});
    const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    
    json.forEach(row => {
      let kab = row["Kabupaten/Kota"];
      let kec = row["Kecamatan"];
      
      if (!kab || !kec) return;
      kab = kab.toString().trim();
      kec = kec.toString().trim();

      const y1 = parseInt(row["Tahun 1"]);
      const v1 = parseFloat(row["Populasi 1"]);
      const y2 = parseInt(row["Tahun 2"]);
      const v2 = parseFloat(row["Populasi 2"]);
      
      if (isNaN(v1) || isNaN(v2)) return;
      
      const r = Math.log(v2 / v1) / (y2 - y1);
      const p5 = YEARS5.map(y => v2 * Math.exp(r * (y - y2)));
      const ann = ANN_YEARS.map(y => v2 * Math.exp(r * (y - y2)));
      
      if (!uploadedKecData[kab]) uploadedKecData[kab] = [];
      uploadedKecData[kab].push({ n: kec, p5, ann });
    });
    
    document.getElementById('kec-controls').style.display = "flex";
    alert("Data kecamatan berhasil dimuat. Klik nama kabupaten di tabel untuk melihatnya.");
    refresh();
  };
  reader.readAsArrayBuffer(file);
}

function toggleViewAllKec() {
  viewAllKec = !viewAllKec; drillKab = null; 
  document.getElementById("btn-view-all").textContent = viewAllKec ? "Tutup Semua Kecamatan" : "Tampilkan Semua Kecamatan";
  document.getElementById("btn-view-all").style.color = viewAllKec ? "var(--text)" : "var(--gold)";
  refresh();
}

function clearKecData() {
  if (confirm("Apakah Anda yakin ingin menghapus semua data kecamatan yang telah diunggah?")) {
    uploadedKecData = {}; viewAllKec = false; drillKab = null;
    document.getElementById('kec-controls').style.display = "none";
    document.getElementById('upload-kec').value = "";
    document.getElementById("btn-view-all").textContent = "Tampilkan Semua Kecamatan";
    document.getElementById("btn-view-all").style.color = "var(--gold)";
    refresh();
  }
}

function drillDown(kab) { drillKab = kab; viewAllKec = false; refresh(); }
function backToKab() { drillKab = null; refresh(); }

function formatName(k) {
  if (!drillKab && !viewAllKec && uploadedKecData[k.name]) {
    return `<span class="drill-link" onclick="drillDown('${k.name}')">${k.name} <span style="font-size:10px">🔍</span></span>`;
  }
  return k.name;
}

function getColor(name, index, isRes) {
  if (isRes) return "#4d6480";
  const rawIdx = KD_RAW[curProv].findIndex(r=>r.n===name);
  if (rawIdx >= 0) return PAL[rawIdx % PAL.length];
  return PAL[index % PAL.length];
}

// ═══════════════════════════════════════════════════════════
// SIDEBAR & UI
// ═══════════════════════════════════════════════════════════
function buildSidebar() {
  const provEl = document.getElementById("prov-btns");
  provEl.innerHTML = "";
  PROV_LIST.forEach(p => {
    const btn = document.createElement("button");
    btn.className = "prov-btn" + (p===curProv?" on":"");
    const tot = (PD[p].tp[0]/1000).toFixed(2);
    btn.innerHTML = `${p.replace("Kalimantan ","Kal. ")}<span class="prov-total">${tot}jt</span>`;
    btn.onclick = () => { curProv = p; drillKab = null; viewAllKec = false; resetKabSel(); buildSidebar(); refresh(); };
    provEl.appendChild(btn);
  });
  buildKabList();
}

function buildKabList(filter="") {
  const el   = document.getElementById("kab-list");
  const kabs = KD_RAW[curProv];
  el.innerHTML = "";
  kabs.forEach((k, i) => {
    if (filter && !k.n.toLowerCase().includes(filter.toLowerCase())) return;
    const div = document.createElement("div");
    div.className = "kab-item" + (selKab.has(k.n)?" on":"");
    const col = PAL[i % PAL.length];
    div.innerHTML = `<span class="kab-dot" style="background:${col}"></span>
      <span style="flex:1">${k.n}</span>
      <input type="checkbox" class="kab-chk" data-kab="${k.n}" ${selKab.has(k.n)?"checked":""}
        onclick="event.stopPropagation();toggleKab('${k.n.replace(/'/g,"\\'")}',this.checked)">`;
    div.onclick = () => {
      const chk = div.querySelector("input");
      chk.checked = !chk.checked;
      toggleKab(k.n, chk.checked);
    };
    el.appendChild(div);
  });
}

function filterKab() { buildKabList(document.getElementById("kab-search").value); }
function toggleKab(name, on) {
  if (on) selKab.add(name); else selKab.delete(name);
  buildKabList(document.getElementById("kab-search").value);
  refresh();
}
function resetKabSel() { selKab = new Set(KD_RAW[curProv].slice(0,5).map(k=>k.n)); }
function selectAllKab() { selKab = new Set(KD_RAW[curProv].map(k=>k.n)); buildKabList(); refresh(); }
function clearAllKab() { selKab.clear(); buildKabList(); refresh(); }
function selectTop5() {
  const proj = getBaseProj(curProv);
  const top5 = [...proj].sort((a,b)=>b.p5[0]-a.p5[0]).slice(0,5).map(k=>k.name);
  selKab = new Set(top5); buildKabList(); refresh();
}

function buildMetrics() {
  const sken = document.getElementById("sel-sken").value;
  const sf   = SF[sken]; const ann_sf = getAnnSf(sf);
  let p0=0, annPop2025=0, annPop2030=0, p3=0, p6=0, entityName="";

  if (viewAllKec || drillKab) {
    const activeProj = getProj(); 
    activeProj.forEach(k => {
      p0+=k.p5[0]; annPop2025+=k.ann[5]; annPop2030+=k.p5[2]; p3+=k.p5[3]; p6+=k.p5[6];
    });
    entityName = drillKab ? drillKab : "Kecamatan Terunggah";
  } else {
    const pd = PD[curProv];
    p0 = pd.tp[0]; annPop2025 = pd.tp[1]*sf[1]; annPop2030 = pd.tp[2]*sf[2]; p3 = pd.tp[3]*sf[3]; p6 = pd.tp[6]*sf[6];
    entityName = curProv;
  }

  const g30 = safeGr(p6, p0); const ar  = safeGr(p6, p0, 1/30);
  const gr2530 = safeGr(annPop2030, annPop2025, 0.2);

  document.getElementById("metrics-strip").innerHTML = `
    <div class="metric"><div class="m-lbl">Pop 2020 (${entityName})</div><div class="m-val">${(p0/1000).toFixed(2)}</div><div class="m-sub">juta jiwa</div></div>
    <div class="metric"><div class="m-lbl">Pop 2025 (Skenario)</div><div class="m-val">${(annPop2025/1000).toFixed(2)}</div><div class="m-sub m-chg ${gr2530>=0?'pos':'neg'}">${gr2530>=0?"+":""}${gr2530.toFixed(2)}%/thn vs 2030</div></div>
    <div class="metric"><div class="m-lbl">Pop 2030 (Skenario)</div><div class="m-val">${(annPop2030/1000).toFixed(2)}</div><div class="m-sub">juta jiwa</div></div>
    <div class="metric"><div class="m-lbl">Pop 2035 (Skenario)</div><div class="m-val">${(p3/1000).toFixed(2)}</div><div class="m-sub">juta jiwa</div></div>
    <div class="metric"><div class="m-lbl">Pop 2050 (Ekstensi)</div><div class="m-val">${(p6/1000).toFixed(2)}</div><div class="m-sub m-chg ${g30>=0?'pos':'neg'}">${g30>=0?"+":""}${g30.toFixed(1)}% dari 2020 (${ar>=0?"+":""}${ar.toFixed(2)}%/thn)</div></div>
  `;
}

// ═══════════════════════════════════════════════════════════
// CHARTS
// ═══════════════════════════════════════════════════════════
function destroyChart(id) { if(charts[id]){charts[id].destroy();delete charts[id];} }
function getActiveSelection(proj) {
  if (drillKab || viewAllKec) return proj; 
  return proj.filter(k => selKab.has(k.name));
}

function buildScenChart() {
  destroyChart("scen");
  const allYears = [2020,2021,2022,2023,2024,2025,2026,2027,2028,2029,2030,2035,2040,2045,2050];
  const scens = ["tren", "optimis", "moderat"];
  const colors = { tren: "#4a9eff", optimis: "#2ecc71", moderat: "#f0a030" };
  const labels = { tren: "Tren (Base)", optimis: "Skenario Optimis", moderat: "Skenario Moderat" };

  const datasets = scens.map(s => {
    const proj = getProj(s); const sel = getActiveSelection(proj);
    const data = allYears.map(y => {
      let sum = 0;
      if (y <= 2030) { const idx = y - 2020; sel.forEach(k => sum += k.ann[idx]); } 
      else { const idx = YEARS5.indexOf(y); sel.forEach(k => sum += k.p5[idx]); }
      return +(sum/1000).toFixed(2);
    });
    return {
      label: labels[s], data: data.map(v => v * 1000), 
      borderColor: colors[s], backgroundColor: colors[s] + "22",
      borderWidth: 2, tension: 0.3, pointRadius: 3, pointHoverRadius: 6
    };
  });

  const ctx = document.getElementById("scenChart").getContext("2d");
  charts.scen = new Chart(ctx, {
    type: "line", data: { labels: allYears, datasets: datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor:"rgba(13,18,32,.95)", borderColor:"rgba(30,45,69,.8)", borderWidth:1,
          titleFont:{family:"'IBM Plex Mono'",size:10}, bodyFont:{family:"'IBM Plex Mono'",size:11},
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString('id-ID')} ribu jiwa` }
        }
      },
      scales: {
        x: { ticks: { color: "#4d6480", font: { family:"'IBM Plex Mono'", size: 10 } }, grid: { color: "rgba(30,45,69,.5)" } },
        y: { title: { display: true, text: "Total Populasi (Ribu Jiwa)", color: "#4d6480", font: { family:"'IBM Plex Mono'", size: 10 } }, ticks: { color: "#4d6480", font: { family:"'IBM Plex Mono'", size: 10 } }, grid: { color: "rgba(30,45,69,.5)" } }
      }
    }
  });

  let entity = drillKab ? drillKab : (viewAllKec ? "Kecamatan Terpilih" : curProv);
  document.getElementById("scen-chart-title").textContent = `Perbandingan Skenario Total Populasi — ${entity} (2020–2050)`;
}

function buildMainChart(proj) {
  destroyChart("main");
  const view  = document.getElementById("sel-view").value;
  const yrS   = +document.getElementById("yr-start").value;
  const yrE   = +document.getElementById("yr-end").value;
  const sel   = getActiveSelection(proj);
  if (!sel.length) return;

  const allYears = [];
  for (let y = 2020; y <= 2030; y++) allYears.push(y);
  [2035,2040,2045,2050].forEach(y => allYears.push(y));
  const filtYears = allYears.filter(y => y >= yrS && y <= yrE);

  const datasets = sel.map((k, i) => {
    const col = getColor(k.parentName || k.name, i, k.isRes);
    const data = filtYears.map(y => {
      if (y <= 2030) {
        const idx = y - 2020;
        if (view==="abs") return +k.ann[idx].toFixed(2);
        if (view==="gr")  return idx===0 ? null : +safeGr(k.ann[idx], k.ann[idx-1]).toFixed(3);
        if (view==="sh")  {
            const tot = proj.reduce((s,r)=>s+r.ann[idx],0);
            return tot>0 ? +(k.ann[idx]/tot*100).toFixed(3) : 0;
        }
      } else {
        const i5 = YEARS5.indexOf(y);
        if (view==="abs") return +k.p5[i5].toFixed(2);
        if (view==="gr")  return +safeGr(k.p5[i5], k.p5[i5-1], 0.2).toFixed(3);
        if (view==="sh")  {
            const tot = proj.reduce((s,r)=>s+r.p5[i5],0);
            return tot>0 ? +(k.p5[i5]/tot*100).toFixed(3) : 0;
        }
      }
    });
    
    let labelName = k.name.replace("Kab. ","").replace("Kota ","K.");
    if (viewAllKec && k.parentName) labelName = `${k.name} (${k.parentName.replace("Kabupaten ","Kab.").replace("Kota ","K.")})`;

    return {
      label: labelName, data, borderColor: col, backgroundColor: col+"22",
      borderWidth: 1.5, tension: .3, pointRadius: 2, pointHoverRadius: 5, borderDash: k.isRes ? [4,4] : []
    };
  });

  const yLbl = view==="abs"?"Populasi (ribu jiwa)":view==="gr"?"Laju pertumbuhan (%/thn)":"Pangsa dalam wilayah (%)";
  const ctx = document.getElementById("mainChart").getContext("2d");
  charts.main = new Chart(ctx, {
    type:"line", data:{labels:filtYears, datasets},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:"rgba(13,18,32,.95)", borderColor:"rgba(30,45,69,.8)", borderWidth:1,
          titleFont:{family:"'IBM Plex Mono'",size:10}, bodyFont:{family:"'IBM Plex Mono'",size:11},
          callbacks:{ 
              label: function(context) {
                  let val = context.parsed.y;
                  if (val === null || isNaN(val)) return context.dataset.label + ': -';
                  return `${context.dataset.label}: ${val.toFixed(view==="abs"?2:3)} ${view==="abs"?"rb":"%"}`;
              } 
          }
        }
      },
      scales:{
        x:{ticks:{font:{family:"'IBM Plex Mono'",size:10},color:"#4d6480"},grid:{color:"rgba(30,45,69,.5)"}},
        y:{title:{display:true,text:yLbl,font:{family:"'IBM Plex Mono'",size:10},color:"#4d6480"},ticks:{font:{family:"'IBM Plex Mono'",size:10},color:"#4d6480"},grid:{color:"rgba(30,45,69,.5)"}}
      }
    }
  });

  const legEl = document.getElementById("chart-legend");
  legEl.innerHTML = sel.map((k,i)=>{
    const col = getColor(k.parentName || k.name, i, k.isRes);
    let labelName = k.name.replace("Kab. ","").replace("Kota ","K.");
    if (viewAllKec && k.parentName) labelName = `${k.name} (${k.parentName.replace("Kabupaten ","Kab.").replace("Kota ","K.")})`;
    return `<div class="leg-item"><span class="leg-dot" style="background:${col}"></span>${labelName}</div>`;
  }).join("");

  let titleText = `${curProv}`;
  if(drillKab) titleText = drillKab;
  if(viewAllKec) titleText = "Kecamatan Terunggah";
  document.getElementById("chart-title").textContent = `${titleText} — ${view==="abs"?"Populasi":view==="gr"?"Laju Pertumbuhan":"Pangsa"} ${yrS}–${yrE}`;
}

function buildBarChart2530(proj) {
  destroyChart("bar2050");
  const sel = getActiveSelection(proj);
  if (!sel.length) return;
  const cols = sel.map((k,i)=>getColor(k.parentName || k.name, i, k.isRes));
  const ctx = document.getElementById("barChart2050").getContext("2d");
  
  let labels = sel.map(k=>k.name.replace("Kabupaten ","K.").replace("Kota ","Kt."));
  if (viewAllKec) labels = sel.map(k=>`${k.name.substring(0,10)}...`); 

  charts.bar2050 = new Chart(ctx, {
    type:"bar",
    data:{
      labels: labels,
      datasets:[
        {label:"2020",data:sel.map(k=>+k.p5[0].toFixed(1)),backgroundColor:cols.map(c=>c+"aa"),borderColor:cols,borderWidth:1},
        {label:"2050",data:sel.map(k=>+k.p5[6].toFixed(1)),backgroundColor:cols.map(c=>c+"55"),borderColor:cols,borderWidth:1,borderDash:[3,2]}
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{labels:{font:{family:"'IBM Plex Mono'",size:10},color:"#8fa3c0"},position:"top"}, tooltip: {callbacks: {title: function(context) {return sel[context[0].dataIndex].name;} }}},
      scales:{
        x:{ticks:{font:{family:"'IBM Plex Mono'",size:9},color:"#4d6480",maxRotation:35},grid:{color:"rgba(30,45,69,.5)"}},
        y:{ticks:{font:{family:"'IBM Plex Mono'",size:9},color:"#4d6480"},grid:{color:"rgba(30,45,69,.5)"},title:{display:true,text:"Ribu jiwa",font:{size:9},color:"#4d6480"}}
      }
    }
  });
}

function buildGrChart(proj) {
  destroyChart("grChart");
  const sel = getActiveSelection(proj);
  if (!sel.length) return;
  
  const grYears = [2021,2022,2023,2024,2025,2026,2027,2028,2029,2030,2035,2040,2045,2050];
  const datasets = sel.map((k,i) => {
    const col = getColor(k.parentName || k.name, i, k.isRes);
    const data = grYears.map(y => {
      if (y <= 2030) { const idx = y - 2020; return +safeGr(k.ann[idx], k.ann[idx-1]).toFixed(3); } 
      else { const i5 = YEARS5.indexOf(y); return +safeGr(k.p5[i5], k.p5[i5-1], 0.2).toFixed(3); }
    });
    
    let labelName = k.name.replace("Kab. ","").replace("Kota ","K.");
    if (viewAllKec && k.parentName) labelName = `${k.name} (${k.parentName.replace("Kabupaten ","Kab.").replace("Kota ","K.")})`;

    return { label: labelName, data: data, borderColor:col, backgroundColor:col+"22", borderWidth:1.5, tension:.3, pointRadius:2, borderDash: k.isRes?[4,4]:[] };
  });
  const ctx = document.getElementById("grChart").getContext("2d");
  charts.grChart = new Chart(ctx, {
    type:"line", data:{labels:grYears, datasets},
    options:{
      responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{
        x:{ticks:{font:{size:10},color:"#4d6480"},grid:{color:"rgba(30,45,69,.5)"}},
        y:{title:{display:true,text:"%/thn",font:{size:9},color:"#4d6480"},ticks:{font:{size:9},color:"#4d6480"},grid:{color:"rgba(30,45,69,.5)"}}
      }
    }
  });
}

function buildCompareCharts() {
  const sken = document.getElementById("sel-sken").value;
  const sf   = SF[sken];
  const provCols = {"Kalimantan Barat":"#4a9eff","Kalimantan Tengah":"#2ecc71","Kalimantan Selatan":"#f0a030","Kalimantan Timur":"#a78bfa","Kalimantan Utara":"#f472b6"};

  destroyChart("cp1"); destroyChart("cp2"); destroyChart("cp3");
  const allYears = [];
  for(let y=2020;y<=2030;y++) allYears.push(y);
  [2035,2040,2045,2050].forEach(y=>allYears.push(y));

  function provPop(prov, yr) {
    const pd=PD[prov], sf_=SF[sken];
    if(yr<=2025){const t=yr-2020;return geoInterp(pd.tp[0]*sf_[0],pd.tp[1]*sf_[1],t);}
    if(yr<=2030){const t=yr-2025;return geoInterp(pd.tp[1]*sf_[1],pd.tp[2]*sf_[2],t);}
    const i5=YEARS5.indexOf(yr); return pd.tp[i5]*sf_[i5];
  }

  const ds1 = PROV_LIST.map(p => ({
    label: p.replace("Kalimantan ","Kal. "), data: allYears.map(y => +(provPop(p,y)/1000).toFixed(3)),
    borderColor: provCols[p], backgroundColor: provCols[p]+"22", borderWidth: 2, tension: .3, pointRadius: 2
  }));
  charts.cp1 = new Chart(document.getElementById("cpChart1").getContext("2d"), {
    type:"line", data:{labels:allYears, datasets:ds1},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{font:{family:"'IBM Plex Mono'",size:10},color:"#8fa3c0"},position:"top"}},scales:{x:{ticks:{font:{size:10},color:"#4d6480"},grid:{color:"rgba(30,45,69,.4)"}},y:{title:{display:true,text:"Juta jiwa",font:{size:9},color:"#4d6480"},ticks:{font:{size:9},color:"#4d6480"},grid:{color:"rgba(30,45,69,.4)"}}}}
  });

  const totals20 = PROV_LIST.map(p=>provPop(p,2020)); const totals50 = PROV_LIST.map(p=>provPop(p,2050));
  charts.cp2 = new Chart(document.getElementById("cpChart2").getContext("2d"), {
    type:"bar",
    data:{
      labels: PROV_LIST.map(p=>p.replace("Kalimantan ","")),
      datasets:[
        {label:"2020",data:totals20.map(v=>(v/totals20.reduce((s,x)=>s+x,0)*100).toFixed(2)),backgroundColor:PROV_LIST.map(p=>provCols[p]+"cc"),borderColor:PROV_LIST.map(p=>provCols[p]),borderWidth:1},
        {label:"2050",data:totals50.map(v=>(v/totals50.reduce((s,x)=>s+x,0)*100).toFixed(2)),backgroundColor:PROV_LIST.map(p=>provCols[p]+"55"),borderColor:PROV_LIST.map(p=>provCols[p]),borderWidth:1,borderDash:[3,2]}
      ]
    },
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{font:{family:"'IBM Plex Mono'",size:10},color:"#8fa3c0"},position:"top"}},scales:{x:{ticks:{font:{size:10},color:"#4d6480"},grid:{color:"rgba(30,45,69,.4)"}},y:{title:{display:true,text:"%",font:{size:9},color:"#4d6480"},ticks:{font:{size:9},color:"#4d6480"},grid:{color:"rgba(30,45,69,.4)"}}}}
  });

  const grYears3 = [2021,2022,2023,2024,2025,2026,2027,2028,2029,2030,2035,2040,2045,2050];
  const ds3 = PROV_LIST.map(p => {
    const data = grYears3.map(y => {
      if(y <= 2030) return +safeGr(provPop(p, y), provPop(p, y-1)).toFixed(3);
      else return +safeGr(provPop(p, y), provPop(p, y-5), 0.2).toFixed(3);
    });
    return {label:p.replace("Kalimantan ","Kal. "),data:data,borderColor:provCols[p],backgroundColor:provCols[p]+"22",borderWidth:2,tension:.3,pointRadius:2};
  });
  charts.cp3 = new Chart(document.getElementById("cpChart3").getContext("2d"), {
    type:"line", data:{labels:grYears3, datasets:ds3},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{font:{family:"'IBM Plex Mono'",size:10},color:"#8fa3c0"},position:"top"}},scales:{x:{ticks:{font:{size:10},color:"#4d6480"},grid:{color:"rgba(30,45,69,.4)"}},y:{title:{display:true,text:"%/thn",font:{size:9},color:"#4d6480"},ticks:{font:{size:9},color:"#4d6480"},grid:{color:"rgba(30,45,69,.4)"}}}}
  });
}

// ═══════════════════════════════════════════════════════════
// TABLES
// ═══════════════════════════════════════════════════════════
function buildAnnualTable(proj) {
  const BPS_YRS = new Set([2020,2025,2030]);
  const thead = document.getElementById("ann-thead"); const tbody = document.getElementById("ann-tbody");
  const thKec = viewAllKec ? "<th>Kecamatan</th><th>Kabupaten/Kota</th>" : "<th>Wilayah</th>";
  thead.innerHTML = `<tr>${thKec}${ANN_YEARS.map(y=>`<th>${y}${BPS_YRS.has(y)?'*':''}</th>`).join("")}<th>Δ 2020–2030</th></tr>`;
  tbody.innerHTML = "";
  
  [...proj].forEach(k => {
    const d = safeGr(k.ann[10], k.ann[0]);
    const tdName = viewAllKec ? `<td title="${k.name}">${k.name}</td><td title="${k.parentName}">${k.parentName}</td>` : `<td title="${k.name}">${formatName(k)}</td>`;
    tbody.innerHTML += `<tr class="${k.isRes?'row-res':''}">
      ${tdName}${k.ann.map((v,i)=>{const cls=BPS_YRS.has(ANN_YEARS[i])?"bps-official":"ann";return `<td class="${cls}">${v.toFixed(2)}</td>`;}).join("")}
      <td class="${d>=0?'pos':'neg'}">${d>=0?"+":""}${d.toFixed(1)}%</td></tr>`;
  });
  
  const tots = ANN_YEARS.map((_,i)=>proj.reduce((s,k)=>s+k.ann[i],0));
  const dTot = safeGr(tots[10], tots[0]);
  let lbl = drillKab ? drillKab : (viewAllKec ? "KECAMATAN TERUNGGAH" : curProv);
  const colspan = viewAllKec ? `colspan="2"` : ``;
  
  tbody.innerHTML += `<tr class="sum-tr"><td ${colspan}>TOTAL ${lbl}</td>${tots.map((t,i)=>{const cls=BPS_YRS.has(ANN_YEARS[i])?"bps-official":"ann";return `<td class="${cls}">${t.toFixed(2)}</td>`;}).join("")}<td class="pos">+${dTot.toFixed(1)}%</td></tr>`;
  document.getElementById("ann-title").textContent = `Proyeksi Tahunan 2020–2030 — ${lbl} (ribu jiwa) · * = BPS resmi`;
}

function buildFyrTable(proj) {
  const thead = document.getElementById("fyr-thead"); const tbody = document.getElementById("fyr-tbody");
  const thKec = viewAllKec ? "<th>Kecamatan</th><th>Kabupaten/Kota</th>" : "<th>Wilayah</th>";
  thead.innerHTML = `<tr>${thKec}${YEARS5.map((y,i)=>`<th>${y}${i<=3?"":"†"}</th>`).join("")}<th>Δ 30thn</th><th>r/thn</th></tr>`;
  tbody.innerHTML = "";
  
  [...proj].forEach(k => {
    const d30=safeGr(k.p5[6],k.p5[0]), r=safeGr(k.p5[6],k.p5[0],1/30);
    const tdName = viewAllKec ? `<td title="${k.name}">${k.name}</td><td title="${k.parentName}">${k.parentName}</td>` : `<td title="${k.name}">${formatName(k)}</td>`;
    tbody.innerHTML += `<tr class="${k.isRes?'row-res':''}">
      ${tdName}${k.p5.map((v,i)=>`<td class="${i<=3?"bps-official":"ext"}">${v.toFixed(2)}</td>`).join("")}
      <td class="${d30>=0?"pos":"neg"}">${d30>=0?"+":""}${d30.toFixed(1)}%</td><td class="${r>=0?"pos":"neg"}">${r>=0?"+":""}${r.toFixed(2)}%</td></tr>`;
  });
  const tots=YEARS5.map((_,i)=>proj.reduce((s,k)=>s+k.p5[i],0));
  const td30=safeGr(tots[6],tots[0]), tr_=safeGr(tots[6],tots[0],1/30);
  let lbl = drillKab ? drillKab : (viewAllKec ? "KECAMATAN TERUNGGAH" : curProv);
  const colspan = viewAllKec ? `colspan="2"` : ``;

  tbody.innerHTML += `<tr class="sum-tr"><td ${colspan}>TOTAL ${lbl}</td>${tots.map((t,i)=>`<td class="${i<=3?"bps-official":"ext"}">${t.toFixed(2)}</td>`).join("")}<td class="pos">+${td30.toFixed(1)}%</td><td class="pos">+${tr_.toFixed(2)}%</td></tr>`;
  document.getElementById("fyr-title").textContent = `Proyeksi 5-Tahunan 2020–2050 — ${lbl} (ribu jiwa)`;
}

function buildGrowthTable(proj) {
  const thead = document.getElementById("gr-thead"); const tbody = document.getElementById("gr-tbody");
  const grPeriods = ["2020–21","2021–22","2022–23","2023–24","2024–25","2025–26","2026–27","2027–28","2028–29","2029–30","2030–35*","2035–40†","2040–45†","2045–50†","2020–50"];
  const thKec = viewAllKec ? "<th>Kecamatan</th><th>Kabupaten/Kota</th>" : "<th>Wilayah</th>";
  thead.innerHTML = `<tr>${thKec}${grPeriods.map(p=>`<th>${p}</th>`).join("")}</tr>`;
  tbody.innerHTML = "";
  
  [...proj].forEach(k => {
    const annGr = k.ann.slice(0,-1).map((_,i)=>formatSafeGr(k.ann[i+1],k.ann[i]));
    const gr3035 = formatSafeGr(k.p5[3],k.p5[2],.2); const gr3540 = formatSafeGr(k.p5[4],k.p5[3],.2);
    const gr4045 = formatSafeGr(k.p5[5],k.p5[4],.2); const gr4550 = formatSafeGr(k.p5[6],k.p5[5],.2);
    const gr2050 = safeGr(k.p5[6],k.p5[0],1/30);
    const fmtG = (v, ext) => { const isNum = v !== "-"; const cls=ext?"ext":(isNum && parseFloat(v)>=0)?"ann":"neg"; return `<td class="${cls}">${v}</td>`; };
    const tdName = viewAllKec ? `<td title="${k.name}">${k.name}</td><td title="${k.parentName}">${k.parentName}</td>` : `<td title="${k.name}">${formatName(k)}</td>`;
    tbody.innerHTML += `<tr class="${k.isRes?'row-res':''}">
      ${tdName}${annGr.map(v=>`<td class="ann">${v}</td>`).join("")}
      ${fmtG(gr3035,false)}${fmtG(gr3540,true)}${fmtG(gr4045,true)}${fmtG(gr4550,true)}
      <td class="${gr2050>=0?"pos":"neg"}"><strong>${gr2050>=0?"+":""}${gr2050.toFixed(3)}%</strong></td></tr>`;
  });
}

// ═══════════════════════════════════════════════════════════
// FILTER, TABS & INIT
// ═══════════════════════════════════════════════════════════
function filterTable(tblId, query) {
  const rows = document.querySelectorAll(`#${tblId} tbody tr`);
  rows.forEach(row => {
    const txtKec = row.cells[0]?.textContent || "";
    const txtKab = row.cells[1] && viewAllKec ? row.cells[1].textContent : "";
    const txtGabung = (txtKec + " " + txtKab).toLowerCase();
    row.style.display = (!query || txtGabung.includes(query.toLowerCase())) ? "" : "none";
  });
}

let activeTab = "chart";
function switchTab(name) {
  activeTab = name;
  ["chart","scenario","annual","5yr","growth","compare","download"].forEach((t,i) => {
    const panel = document.getElementById("panel-"+t);
    const btn   = document.querySelectorAll(".tab-btn")[i];
    if (!panel||!btn) return;
    panel.classList.toggle("on", t===name);
    btn.classList.toggle("on", t===name);
  });
  if (name==="compare") buildCompareCharts();
  if (name==="scenario") buildScenChart();
  if (name==="download") buildDownloadPanel();
}

function refresh() {
  const proj = getProj();
  document.getElementById("drill-nav").style.display = drillKab ? "flex" : "none";
  
  const compTab = document.getElementById("tab-compare");
  if (compTab) compTab.style.display = (drillKab || viewAllKec) ? "none" : "block";
  if ((drillKab || viewAllKec) && activeTab === "compare") switchTab("chart");

  buildMetrics();
  buildMainChart(proj);
  buildBarChart2530(proj);
  buildGrChart(proj);
  buildAnnualTable(proj);
  buildFyrTable(proj);
  buildGrowthTable(proj);
  if (activeTab==="compare") buildCompareCharts();
  if (activeTab==="scenario") buildScenChart();
  if (activeTab==="download") buildDownloadPanel();
}

document.getElementById("foot-ts").textContent = "Dibuat: " + new Date().toLocaleDateString("id-ID",{day:"numeric",month:"long",year:"numeric"});
resetKabSel();
buildSidebar();
refresh();