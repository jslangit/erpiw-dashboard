// ═══════════════════════════════════════════════════════════
// EXPORT & DOWNLOAD LOGIC
// ═══════════════════════════════════════════════════════════

function buildDownloadPanel() {
  const grid = document.getElementById("dl-grid");
  const sken = document.getElementById("sel-sken").value;
  let areaLabel = curProv;
  if (drillKab) areaLabel = drillKab;
  if (viewAllKec) areaLabel = "Semua Kecamatan Terunggah";
  
  grid.innerHTML = `
    <div class="dl-card">
      <div class="dl-card-title">📊 Proyeksi Tahunan 2020–2030</div>
      <div class="dl-card-desc">Data per tahun untuk setiap wilayah. Titik 2020, 2025, 2030 dari BPS resmi; tahun lain interpolasi log-linear.</div>
      <div class="dl-card-meta"><span class="dl-tag">${areaLabel}</span><span class="dl-tag">Sken: ${sken}</span></div>
      <div style="display:flex;gap:8px;margin-top:auto">
        <button class="btn-dl" style="flex:1" onclick="dlCSV('annual')">⬇ CSV</button>
        <button class="btn-dl btn-dl-green" style="flex:1" onclick="dlExcel('annual')">⬇ Excel</button>
      </div>
    </div>
    <div class="dl-card">
      <div class="dl-card-title">📈 Proyeksi 5-Tahunan 2020–2050</div>
      <div class="dl-card-desc">Data 5-tahunan. Ekstensi proyeksi (2040–2050) berdasarkan laju provinsi BPS nasional.</div>
      <div class="dl-card-meta"><span class="dl-tag">${areaLabel}</span><span class="dl-tag">Sken: ${sken}</span></div>
      <div style="display:flex;gap:8px;margin-top:auto">
        <button class="btn-dl" style="flex:1" onclick="dlCSV('5yr')">⬇ CSV</button>
        <button class="btn-dl btn-dl-green" style="flex:1" onclick="dlExcel('5yr')">⬇ Excel</button>
      </div>
    </div>
    <div class="dl-card">
      <div class="dl-card-title">📉 Laju Pertumbuhan</div>
      <div class="dl-card-desc">Laju pertumbuhan tahunan 2020–2030 dan per-periode 5-tahunan 2030–2050.</div>
      <div class="dl-card-meta"><span class="dl-tag">${areaLabel}</span><span class="dl-tag">Sken: ${sken}</span></div>
      <div style="display:flex;gap:8px;margin-top:auto">
        <button class="btn-dl" style="flex:1" onclick="dlCSV('growth')">⬇ CSV</button>
        <button class="btn-dl btn-dl-green" style="flex:1" onclick="dlExcel('growth')">⬇ Excel</button>
      </div>
    </div>
    <div class="dl-card">
      <div class="dl-card-title">🌏 Semua 5 Provinsi — Tahunan</div>
      <div class="dl-card-desc">Gabungan data tahunan 2020–2030 untuk seluruh 56 kabupaten/kota.</div>
      <div class="dl-card-meta"><span class="dl-tag">5 Provinsi</span><span class="dl-tag">Sken: ${sken}</span></div>
      <div style="display:flex;gap:8px;margin-top:auto">
        <button class="btn-dl btn-dl-gold" style="flex:1" onclick="dlCSVAll()">⬇ CSV Semua</button>
        <button class="btn-dl btn-dl-green" style="flex:1" onclick="dlExcelAll()">⬇ Excel Semua</button>
      </div>
    </div>
    <div class="dl-card">
      <div class="dl-card-title">🌏 Semua 5 Provinsi — 5-Tahunan</div>
      <div class="dl-card-desc">Gabungan data 5-tahunan 2020–2050 untuk seluruh 56 kabupaten/kota.</div>
      <div class="dl-card-meta"><span class="dl-tag">5 Provinsi</span><span class="dl-tag">Sken: ${sken}</span></div>
      <div style="display:flex;gap:8px;margin-top:auto">
        <button class="btn-dl btn-dl-gold" style="flex:1" onclick="dlCSVAll5yr()">⬇ CSV Semua</button>
        <button class="btn-dl btn-dl-green" style="flex:1" onclick="dlExcelAll5yr()">⬇ Excel Semua</button>
      </div>
    </div>
    <div class="dl-card">
      <div class="dl-card-title">📋 Metadata & Metodologi</div>
      <div class="dl-card-desc">File teks berisi metodologi, sumber data, asumsi skenario, dan catatan teknis.</div>
      <div class="dl-card-meta"><span class="dl-tag">README</span><span class="dl-tag">Metodologi BPS</span></div>
      <button class="btn-dl" style="margin-top:auto" onclick="dlReadme()">⬇ Unduh README.txt</button>
    </div>
  `;
}

function dlKecTemplate() {
  const aoa = [
    ["Kabupaten/Kota", "Kecamatan", "Tahun 1", "Populasi 1", "Tahun 2", "Populasi 2"],
    ["Kota Samarinda", "Samarinda Ulu", 2020, 130.2, 2023, 135.5],
    ["Kota Balikpapan", "Balikpapan Utara", 2020, 169.4, 2022, 175.1]
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template_Kec");
  XLSX.writeFile(wb, "Template_Data_Kecamatan.xlsx");
}

function dlCSV(type) {
  const sken = document.getElementById("sel-sken").value;
  const proj = getProj(); 
  let csv="", fn="";
  let areaLabel = curProv;
  if (drillKab) areaLabel = drillKab;
  if (viewAllKec) areaLabel = "Semua_Kecamatan";
  
  const headerWilayah = viewAllKec ? "Kabupaten/Kota,Kecamatan" : "Wilayah";

  if (type === "annual") {
    csv  = `# Proyeksi Penduduk Tahunan 2020-2030\n# Wilayah: ${areaLabel} | Skenario: ${sken}\n`;
    csv += `Provinsi,${headerWilayah},${ANN_YEARS.join(",")},Delta_2020_2030_pct\n`;
    proj.forEach(k => {
      const d=safeGr(k.ann[10], k.ann[0]).toFixed(2);
      const rowWilayah = viewAllKec ? `"${k.parentName}","${k.name}"` : `"${k.name}"`;
      csv += `"${curProv}",${rowWilayah},${k.ann.map(v=>v.toFixed(2)).join(",")},${d}\n`;
    });
    fn = `proyeksi_tahunan_${areaLabel.replace(/ /g,"_")}_${sken}.csv`;
  } else if (type === "5yr") {
    csv  = `# Proyeksi Penduduk 5-Tahunan 2020-2050\n# Wilayah: ${areaLabel} | Skenario: ${sken}\n`;
    csv += `Provinsi,${headerWilayah},${YEARS5.join(",")},Delta_30thn_pct,r_thn_pct\n`;
    proj.forEach(k => {
      const d30=safeGr(k.p5[6], k.p5[0]).toFixed(2);
      const r=safeGr(k.p5[6], k.p5[0], 1/30).toFixed(4);
      const rowWilayah = viewAllKec ? `"${k.parentName}","${k.name}"` : `"${k.name}"`;
      csv += `"${curProv}",${rowWilayah},${k.p5.map(v=>v.toFixed(2)).join(",")},${d30},${r}\n`;
    });
    fn = `proyeksi_5thn_${areaLabel.replace(/ /g,"_")}_${sken}.csv`;
  } else if (type === "growth") {
    const grYrs = ANN_YEARS.slice(0,-1).map((y,i)=>`${y}-${y+1}`);
    csv  = `# Laju Pertumbuhan Penduduk\n# Wilayah: ${areaLabel} | Skenario: ${sken}\n\n`;
    csv += `Provinsi,${headerWilayah},${grYrs.join(",")},2030-35,2035-40,2040-45,2045-50,2020-50\n`;
    proj.forEach(k => {
      const annGr = k.ann.slice(0,-1).map((_,i)=>safeGr(k.ann[i+1],k.ann[i]).toFixed(4));
      const p35=safeGr(k.p5[3],k.p5[2],.2).toFixed(4);
      const p40=safeGr(k.p5[4],k.p5[3],.2).toFixed(4);
      const p45=safeGr(k.p5[5],k.p5[4],.2).toFixed(4);
      const p50=safeGr(k.p5[6],k.p5[5],.2).toFixed(4);
      const tot=safeGr(k.p5[6],k.p5[0],1/30).toFixed(4);
      const rowWilayah = viewAllKec ? `"${k.parentName}","${k.name}"` : `"${k.name}"`;
      csv += `"${curProv}",${rowWilayah},${annGr.join(",")},${p35},${p40},${p45},${p50},${tot}\n`;
    });
    fn = `laju_pertumbuhan_${areaLabel.replace(/ /g,"_")}_${sken}.csv`;
  }
  dlBlob(csv, fn);
}

function dlCSVAll() {
  const sken = document.getElementById("sel-sken").value;
  let csv  = `# Proyeksi Penduduk Tahunan 2020-2030 - Seluruh Provinsi Kalimantan\n`;
  csv += `Provinsi,Kabupaten/Kota,${ANN_YEARS.join(",")},Delta_2020_2030_pct\n`;
  PROV_LIST.forEach(prov => {
    const proj = getBaseProj(prov); 
    proj.forEach(k => {
      const d=safeGr(k.ann[10], k.ann[0]).toFixed(2);
      csv += `"${prov}","${k.name}",${k.ann.map(v=>v.toFixed(2)).join(",")},${d}\n`;
    });
  });
  dlBlob(csv, `proyeksi_tahunan_kalimantan_semua_${sken}.csv`);
}

function dlCSVAll5yr() {
  const sken = document.getElementById("sel-sken").value;
  let csv  = `# Proyeksi Penduduk 5-Tahunan 2020-2050 - Seluruh Provinsi Kalimantan\n`;
  csv += `Provinsi,Kabupaten/Kota,${YEARS5.join(",")},Delta_30thn_pct,r_thn_pct\n`;
  PROV_LIST.forEach(prov => {
    const proj = getBaseProj(prov); 
    proj.forEach(k => {
      const d30=safeGr(k.p5[6], k.p5[0]).toFixed(2);
      const r=safeGr(k.p5[6], k.p5[0], 1/30).toFixed(4);
      csv += `"${prov}","${k.name}",${k.p5.map(v=>v.toFixed(2)).join(",")},${d30},${r}\n`;
    });
  });
  dlBlob(csv, `proyeksi_5thn_kalimantan_semua_${sken}.csv`);
}

function dlExcel(type) {
  const sken = document.getElementById("sel-sken").value;
  const proj = getProj(); 
  let areaLabel = curProv;
  if (drillKab) areaLabel = drillKab;
  if (viewAllKec) areaLabel = "Semua_Kecamatan";

  let aoa = []; let fn = "";
  const headerWilayah = viewAllKec ? ["Kabupaten/Kota", "Kecamatan"] : ["Wilayah"];

  if (type === "annual") {
    aoa.push(["Provinsi", ...headerWilayah, ...ANN_YEARS, "Delta_2020_2030_pct"]);
    proj.forEach(k => {
      const rowWilayah = viewAllKec ? [k.parentName, k.name] : [k.name];
      const d = +safeGr(k.ann[10], k.ann[0]).toFixed(2);
      aoa.push([curProv, ...rowWilayah, ...k.ann.map(v=>+v.toFixed(2)), d]);
    });
    fn = `proyeksi_tahunan_${areaLabel.replace(/ /g,"_")}_${sken}.xlsx`;
  } else if (type === "5yr") {
    aoa.push(["Provinsi", ...headerWilayah, ...YEARS5, "Delta_30thn_pct", "r_thn_pct"]);
    proj.forEach(k => {
      const rowWilayah = viewAllKec ? [k.parentName, k.name] : [k.name];
      const d30 = +safeGr(k.p5[6], k.p5[0]).toFixed(2);
      const r = +safeGr(k.p5[6], k.p5[0], 1/30).toFixed(4);
      aoa.push([curProv, ...rowWilayah, ...k.p5.map(v=>+v.toFixed(2)), d30, r]);
    });
    fn = `proyeksi_5thn_${areaLabel.replace(/ /g,"_")}_${sken}.xlsx`;
  } else if (type === "growth") {
    const grYrs = ANN_YEARS.slice(0,-1).map((y,i)=>`${y}-${y+1}`);
    aoa.push(["Provinsi", ...headerWilayah, ...grYrs, "2030-35", "2035-40", "2040-45", "2045-50", "2020-50"]);
    proj.forEach(k => {
      const rowWilayah = viewAllKec ? [k.parentName, k.name] : [k.name];
      const annGr = k.ann.slice(0,-1).map((_,i)=>+safeGr(k.ann[i+1],k.ann[i]).toFixed(4));
      const p35 = +safeGr(k.p5[3],k.p5[2],.2).toFixed(4);
      const p40 = +safeGr(k.p5[4],k.p5[3],.2).toFixed(4);
      const p45 = +safeGr(k.p5[5],k.p5[4],.2).toFixed(4);
      const p50 = +safeGr(k.p5[6],k.p5[5],.2).toFixed(4);
      const tot = +safeGr(k.p5[6],k.p5[0],1/30).toFixed(4);
      aoa.push([curProv, ...rowWilayah, ...annGr, p35, p40, p45, p50, tot]);
    });
    fn = `laju_pertumbuhan_${areaLabel.replace(/ /g,"_")}_${sken}.xlsx`;
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa); const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data_Proyeksi");
  XLSX.writeFile(wb, fn);
}

function dlExcelAll() {
  const sken = document.getElementById("sel-sken").value;
  let aoa = [["Provinsi", "Kabupaten/Kota", ...ANN_YEARS, "Delta_2020_2030_pct"]];
  PROV_LIST.forEach(prov => {
    const proj = getBaseProj(prov);
    proj.forEach(k => {
      const d = +safeGr(k.ann[10], k.ann[0]).toFixed(2);
      aoa.push([prov, k.name, ...k.ann.map(v=>+v.toFixed(2)), d]);
    });
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa); const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tahunan_Semua");
  XLSX.writeFile(wb, `proyeksi_tahunan_kalimantan_semua_${sken}.xlsx`);
}

function dlExcelAll5yr() {
  const sken = document.getElementById("sel-sken").value;
  let aoa = [["Provinsi", "Kabupaten/Kota", ...YEARS5, "Delta_30thn_pct", "r_thn_pct"]];
  PROV_LIST.forEach(prov => {
    const proj = getBaseProj(prov);
    proj.forEach(k => {
      const d30 = +safeGr(k.p5[6], k.p5[0]).toFixed(2);
      const r = +safeGr(k.p5[6], k.p5[0], 1/30).toFixed(4);
      aoa.push([prov, k.name, ...k.p5.map(v=>+v.toFixed(2)), d30, r]);
    });
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa); const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "5Tahunan_Semua");
  XLSX.writeFile(wb, `proyeksi_5thn_kalimantan_semua_${sken}.xlsx`);
}

function dlReadme() {
  const txt = `PROYEKSI PENDUDUK KABUPATEN/KOTA & KECAMATAN KALIMANTAN 2020–2050
Berbasis Sensus Penduduk 2020 (SP2020)
========================================================

SUMBER DATA
-----------
1. Publikasi BPS Kabupaten/Kota Provinsi di Kalimantan (2020-2035)
2. Proyeksi Penduduk Indonesia 2020-2050 Hasil SP2020 (BPS, 2023)

METODOLOGI EKSTENSI (2040-2050)
------------------------------------
1. Menggunakan pertumbuhan diferensial yang dimoderasi.
2. Dikalibrasi otomatis dengan Normalisasi Pro-Rata untuk memastikan 
   jumlah seluruh kabupaten/kota per tahun sama presisi dengan pagu BPS Provinsi.
`;
  dlBlob(txt, "README_metodologi.txt");
}

function dlBlob(content, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF"+content], {type:"text/csv;charset=utf-8"}));
  a.download = filename;
  a.click();
}