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

    // ---------- Jalankan ----------
    injectUI();
    fetchEditClients(false);
})();
