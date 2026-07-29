const API_URL = "https://script.google.com/macros/s/AKfycbxd0BKE2PObmp8FPLtuuwvQnWSoXlr1Squ2aE_D2BRENR6QctYh0IfMkrEF5R_8WEDm/exec"; 
const APP_PASSWORD = "2"; 

// --- HELPER PERHITUNGAN TANGGAL & DEADLINE ---
function hitungTenggatWaktu(tanggalDaftarStr) {
  if (!tanggalDaftarStr) return "-";
  const tgl = new Date(tanggalDaftarStr);
  if (isNaN(tgl.getTime())) return "-";
  
  // Tambahkan 3 minggu (21 hari)
  tgl.setDate(tgl.getDate() + 21);
  
  return tgl.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function formatTanggalLengkap(tanggalDaftarStr) {
  if (!tanggalDaftarStr) return "-";
  const tgl = new Date(tanggalDaftarStr);
  if (isNaN(tgl.getTime())) return tanggalDaftarStr;
  
  return tgl.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

let APP_STATE = { events: [], sekolah: [], kelas: [], peserta: [], riwayat: [] };
let CURRENT_CONTEXT = { view: 'dashboard', id_event: null, id_sekolah: null, id_kelas: null, id_peserta: null };

document.addEventListener("DOMContentLoaded", () => {
  checkDraftQueue();
  setupEventListeners();
  setupGatekeeper();
});

function hitungHargaTotalTiket(jenisTiket, opsiTrans) {
  let hargaDasar = jenisTiket === 'VIP' ? 200000 : 150000; 
  let tambahanTrans = (opsiTrans === 'Ya' || opsiTrans === true || opsiTrans === "true") ? 20000 : 0; 
  return hargaDasar + tambahanTrans;
}

function setupGatekeeper() {
  const btnSubmitGate = document.getElementById("btn-submit-gate");
  const inpGatePassword = document.getElementById("inp-gate-password");
  const loginGate = document.getElementById("login-gate");

  if (!btnSubmitGate || !inpGatePassword || !loginGate) return;

  if (sessionStorage.getItem("gatekeeper_authenticated") === "true") {
    loginGate.style.display = "none";
    initApp();
    return;
  }

  btnSubmitGate.addEventListener("click", () => {
    if (inpGatePassword.value === APP_PASSWORD) {
      sessionStorage.setItem("gatekeeper_authenticated", "true");
      loginGate.style.display = "none";
      initApp();
    } else {
      alert("Password salah! Coba lagi.");
      inpGatePassword.value = "";
      inpGatePassword.focus();
    }
  });

  inpGatePassword.addEventListener("keypress", (e) => {
    if (e.key === "Enter") btnSubmitGate.click();
  });
}

function setupEventListeners() {
  const btnSimpanDraft = document.getElementById("btn-simpan-draft");
  if (btnSimpanDraft) {
    btnSimpanDraft.addEventListener("click", simpanKeDraftOffline);
  }
  const btnSyncDraft = document.getElementById("btn-sync-draft");
  if (btnSyncDraft) {
    btnSyncDraft.addEventListener("click", sinkronkanDraftOnline);
  }
  const btnStatLunas = document.getElementById("btn-stat-lunas");
  if (btnStatLunas) {
    btnStatLunas.addEventListener("click", () => switchView("lunas-filter"));
  }
  const btnSimpanCepat = document.getElementById("btn-simpan-cepat");
  if(btnSimpanCepat) {
    btnSimpanCepat.addEventListener("click", async () => {
      const idEvent = document.getElementById("inp-event").value;
      const namaSekolah = document.getElementById("inp-sekolah-nama").value.trim();
      const namaKelas = document.getElementById("inp-kelas-nama").value.trim();
      const pjKelas = document.getElementById("inp-kelas-pj").value.trim();
      const namaPeserta = document.getElementById("inp-peserta-nama").value.trim();
      const waPeserta = document.getElementById("inp-peserta-wa").value.trim();
      const tiket = document.getElementById("inp-peserta-tiket").value;
      const trans = document.getElementById("inp-peserta-trans").checked ? "Ya" : "Tidak";
      const catatan = document.getElementById("inp-peserta-catatan").value.trim();
      const rawUang = document.getElementById("inp-cepat-bayar").value.trim();
      const metode = document.getElementById("inp-cepat-metode").value;
      
      if (!idEvent || !namaSekolah || !namaKelas || !namaPeserta || !waPeserta || !rawUang) {
        alert("Lengkapi kolom bertanda bintang / pastikan Event dipilih!"); return;
      }
      
      const jumlahBayar = Number(rawUang) * 1000;
      showLoader(true);
      try {
        // 1. Dapatkan / Buat Sekolah
        const resSek = await fetchFromBackend({ action: 'upsertSekolah', payload: { nama_sekolah: namaSekolah } });
        const idSekolah = resSek.data.id_sekolah;
        
        // 2. Dapatkan / Buat Kelas
        const resKel = await fetchFromBackend({ 
          action: 'upsertKelas', 
          payload: { id_event: idEvent, id_sekolah: idSekolah, nama_class: namaKelas, penanggung_jawab: pjKelas } 
        });
        const idKelas = resKel.data.id_kelas;
        
        CURRENT_CONTEXT.id_event = idEvent;
        CURRENT_CONTEXT.id_sekolah = idSekolah;
        CURRENT_CONTEXT.id_kelas = idKelas;

        // 3. Simpan Peserta Baru
        const tglSekarang = new Date().toISOString();
        const resP = await fetchFromBackend({ 
          action: 'quickInsertPeserta', 
          payload: { 
            id_kelas: idKelas, 
            nama_peserta: namaPeserta, 
            whatsapp: waPeserta, 
            jenis_tiket: tiket, 
            opsi_trans: trans, 
            catatan: catatan,
            created_at: tglSekarang,
            tanggal_daftar: tglSekarang
          } 
        });

        // 4. PERBAIKAN: Catat Pembayaran DP ke Backend Google Apps Script!
        if (resP.data && resP.data.id_peserta && jumlahBayar > 0) {
          await fetchFromBackend({ 
            action: 'addPembayaran', 
            payload: { 
              id_peserta: resP.data.id_peserta, 
              jumlah_bayar: jumlahBayar, 
              metode: metode 
            } 
          });
        }
        
        // Refresh seluruh data aplikasi agar kalkulasi total di dashboard & sisa tagihan ter-update
        await initApp();

        // Reset Form Input
        document.getElementById("inp-peserta-nama").value = "";
        document.getElementById("inp-peserta-wa").value = "";
        document.getElementById("inp-peserta-catatan").value = "";
        document.getElementById("inp-cepat-bayar").value = "";
        
        alert("Data siswa & pembayaran DP berhasil tersimpan!");
        switchView('dashboard');
      } catch(e) { alert(e); } finally { showLoader(false); }
    });
  }

  const btnWaDetail = document.getElementById("btn-wa-detail");
  if(btnWaDetail) {
    btnWaDetail.addEventListener("click", () => {
      const p = APP_STATE.peserta.find(x => x.id_peserta == CURRENT_CONTEXT.id_peserta);
      if(!p) return;

      // Template pesan resmi STIFIn 2026 dengan Nama Peserta Otomatis
      const teksPesan = `Salam Sukses Mulia.. ✊

 *"Perubahan Hidup Butuh Perbedaan Tindakan, Tanpa perbedaan tindakan perubahan adalah omong kosong"*

*SELAMAT* ! 
${p.nama_peserta} Kamu Terdaftar di Acara Roadshow *EVENT EDUTAINMENT STIFIn 2026 Kabupaten Labuhan batu* diselenggarakan oleh STIFIn Genetic Cabang SUMUT. 
Bersama 
1. *Mis. Eliza Fazira, S.T* (Branch Manager STIFIn Genetic Indonesia) & 
2. *Mr. Saad Budiman Lubis, S.Pd.I., M.M.* (Trainer dan Motivator)

Untuk  Pembayaran selanjutnya di lakukan mulai besok dikumpul ke perwakilan Kelas.
Bagi peserta yg sudah Lunas akan segera langsung mendapatkan *E-TIKET (BARCODE)* 

Pembayaran bisa dilakukan secara langsung (cash) ke panitia atau lewat transfer :
1. Transfer ke Rekening 
         BSI : 
         7191133786
         M. Ikbal siregar

2. DANA 0823 7084 1566
3. Gopay 0823 7084 1566

Note :
_*Nama yang sudah terdaftar sudah di input, dan uang yang sudah masuk tidak bisa di tarik kembali*_

Terima Kasih🙏🏻☺️

Yuuk silahkan di Follow ya IG 👇🏻 :
@stifingenetic


#GerakanSadarPotensi
#Character
#SelaluAdaJalan
#stifingenetic`;
      
      let nomorFormatted = p.whatsapp.trim();
      if(nomorFormatted.startsWith("0")) nomorFormatted = "62" + nomorFormatted.slice(1);
      
      window.open(`whatsapp://send?phone=${nomorFormatted}&text=${encodeURIComponent(teksPesan)}`, '_blank');
  })
  }
  const btnBayarDetail = document.getElementById("btn-bayar-detail");
  if(btnBayarDetail) {
    btnBayarDetail.addEventListener("click", () => {
      document.getElementById("inp-modal-bayar").value = "";
      document.getElementById("modal-cicilan").style.display = "flex";
    });
  }

  const btnModalKirim = document.getElementById("btn-modal-kirim-online");
  if(btnModalKirim) {
    btnModalKirim.addEventListener("click", async () => {
      const nominalRaw = document.getElementById("inp-modal-bayar").value.trim();
      const metode = document.getElementById("inp-modal-metode").value;

      if(!nominalRaw || isNaN(nominalRaw) || Number(nominalRaw) <= 0) {
        alert("Masukkan nominal pembayaran yang valid!"); return;
      }

      tutupModalCicilan();
      showLoader(true);
      try {
        await fetchFromBackend({ action: 'addPembayaran', payload: { id_peserta: CURRENT_CONTEXT.id_peserta, jumlah_bayar: Number(nominalRaw) * 1000, metode: metode } });
        await initApp();
        switchView('detail-peserta', { id_peserta: CURRENT_CONTEXT.id_peserta });
        alert("Pembayaran Berhasil Dicatat!");
      } catch(err) { alert(err); } finally { showLoader(false); }
    });
  }

  const btnModalDraft = document.getElementById("btn-modal-draft-cicilan");
  if(btnModalDraft) btnModalDraft.addEventListener("click", simpanCicilanKeDraft);

  const btnHapusDetail = document.getElementById("btn-hapus-detail");
  if(btnHapusDetail) {
    btnHapusDetail.addEventListener("click", async () => {
      if(!confirm("Hapus data anak ini secara permanen?")) return;
      showLoader(true);
      try {
        await fetchFromBackend({ action: 'deletePeserta', payload: { id_peserta: CURRENT_CONTEXT.id_peserta } });
        await initApp();
        switchView('peserta', { id_kelas: CURRENT_CONTEXT.id_kelas });
        alert("Data sukses terhapus!");
      } catch(e) { alert(e); } finally { showLoader(false); }
    });
  }

  const btnSaveEditPeserta = document.getElementById("btn-save-edit-peserta");
  if(btnSaveEditPeserta) {
    btnSaveEditPeserta.addEventListener("click", async () => {
      showLoader(true);
      const payload = {
        id_peserta: CURRENT_CONTEXT.id_peserta,
        nama_peserta: document.getElementById("edit-peserta-nama").value.trim(),
        whatsapp: document.getElementById("edit-peserta-wa").value.trim(),
        jenis_tiket: document.getElementById("edit-peserta-tiket").value,
        catatan: document.getElementById("edit-peserta-catatan").value.trim()
      };
      try {
        await fetchFromBackend({ action: 'updatePeserta', payload: payload });
        await initApp();
        switchView('detail-peserta', { id_peserta: CURRENT_CONTEXT.id_peserta });
        alert("Profil siswa diperbarui!");
      } catch(e) { alert(e); } finally { showLoader(false); }
    });
  }
}

function tutupModalCicilan() {
  const modal = document.getElementById("modal-cicilan");
  if(modal) modal.style.display = "none";
}

function simpanCicilanKeDraft() {
  const nominalRaw = document.getElementById("inp-modal-bayar").value.trim();
  const metode = document.getElementById("inp-modal-metode").value;

  if(!nominalRaw || isNaN(nominalRaw) || Number(nominalRaw) <= 0) {
    alert("Masukkan nominal pembayaran yang valid!"); return;
  }

  const p = APP_STATE.peserta.find(x => x.id_peserta == CURRENT_CONTEXT.id_peserta);
  if(!p) { alert("Data peserta tidak ditemukan!"); return; }

  const payload = {
    tipe_draft: 'cicilan_saja',
    id_peserta: CURRENT_CONTEXT.id_peserta,
    nama_peserta: p.nama_peserta,
    nominal_dp: Number(nominalRaw) * 1000,
    metode_pembayaran: metode
  };

  let currentDrafts = JSON.parse(localStorage.getItem("offline_drafts")) || [];
  currentDrafts.push(payload);
  localStorage.setItem("offline_drafts", JSON.stringify(currentDrafts));

  tutupModalCicilan();
  alert(`📂 Mantap! Cicilan Rp${Number(nominalRaw)*1000} untuk ${p.nama_peserta} disimpan ke DRAFT OFFLINE.`);
  checkDraftQueue();
}

function simpanKeDraftOffline() {
  const evt = document.getElementById("inp-event").value;
  const sekolah = document.getElementById("inp-sekolah-nama").value.trim();
  const kelas = document.getElementById("inp-kelas-nama").value.trim();
  const pj = document.getElementById("inp-kelas-pj").value.trim();
  const nama = document.getElementById("inp-peserta-nama").value.trim();
  const wa = document.getElementById("inp-peserta-wa").value.trim();
  const tkt = document.getElementById("inp-peserta-tiket").value;
  const trans = document.getElementById("inp-peserta-trans").checked ? "Ya" : "Tidak";
  const cat = document.getElementById("inp-peserta-catatan").value.trim();
  const bayarRaw = document.getElementById("inp-cepat-bayar").value;
  const mtd = document.getElementById("inp-cepat-metode").value;

  if(!evt || !sekolah || !kelas || !pj || !nama || !wa || !bayarRaw) {
    alert("Data form belum lengkap, silakan cek kembali!"); return;
  }

  const tglSekarang = new Date().toISOString();
  const payload = {
    tipe_draft: 'peserta_baru',
    id_event: evt, nama_sekolah: sekolah, nama_kelas: kelas, pj_kelas: pj,
    nama_peserta: nama, whatsapp: wa, jenis_tiket: tkt, transportasi: trans,
    catatan: cat, nominal_dp: Number(bayarRaw) * 1000, metode_pembayaran: mtd,
    created_at: tglSekarang,
    tanggal_daftar: tglSekarang
  };

  let currentDrafts = JSON.parse(localStorage.getItem("offline_drafts")) || [];
  currentDrafts.push(payload);
  localStorage.setItem("offline_drafts", JSON.stringify(currentDrafts));

  document.getElementById("inp-peserta-nama").value = "";
  document.getElementById("inp-peserta-wa").value = "";
  document.getElementById("inp-cepat-bayar").value = "";
  document.getElementById("inp-peserta-catatan").value = "";
  document.getElementById("inp-peserta-nama").focus();

  alert(`📂 Mantap! Data ${nama} disimpan ke DRAFT OFFLINE.`);
  checkDraftQueue();
}

function checkDraftQueue() {
  const currentDrafts = JSON.parse(localStorage.getItem("offline_drafts")) || [];
  const boxDraftAlert = document.getElementById("box-draft-alert");
  const countDraft = document.getElementById("count-draft");

  if(currentDrafts.length > 0) {
    if(boxDraftAlert) boxDraftAlert.style.display = "block";
    if(countDraft) countDraft.innerText = currentDrafts.length;
  } else {
    if(boxDraftAlert) boxDraftAlert.style.display = "none";
  }
}

async function sinkronkanDraftOnline() {
  let currentDrafts = JSON.parse(localStorage.getItem("offline_drafts")) || [];
  if(currentDrafts.length === 0) return;

  if(!confirm(`Kirim ${currentDrafts.length} data draft ini ke Google Sheets?`)) return;

  showLoader(true);
  const totalData = currentDrafts.length;

  for(let i = 0; i < totalData; i++) {
    const dataToSend = currentDrafts[i];

    try {
      if(dataToSend.tipe_draft === 'cicilan_saja') {
        await fetchFromBackend({ 
          action: 'addPembayaran', 
          payload: { id_peserta: dataToSend.id_peserta, jumlah_bayar: dataToSend.nominal_dp, metode: dataToSend.metode_pembayaran } 
        });
      } else {
        const resSek = await fetchFromBackend({ action: 'upsertSekolah', payload: { nama_sekolah: dataToSend.nama_sekolah } });
        const idSekolah = resSek.data.id_sekolah;
        
        const resKel = await fetchFromBackend({ 
          action: 'upsertKelas', 
          payload: { id_event: dataToSend.id_event, id_sekolah: idSekolah, nama_class: dataToSend.nama_kelas, penanggung_jawab: dataToSend.pj_kelas } 
        });
        const idKelas = resKel.data.id_kelas;
        
        const tglDraft = dataToSend.created_at || new Date().toISOString();
        const resP = await fetchFromBackend({ 
          action: 'quickInsertPeserta', 
          payload: { 
            id_kelas: idKelas, 
            nama_peserta: dataToSend.nama_peserta, 
            whatsapp: dataToSend.whatsapp, 
            jenis_tiket: dataToSend.jenis_tiket, 
            opsi_trans: dataToSend.transportasi, 
            catatan: dataToSend.catatan,
            created_at: tglDraft,
            tanggal_daftar: tglDraft
          } 
        });
        
        if (resP.data && resP.data.id_peserta) {
          await fetchFromBackend({ 
            action: 'addPembayaran', 
            payload: { id_peserta: resP.data.id_peserta, jumlah_bayar: dataToSend.nominal_dp, metode: dataToSend.metode_pembayaran } 
          });
        }
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      showLoader(false);
      alert(`🚨 Error saat mengirim ${dataToSend.nama_peserta || 'data'}. Sisa data aman.`);
      const remainingDrafts = currentDrafts.slice(i);
      localStorage.setItem("offline_drafts", JSON.stringify(remainingDrafts));
      checkDraftQueue();
      return;
    }
  }

  localStorage.removeItem("offline_drafts");
  await initApp(); 
  checkDraftQueue();
  alert("🚀 Berhasil! Semua data draft offline telah disinkronkan ke Google Sheets!");
}

async function initApp() {
  showLoader(true);
  try {
    const response = await fetchFromBackend({ action: 'getAllData' });
    if (response.status === 'success') {
      APP_STATE = response.data;
      renderDashboard();
      populateEventDropdown();
      populateSekolahDatalist();
      populateCetakFilterSekolah();
    }
  } catch (err) {
    console.error("Gagal sinkronisasi data:", err);
  } finally {
    showLoader(false);
  }
}

async function fetchFromBackend(payload) {
  try {
    const response = await fetch(API_URL, { method: "POST", body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const result = await response.json();
    if (result.status === 'error') throw new Error(result.message);
    return result;
  } catch (e) {
    alert(`🚨 [SYSTEM LOG ERROR]\nTindakan: ${payload.action}\nPenyebab: ${e.toString()}`);
    return { status: 'error', message: e.toString() };
  }
}

function showLoader(show) {
  const loader = document.getElementById("loader");
  if(loader) loader.style.display = show ? "flex" : "none";
}

function switchView(viewName, contextParams = {}) {
  CURRENT_CONTEXT.view = viewName;
  Object.assign(CURRENT_CONTEXT, contextParams);
  
  const headerActions = document.getElementById("header-actions");
  if (headerActions) headerActions.innerHTML = "";
  
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const targetView = document.getElementById(`view-${viewName}`);
  if(targetView) targetView.classList.add('active');
  
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  const titleEl = document.getElementById("header-title");
  
  switch(viewName) {
    case 'dashboard':
      if(titleEl) titleEl.innerText = "Dashboard";
      if(document.querySelectorAll('.nav-item')[0]) document.querySelectorAll('.nav-item')[0].classList.add('active');
      renderDashboard();
      break;
    case 'lunas-filter':
      if(titleEl) titleEl.innerText = "Detail Peserta Lunas";
      filterDanRenderLunas('Reguler');
      break;
    case 'event':
      if(titleEl) titleEl.innerText = "Daftar Event";
      if(document.querySelectorAll('.nav-item')[1]) document.querySelectorAll('.nav-item')[1].classList.add('active');
      if (headerActions) headerActions.innerHTML = `<button class="btn-add-header" onclick="openFormEvent()">+ Tambah</button>`;
      renderEventList();
      break;
    case 'sekolah':
      if(titleEl) titleEl.innerText = getEventName(CURRENT_CONTEXT.id_event);
      renderSekolahList();
      break;
    case 'kelas':
      if(titleEl) titleEl.innerText = getSekolahName(CURRENT_CONTEXT.id_sekolah);
      renderKelasList();
      break;
    case 'peserta':
      if(titleEl) titleEl.innerText = getKelasName(CURRENT_CONTEXT.id_kelas);
      if (headerActions) headerActions.innerHTML = `<button class="btn-add-header" onclick="triggerCetakLangsung()">🖨️ Cetak</button>`;
      renderPesertaList();
      break;
    case 'detail-peserta':
      if(titleEl) titleEl.innerText = "Profil Peserta";
      renderDetailPeserta();
      break;
    case 'input-cepat':
      if(titleEl) titleEl.innerText = "Mode Input Cepat";
      if(document.querySelectorAll('.nav-item')[2]) document.querySelectorAll('.nav-item')[2].classList.add('active');
      break;
    case 'menu-cetak':
      if(titleEl) titleEl.innerText = "Menu Cetak Formulir";
      if(document.querySelectorAll('.nav-item')[3]) document.querySelectorAll('.nav-item')[3].classList.add('active');
      populateCetakFilterSekolah();
      break;
  }
}

function formatRupiah(num) { return "Rp" + Number(num || 0).toLocaleString('id-ID'); }

// --- FORMAT KHUSUS UNTUK CETAK DP (Tanpa Rp & Tanpa Ribuan .000) ---
function formatNominalCetak(num) {
  const val = Number(num || 0);
  if (val <= 0) return "";
  // Contoh: 50000 menjadi "50"
  return Math.floor(val / 1000).toString();
}

function formatTanggalBersih(dateStr) {
  if(!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if(isNaN(d.getTime())) return dateStr.split("T")[0];
    return d.toISOString().split('T')[0];
  } catch(e) { return dateStr.split("T")[0]; }
}

function getEventName(id) { 
  if(!APP_STATE.events) return "Detail Event";
  const x = APP_STATE.events.find(e => e.id_event == id); 
  return x ? x.nama_event : "Detail Event"; 
}
function getSekolahName(id) { 
  if(!APP_STATE.sekolah) return "Detail Sekolah";
  const x = APP_STATE.sekolah.find(s => s.id_sekolah == id); 
  return x ? x.nama_sekolah : "Detail Sekolah"; 
}
function getKelasName(id) { 
  if(!APP_STATE.kelas) return "Detail Kelas";
  const x = APP_STATE.kelas.find(k => k.id_kelas == id); 
  return x ? x.nama_class || x.nama_kelas : "Detail Kelas"; 
}

function renderDashboard() {
  let totalMasuk = 0, totalSisa = 0, vip = 0, reguler = 0, lunas = 0, cicil = 0;
  if (APP_STATE.peserta && Array.isArray(APP_STATE.peserta)) {
    APP_STATE.peserta.forEach(p => {
      totalMasuk += Number(p.tot_dibayar || 0);
      totalSisa += Number(p.sis_tagihan || 0);
      if (p.jenis_tiket === 'VIP') vip++; else reguler++;
      if (p.status_bayar === 'Lunas') lunas++; else cicil++;
    });
  }
  
  const elUangMasuk = document.getElementById("dash-uang-masuk");
  const elSisaTagihan = document.getElementById("dash-sisa-tagihan");
  const elPeserta = document.getElementById("dash-peserta");
  const elLunas = document.getElementById("dash-lunas");
  const elReguler = document.getElementById("dash-reguler");
  const elVip = document.getElementById("dash-vip");
  const elCicil = document.getElementById("dash-cicil");

  if(elUangMasuk) elUangMasuk.innerText = formatRupiah(totalMasuk);
  if(elSisaTagihan) elSisaTagihan.innerText = formatRupiah(totalSisa);
  if(elPeserta) elPeserta.innerText = APP_STATE.peserta ? APP_STATE.peserta.length : 0;
  if(elLunas) elLunas.innerText = lunas;
  if(elReguler) elReguler.innerText = reguler;
  if(elVip) elVip.innerText = vip;
  if(elCicil) elCicil.innerText = cicil;
}

function filterDanRenderLunas(jenisTiket) {
  const btnReg = document.getElementById("btn-filter-lunas-reguler");
  const btnVip = document.getElementById("btn-filter-lunas-vip");
  if(btnReg && btnVip) {
    if(jenisTiket === 'Reguler') {
      btnReg.style.background = "#0284c7"; btnReg.style.color = "#fff";
      btnVip.style.background = "#faf5ff"; btnVip.style.color = "#6b21a8";
    } else {
      btnVip.style.background = "#7e22ce"; btnVip.style.color = "#fff";
      btnReg.style.background = "#e0f2fe"; btnReg.style.color = "#0369a1";
    }
  }

  const container = document.getElementById("list-lunas-filtered-container");
  const titleEl = document.getElementById("title-list-lunas");
  if(!container || !APP_STATE.peserta) return;
  const dataDitemukan = APP_STATE.peserta.filter(p => p.status_bayar === 'Lunas' && p.jenis_tiket === jenisTiket);
  
  if(titleEl) titleEl.innerText = `Menampilkan ${dataDitemukan.length} Peserta Lunas (${jenisTiket})`;
  container.innerHTML = dataDitemukan.length === 0 ? `<p style="padding:12px; color:var(--text-secondary);">Tidak ada peserta ${jenisTiket} yang lunas.</p>` : "";
  
  dataDitemukan.forEach(p => {
    const card = document.createElement("div");
    card.className = "card-list";
    card.onclick = () => switchView('detail-peserta', { id_peserta: p.id_peserta });
    card.innerHTML = `<div class="card-title">👦 ${p.nama_peserta}</div><div class="card-sub"><span>📱 ${p.whatsapp}</span><span class="badge badge-lunas">LUNAS</span></div>`;
    container.appendChild(card);
  });
}

function renderEventList() {
  const container = document.getElementById("list-event-container");
  if(!container) return;
  container.innerHTML = (!APP_STATE.events || APP_STATE.events.length === 0) ? "<p style='padding:12px;'>Belum ada event resmi.</p>" : "";
  
  APP_STATE.events.forEach(e => {
    const card = document.createElement("div");
    card.className = "card-list";
    card.innerHTML = `
      <div onclick="switchView('sekolah', { id_event: '${e.id_event}' })" style="width:70%; cursor:pointer;">
        <div class="card-title">📅 ${e.nama_event}</div>
        <div class="card-sub"><span>📍 ${e.lokasi} | 🗓️ ${formatTanggalBersih(e.tanggal)}</span></div>
      </div>
      <div style="position:absolute; right:12px; top:16px; z-index:5;">
        <button class="btn-action-mini" onclick="editEventAktif('${e.id_event}', '${e.nama_event}', '${formatTanggalBersih(e.tanggal)}', '${e.lokasi}')">✏️</button>
        <button class="btn-action-mini" style="color:var(--danger);" onclick="hapusEventAktif('${e.id_event}')">🗑️</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function openFormEvent() {
  document.getElementById("form-event-title").innerText = "Buat Event Baru";
  document.getElementById("inp-evt-id").value = "";
  document.getElementById("inp-evt-nama").value = "";
  document.getElementById("inp-evt-tanggal").value = "";
  document.getElementById("inp-evt-lokasi").value = "";
  document.getElementById('form-event-baru').style.display = 'block';
}

function editEventAktif(id, nama, tgl, lokasi) {
  document.getElementById("form-event-title").innerText = "Edit Info Event";
  document.getElementById("inp-evt-id").value = id;
  document.getElementById("inp-evt-nama").value = nama;
  document.getElementById("inp-evt-tanggal").value = tgl;
  document.getElementById("inp-evt-lokasi").value = lokasi;
  document.getElementById('form-event-baru').style.display = 'block';
}

async function hapusEventAktif(id) {
  if(!confirm("Hapus event ini secara permanen dari database?")) return;
  showLoader(true);
  try {
    await fetchFromBackend({ action: 'deleteEvent', payload: { id_event: id } });
    await initApp();
    switchView('event');
    alert("Event terhapus!");
  } catch(e) { alert(e); } finally { showLoader(false); }
}

function renderSekolahList() {
  const container = document.getElementById("list-sekolah-container");
  if(!container) return; container.innerHTML = "";
  const kelasDiEvent = APP_STATE.kelas.filter(k => k.id_event == CURRENT_CONTEXT.id_event);
  const idSekolahUnik = [...new Set(kelasDiEvent.map(k => k.id_sekolah))];
  
  if(idSekolahUnik.length === 0) { container.innerHTML = "<p style='padding:12px;'>Belum ada sekolah terdaftar di event ini.</p>"; return; }
  idSekolahUnik.forEach(idSek => {
    const sek = APP_STATE.sekolah.find(s => s.id_sekolah == idSek);
    if (!sek) return;
    const kelasSekolah = kelasDiEvent.filter(k => k.id_sekolah == idSek);
    let totalP = 0;
    kelasSekolah.forEach(k => { totalP += APP_STATE.peserta.filter(p => p.id_kelas == k.id_kelas).length; });
    
    const card = document.createElement("div");
    card.className = "card-list";
    card.onclick = () => switchView('kelas', { id_sekolah: idSek });
    card.innerHTML = `<div class="card-title">🏫 ${sek.nama_sekolah}</div><div class="card-sub"><span>${kelasSekolah.length} Kelas | ${totalP} Siswa</span></div>`;
    container.appendChild(card);
  });
}

function renderKelasList() {
  const container = document.getElementById("list-kelas-container");
  if(!container) return; container.innerHTML = "";
  const kelasFiltered = APP_STATE.kelas.filter(k => k.id_event == CURRENT_CONTEXT.id_event && k.id_sekolah == CURRENT_CONTEXT.id_sekolah);
  
  kelasFiltered.forEach(k => {
    const totalP = APP_STATE.peserta.filter(p => p.id_kelas == k.id_kelas).length;
    const card = document.createElement("div");
    card.className = "card-list";
    card.onclick = () => switchView('peserta', { id_kelas: k.id_kelas });
    
    const namaKelasText = k.nama_class || k.nama_kelas || "Tanpa Nama Kelas";
    const pjText = k.penanggung_jawab ? ` | PJ: ${k.penanggung_jawab}` : "";
    card.innerHTML = `<div class="card-title">🚪 Kelas ${namaKelasText}</div><div class="card-sub"><span>Total: ${totalP} Peserta${pjText}</span></div>`;
    container.appendChild(card);
  });
}

// --- UPDATE RENDER PESERTA LIST (Menambahkan Tanggal Daftar pada Card) ---
function renderPesertaList() {
  const container = document.getElementById("list-peserta-container");
  if(!container) return; container.innerHTML = "";
  const pesertaFiltered = APP_STATE.peserta.filter(p => p.id_kelas == CURRENT_CONTEXT.id_kelas);
  
  if(pesertaFiltered.length === 0) { container.innerHTML = "<p style='padding:12px;'>Belum ada siswa di kelas ini.</p>"; return; }
  pesertaFiltered.forEach(p => {
    const card = document.createElement("div");
    card.className = "card-list";
    card.onclick = () => switchView('detail-peserta', { id_peserta: p.id_peserta });
    
    const sisaTagihanFix = Number(p.sis_tagihan || 0);
    const statusFix = sisaTagihanFix <= 0 ? 'LUNAS' : 'DP';
    const badgeClass = statusFix === 'LUNAS' ? 'badge-lunas' : 'badge-dp';

    // Tanggal pendaftaran (ambil dari created_at / tanggal_daftar / tanggal)
    const tglDaftar = p.created_at || p.tanggal_daftar || p.tanggal || null;
    const tglTeks = tglDaftar ? formatTanggalLengkap(tglDaftar) : "Tanggal tidak tercatat";

    card.innerHTML = `
      <div class="card-title">👦 ${p.nama_peserta}</div>
      <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 6px;">📅 Daftar: ${tglTeks}</div>
      <div class="card-sub">
        <span>Tiket: ${p.jenis_tiket} | Sisa: ${formatRupiah(sisaTagihanFix)}</span>
        <span class="badge ${badgeClass}">${statusFix}</span>
      </div>
    `;
    container.appendChild(card);
  });
}

function bukaFormEditPeserta() {
  const p = APP_STATE.peserta.find(x => x.id_peserta == CURRENT_CONTEXT.id_peserta);
  if(!p) return;
  
  document.getElementById("edit-peserta-nama").value = p.nama_peserta;
  document.getElementById("edit-peserta-wa").value = p.whatsapp;
  document.getElementById("edit-peserta-tiket").value = p.jenis_tiket;
  document.getElementById("edit-peserta-catatan").value = p.catatan || "";
  
  switchView('edit-peserta-form');
}

// --- UPDATE RENDER DETAIL PESERTA (Menampilkan Tanggal + Tenggat Waktu) ---
function renderDetailPeserta() {
  const p = APP_STATE.peserta.find(x => x.id_peserta == CURRENT_CONTEXT.id_peserta);
  const container = document.getElementById("detail-peserta-container");
  if (!p || !container) return;
  
  const sisaTagihanFix = Number(p.sis_tagihan || 0);
  const totalBayar = Number(p.tot_dibayar || 0);
  const hargaWajib = hitungHargaTotalTiket(p.jenis_tiket, p.opsi_trans);
  
  const statusFix = sisaTagihanFix <= 0 ? 'LUNAS' : 'DP';
  const badgeClass = statusFix === 'LUNAS' ? 'badge-lunas' : 'badge-dp';

  // Format tanggal terdaftar & deadline 3 minggu
  const tglDaftarRaw = p.created_at || p.tanggal_daftar || p.tanggal || null;
  const tglDaftarTeks = formatTanggalLengkap(tglDaftarRaw);
  const deadlineTeks = hitungTenggatWaktu(tglDaftarRaw);

  // Status/tampilan khusus jika lunas vs belum lunas
  const infoTenggat = statusFix === 'LUNAS' 
    ? `<div style="color: var(--success); font-weight: 700;">✅ Pembayaran Sudah Lunas</div>`
    : `<div class="deadline-box">⏰ <b>Tenggat Pelunasan (3 Minggu):</b> <span style="color: var(--warning); font-weight: 800;">${deadlineTeks}</span></div>`;

  container.innerHTML = `
    <div style="background:var(--surface); padding:18px; border-radius:12px; border:1px solid var(--border); display:flex; flex-direction:column; gap:8px;">
      <h2 style="color:var(--primary); border-bottom:2px solid var(--background); padding-bottom:8px;">${p.nama_peserta}</h2>
      <div><span style="font-weight:600; color:var(--text-secondary);">🗓️ Tanggal Terdaftar:</span> ${tglDaftarTeks}</div>
      ${infoTenggat}
      <hr style="border: 0; border-top: 1px dashed var(--border); margin: 6px 0;">
      <div><span style="font-weight:600; color:var(--text-secondary);">No WhatsApp:</span> ${p.whatsapp}</div>
      <div><span style="font-weight:600; color:var(--text-secondary);">Jenis Tiket:</span> ${p.jenis_tiket}</div>
      <div><span style="font-weight:600; color:var(--text-secondary);">Opsi Transportasi:</span> ${p.opsi_trans === "Ya" || p.opsi_trans === true || p.opsi_trans === "true" ? '✅ Ya (+20rb)' : '❌ Tidak'}</div>
      <div><span style="font-weight:600; color:var(--text-secondary);">Total Tagihan Wajib:</span> ${formatRupiah(hargaWajib)}</div>
      <div><span style="font-weight:600; color:var(--text-secondary);">Total Sudah Dibayar:</span> ${formatRupiah(totalBayar)}</div>
      <div><span style="font-weight:600; color:var(--text-secondary);">Catatan:</span> ${p.catatan || '-'}</div>
      <div style="margin-top:10px; padding-top:10px; border-top:1px dashed var(--border); display:flex; justify-content:space-between; align-items:center;">
        <div>Status: <span class="badge ${badgeClass}">${statusFix}</span></div>
        <div style="text-align:right;">Sisa Tagihan:<br><b style="font-size:1.1rem; color:var(--danger);">${formatRupiah(sisaTagihanFix)}</b></div>
      </div>
    </div>
  `;
}

// --- LOGIKA POPULATE DAN FILTER CETAK DUAL FORMULIR ---
function populateCetakFilterSekolah() {
  const selSekKiri = document.getElementById("cetak-sekolah-kiri");
  const selSekKanan = document.getElementById("cetak-sekolah-kanan");
  const selKelKiri = document.getElementById("cetak-kelas-kiri");
  const selKelKanan = document.getElementById("cetak-kelas-kanan");

  if (!selSekKiri || !selSekKanan) return;

  let optionsHTML = `<option value="">-- Kosongkan --</option>`;
  if (APP_STATE.sekolah && APP_STATE.sekolah.length > 0) {
    APP_STATE.sekolah.forEach(s => {
      optionsHTML += `<option value="${s.id_sekolah}">${s.nama_sekolah}</option>`;
    });
  }

  selSekKiri.innerHTML = optionsHTML;
  selSekKanan.innerHTML = optionsHTML;

  selKelKiri.innerHTML = `<option value="">-- Pilih Sekolah Terlebih Dahulu --</option>`;
  selKelKanan.innerHTML = `<option value="">-- Pilih Sekolah Terlebih Dahulu --</option>`;
  selKelKiri.disabled = true;
  selKelKanan.disabled = true;
}

function onCetakSekolahChange(sisi) {
  const idSekolah = document.getElementById(`cetak-sekolah-${sisi}`).value;
  const selKel = document.getElementById(`cetak-kelas-${sisi}`);

  if (!selKel) return;

  if (!idSekolah) {
    selKel.innerHTML = `<option value="">-- Kosongkan --</option>`;
    selKel.disabled = true;
    return;
  }

  // Filter kelas dengan mengonversi kedua ID ke String agar pencocokan 100% akurat
  const kelasFiltered = APP_STATE.kelas.filter(k => String(k.id_sekolah) === String(idSekolah));

  if (kelasFiltered && kelasFiltered.length > 0) {
    let htmlOptions = `<option value="">-- Pilih Kelas --</option>`;
    
    kelasFiltered.forEach(k => {
      const namaClass = k.nama_class || k.nama_kelas || "Tanpa Nama";
      htmlOptions += `<option value="${k.id_kelas}">${namaClass}</option>`;
    });

    selKel.innerHTML = htmlOptions;
    selKel.disabled = false;
  } else {
    selKel.innerHTML = `<option value="">-- Tidak ada kelas di sekolah ini --</option>`;
    selKel.disabled = true;
  }
}

// Fungsi Render Satu Form (Kiri / Kanan)
function renderSatuFormulir(idKelas, containerClass) {
  const isLeft = containerClass.includes("left");
  const tbody = document.querySelector(`.${containerClass}`);
  const parentForm = tbody ? tbody.closest(".print-form-half") : null;

  if (!tbody || !parentForm) return;

  const sekolahVal = parentForm.querySelector(".print-sekolah-val");
  const kelasVal = parentForm.querySelector(".print-kelas-val");
  const pjVal = parentForm.querySelector(".print-pj-val");

  tbody.innerHTML = "";

  // Jika tidak ada kelas dipilih, kosongkan formulir
  if (!idKelas) {
    if (sekolahVal) sekolahVal.innerText = "-";
    if (kelasVal) kelasVal.innerText = "-";
    if (pjVal) pjVal.innerText = "-";

    for (let i = 0; i < 20; i++) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="col-no">${i + 1}</td>
        <td class="col-nama"></td>
        <td class="col-tiket"></td>
        <td class="col-dp"></td>
      `;
      tbody.appendChild(tr);
    }
    return;
  }

  // Jika kelas dipilih
  const k = APP_STATE.kelas.find(x => x.id_kelas == idKelas);
  const s = APP_STATE.sekolah.find(x => x.id_sekolah == (k ? k.id_sekolah : null));
  const pesertaFiltered = APP_STATE.peserta.filter(p => p.id_kelas == idKelas);

  if (sekolahVal) sekolahVal.innerText = s ? s.nama_sekolah : "-";
  if (kelasVal) kelasVal.innerText = k ? (k.nama_class || k.nama_kelas || "-") : "-";
  if (pjVal) pjVal.innerText = k ? (k.penanggung_jawab || "-") : "-";

  for (let i = 0; i < 20; i++) {
    const p = pesertaFiltered[i];
    const tr = document.createElement("tr");

    if (p) {
      tr.innerHTML = `
        <td class="col-no">${i + 1}</td>
        <td class="col-nama">${p.nama_peserta}</td>
        <td class="col-tiket">${p.jenis_tiket || '-'}</td>
        <td class="col-dp">${formatNominalCetak(p.tot_dibayar)}</td>
      `;
    } else {
      tr.innerHTML = `
        <td class="col-no">${i + 1}</td>
        <td class="col-nama"></td>
        <td class="col-tiket"></td>
        <td class="col-dp"></td>
      `;
    }
    tbody.appendChild(tr);
  }
}

function triggerEksekusiCetak() {
  const idKelasKiri = document.getElementById("cetak-kelas-kiri").value;
  const idKelasKanan = document.getElementById("cetak-kelas-kanan").value;

  if (!idKelasKiri && !idKelasKanan) {
    alert("Pilih minimal 1 kelas (di kiri atau kanan) untuk dicetak!");
    return;
  }

  renderSatuFormulir(idKelasKiri, "print-table-body-left");
  renderSatuFormulir(idKelasKanan, "print-table-body-right");

  window.print();
}

function triggerCetakLangsung() {
  if (CURRENT_CONTEXT.id_kelas) {
    // Jika cetak langsung dari view daftar kelas, pasang di formulir kiri dan kosongkan kanan
    renderSatuFormulir(CURRENT_CONTEXT.id_kelas, "print-table-body-left");
    renderSatuFormulir(null, "print-table-body-right");
    window.print();
  }
}

function populateEventDropdown() {
  const select = document.getElementById("inp-event");
  if(!select) return; select.innerHTML = "";
  if(APP_STATE.events && APP_STATE.events.length > 0) {
    APP_STATE.events.forEach(e => { select.innerHTML += `<option value="${e.id_event}">${e.nama_event}</option>`; });
  } else {
    select.innerHTML = `<option value="">-- Belum Ada Event --</option>`;
  }
}

function populateSekolahDatalist() {
  const dl = document.getElementById("list-saran-sekolah");
  if(!dl) return; dl.innerHTML = "";
  if(APP_STATE.sekolah) {
    APP_STATE.sekolah.forEach(s => { dl.innerHTML += `<option value="${s.nama_sekolah}"></option>`; });
  }
}