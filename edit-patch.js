/* ==========================================================
   VIVIDLENS - Menu "Status Edit" (patch untuk index.html)
   Dimuat SETELAH script utama di index.html.
   Status disimpan di Supabase (tabel clients) dan dibaca pay.html.
   Tampilan: tabel mingguan (Senin-Minggu), satu baris per klien.
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
                            <p class="text-[11px] sm:text-xs text-slate-500 mt-0.5">Klik Mulai edit setelah klien kirim list foto. Deadline maks. 10 hari, status otomatis berubah di portal klien.</p>
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

    // ---------- Render daftar (tabel mingguan) ----------
    let editWeekStart = null;
    const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    function mondayOf(d) {
        const x = new Date(d);
        x.setHours(0, 0, 0, 0);
        const w = x.getDay();
        x.setDate(x.getDate() - (w === 0 ? 6 : w - 1));
        return x;
    }
    function escE(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function sumNum(n, cls) {
        return n ? `<b class="font-semibold ${cls}">${n}</b>` : '';
    }

    function editCells(c) {
        const sheet = findSheetClientByName(c.nama);
        const isLunas = sheet ? (sheet.payment || '').toUpperCase().trim() === 'LUNAS' : null;
        const done = c.state === 'selesai';
        let status = '', deadline = '<span class="text-slate-300">-</span>', actions = '';

        if (c.state === 'siap') {
            status = '<span class="inline-flex items-center gap-1.5 text-xs text-amber-700"><i class="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></i>Siap diproses</span>';
            actions = `<button onclick="setEditStatus('${c.slug}','PROSES')" class="text-xs font-semibold text-blue-600 hover:underline">Mulai edit</button>`;
        } else if (c.state === 'proses') {
            const late = c.daysLeft !== null && c.daysLeft < 0;
            status = `<span class="inline-flex items-center gap-1.5 text-xs ${late ? 'text-rose-600' : 'text-blue-600'}"><i class="w-1.5 h-1.5 rounded-full ${late ? 'bg-rose-500' : 'bg-blue-500'} inline-block"></i>Sedang diedit</span>`;
            if (c.daysLeft !== null) {
                const cls = late ? 'text-rose-600' : (c.daysLeft <= 3 ? 'text-amber-700' : 'text-slate-500');
                const txt = late ? `Telat ${Math.abs(c.daysLeft)} hari` : (c.daysLeft === 0 ? 'Hari ini' : `Sisa ${c.daysLeft} hari`);
                deadline = `<span class="text-xs ${cls}">${txt}</span>`;
            } else {
                deadline = '<span class="text-xs text-slate-400">Belum diset</span>';
            }
            actions = `
                <button onclick="setEditStatus('${c.slug}','SELESAI')" class="text-xs font-semibold text-emerald-600 hover:underline">Selesai</button>
                <button onclick="setEditStatus('${c.slug}','RESET')" title="Batalkan" aria-label="Batalkan edit" class="text-slate-400 hover:text-slate-700 text-xs"><i class="fa-solid fa-rotate-left"></i></button>`;
        } else {
            status = '<span class="inline-flex items-center gap-1.5 text-xs text-emerald-600"><i class="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></i>Selesai</span>';
            actions = `<button onclick="setEditStatus('${c.slug}','RESET')" title="Reset status" aria-label="Reset status" class="text-slate-400 hover:text-slate-700 text-xs"><i class="fa-solid fa-rotate-left"></i></button>`;
        }

        return `
            <td class="py-2 px-2 border-b border-slate-100">
                <div class="text-[13px] truncate ${done ? 'text-slate-400' : 'text-slate-900 font-semibold'}">${escE(c.nama)}</div>
                ${isLunas === false ? '<div class="text-[10px] text-rose-500">Belum lunas</div>' : ''}
            </td>
            <td class="py-2 px-2 border-b border-slate-100 text-xs text-slate-500">${escE(c.univ || 'Umum')}</td>
            <td class="py-2 px-2 border-b border-slate-100">${status}</td>
            <td class="py-2 px-2 border-b border-slate-100">${deadline}</td>
            <td class="py-2 px-2 border-b border-slate-100"><div class="flex items-center justify-end gap-3">${actions}</div></td>`;
    }

    function renderEditList() {
        const container = document.getElementById('editListContainer');
        if (!container) return;
        const filter = document.getElementById('filterEditStatus').value;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (!editWeekStart) editWeekStart = mondayOf(today);

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

        // Kelompokkan per tanggal sesi
        const byDate = {};
        const noDate = [];
        items.forEach(i => {
            if (i.tanggal) {
                const k = String(i.tanggal).slice(0, 10);
                (byDate[k] = byDate[k] || []).push(i);
            } else {
                noDate.push(i);
            }
        });
        const order = { siap: 0, proses: 1, selesai: 2 };
        const sortFn = (a, b) => (order[a.state] - order[b.state]) || ((a.daysLeft ?? 999) - (b.daysLeft ?? 999));

        // Judul minggu
        const we = new Date(editWeekStart);
        we.setDate(we.getDate() + 6);
        const sameMonth = editWeekStart.getMonth() === we.getMonth();
        const rentang = `${editWeekStart.getDate()}${sameMonth ? '' : ' ' + NAMA_BULAN[editWeekStart.getMonth()]} - ${we.getDate()} ${NAMA_BULAN[we.getMonth()]} ${we.getFullYear()}`;

        let html = `
            <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div class="flex items-center gap-1">
                    <button onclick="editWeekMove(-1)" aria-label="Minggu sebelumnya" class="w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-100"><i class="fa-solid fa-chevron-left text-xs"></i></button>
                    <span class="text-sm font-bold text-slate-900 px-1.5">${rentang}</span>
                    <button onclick="editWeekMove(1)" aria-label="Minggu berikutnya" class="w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-100"><i class="fa-solid fa-chevron-right text-xs"></i></button>
                    <button onclick="editWeekNow()" class="text-xs text-slate-500 hover:text-slate-900 ml-2">Minggu ini</button>
                </div>
                <div class="flex flex-wrap gap-3 text-[11px] text-slate-500">
                    <span class="inline-flex items-center gap-1"><i class="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></i>Siap</span>
                    <span class="inline-flex items-center gap-1"><i class="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block"></i>Proses</span>
                    <span class="inline-flex items-center gap-1"><i class="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></i>Selesai</span>
                    <span class="inline-flex items-center gap-1"><i class="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block"></i>Terlambat</span>
                </div>
            </div>
            <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse min-w-[600px]">
                <colgroup><col style="width:17%"><col style="width:21%"><col style="width:10%"><col style="width:19%"><col style="width:12%"><col style="width:21%"></colgroup>
                <thead>
                    <tr class="text-[11px] text-slate-400 border-b border-slate-300">
                        <th class="py-1.5 px-2 font-normal">Tanggal</th>
                        <th class="py-1.5 px-2 font-normal">Klien</th>
                        <th class="py-1.5 px-2 font-normal">Kampus</th>
                        <th class="py-1.5 px-2 font-normal">Status</th>
                        <th class="py-1.5 px-2 font-normal">Deadline</th>
                        <th class="py-1.5 px-2 font-normal"></th>
                    </tr>
                </thead>
                <tbody>`;

        const todayKey = dateToISO(today);
        for (let i = 0; i < 7; i++) {
            const d = new Date(editWeekStart);
            d.setDate(d.getDate() + i);
            const k = dateToISO(d);
            const all = byDate[k] || [];
            const rows = all.filter(x => filter === 'all' || x.state === filter).sort(sortFn);

            const n = { siap: 0, proses: 0, selesai: 0, late: 0 };
            all.forEach(x => { n[x.state]++; if (x.state === 'proses' && x.daysLeft !== null && x.daysLeft < 0) n.late++; });

            const isToday = k === todayKey;
            const dayCell = `
                <td rowspan="${Math.max(1, rows.length)}" class="align-top py-2.5 px-2 border-b border-slate-300">
                    <div class="text-[11px] text-slate-400">${NAMA_HARI[d.getDay()]}</div>
                    <div class="text-lg font-bold leading-tight ${isToday ? 'text-blue-600' : 'text-slate-900'}">${d.getDate()}</div>
                    <div class="flex gap-1.5 text-xs mt-0.5">${sumNum(n.siap, 'text-amber-600')}${sumNum(n.proses, 'text-blue-600')}${sumNum(n.selesai, 'text-emerald-600')}${sumNum(n.late, 'text-rose-600')}</div>
                </td>`;

            if (rows.length === 0) {
                html += `<tr>${dayCell}<td colspan="5" class="py-2 px-2 border-b border-slate-300 text-xs text-slate-400">${all.length ? 'Tidak ada di filter ini' : 'Tidak ada sesi'}</td></tr>`;
                continue;
            }
            rows.forEach((c, idx) => {
                html += `<tr>${idx === 0 ? dayCell : ''}${editCells(c)}</tr>`;
            });
        }
        html += '</tbody></table></div>';

        // Klien tanpa tanggal sesi (jarang, tapi jangan sampai hilang)
        const orphans = noDate.filter(x => filter === 'all' || x.state === filter).sort(sortFn);
        if (orphans.length) {
            html += `
                <div class="mt-4">
                    <div class="text-[11px] text-slate-400 mb-1">Tanpa tanggal sesi</div>
                    <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse min-w-[600px]"><tbody>${orphans.map(c => `<tr>${editCells(c)}</tr>`).join('')}</tbody></table>
                    </div>
                </div>`;
        }

        container.innerHTML = html;
    }

    function editWeekMove(dir) {
        if (!editWeekStart) editWeekStart = mondayOf(new Date());
        editWeekStart.setDate(editWeekStart.getDate() + dir * 7);
        renderEditList();
    }
    function editWeekNow() {
        editWeekStart = mondayOf(new Date());
        renderEditList();
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
    window.editWeekMove = editWeekMove;
    window.editWeekNow = editWeekNow;

    // ==========================================================
    // STRIP FG DI TIAP KARTU REMINDER H-1
    // (status link, status chat disalin, catatan -> tabel fg_confirm)
    // ==========================================================
    const keyNama = s => String(s || '').toLowerCase().trim();
    const unescNama = s => s.replace(/\\'/g, "'").replace(/&quot;/g, '"');
    window._fgCards = [];

    function tomorrowISO() {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return dateToISO(d);
    }

    function fgStripHtml(idx, fg) {
        return `
            <div data-fgstrip="${idx}" class="border border-slate-200 bg-white rounded-xl px-3 py-2">
                <div class="flex items-center justify-between gap-2 flex-wrap">
                    <div class="flex items-center gap-1.5 flex-wrap text-[11px]">
                        <span class="font-bold text-slate-800">📤 Link ${fg}</span>
                        <span data-st-link></span>
                        <span data-st-chat></span>
                    </div>
                    <div class="flex gap-1.5">
                        <button data-fgsend onclick="fgSendLink(${idx})" class="py-1.5 px-3 font-bold text-[11px] rounded-lg active:scale-95 transition"></button>
                        <button data-fgnotebtn onclick="fgToggleNote(${idx})" title="Catatan untuk fotografer" class="py-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-lg">📝</button>
                    </div>
                </div>
                <div data-fgnotebox class="hidden mt-2">
                    <textarea data-fgnote rows="2" onchange="fgSaveNote(${idx}, this.value)" placeholder="Catatan untuk fotografer (meeting point, request klien...)" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-slate-800"></textarea>
                    <span class="text-[10px] text-slate-400">Tersimpan otomatis saat selesai mengetik, tampil di halaman fotografer.</span>
                </div>
            </div>`;
    }

    function setChip(el, on, textOn, textOff, onCls) {
        if (!el) return;
        el.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full border ' +
            (on ? onCls + ' border-transparent' : 'bg-slate-50 text-slate-500 border-slate-200');
        el.textContent = on ? textOn : textOff;
    }

    async function upsertConfirm(rows) {
        if (typeof supabaseGalleryClient === 'undefined' || !supabaseGalleryClient || !rows.length) return;
        try {
            await supabaseGalleryClient.from('fg_confirm').upsert(rows, { onConflict: 'nama,tanggal' });
        } catch (e) { console.log('fg_confirm error', e); }
    }

    function fgJobsOf(c) {
        return (typeof cachedClients !== 'undefined' ? cachedClients : []).filter(x =>
            String(x.fg || 'Raihan').trim() === c.fg && cleanToISODate(x.tanggal) === c.tgl);
    }

    // Tombol "Kirim Link FG": salin pesan + link, tandai terkirim untuk semua sesi fotografer itu
    window.fgSendLink = async function (idx) {
        const c = window._fgCards[idx];
        if (!c) return;
        const jobs = fgJobsOf(c);
        const link = `${location.origin}/fg.html?fg=${encodeURIComponent(c.fg)}&tgl=${c.tgl}`;
        const msg = `Halo kak ${c.fg} 👋\nIni jadwal, format chat ke klien, dan link Drive untuk sesi besok (${jobs.length || 1} sesi):\n${link}\n\nMohon dicek ya kak 🙏`;
        try { await navigator.clipboard.writeText(msg); } catch (e) {}
        showToast(`Pesan + link untuk ${c.fg} tersalin`);
        const now = new Date().toISOString();
        const names = jobs.length ? jobs.map(j => j.nama) : [c.nama];
        await upsertConfirm(names.map(n => ({ nama: n, tanggal: c.tgl, fg: c.fg, link_sent_at: now })));
        decorateFgStatus();
    };

    window.fgToggleNote = function (idx) {
        const box = document.querySelector(`[data-fgstrip="${idx}"] [data-fgnotebox]`);
        if (box) box.classList.toggle('hidden');
    };

    window.fgSaveNote = async function (idx, val) {
        const c = window._fgCards[idx];
        if (!c) return;
        await upsertConfirm([{ nama: c.nama, tanggal: c.tgl, fg: c.fg, note: (val || '').trim() }]);
        showToast('Catatan untuk fotografer tersimpan');
        decorateFgStatus();
    };

    async function decorateFgStatus() {
        if (typeof activeScheduleSubTab === 'undefined' || activeScheduleSubTab !== 'tomorrow') return;
        if (typeof supabaseGalleryClient === 'undefined' || !supabaseGalleryClient) return;
        const box = document.getElementById('scheduleCardsContainer');
        if (!box) return;

        const tgl = tomorrowISO();
        let rows = [];
        try {
            const { data } = await supabaseGalleryClient.from('fg_confirm').select('*').eq('tanggal', tgl);
            rows = data || [];
        } catch (e) { return; }
        const map = {};
        rows.forEach(r => { map[keyNama(r.nama)] = r; });

        box.querySelectorAll('button[onclick*="prepareAndShowFGChat"]').forEach(btn => {
            const m = (btn.getAttribute('onclick') || '').match(/markFGSent\('(.*?)'\);/);
            if (!m) return;
            const nama = unescNama(m[1]);
            const st = map[keyNama(nama)] || {};
            const card = btn.closest('.p-4');
            if (!card) return;

            const sheet = findSheetClientByName(nama);
            const fg = String((sheet && sheet.fg) || 'Raihan').trim();

            let strip = card.querySelector('[data-fgstrip]');
            if (!strip) {
                const idx = window._fgCards.push({ nama, fg, tgl }) - 1;
                card.insertAdjacentHTML('beforeend', fgStripHtml(idx, fg));
                strip = card.querySelector('[data-fgstrip]');
            }

            const sent = !!st.link_sent_at;
            const copied = !!st.chat_copied_at;
            const jam = copied ? new Date(st.chat_copied_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '';

            setChip(strip.querySelector('[data-st-link]'), sent, '✓ Terkirim', 'Belum dikirim', 'bg-amber-100 text-amber-800');
            setChip(strip.querySelector('[data-st-chat]'), copied, `✓ Chat disalin ${jam}`, 'Chat belum disalin', 'bg-blue-100 text-blue-800');

            const sendBtn = strip.querySelector('[data-fgsend]');
            if (sendBtn) {
                sendBtn.textContent = sent ? 'Salin Ulang' : 'Kirim Link FG';
                sendBtn.className = 'py-1.5 px-3 font-bold text-[11px] rounded-lg active:scale-95 transition ' +
                    (sent ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-emerald-600 hover:bg-emerald-700 text-white');
            }

            const noteBtn = strip.querySelector('[data-fgnotebtn]');
            const hasNote = !!(st.note && st.note.trim());
            if (noteBtn) noteBtn.textContent = hasNote ? '📝 •' : '📝';
            const ta = strip.querySelector('[data-fgnote]');
            if (ta && document.activeElement !== ta && ta.value !== (st.note || '')) ta.value = st.note || '';

            if (copied) {
                btn.className = 'py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1 active:scale-95';
                btn.innerHTML = '<i class="fa-solid fa-check-double"></i> FG sudah salin';
            }
        });
    }

    // Segarkan status tiap 20 detik saat tab Jadwal Sesi terbuka
    setInterval(() => {
        const sec = document.getElementById('sectionTodaySchedule');
        if (sec && !sec.classList.contains('hidden')) decorateFgStatus();
    }, 20000);

    const originalRenderSchedule = window.renderCombinedSchedule;
    window.renderCombinedSchedule = function () {
        window._fgCards = [];
        originalRenderSchedule.apply(this, arguments);
        decorateFgStatus();
    };

    // ==========================================================
    // HALAMAN DETAIL KLIEN DIPERKAYA
    // (pembayaran, posisi alur, aksi cepat, riwayat/repeat, catatan internal)
    // ==========================================================
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const rupiah = n => 'Rp' + Number(n || 0).toLocaleString('id-ID');
    const digitsOf = s => String(s || '').replace(/\D/g, '');
    let detailToken = 0;
    let noteTimer;

    function detailRow(tone, label, val) {
        const map = {
            ok:   ['bg-emerald-100 text-emerald-700', '✓'],
            run:  ['bg-purple-100 text-purple-700', '✦'],
            wait: ['bg-amber-100 text-amber-700', '…'],
            todo: ['bg-slate-200 text-slate-500', '–']
        };
        const [cls, ic] = map[tone];
        return `<div class="flex items-center gap-2.5"><span class="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-none ${cls}">${ic}</span><div><div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">${label}</div><div class="text-xs font-semibold text-slate-800 leading-snug">${val}</div></div></div>`;
    }

    function detailSteps(st) {
        const labels = ['Booking', 'DP', 'Lunas', 'Galeri', 'Seleksi', 'Edit', 'Selesai'];
        const firstTodo = st.findIndex(v => v === 0);
        return labels.map((l, i) => {
            const state = st[i] === 1 ? 'd' : (st[i] === 2 ? 'n' : (i === firstTodo ? 'n' : ''));
            const cls = state === 'd' ? 'bg-emerald-600 text-white' : (state === 'n' ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-slate-200 text-slate-500');
            const ico = st[i] === 1 ? '✓' : (st[i] === 2 ? '✦' : (i + 1));
            return `<div><div class="w-6 h-6 rounded-full mx-auto mb-1 flex items-center justify-center text-[10px] font-bold ${cls}">${ico}</div><div class="text-[9px] ${state ? 'text-slate-800 font-bold' : 'text-slate-400 font-semibold'}">${l}</div></div>`;
        }).join('');
    }

    function detailNextStep(lunas, galeri, seleksi, edit) {
        if (!lunas) return '➡ Berikutnya: tunggu pelunasan klien';
        if (!galeri) return '➡ Berikutnya: buat galeri & Drive';
        if (!seleksi) return '➡ Berikutnya: klien memilih foto';
        if (!edit) return '➡ Berikutnya: mulai proses edit';
        if (edit === 'PROSES') return '➡ Berikutnya: selesaikan edit sebelum deadline';
        return '🎉 Semua tahap sudah selesai';
    }

    window.copyDetailText = function (txt) {
        if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => showToast('Link portal tersalin'));
    };

    window.onClientNoteInput = function (ta) {
        const s = document.getElementById('clientNoteSaved');
        if (s) s.textContent = 'Menyimpan...';
        clearTimeout(noteTimer);
        noteTimer = setTimeout(async () => {
            const nama = ta.getAttribute('data-nama');
            try {
                const { error } = await supabaseGalleryClient.from('client_notes').upsert(
                    { key: keyNama(nama), nama, note: ta.value, updated_at: new Date().toISOString() },
                    { onConflict: 'key' }
                );
                if (s) s.textContent = error ? 'Gagal menyimpan (cek tabel client_notes)' : '✓ Tersimpan';
            } catch (e) { if (s) s.textContent = 'Gagal menyimpan'; }
        }, 700);
    };

    async function enrichClientDetail() {
        const c = window._selectedClientObject;
        const content = document.getElementById('clientDetailPageContent');
        if (!c || !content) return;
        const token = ++detailToken;
        content.querySelectorAll('[data-enrich]').forEach(e => e.remove());

        const nama = String(c.nama || '').trim();
        const key = keyNama(nama);
        const iso = cleanToISODate(c.tanggal);

        // Data dari Supabase (galeri, seleksi, edit, chat FG, catatan)
        let sup = null, conf = null, note = '';
        if (typeof supabaseGalleryClient !== 'undefined' && supabaseGalleryClient) {
            try {
                const [r1, r2, r3] = await Promise.all([
                    supabaseGalleryClient.from('clients').select('*').ilike('nama', nama.replace(/[%_]/g, '')).order('created_at', { ascending: false }).limit(1),
                    supabaseGalleryClient.from('fg_confirm').select('*').eq('nama', nama).eq('tanggal', iso).limit(1),
                    supabaseGalleryClient.from('client_notes').select('note').eq('key', key).limit(1)
                ]);
                sup = (r1.data && r1.data[0]) || null;
                conf = (r2.data && r2.data[0]) || null;
                note = (r3.data && r3.data[0]) ? (r3.data[0].note || '') : '';
            } catch (e) { console.log('detail fetch error', e); }
        }
        if (token !== detailToken) return; // pengguna sudah pindah halaman

        const header = content.firstElementChild && content.firstElementChild.firstElementChild;
        if (!header) return;

        // ---- Pembayaran ----
        const h = parseInt(c.harga) || 0;
        const dp = parseInt(c.dp) || 0;
        const lunas = (c.payment || '').toUpperCase().trim() === 'LUNAS';
        const sisa = lunas ? 0 : Math.max(0, h - dp);

        // ---- Posisi alur ----
        const galeri = !!(sup && sup.drive_link);
        const seleksi = !!(sup && (sup.status_selection || '').toLowerCase() === 'submitted');
        const edit = sup ? (sup.edit_status || '').toUpperCase() : '';
        const st = [1, 1, lunas ? 1 : 0, galeri ? 1 : 0, seleksi ? 1 : 0, edit === 'SELESAI' ? 1 : (edit === 'PROSES' ? 2 : 0), edit === 'SELESAI' ? 1 : 0];

        let editVal = 'Belum dimulai', editTone = 'todo';
        if (edit === 'PROSES') {
            editTone = 'run';
            editVal = 'Berjalan';
            if (sup.edit_deadline) {
                const t0 = new Date(); t0.setHours(0, 0, 0, 0);
                const left = Math.round((parseISOLocal(sup.edit_deadline) - t0) / 86400000);
                editVal += left < 0 ? ` • terlambat ${Math.abs(left)} hari` : (left === 0 ? ' • deadline hari ini' : ` • deadline ${left} hari lagi`);
            }
        } else if (edit === 'SELESAI') { editTone = 'ok'; editVal = 'Selesai'; }

        const copied = !!(conf && conf.chat_copied_at);
        const copiedJam = copied ? new Date(conf.chat_copied_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '';

        // ---- Aksi cepat ----
        const waRaw = getClientWhatsAppNumber(nama, c.noWa);
        const waNum = digitsOf(waRaw).replace(/^0/, '62');
        const portalLink = `${location.origin}/pay.html?nama=${encodeURIComponent(nama)}`;
        const galleryLink = (sup && sup.slug && typeof GALLERY_BASE_DOMAIN !== 'undefined') ? `${GALLERY_BASE_DOMAIN}/${sup.slug}` : '';
        const btnBase = 'py-2.5 px-2 font-bold text-[11px] rounded-xl text-center transition active:scale-95 ';
        const off = 'bg-slate-100 text-slate-400 pointer-events-none';

        // ---- Riwayat / repeat ----
        const phone = digitsOf(waRaw).slice(-9);
        const hist = (typeof cachedClients !== 'undefined' ? cachedClients : []).filter(x => {
            if (!x || !x.nama) return false;
            const same = keyNama(x.nama) === key;
            const samePhone = phone.length >= 9 && digitsOf(x.noWa || x.no_wa || '').slice(-9) === phone;
            if (!same && !samePhone) return false;
            return !(same && x.tanggal === c.tanggal && (x.sheetName || '') === (c.sheetName || ''));
        }).sort((a, b) => cleanToISODate(b.tanggal).localeCompare(cleanToISODate(a.tanggal)));
        const isRepeat = hist.length > 0;

        const histHtml = isRepeat
            ? hist.map(x => {
                const l = (x.payment || '').toUpperCase().trim() === 'LUNAS';
                return `<div class="flex justify-between gap-2 py-2 border-b border-slate-100 last:border-0 text-xs"><div><b class="text-slate-800">${esc(x.paket || '-')}</b><div class="text-slate-400">${esc(x.tanggal || '-')} • ${esc(x.kampus || 'Umum')}</div></div><div class="text-right"><b class="text-slate-800">${rupiah(x.harga)}</b><div class="${l ? 'text-emerald-600' : 'text-amber-600'} font-semibold">${l ? 'Lunas' : esc(x.payment || 'DP')}</div></div></div>`;
            }).join('')
            : '<div class="py-2 text-xs text-slate-400">Belum ada booking lain atas nama atau nomor WA ini.</div>';

        const html = `
            <div data-enrich class="space-y-5 text-xs">
                <div class="space-y-2">
                    <h4 class="font-bold text-slate-900 text-sm flex items-center gap-2">💰 Pembayaran
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${lunas ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'}">${lunas ? 'LUNAS' : 'BELUM LUNAS'}</span></h4>
                    <div class="grid grid-cols-3 gap-2">
                        <div class="p-2.5 bg-slate-50 border border-slate-200 rounded-xl"><div class="text-[9px] font-bold uppercase text-slate-400">Paket ${esc(c.paket || '-')}</div><b class="text-slate-900">${rupiah(h)}</b></div>
                        <div class="p-2.5 bg-slate-50 border border-slate-200 rounded-xl"><div class="text-[9px] font-bold uppercase text-slate-400">DP Terbayar</div><b class="text-emerald-600">${rupiah(lunas ? h : dp)}</b></div>
                        <div class="p-2.5 bg-slate-50 border border-slate-200 rounded-xl"><div class="text-[9px] font-bold uppercase text-slate-400">Sisa Tagihan</div><b class="${lunas ? 'text-emerald-600' : 'text-rose-600'}">${rupiah(sisa)}</b></div>
                    </div>
                </div>

                <div class="space-y-2">
                    <h4 class="font-bold text-slate-900 text-sm">🧭 Posisi Klien dalam Alur</h4>
                    <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                        <div class="grid grid-cols-7 gap-0.5 text-center">${detailSteps(st)}</div>
                        <div class="mt-3 px-3 py-2 bg-blue-50 text-blue-700 font-bold rounded-xl">${detailNextStep(lunas, galeri, seleksi, edit)}</div>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-3 pt-3 border-t border-slate-200">
                            ${detailRow(seleksi ? 'ok' : (galeri ? 'wait' : 'todo'), 'Seleksi foto', seleksi ? 'Sudah dipilih klien' : (galeri ? 'Menunggu klien memilih' : 'Galeri belum dibuat'))}
                            ${detailRow(editTone, 'Edit foto', editVal)}
                            ${detailRow(copied ? 'ok' : 'wait', 'Fotografer', copied ? `Sudah salin chat (${copiedJam})` : 'Belum salin chat')}
                        </div>
                    </div>
                </div>

                <div class="space-y-2">
                    <h4 class="font-bold text-slate-900 text-sm">⚡ Aksi Cepat</h4>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <a ${waNum.length >= 9 ? `href="https://wa.me/${waNum}" target="_blank"` : ''} class="${btnBase}${waNum.length >= 9 ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : off}">💬 Chat Klien</a>
                        <button data-t="${esc(portalLink)}" onclick="copyDetailText(this.dataset.t)" class="${btnBase}bg-slate-900 hover:bg-black text-white">🔗 Salin Link Portal</button>
                        <a ${galeri ? `href="${esc(sup.drive_link)}" target="_blank"` : ''} class="${btnBase}${galeri ? 'bg-blue-600 hover:bg-blue-700 text-white' : off}">📁 Buka Drive</a>
                        <a ${galleryLink ? `href="${esc(galleryLink)}" target="_blank"` : ''} class="${btnBase}${galleryLink ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : off}">🖼 Buka Galeri</a>
                    </div>
                </div>

                <div class="space-y-2">
                    <h4 class="font-bold text-slate-900 text-sm flex items-center gap-2">🗂 Riwayat Klien Ini ${isRepeat ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">Repeat</span>' : ''}</h4>
                    <div class="px-3 py-1 bg-slate-50 border border-slate-200 rounded-2xl">${histHtml}</div>
                </div>

                <div class="space-y-1.5">
                    <h4 class="font-bold text-slate-900 text-sm">📝 Catatan Internal</h4>
                    <textarea data-nama="${esc(nama)}" oninput="onClientNoteInput(this)" rows="3" placeholder="Catatan untuk admin: permintaan khusus, riwayat reschedule, dll." class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-slate-800">${esc(note)}</textarea>
                    <div id="clientNoteSaved" class="text-[10px] text-emerald-600 font-semibold h-3"></div>
                </div>
            </div>`;

        header.insertAdjacentHTML('afterend', html);

        // Label Repeat di samping nama
        const nameEl = content.querySelector('h3');
        if (nameEl && isRepeat && !nameEl.querySelector('[data-enrich-chip]')) {
            nameEl.insertAdjacentHTML('beforeend', ` <span data-enrich-chip class="align-middle text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">⭐ Repeat ×${hist.length + 1}</span>`);
        }
    }

    const originalOpenDetail = window.openClientDetailModal;
    if (typeof originalOpenDetail === 'function') {
        window.openClientDetailModal = function (idx) {
            originalOpenDetail(idx);
            enrichClientDetail();
        };
    }

    // ---------- Jalankan ----------
    injectUI();
    fetchEditClients(false);
})();
