/* ==========================================================
   VIVIDLENS - Menu "Status Edit" (patch untuk index.html)
   Dimuat SETELAH script utama di index.html.
   Status disimpan di Supabase (tabel clients) dan dibaca pay.html.
   ========================================================== */
(function () {
    const EDIT_MAX_DAYS = 10;
    let cachedEditClients = [];

    // ---------- Helper ----------
    function dateToISO(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    function parseISOLocal(iso) {
        const [y, m, d] = String(iso).split('-').map(Number);
        return new Date(y, m - 1, d);
    }
    function formatTglID(d) {
        return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    function findSheetClientByName(nama) {
        const key = (nama || '').toLowerCase().trim();
        return (typeof cachedClients !== 'undefined' ? cachedClients : []).find(s => s.nama && s.nama.toLowerCase().trim() === key);
    }

    // ---------- Suntik tombol tab + section ke halaman ----------
    function injectUI() {
        const trackerBtn = document.getElementById('tabTrackerBtn');
        if (trackerBtn && !document.getElementById('tabEditBtn')) {
            trackerBtn.insertAdjacentHTML('afterend', `
                <button id="tabEditBtn" onclick="switchMode('edit')" class="flex-1 sm:flex-none py-2 px-3 text-slate-600 hover:text-slate-900 font-bold text-xs rounded-lg transition flex items-center justify-center gap-1.5 active:scale-95 whitespace-nowrap">
                    <i class="fa-solid fa-wand-magic-sparkles text-[11px]"></i> Status Edit
                    <span id="badgeEditCount" class="bg-purple-600 text-white text-[9px] px-1.5 py-0.2 rounded-full font-bold hidden">0</span>
                </button>`);
        }

        const payFg = document.getElementById('sectionPaymentFg');
        if (payFg && !document.getElementById('sectionEdit')) {
            payFg.insertAdjacentHTML('beforebegin', `
                <div id="sectionEdit" class="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm max-w-4xl mx-auto space-y-4 hidden">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-3">
                        <div>
                            <h3 class="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                                <i class="fa-solid fa-wand-magic-sparkles text-purple-600"></i> Status Edit Foto
                            </h3>
                            <p class="text-[11px] sm:text-xs text-slate-500 mt-0.5">Klik Proses Edit setelah klien kirim list foto. Deadline maks. 10 hari, status otomatis berubah di portal klien.</p>
                        </div>
                        <div class="flex items-center gap-2 w-full sm:w-auto">
                            <select id="filterEditStatus" onchange="renderEditList()" class="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none cursor-pointer flex-1 sm:flex-none">
                                <option value="all">Semua</option>
                                <option value="siap">Siap Diproses</option>
                                <option value="proses">Sedang Diedit</option>
                                <option value="selesai">Selesai</option>
                            </select>
                            <button onclick="fetchEditClients(true)" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-3 py-1.5 rounded-xl transition whitespace-nowrap">
                                <i class="fa-solid fa-arrows-rotate mr-1"></i> Refresh
                            </button>
                        </div>
                    </div>
                    <div id="editListContainer" class="space-y-3">
                        <div class="p-8 text-center text-slate-400 text-xs">Memuat data edit...</div>
                    </div>
                </div>`);
        }
    }

    // ---------- Bar garis deadline ----------
    function editDeadlineBar(daysLeft) {
        const late = daysLeft < 0;
        const dayNo = Math.min(EDIT_MAX_DAYS, Math.max(1, EDIT_MAX_DAYS - daysLeft));
        const pct = late ? 100 : Math.round(dayNo / EDIT_MAX_DAYS * 100);
        const color = late ? '#e11d48' : (daysLeft <= 3 ? '#d97706' : '#7c3aed');
        const label = late
            ? `Lewat ${Math.abs(daysLeft)} hari dari deadline`
            : (daysLeft === 0 ? 'Hari ke-10 · jatuh tempo hari ini' : `Hari ke-${dayNo} dari ${EDIT_MAX_DAYS} · sisa ${daysLeft} hari`);
        return `
            <div>
                <div class="flex justify-between text-[10px] mb-1 gap-2">
                    <span class="text-slate-500 font-semibold">Progres deadline</span>
                    <b style="color:${color}" class="text-right">${label}</b>
                </div>
                <div class="relative h-2.5 rounded-full bg-slate-200 overflow-hidden">
                    <div class="h-full rounded-full" style="width:${pct}%;background:${color}"></div>
                    <div class="absolute inset-0" style="background:repeating-linear-gradient(90deg,transparent 0,transparent calc(10% - 1px),#f8fafc calc(10% - 1px),#f8fafc 10%)"></div>
                </div>
            </div>`;
    }

    // ---------- Ambil data ----------
    async function fetchEditClients(showToastNotice) {
        if (typeof supabaseGalleryClient === 'undefined' || !supabaseGalleryClient) return;
        const container = document.getElementById('editListContainer');
        try {
            const { data, error } = await supabaseGalleryClient
                .from('clients')
                .select('*')
                .or('status_selection.eq.submitted,edit_status.not.is.null')
                .order('created_at', { ascending: false });
            if (error) throw error;
            cachedEditClients = data || [];
            renderEditList();
            if (showToastNotice) showToast(`Memuat ${cachedEditClients.length} klien`);
        } catch (err) {
            if (container) container.innerHTML = `<div class="p-6 text-center text-rose-500 text-xs italic">Gagal memuat: ${err.message}</div>`;
        }
    }

    // ---------- Render daftar ----------
    function renderEditList() {
        const container = document.getElementById('editListContainer');
        if (!container) return;
        const filter = document.getElementById('filterEditStatus').value;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const items = cachedEditClients.map(c => {
            const st = (c.edit_status || '').toUpperCase();
            const state = st === 'SELESAI' ? 'selesai' : (st === 'PROSES' ? 'proses' : 'siap');
            let deadline = null, daysLeft = null;
            if (state === 'proses' && c.edit_deadline) {
                deadline = parseISOLocal(c.edit_deadline);
                daysLeft = Math.round((deadline - today) / 86400000);
            }
            return { ...c, state, deadline, daysLeft };
        });

        const badge = document.getElementById('badgeEditCount');
        const siapCount = items.filter(i => i.state === 'siap').length;
        if (badge) {
            badge.textContent = siapCount;
            badge.classList.toggle('hidden', siapCount === 0);
        }

        const order = { proses: 0, siap: 1, selesai: 2 };
        const list = items.filter(i => filter === 'all' || i.state === filter);
        list.sort((a, b) => (order[a.state] - order[b.state]) || ((a.daysLeft ?? 999) - (b.daysLeft ?? 999)));

        if (list.length === 0) {
            container.innerHTML = `
                <div class="p-8 bg-slate-50 border border-slate-100 rounded-2xl text-center space-y-2">
                    <i class="fa-solid fa-wand-magic-sparkles text-3xl text-slate-300"></i>
                    <p class="font-bold text-xs sm:text-sm text-slate-700">Belum ada klien di kategori ini</p>
                    <p class="text-[11px] text-slate-400">Klien muncul di sini setelah mengirim list foto pilihan.</p>
                </div>`;
            return;
        }

        container.innerHTML = list.map(c => {
            const sheet = findSheetClientByName(c.nama);
            const isLunas = sheet ? (sheet.payment || '').toUpperCase().trim() === 'LUNAS' : null;
            let stateBadge = '', extra = '', actions = '', border = 'border-slate-200';

            if (c.state === 'siap') {
                stateBadge = '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Siap Diproses</span>';
                actions = `<button onclick="setEditStatus('${c.slug}','PROSES')" class="py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-sm active:scale-95"><i class="fa-solid fa-wand-magic-sparkles"></i> Proses Edit</button>`;
            } else if (c.state === 'proses') {
                stateBadge = '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">Sedang Diedit</span>';
                if (c.deadline) {
                    const late = c.daysLeft < 0;
                    const cls = late ? 'bg-rose-100 text-rose-700' : (c.daysLeft <= 3 ? 'bg-amber-100 text-amber-800' : 'bg-purple-100 text-purple-800');
                    const sisa = late ? `terlambat ${Math.abs(c.daysLeft)} hari` : (c.daysLeft === 0 ? 'jatuh tempo hari ini' : `sisa ${c.daysLeft} hari`);
                    if (late) border = 'border-rose-300';
                    extra = `<div class="text-[11px] font-bold px-3 py-2 rounded-xl ${cls}"><i class="fa-solid fa-hourglass-half mr-1"></i> Deadline maks. ${EDIT_MAX_DAYS} hari: ${formatTglID(c.deadline)} • ${sisa}</div>${editDeadlineBar(c.daysLeft)}`;
                } else {
                    extra = '<div class="text-[11px] font-bold px-3 py-2 rounded-xl bg-purple-100 text-purple-800">Deadline belum diset</div>';
                }
                actions = `
                    <button onclick="setEditStatus('${c.slug}','SELESAI')" class="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-sm active:scale-95"><i class="fa-solid fa-flag-checkered"></i> Tandai Selesai</button>
                    <button onclick="setEditStatus('${c.slug}','RESET')" class="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition">Batalkan</button>`;
            } else {
                stateBadge = '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800"><i class="fa-solid fa-check mr-1"></i> Selesai</span>';
                border = 'border-emerald-200';
                extra = `<div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 leading-relaxed">🎉 <b>Selamat!</b> Editing ${c.nama} sudah selesai. Terima kasih atas kerja kerasnya, tim VividLens! 🤍</div>`;
                actions = `<button onclick="setEditStatus('${c.slug}','RESET')" class="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition">Reset Status</button>`;
            }

            return `
                <div class="p-4 bg-slate-50 border ${border} rounded-2xl space-y-3">
                    <div class="flex flex-wrap items-center gap-1.5">
                        ${stateBadge}
                        ${isLunas === false ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">Belum Lunas</span>' : ''}
                        ${isLunas === true ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Lunas</span>' : ''}
                    </div>
                    <div>
                        <h4 class="font-bold text-sm sm:text-base text-slate-900">${c.nama}</h4>
                        <p class="text-xs text-slate-500 font-medium">${c.univ || 'Umum'} • Sesi: ${c.tanggal || '-'} • Kuota: ${c.limit_foto || 35} foto</p>
                    </div>
                    ${extra}
                    <div class="flex flex-wrap gap-2">${actions}</div>
                </div>`;
        }).join('');
    }

    // ---------- Ubah status ----------
    async function setEditStatus(slug, status) {
        if (typeof supabaseGalleryClient === 'undefined' || !supabaseGalleryClient) return alert('Koneksi Supabase belum siap!');
        const c = cachedEditClients.find(x => x.slug === slug);
        if (!c) return;

        let update = {};
        if (status === 'PROSES') {
            const sheet = findSheetClientByName(c.nama);
            if (sheet && (sheet.payment || '').toUpperCase().trim() !== 'LUNAS') {
                if (!confirm(`${c.nama} belum LUNAS. Tetap proses edit?`)) return;
            }
            const now = new Date();
            const dl = new Date(now);
            dl.setDate(dl.getDate() + EDIT_MAX_DAYS);
            update = { edit_status: 'PROSES', edit_started_at: now.toISOString(), edit_deadline: dateToISO(dl) };
        } else if (status === 'SELESAI') {
            update = { edit_status: 'SELESAI' };
        } else {
            if (!confirm(`Reset status edit ${c.nama}?`)) return;
            update = { edit_status: null, edit_started_at: null, edit_deadline: null };
        }

        try {
            const { error } = await supabaseGalleryClient.from('clients').update(update).eq('slug', slug);
            if (error) throw error;

            if (status === 'SELESAI') {
                showSuccessAlert('Editing Selesai! 🎉', `Selamat, foto wisuda ${c.nama} sudah selesai diedit. Terima kasih atas kerja kerasnya! Status di portal klien sudah berubah menjadi Selesai.`);
            } else if (status === 'PROSES') {
                showToast(`${c.nama} masuk proses edit (deadline 10 hari)`);
            } else {
                showToast('Status direset');
            }
            await fetchEditClients(false);
        } catch (err) {
            alert('Gagal memperbarui status edit: ' + err.message);
        }
    }

    // ---------- Sambungkan ke switchMode bawaan ----------
    const originalSwitchMode = window.switchMode;
    window.switchMode = function (mode) {
        originalSwitchMode(mode);
        const isEdit = mode === 'edit';
        const sec = document.getElementById('sectionEdit');
        const btn = document.getElementById('tabEditBtn');
        if (sec) sec.classList.toggle('hidden', !isEdit);
        if (btn) btn.className = isEdit ? getActiveTabClass() : getInactiveTabClass();
        if (isEdit) fetchEditClients(false);
    };

    // Ekspor untuk onclick di HTML
    window.fetchEditClients = fetchEditClients;
    window.renderEditList = renderEditList;
    window.setEditStatus = setEditStatus;

    // ---------- Panel "Link untuk Fotografer" di tab Reminder H-1 ----------
    const FG_PAGE = location.origin + '/fg.html';
    window._fgMsgs = {};
    window._fgNames = {};

    function tomorrowISO() {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return dateToISO(d);
    }

    function injectFgLinkPanel() {
        if (typeof activeScheduleSubTab === 'undefined' || activeScheduleSubTab !== 'tomorrow') return;
        const box = document.getElementById('scheduleCardsContainer');
        if (!box || typeof cachedClients === 'undefined') return;

        const tgl = tomorrowISO();
        const jobs = cachedClients.filter(c => cleanToISODate(c.tanggal) === tgl);
        if (jobs.length === 0) return;

        const byFg = {};
        jobs.forEach(c => {
            const f = String(c.fg || 'Raihan').trim();
            byFg[f] = (byFg[f] || 0) + 1;
        });

        const rows = Object.keys(byFg).map((f, i) => {
            const link = `${FG_PAGE}?fg=${encodeURIComponent(f)}&tgl=${tgl}`;
            window._fgMsgs[i] = `Halo kak ${f} 👋\nIni jadwal, format chat ke klien, dan link Drive untuk sesi besok (${byFg[f]} sesi):\n${link}\n\nMohon dicek ya kak 🙏`;
            window._fgNames[i] = { fg: f, names: jobs.filter(c => String(c.fg || 'Raihan').trim() === f).map(c => c.nama) };
            return `
                <div data-fgrow="${i}" class="flex items-center justify-between gap-2 bg-white p-2.5 rounded-xl border border-slate-200">
                    <div>
                        <span class="font-bold text-xs text-slate-800">${f}</span>
                        <span class="text-[11px] text-slate-500 block">${byFg[f]} sesi besok</span>
                        <span data-fglinkchip class="text-[10px] font-bold text-amber-700 hidden">📤 Link terkirim ke fotografer</span>
                    </div>
                    <div class="flex gap-1.5">
                        <button onclick="copyFgMsg(${i}, this)" class="py-1.5 px-3 bg-slate-900 hover:bg-black text-white font-bold text-[11px] rounded-lg active:scale-95"><i class="fa-solid fa-copy mr-1"></i> Salin Pesan</button>
                        <a href="${link}" target="_blank" class="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-lg">Lihat</a>
                    </div>
                </div>`;
        }).join('');

        box.insertAdjacentHTML('afterbegin', `
            <div class="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-2">
                <div>
                    <span class="text-xs font-bold text-blue-900 block"><i class="fa-solid fa-link mr-1"></i> Kirim ke Fotografer / Freelance</span>
                    <span class="text-[11px] text-blue-700">Satu link per fotografer berisi jadwal, format chat klien, dan folder Drive.</span>
                </div>
                ${rows}
            </div>`);
    }

    window.copyFgMsg = function (i, btn) {
        const text = window._fgMsgs[i];
        const done = () => {
            const o = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-check mr-1"></i> Tersalin!';
            setTimeout(() => btn.innerHTML = o, 1500);
        };
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => { done(); markLinkSent(i); });
    };

    // ---------- Status konfirmasi FG (tersimpan di Supabase: tabel fg_confirm) ----------
    const keyNama = s => String(s || '').toLowerCase().trim();
    const unescNama = s => s.replace(/\\'/g, "'").replace(/&quot;/g, '"');

    async function markLinkSent(i) {
        const info = window._fgNames[i];
        if (!info || typeof supabaseGalleryClient === 'undefined' || !supabaseGalleryClient) return;
        const tgl = tomorrowISO();
        const now = new Date().toISOString();
        try {
            await supabaseGalleryClient.from('fg_confirm').upsert(
                info.names.map(n => ({ nama: n, tanggal: tgl, fg: info.fg, link_sent_at: now })),
                { onConflict: 'nama,tanggal' }
            );
            decorateFgStatus();
        } catch (e) { console.log('fg_confirm error', e); }
    }

    async function decorateFgStatus() {
        if (typeof activeScheduleSubTab === 'undefined' || activeScheduleSubTab !== 'tomorrow') return;
        if (typeof supabaseGalleryClient === 'undefined' || !supabaseGalleryClient) return;
        const box = document.getElementById('scheduleCardsContainer');
        if (!box) return;

        let rows = [];
        try {
            const { data } = await supabaseGalleryClient.from('fg_confirm').select('*').eq('tanggal', tomorrowISO());
            rows = data || [];
        } catch (e) { return; }
        const map = {};
        rows.forEach(r => { map[keyNama(r.nama)] = r; });

        // Kartu klien: tombol Chat FG + chip status
        box.querySelectorAll('button[onclick*="prepareAndShowFGChat"]').forEach(btn => {
            const m = (btn.getAttribute('onclick') || '').match(/markFGSent\('(.*?)'\);/);
            if (!m) return;
            const st = map[keyNama(unescNama(m[1]))];
            const card = btn.closest('.p-4');
            if (card) {
                card.querySelectorAll('[data-fgchip]').forEach(e => e.remove());
                const chipRow = card.querySelector('.flex-wrap');
                if (st && chipRow) {
                    let html = '';
                    if (st.link_sent_at) html += '<span data-fgchip class="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md">📤 Link FG terkirim</span>';
                    if (st.chat_copied_at) {
                        const jam = new Date(st.chat_copied_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                        html += `<span data-fgchip class="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md">✅ FG sudah salin chat (${jam})</span>`;
                    }
                    chipRow.insertAdjacentHTML('beforeend', html);
                }
            }
            if (st && st.chat_copied_at) {
                btn.className = 'py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1 active:scale-95';
                btn.innerHTML = '<i class="fa-solid fa-check-double"></i> FG sudah salin';
            }
        });

        // Baris panel fotografer: tanda link terkirim
        document.querySelectorAll('[data-fgrow]').forEach(row => {
            const info = window._fgNames[row.getAttribute('data-fgrow')];
            const chip = row.querySelector('[data-fglinkchip]');
            if (!info || !chip) return;
            const sent = info.names.every(n => map[keyNama(n)] && map[keyNama(n)].link_sent_at);
            chip.classList.toggle('hidden', !sent);
        });
    }

    // Segarkan status tiap 20 detik saat tab Jadwal Sesi terbuka
    setInterval(() => {
        const sec = document.getElementById('sectionTodaySchedule');
        if (sec && !sec.classList.contains('hidden')) decorateFgStatus();
    }, 20000);

    const originalRenderSchedule = window.renderCombinedSchedule;
    window.renderCombinedSchedule = function () {
        originalRenderSchedule.apply(this, arguments);
        injectFgLinkPanel();
        decorateFgStatus();
    };

    // ---------- Jalankan ----------
    injectUI();
    fetchEditClients(false);
})();
