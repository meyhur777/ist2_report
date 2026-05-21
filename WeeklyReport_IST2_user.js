// ==UserScript==
// @name         Weekly Report Card IST2
// @namespace    muraoget_ist2
// @version      102.0
// @description  IST2 Pick Performance Report - Manager / Shift / Vardiya / Picker
// @author       muraoget
// @updateURL    https://raw.githubusercontent.com/meyhur777/ist2_report/main/WeeklyReport_IST2_user.js
// @downloadURL  https://raw.githubusercontent.com/meyhur777/ist2_report/main/WeeklyReport_IST2_user.js
// @match        https://picking-console.eu.picking.aft.a2z.com/fc/IST2/pick-history*
// @match        https://moc.prod.atlas-opensearch.qubit.amazon.dev/*
// @match        https://atlas.qubit.amazon.dev/*
// @match        https://fclm-portal.amazon.com/search*
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// @connect      fclm-portal.amazon.com
// ==/UserScript==

(function () {
    'use strict';

    const IS_ATLAS = window.location.hostname.includes('atlas-opensearch.qubit.amazon.dev');
    const IS_RAW_REPORTS = window.location.hostname === 'atlas.qubit.amazon.dev' && window.location.pathname.includes('reporting');
    const IS_PICKING = window.location.hostname.includes('picking-console');
    const IS_FCLM_SEARCH = window.location.hostname === 'fclm-portal.amazon.com' && window.location.pathname.includes('/search');

    // ── ATLAS page: fetch data and store ──────────────────────────────────────
    if (IS_ATLAS) {
        // Check if opened by Picking Console with fetch params
        // Check window.name for params from Picking Console
    function checkAndFetch() {
        try {
            const name = window.name || '';
            if (name && name.startsWith('{') && window.opener) {
                const params = JSON.parse(name);
                if (params.wr_from && params.wr_to) {
                    console.log('[ATLAS] Found WR params in window.name:', params.wr_from, '->', params.wr_to);
                    autoFetchForOpener(params);
                    return;
                }
            }
        } catch(e) {}
        injectAtlasPanel();
    }
    setTimeout(checkAndFetch, 3000);
        return;
    }

    if (IS_RAW_REPORTS) {
        // Prevent multiple runs on SPA navigation
        if (window.__WR_RAW_RUNNING__) return;
        window.__WR_RAW_RUNNING__ = true;
        // Raw Reports page - read table and send to opener
        setTimeout(readTableAndSend, 4000);
        return;
    }

    if (!IS_PICKING) return;

    // ── CSS ───────────────────────────────────────────────────────────────────
    // Dark/Light mode state
    let wrDarkMode = true;

    function wrColors() {
        return wrDarkMode ? {
            bg:       '#1a1b2e',
            panel:    '#16213e',
            header:   '#0f3460',
            card:     '#1e2d40',
            border:   '#2d4a6a',
            text:     '#e2e8f0',
            muted:    '#94a3b8',
            accent:   '#f59e0b',
            accentFg: '#1a1b2e',
            btn:      '#1e3a5f',
            btnHover: '#2d4a6a',
            green:    '#10b981',
            red:      '#ef4444',
            input:    '#1e3a5f',
        } : {
            bg:       '#f8fafc',
            panel:    '#ffffff',
            header:   '#1e40af',
            card:     '#f1f5f9',
            border:   '#cbd5e1',
            text:     '#1e293b',
            muted:    '#64748b',
            accent:   '#f59e0b',
            accentFg: '#1a1b2e',
            btn:      '#e2e8f0',
            btnHover: '#cbd5e1',
            green:    '#059669',
            red:      '#dc2626',
            input:    '#ffffff',
        };
    }

    function applyWrTheme() {
        const C = wrColors();
        const el = document.getElementById('wr-panel');
        const tgl = document.getElementById('wr-toggle');
        if (!el) return;
        el.style.background = C.panel;
        el.style.color = C.text;
        const header = document.getElementById('wr-header');
        if (header) { header.style.background = C.header; header.style.color = '#ffffff'; }
        el.querySelectorAll('.wr-input, .wr-select').forEach(i => {
            i.style.background = C.input; i.style.color = C.text; i.style.borderColor = C.border;
        });
        el.querySelectorAll('.wr-btn-secondary').forEach(b => {
            b.style.background = C.btn; b.style.color = C.text; b.style.borderColor = C.border;
        });
        el.querySelectorAll('.wr-label').forEach(l => { l.style.color = C.muted; });
        el.querySelectorAll('.wr-tabs').forEach(t => { t.style.background = C.card; });
        el.querySelectorAll('.wr-tab').forEach(t => {
            if (!t.classList.contains('active')) { t.style.background = 'transparent'; t.style.color = C.muted; }
            else { t.style.background = C.accent; t.style.color = C.accentFg; }
        });
        el.querySelectorAll('.wr-shift-box, .wr-atlas-section').forEach(d => {
            d.style.background = C.card; d.style.borderColor = C.border;
        });
        el.querySelectorAll('.wr-vardiya-btn').forEach(b => {
            if (!b.classList.contains('active')) { b.style.background = C.btn; b.style.color = C.text; b.style.borderColor = C.border; }
            else { b.style.background = C.accent; b.style.color = C.accentFg; b.style.borderColor = C.accent; }
        });
        const status = document.getElementById('wr-status');
        if (status) { status.style.background = C.card; }
        const themeBtn = document.getElementById('wr-theme-btn');
        if (themeBtn) themeBtn.textContent = wrDarkMode ? '☀️' : '🌙';
    }

    const style = document.createElement('style');
    style.textContent = `
        #wr-toggle {
            position: fixed; bottom: 60px; right: 20px;
            background: linear-gradient(135deg, #f59e0b, #d97706);
            color: #1a1b2e; border: none; border-radius: 10px;
            padding: 10px 18px; font-weight: 700;
            font-size: 13px; cursor: pointer;
            z-index: 99998;
            box-shadow: 0 4px 16px rgba(245,158,11,0.4);
            transition: all 0.2s;
        }
        #wr-toggle:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(245,158,11,0.5); }
        #wr-panel {
            position: fixed; top: 16px; right: 16px;
            width: 580px; border-radius: 16px;
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 15px; z-index: 99999;
            box-shadow: 0 20px 60px rgba(0,0,0,0.4);
            overflow: hidden; border: 1px solid rgba(255,255,255,0.1);
            max-height: 94vh; overflow-y: auto;
        }
        #wr-header {
            padding: 16px 20px;
            display: flex; justify-content: space-between;
            align-items: center; font-weight: 700; font-size: 16px;
            position: sticky; top: 0; z-index: 1;
        }
        #wr-header-actions { display: flex; gap: 8px; align-items: center; }
        #wr-theme-btn {
            background: rgba(255,255,255,0.15); border: none;
            border-radius: 6px; padding: 5px 10px; cursor: pointer;
            font-size: 15px; color: #fff; transition: all 0.15s;
        }
        #wr-theme-btn:hover { background: rgba(255,255,255,0.25); }
        #wr-close {
            background: rgba(255,255,255,0.15); border: none;
            border-radius: 6px; padding: 5px 12px;
            font-size: 17px; cursor: pointer; color: #fff;
            transition: all 0.15s; line-height: 1;
        }
        #wr-close:hover { background: rgba(239,68,68,0.7); }
        #wr-body { padding: 18px; }
        .wr-label { font-size: 12px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 6px; margin-top: 12px; }
        .wr-select, .wr-input {
            width: 100%; border-radius: 8px;
            padding: 10px 12px; font-size: 14px;
            box-sizing: border-box; transition: border-color 0.15s;
            outline: none; border: 1.5px solid transparent;
        }
        .wr-select:focus, .wr-input:focus { border-color: #f59e0b; }
        .wr-date-row { display: flex; gap: 10px; margin-bottom: 10px; }
        .wr-date-row > div { flex: 1; }
        .wr-tabs {
            display: flex; gap: 3px; margin-bottom: 14px;
            border-radius: 10px; padding: 4px;
        }
        .wr-tab {
            flex: 1; padding: 7px 4px; border: none;
            background: transparent;
            border-radius: 7px; cursor: pointer;
            font-size: 12px; font-weight: 600;
            font-family: 'Segoe UI', Arial, sans-serif;
            transition: all 0.2s;
        }
        .wr-pane { display: none; }
        .wr-pane.active { display: block; }
        .wr-btn {
            width: 100%; border: none; border-radius: 8px;
            padding: 11px; font-weight: 700; font-size: 14px;
            cursor: pointer; margin-top: 10px;
            font-family: 'Segoe UI', Arial, sans-serif;
            transition: all 0.2s;
        }
        .wr-btn-main {
            background: linear-gradient(135deg, #f59e0b, #d97706);
            color: #1a1b2e; box-shadow: 0 4px 12px rgba(245,158,11,0.3);
        }
        .wr-btn-stop {
            background: linear-gradient(135deg, #ef4444, #dc2626);
            color: #ffffff; box-shadow: 0 4px 12px rgba(239,68,68,0.3);
            display: none;
        }
        .wr-btn-restart {
            background: linear-gradient(135deg, #6366f1, #4f46e5);
            color: #ffffff;
        }
        .wr-btn-main:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(245,158,11,0.4); }
        .wr-btn-main:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .wr-btn-secondary {
            border: 1.5px solid; margin-top: 6px;
            border-radius: 8px;
        }
        .wr-btn-secondary:hover { transform: translateY(-1px); }
        #wr-status {
            margin-top: 10px; padding: 10px 12px;
            border-radius: 8px; font-size: 12px;
            display: none; word-break: break-word;
            border-left: 3px solid #10b981;
        }
        #wr-status.error { border-left-color: #ef4444; }
        .wr-shift-box {
            border-radius: 8px; padding: 8px; margin-bottom: 6px;
            max-height: 150px; overflow-y: auto;
        }
        .wr-shift-all {
            font-size: 10px; margin-bottom: 6px;
            border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;
        }
        .wr-shift-all span { color: #f59e0b; cursor: pointer; text-decoration: underline; margin: 0 3px; }
        .wr-shift-item {
            display: flex; align-items: center; gap: 6px;
            font-size: 12px; padding: 3px 0; cursor: pointer;
        }
        .wr-shift-item input { accent-color: #f59e0b; cursor: pointer; }
        .wr-atlas-status { font-size: 11px; margin-top: 4px; }
        .wr-vardiya-row { display: flex; gap: 8px; margin-bottom: 8px; }
        .wr-vardiya-btn {
            flex: 1; padding: 12px 4px; border: 2px solid;
            border-radius: 8px; cursor: pointer;
            font-size: 13px; font-weight: 600;
            font-family: 'Segoe UI', Arial, sans-serif; text-align: center;
            transition: all 0.2s;
        }
        .wr-vardiya-btn:hover { transform: translateY(-2px); }
        .wr-atlas-section {
            border-top: 1px solid rgba(255,255,255,0.1);
            margin-top: 12px; padding-top: 12px;
        }
        .wr-divider {
            height: 1px; background: rgba(255,255,255,0.08);
            margin: 10px 0;
        }
    `;
    document.head.appendChild(style);

    // ── Toggle butonu ─────────────────────────────────────────────────────────
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'wr-toggle';
    toggleBtn.innerHTML = '📋 Weekly Report';
    document.body.appendChild(toggleBtn);

    // ── Panel ─────────────────────────────────────────────────────────────────
    const panel = document.createElement('div');
    panel.id = 'wr-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
        <div id="wr-header">
            <span>📋 Weekly Report Card</span>
            <div id="wr-header-actions">
                <button id="wr-theme-btn" title="Toggle Theme">🌙</button>
                <button id="wr-close">×</button>
            </div>
        </div>
        <div id="wr-body">
            <!-- Sekmeler -->
            <div class="wr-tabs">
                <button class="wr-tab active" data-tab="manager">👤 Manager</button>
                <button class="wr-tab" data-tab="shift">📋 Shift Pattern</button>
                <button class="wr-tab" data-tab="vardiya">🕐 Shift Hours</button>
                <button class="wr-tab" data-tab="picker">🔍 Picker</button>
            </div>

            <!-- Manager Sekmesi -->
            <div class="wr-pane active" id="wr-pane-manager">
                <div class="wr-date-row">
                    <div><div class="wr-label">From</div><input class="wr-input" type="date" id="wr-manager-from" /></div>
                    <div><div class="wr-label">To</div><input class="wr-input" type="date" id="wr-manager-to" /></div>
                </div>
                <div class="wr-label">Manager</div>
                <select class="wr-select" id="wr-manager">
                    <option value="">— Loading managers... —</option>
                </select>
                <div class="wr-label" style="margin-top:6px;">ATLAS Login <span style="color:#a6adc8;font-size:10px;">(örn: stuzlen)</span></div>
                <input class="wr-input" type="text" id="wr-atlas-login" placeholder="Manager ATLAS login (e.g. stuzlen)">
                <div id="wr-shift-filter-section" style="display:none;">
                    <div class="wr-label">Shift Filter <span style="color:#a6adc8;font-size:10px;">(optional)</span></div>
                    <div class="wr-shift-box" id="wr-shift-list"></div>
                </div>
                <div class="wr-atlas-section">
                    <button class="wr-btn wr-btn-secondary" id="wr-atlas-fetch-btn">🔄 Fetch ATLAS Data</button>
                    <div class="wr-atlas-status" id="wr-atlas-status"></div>
                </div>
            </div>

            <!-- Shift Sekmesi -->
            <div class="wr-pane" id="wr-pane-shift">
                <div class="wr-date-row">
                    <div><div class="wr-label">From</div><input class="wr-input" type="date" id="wr-shift-from" /></div>
                    <div><div class="wr-label">To</div><input class="wr-input" type="date" id="wr-shift-to" /></div>
                </div>
                <button class="wr-btn wr-btn-secondary" id="wr-shift-load" style="margin-bottom:8px;">🔄 Load Shift Patterns</button>
                <div class="wr-label">Shift Pattern</div>
                <select class="wr-select" id="wr-shift-select">
                    <option value="">— Click Load to fetch shifts —</option>
                </select>
                <div id="wr-shift-info" style="font-size:11px;color:#a6adc8;margin-top:4px;"></div>
                <div class="wr-atlas-section">
                    <button class="wr-btn wr-btn-secondary" id="wr-atlas-fetch-btn-shift">🔄 Fetch ATLAS Data</button>
                    <div class="wr-atlas-status" id="wr-atlas-status-shift"></div>
                </div>
                <button class="wr-btn wr-btn-secondary" id="wr-generate-all" style="margin-top:6px;">📥 Generate All Shifts</button>
            </div>

            <!-- Shift Hours Tab -->
            <div class="wr-pane" id="wr-pane-vardiya">
                <div class="wr-date-row">
                    <div><div class="wr-label">From</div><input class="wr-input" type="date" id="wr-vardiya-from" /></div>
                    <div><div class="wr-label">To</div><input class="wr-input" type="date" id="wr-vardiya-to" /></div>
                </div>
                <div class="wr-label">Shift</div>
                <div class="wr-vardiya-row">
                    <button class="wr-vardiya-btn active" data-vardiya="NS">🌙 NS<br><span style="font-size:10px;font-weight:400;">00:00–08:00</span></button>
                    <button class="wr-vardiya-btn" data-vardiya="LS">🌆 LS<br><span style="font-size:10px;font-weight:400;">16:00–00:00</span></button>
                    <button class="wr-vardiya-btn" data-vardiya="ES">☀️ ES<br><span style="font-size:10px;font-weight:400;">08:00–16:00</span></button>
                </div>
                <div class="wr-atlas-section">
                    <button class="wr-btn wr-btn-secondary" id="wr-atlas-fetch-btn-vardiya">🔄 Fetch ATLAS Data</button>
                    <div class="wr-atlas-status" id="wr-atlas-status-vardiya"></div>
                </div>
            </div>

            <!-- Picker Sekmesi -->
            <div class="wr-pane" id="wr-pane-picker">
                <div class="wr-date-row">
                    <div><div class="wr-label">From</div><input class="wr-input" type="date" id="wr-picker-from" /></div>
                    <div><div class="wr-label">To</div><input class="wr-input" type="date" id="wr-picker-to" /></div>
                </div>
                <div class="wr-label">Picker Login</div>
                <input class="wr-input" type="text" id="wr-picker-login" placeholder="e.g. muraoget" style="margin-bottom:6px;" />
                <div class="wr-atlas-section">
                    <button class="wr-btn wr-btn-secondary" id="wr-atlas-fetch-btn-picker">🔄 Fetch ATLAS Data</button>
                    <div class="wr-atlas-status" id="wr-atlas-status-picker"></div>
                </div>
            </div>

            <button class="wr-btn wr-btn-main" id="wr-generate">📥 Generate &amp; Download</button>
            <button class="wr-btn wr-btn-stop" id="wr-stop">⏹ Stop</button>
            <button class="wr-btn wr-btn-restart wr-btn-secondary" id="wr-restart" style="margin-top:6px;">🔄 Restart Panel</button>

            <div id="wr-status"></div>
        </div>
    `;
    document.body.appendChild(panel);

    // ── Toggle / Close ────────────────────────────────────────────────────────
    toggleBtn.addEventListener('click', () => {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        if (panel.style.display === 'block') applyWrTheme();
    });
    // Apply initial theme
    setTimeout(applyWrTheme, 50);

    document.getElementById('wr-theme-btn').addEventListener('click', () => {
        wrDarkMode = !wrDarkMode;
        applyWrTheme();
    });

    document.getElementById('wr-close').addEventListener('click', () => {
        panel.style.display = 'none';
    });

    // ── Tab geçişi ─────────────────────────────────────────────────────────────
    let activeTab = 'manager';
    document.querySelectorAll('.wr-tab').forEach(btn => {
        btn.addEventListener('click', function() {
            activeTab = this.dataset.tab;
            document.querySelectorAll('.wr-tab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.wr-pane').forEach(p => p.classList.remove('active'));
            this.classList.add('active');
            document.getElementById('wr-pane-' + activeTab).classList.add('active');
            applyWrTheme();
        });
    });

    // ── Vardiya butonları ──────────────────────────────────────────────────────
    let selectedVardiya = 'NS';
    document.querySelectorAll('.wr-vardiya-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.wr-vardiya-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            selectedVardiya = this.dataset.vardiya;
            applyWrTheme();
        });
    });

    // ── Yardımcı fonksiyonlar ─────────────────────────────────────────────────
    function getWeekRange(weeksBack) {
        const now = new Date();
        const d = new Date(now.getTime() - weeksBack * 7 * 86400000);
        const dayOfWeek = d.getDay();
        const daysSinceMon = (dayOfWeek - 1 + 7) % 7;
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - daysSinceMon);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 0);
        const d2 = new Date(weekStart);
        d2.setHours(0,0,0,0);
        d2.setDate(d2.getDate() + 3 - (d2.getDay() + 6) % 7);
        const week1 = new Date(d2.getFullYear(), 0, 4);
        const weekNum = 1 + Math.round(((d2 - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
        return {
            start: Math.floor(weekStart.getTime() / 1000),
            end: Math.floor(weekEnd.getTime() / 1000),
            label: 'W' + weekNum,
            startDate: weekStart.toISOString().slice(0, 10),
            endDate: weekEnd.toISOString().slice(0, 10)
        };
    }

    function setDefaultDates() {
        const w = getWeekRange(4); // ~1 ay önce
        // Her sekme için ~1 ay öncesinin haftası
        document.getElementById('wr-manager-from').value = w.startDate;
        document.getElementById('wr-manager-to').value = w.endDate;
        document.getElementById('wr-shift-from').value = w.startDate;
        document.getElementById('wr-shift-to').value = w.endDate;
        document.getElementById('wr-vardiya-from').value = w.startDate;
        document.getElementById('wr-vardiya-to').value = w.endDate;
        // Picker için bugün default
        const today = new Date().toISOString().slice(0, 10);
        document.getElementById('wr-picker-from').value = today;
        document.getElementById('wr-picker-to').value = today;
    }
    setDefaultDates();

    // ── Startup: arka planda shift pattern'leri preload et ───────────────────
    (async function autoPreloadShifts() {
        try {
            await new Promise(r => setTimeout(r, 2000)); // sayfa yüklensin
            const w = getWeekRange(4);
            const fromUnix = Math.floor(new Date(w.startDate + 'T00:00:00').getTime() / 1000);
            const toUnix   = Math.floor(new Date(w.endDate   + 'T23:59:59').getTime() / 1000);
            const vec = await fetchScorecard(fromUnix, toUnix);
            const pickers = vec.filter(p => p.login && p.login !== 'Unknown');
            const logins = pickers.map(p => p.login);
            console.log('[WeeklyReport] Auto-preloading', logins.length, 'pickers via FCLM tab...');
            fetchAllShiftData(logins, null, null);
        } catch(e) {
            console.warn('[WeeklyReport] Auto-preload failed:', e);
        }
    })();

    async function fetchScorecard(fromUnix, toUnix) {
        const url = '/api/fcs/IST2/reports/current-scorecard/from/' + fromUnix + '/to/' + toUnix;
        try {
            const resp = await fetch(url, {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pickProcessList: ['All'] })
            });
            if (!resp.ok) return [];
            const json = await resp.json();
            return json.activeScorecardData && json.activeScorecardData.fullCurrentScorecardDataVector || [];
        } catch (e) { return []; }
    }

    async function fetchPickHistory(username, fromUnix, toUnix) {
        const url = 'https://picking-console.eu.picking.aft.a2z.com/api/fcs/IST2/pickhistory/searchattribute/pickerId/searchvalue/' + username +
            '/startdate/' + fromUnix + '/enddate/' + toUnix;
        try {
            const resp = await fetch(url, { credentials: 'include' });
            if (!resp.ok) return [];
            const json = await resp.json();
            if (!json.pickHistoryDataList) return [];
            const compressed = base64ToUint8Array(json.pickHistoryDataList);
            const decompressed = await decompressGzip(compressed);
            const idx = decompressed.indexOf('[{');
            const jsonStr = idx > 0 ? decompressed.slice(idx) : decompressed;
            return JSON.parse(jsonStr);
        } catch (e) { return []; }
    }

    function base64ToUint8Array(b64) {
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return arr;
    }

    async function decompressGzip(compressed) {
        const ds = new DecompressionStream('gzip');
        const writer = ds.writable.getWriter();
        writer.write(compressed);
        writer.close();
        const chunks = [];
        const reader = ds.readable.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }
        let total = 0;
        chunks.forEach(c => total += c.length);
        const result = new Uint8Array(total);
        let offset = 0;
        chunks.forEach(c => { result.set(c, offset); offset += c.length; });
        return new TextDecoder().decode(result);
    }

    function analyzePickHistory(picks) {
        if (!picks || picks.length === 0) return null;
        const procMap = {};
        const floorMap = {};
        const hourMap = {};
        let totalUnits = 0, totalShorted = 0, totalDamaged = 0;
        const procTimeMap = {};
        picks.forEach(p => {
            const units = p.quantityPicked || 0;
            totalUnits += units;
            totalShorted += p.quantityShorted || 0;
            totalDamaged += p.quantityDamaged || 0;
            const proc = p.pickProcess || 'Unknown';
            procMap[proc] = (procMap[proc] || 0) + units;
            procTimeMap[proc] = (procTimeMap[proc] || 0) + (p.actualTimeBetweenScans || 0);
            const m = p.binId && p.binId.match(/^([A-Z])-(\d+)/);
            if (m) {
                const floor = 'Floor ' + m[2];
                floorMap[floor] = (floorMap[floor] || 0) + units;
            }
            // Saatlik dagilim (timestamputc ms cinsinden)
            if (p.timestamputc) {
                const h = new Date(p.timestamputc).getHours();
                hourMap[h] = (hourMap[h] || 0) + units;
            }
        });
        return { procMap, procTimeMap, floorMap, hourMap, totalUnits, totalShorted, totalDamaged };
    }

    function fetchShiftPattern(employeeId) {
        return new Promise((resolve) => {
            const url = 'https://fclm-portal.amazon.com/employee/timeDetails?warehouseId=IST2&employeeId=' + employeeId;
            GM_xmlhttpRequest({
                method: 'GET', url, withCredentials: true,
                onload: function(resp) {
                    try {
                        const match = resp.responseText.match(/Shift<\/dt>\s*<dd>\s*([\w-]+)/);
                        resolve(match ? match[1] : '-');
                    } catch(e) { resolve('-'); }
                },
                onerror: function() { resolve('-'); }
            });
        });
    }

    // Employee Search API — toplu login → TROB map
    function fetchShiftPatternBatch(logins) {
        // 20'lik batch — GM_xmlhttpRequest ile direkt, sekme açmadan
        return new Promise((resolve) => {
            const term = logins.join(', ');
            const url = 'https://fclm-portal.amazon.com/search?term=' + encodeURIComponent(term) +
                '&warehouseId=IST2&startHourIntraday1=0&startMinuteIntraday1=0&startHourIntraday2=0&startMinuteIntraday2=0';
            GM_xmlhttpRequest({
                method: 'GET', url, withCredentials: true,
                onload: function(resp) {
                    const result = {};
                    try {
                        const html = resp.responseText;
                        const cardRe = /class="label">Login<\/span>([\w-]+)<\/li>[\s\S]*?class="label">Shift<\/span>([\w-]+)<\/li>/g;
                        let m;
                        while ((m = cardRe.exec(html)) !== null) {
                            result[m[1]] = m[2];
                        }
                    } catch(e) {}
                    resolve(result);
                },
                onerror: function() { resolve({}); },
                ontimeout: function() { resolve({}); }
            });
        });
    }

    // ── ATLAS Quality Map ──────────────────────────────────────────────────────
    window.atlasQualityMap = {};
    let atlasQualityMap = window.atlasQualityMap;

    // ── ATLAS window.open fetcher ─────────────────────────────────────────────
    const ATLAS_BASE_URL = 'https://moc.prod.atlas-opensearch.qubit.amazon.dev/_dashboards';
    const ATLAS_DASHBOARDS_CFG = [
        { id: '4c8c3d90-445c-11e9-86f1-a72adc4935ed', type: 'short',          countField: 'quantity' },
        { id: '1800ba30-4464-11e9-86f1-a72adc4935ed', type: 'errorIndicator',  countField: 'quantity' },
        { id: '68a5a240-4462-11e9-8a46-bbf85c8a8a5d', type: 'wrongAsin',       countField: 'num_bad_scans' },
        { id: '8bceba30-4459-11e9-a572-c3a1576aa62f', type: 'damage',          countField: 'quantity' },
        { id: 'b784a950-445e-11e9-86f1-a72adc4935ed', type: 'reject',          countField: 'quantity' },
    ];

    // Listen for FCLM shift data
    window.addEventListener('message', function(e) {
        if (!e.data || e.data.type !== 'WR_FCLM_SHIFTS') return;
        const shiftMap = e.data.shiftMap || {};
        Object.assign(shiftPreloadMap, shiftMap);
        console.log('[WeeklyReport] FCLM shift data received:', Object.keys(shiftMap).length, 'pickers');
        // Update shift load button status
        const info = document.getElementById('wr-shift-info');
        if (info) info.textContent = '✓ ' + Object.keys(shiftPreloadMap).length + ' shift patterns loaded';
    });

    // Open FCLM Search and do batch processing via postMessage
    function fetchAllShiftData(logins, statusEl, btnEl) {
        if (!logins || logins.length === 0) return;
        if (btnEl) { btnEl.disabled = true; btnEl.textContent = '⏳ Opening FCLM...'; }
        if (statusEl) { statusEl.style.color = '#f9e2af'; statusEl.textContent = 'Opening FCLM...'; }

        const fclmUrl = 'https://fclm-portal.amazon.com/search?warehouseId=IST2&startHourIntraday1=0&startMinuteIntraday1=0&startHourIntraday2=0&startMinuteIntraday2=0';
        const fclmWin = window.open(fclmUrl, '_blank');

        if (!fclmWin) {
            if (statusEl) { statusEl.style.color = '#f38ba8'; statusEl.textContent = 'Popup blocked! Allow popups for this site.'; }
            if (btnEl) { btnEl.disabled = false; btnEl.textContent = '🔄 Fetch Shift Data'; }
            return;
        }

        if (btnEl) btnEl.textContent = '⏳ Loading shifts...';

        // FCLM sekmesi hazır olunca login listesini gönder
        const onReady = function(e) {
            if (!e.data || e.data.type !== 'WR_FCLM_READY') return;
            window.removeEventListener('message', onReady);
            fclmWin.postMessage({ type: 'WR_FCLM_START', logins }, '*');
            if (statusEl) statusEl.textContent = 'FCLM fetching ' + logins.length + ' pickers in batches...';
        };
        window.addEventListener('message', onReady);

        if (btnEl) {
            // Bitince butonu resetle
            const onDone = function(e) {
                if (!e.data || e.data.type !== 'WR_FCLM_SHIFTS') return;
                window.removeEventListener('message', onDone);
                if (btnEl) { btnEl.disabled = false; btnEl.textContent = '🔄 Fetch Shift Data'; }
            };
            window.addEventListener('message', onDone);
        }
    }
    window.addEventListener('message', function(e) {
        if (!e.data || e.data.type !== 'WR_ATLAS_RESULT') return;
        console.log('[WeeklyReport] ATLAS verisi alındı:', e.data);
        try {
            // Support both qualityMap (from Raw Reports) and rawCounts (from OpenSearch)
            if (e.data.qualityMap) {
                atlasQualityMap = e.data.qualityMap;
                window.atlasQualityMap = atlasQualityMap;
            } else {
                const rawCounts = e.data.rawCounts || {};
                atlasQualityMap = {};
                const cache = scorecardCache.length > 0 ? scorecardCache : allPickersCache;
                Object.entries(rawCounts).forEach(([userId, counts]) => {
                    const sc = cache.find(p => p.login === userId);
                    const opp = sc ? (parseInt(sc.quantityPicked) || 1000) : 1000;
                    const total = (counts.short||0) + (counts.errorIndicator||0) + (counts.wrongAsin||0) + (counts.damage||0) + (counts.reject||0);
                    atlasQualityMap[userId] = {
                        opportunities: String(opp),
                        short:          String(counts.short||0),
                        errorIndicator: String(counts.errorIndicator||0),
                        wrongAsin:      String(counts.wrongAsin||0),
                        damage:         String(counts.damage||0),
                        reject:         String(counts.reject||0),
                        totalDefects:   String(total),
                        dpmo:           String(Math.round(total / opp * 1000000))
                    };
                });
                window.atlasQualityMap = atlasQualityMap;
            }
            const count = Object.keys(atlasQualityMap).length;
            console.log('[WeeklyReport] atlasQualityMap:', count, 'pickers');
            // Update all status elements
            ['', '-shift', '-vardiya', '-picker'].forEach(suffix => {
                const el = document.getElementById('wr-atlas-status' + suffix);
                const btn = document.getElementById('wr-atlas-fetch-btn' + suffix);
                if (el) { el.style.color = '#a6e3a1'; el.textContent = '✓ ' + count + ' pickers loaded'; }
                if (btn) { btn.disabled = false; btn.textContent = '🔄 Fetch ATLAS Data'; btn.style.borderColor = '#a6e3a1'; btn.style.color = '#a6e3a1'; }
            });
        } catch(e) {
            console.error('[WeeklyReport] ATLAS result parse error:', e);
        }
    });

    function fetchAllAtlasData(fromDate, toDate, statusEl, btnEl) {
        if (btnEl) { btnEl.disabled = true; btnEl.textContent = '⏳ Opening ATLAS...'; }
        if (statusEl) { statusEl.style.color = '#f9e2af'; statusEl.textContent = 'Opening ATLAS...'; }

        const activeTabEl = document.querySelector('.wr-tab.active');
        const activeTabName = activeTabEl ? activeTabEl.dataset.tab : 'manager';

        // Vardiya sekmesinde saat aralığını vardiyaya göre ayarla
        let startTime = '00%3A00%3A00';
        let endTime   = '23%3A45%3A00';
        let atlasToDate = toDate;
        if (activeTabName === 'vardiya') {
            if (selectedVardiya === 'NS') {
                startTime = '00%3A00%3A00';
                endTime   = '08%3A00%3A00';
            } else if (selectedVardiya === 'ES') {
                startTime = '08%3A00%3A00';
                endTime   = '16%3A00%3A00';
            } else { // LS — gece yarısına taşar, toDate+1
                startTime = '16%3A00%3A00';
                endTime   = '23%3A45%3A00';
                const toDt = new Date(toDate + 'T00:00:00');
                toDt.setDate(toDt.getDate() + 1);
                atlasToDate = toDt.toISOString().slice(0, 10);
            }
        }

        let atlasUrl;
        if (activeTabName === 'manager') {
            const atlasLoginEl = document.getElementById('wr-atlas-login');
            const managerLogin = atlasLoginEl ? atlasLoginEl.value.trim() : '';
            if (!managerLogin) {
                if (statusEl) { statusEl.style.color = '#f38ba8'; statusEl.textContent = 'Enter ATLAS Login!'; }
                if (btnEl) { btnEl.disabled = false; btnEl.textContent = '🔄 Fetch ATLAS Data'; }
                return;
            }
            atlasUrl = 'https://atlas.qubit.amazon.dev/reporting?aggregateType=MANAGER_LOGIN&queryType=NORMAL&targetProcess=PICK' +
              '&startDate=' + fromDate + '&startTime=' + startTime +
              '&endDate=' + atlasToDate + '&endTime=' + endTime +
              '&managerLogin=' + encodeURIComponent(managerLogin) +
              '&warehouseId=IST2';
        } else {
            atlasUrl = 'https://atlas.qubit.amazon.dev/reporting?aggregateType=WAREHOUSE_ID&queryType=NORMAL&targetProcess=PICK' +
              '&startDate=' + fromDate + '&startTime=' + startTime +
              '&endDate=' + atlasToDate + '&endTime=' + endTime +
              '&region=EU&warehouseId=IST2';
        }

        const atlasWin = window.open(atlasUrl, '_blank');
        if (!atlasWin) {
            if (statusEl) { statusEl.style.color = '#f38ba8'; statusEl.textContent = 'Popup blocked — check browser permissions'; }
            if (btnEl) { btnEl.disabled = false; btnEl.textContent = '🔄 Fetch ATLAS Data'; }
            return;
        }

        if (btnEl) { btnEl.disabled = true; btnEl.textContent = '⏳ Waiting...'; }
        if (statusEl) { statusEl.style.color = '#f9e2af'; statusEl.textContent = 'Fetching data from ATLAS tab...'; }
    }

    

        // ── Bind fetch buttons ─────────────────────────────────────────────────────
    function getDateRange(tab) {
        if (tab === 'manager') {
            return {
                from: document.getElementById('wr-manager-from').value,
                to:   document.getElementById('wr-manager-to').value
            };
        } else if (tab === 'shift') {
            return {
                from: document.getElementById('wr-shift-from').value,
                to:   document.getElementById('wr-shift-to').value
            };
        } else if (tab === 'vardiya') {
            return {
                from: document.getElementById('wr-vardiya-from').value,
                to:   document.getElementById('wr-vardiya-to').value
            };
        } else if (tab === 'picker') {
            return {
                from: document.getElementById('wr-picker-from').value,
                to:   document.getElementById('wr-picker-to').value
            };
        }
        return { from: '', to: '' };
    }

    ['manager', 'shift', 'vardiya', 'picker'].forEach(tab => {
        const suffix = tab === 'manager' ? '' : '-' + tab;
        const btn = document.getElementById('wr-atlas-fetch-btn' + suffix);
        const statusEl = document.getElementById('wr-atlas-status' + suffix);
        if (!btn) return;
        btn.textContent = '🔄 Fetch ATLAS Data';
        btn.addEventListener('click', function() {
            const dates = getDateRange(tab);
            if (!dates.from || !dates.to) {
                if (statusEl) { statusEl.style.color = '#f38ba8'; statusEl.textContent = '✗ Önce tarih gir'; }
                return;
            }
            fetchAllAtlasData(dates.from, dates.to, statusEl, btn);
        });
    });

    function recalcDpmo() {
        Object.keys(atlasQualityMap).forEach(userId => {
            const d = atlasQualityMap[userId];
            const total = (parseInt(d.short)||0) + (parseInt(d.errorIndicator)||0) +
                          (parseInt(d.wrongAsin)||0) + (parseInt(d.damage)||0) + (parseInt(d.reject)||0);
            // ATLAS'tan gelen opportunities kullan — scorecard quantityPicked degil
            const opp = parseInt(d.opportunities) || 1000;
            atlasQualityMap[userId].totalDefects = String(total);
            atlasQualityMap[userId].dpmo = String(Math.round(total / opp * 1000000));
        });
        console.log('[WeeklyReport] DPMO recalculated for', Object.keys(atlasQualityMap).length, 'pickers');
    }

    // ── Shift cache    // ── Shift cache ────────────────────────────────────────────────────────────
    const shiftPreloadMap = {};
    let wrStopRequested = false;
    let scorecardCache = [];
    let allPickersCache = []; // Son 3 haftanın birleşik listesi

    async function loadManagers() {
        const weeks = [getWeekRange(0), getWeekRange(1), getWeekRange(2)];
        const results = await Promise.all(weeks.map(w => fetchScorecard(w.start, w.end)));
        const combined = [];
        const seenLogins = new Set();
        results.forEach(function(vec) {
            vec.forEach(function(p) {
                if (!seenLogins.has(p.login)) {
                    seenLogins.add(p.login);
                    combined.push(p);
                }
            });
        });
        allPickersCache = combined;

        // Manager dropdown
        const managers = [...new Set(combined.map(p => p.managerName).filter(m => m && m !== 'Unknown'))].sort();
        const sel = document.getElementById('wr-manager');
        sel.innerHTML = '<option value="">— Select Manager —</option>';
        managers.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m; opt.textContent = m;
            sel.appendChild(opt);
        });

        // Shift dropdown - tarih seçilince yüklenecek
        const shiftSel = document.getElementById('wr-shift-select');
        shiftSel.innerHTML = '<option value="">— Set dates and click Load —</option>';
    }

    // ── Shift Pattern Preload — batch paralel ────────────────────────────────
    async function preloadShiftPatterns(pickers, statusEl) {
        // 20'lik batch — GM_xmlhttpRequest ile direkt, stop destekli
        const BATCH = 20;
        for (let i = 0; i < pickers.length; i += BATCH) {
            if (wrStopRequested) { wrStopRequested = false; break; }
            const batch = pickers.slice(i, i + BATCH).filter(p => !shiftPreloadMap[p.login] && p.login);
            if (batch.length > 0) {
                const logins = batch.map(p => p.login);
                const result = await fetchShiftPatternBatch(logins);
                logins.forEach(login => {
                    shiftPreloadMap[login] = result[login] || '-';
                });
            }
            if (statusEl) statusEl.textContent = 'Loading shifts... ' + Math.min(i + BATCH, pickers.length) + '/' + pickers.length;
            await new Promise(r => setTimeout(r, 200));
        }
    }

    // Shift Load butonu — FCLM Employee Search sayfasını aç
    document.getElementById('wr-shift-load').addEventListener('click', async function() {
        const fromDate = document.getElementById('wr-shift-from').value;
        const toDate = document.getElementById('wr-shift-to').value;
        if (!fromDate || !toDate) { alert('Please enter date range first.'); return; }

        const btn = this;
        const info = document.getElementById('wr-shift-info');
        btn.disabled = true;
        btn.textContent = '⏳ Loading...';
        info.textContent = 'Fetching scorecard...';

        const fromUnix = Math.floor(new Date(fromDate + 'T00:00:00').getTime() / 1000);
        const toUnix = Math.floor(new Date(toDate + 'T23:59:59').getTime() / 1000);
        const vec = await fetchScorecard(fromUnix, toUnix);
        const pickers = vec.filter(p => p.login && p.login !== 'Unknown');
        const logins = pickers.map(p => p.login);

        info.textContent = 'Opening FCLM for ' + logins.length + ' pickers...';
        fetchAllShiftData(logins, info, btn);

        // FCLM'den veri gelince dropdown'ı doldur
        const fillDropdown = function(e) {
            if (!e.data || e.data.type !== 'WR_FCLM_SHIFTS') return;
            const allShifts = [...new Set(pickers.map(p => shiftPreloadMap[p.login] || '-').filter(s => s !== '-'))].sort();
            const shiftSel = document.getElementById('wr-shift-select');
            shiftSel.innerHTML = '<option value="">— Select Shift Pattern —</option>';
            const totalCount = pickers.filter(p => shiftPreloadMap[p.login] && shiftPreloadMap[p.login] !== '-').length;
            const allOpt = document.createElement('option');
            allOpt.value = '__ALL__';
            allOpt.textContent = '— All Shifts (' + totalCount + ' pickers) —';
            shiftSel.appendChild(allOpt);
            allShifts.forEach(shift => {
                const count = pickers.filter(p => shiftPreloadMap[p.login] === shift).length;
                const opt = document.createElement('option');
                opt.value = shift;
                opt.textContent = shift + ' (' + count + ' pickers)';
                shiftSel.appendChild(opt);
            });
            info.textContent = '✓ ' + allShifts.length + ' shift patterns loaded';
            btn.disabled = false;
            btn.textContent = '🔄 Reload Shift Patterns';
            window.removeEventListener('message', fillDropdown);
        };
        window.addEventListener('message', fillDropdown);
    });

    // Manager değişince shift'leri yükle
    document.getElementById('wr-manager').addEventListener('change', async function() {
        const manager = this.value;
        const shiftSection = document.getElementById('wr-shift-filter-section');
        if (!manager) { shiftSection.style.display = 'none'; return; }

        shiftSection.style.display = 'block';
        const shiftList = document.getElementById('wr-shift-list');
        shiftList.innerHTML = '<div style="color:#a6adc8;font-size:11px;">Loading shifts...</div>';

        const pickers = allPickersCache.filter(p => p.managerName === manager && p.login && p.login !== 'Unknown');

        // Shift pattern'ları paralel çek
        await Promise.all(pickers.map(async (sc) => {
            if (!shiftPreloadMap[sc.login]) {
                shiftPreloadMap[sc.login] = await fetchShiftPattern(sc.employeeId);
            }
        }));

        const shifts = [...new Set(pickers.map(sc => shiftPreloadMap[sc.login] || '-'))].sort();

        shiftList.innerHTML = '';
        const allRow = document.createElement('div');
        allRow.className = 'wr-shift-all';
        allRow.innerHTML = 'Shifts: <span id="wr-sel-all">All</span> / <span id="wr-sel-none">None</span>';
        shiftList.appendChild(allRow);

        shifts.forEach(shift => {
            const count = pickers.filter(p => (shiftPreloadMap[p.login] || '-') === shift).length;
            const item = document.createElement('label');
            item.className = 'wr-shift-item';
            item.innerHTML = '<input type="checkbox" class="wr-shift-cb" value="' + shift + '" checked> ' +
                shift + ' <span style="color:#a6adc8;font-size:10px;">(' + count + ' pickers)</span>';
            shiftList.appendChild(item);
        });

        // Shift sekmesi için de shift dropdown'ını doldur
        const shiftSel = document.getElementById('wr-shift-select');
        shiftSel.innerHTML = '<option value="">— Select Shift —</option>';
        shifts.forEach(shift => {
            if (shift === '-') return;
            const count = pickers.filter(p => (shiftPreloadMap[p.login] || '-') === shift).length;
            const opt = document.createElement('option');
            opt.value = shift;
            opt.textContent = shift + ' (' + count + ' pickers)';
            shiftSel.appendChild(opt);
        });

        document.getElementById('wr-sel-all').addEventListener('click', () => {
            document.querySelectorAll('.wr-shift-cb').forEach(cb => cb.checked = true);
        });
        document.getElementById('wr-sel-none').addEventListener('click', () => {
            document.querySelectorAll('.wr-shift-cb').forEach(cb => cb.checked = false);
        });
    });

    // Shift dropdown değişince picker sayısını göster
    document.getElementById('wr-shift-select').addEventListener('change', function() {
        const shift = this.value;
        const info = document.getElementById('wr-shift-info');
        if (!shift) { info.textContent = ''; return; }
        const count = Object.entries(shiftPreloadMap).filter(([login, s]) => s === shift).length;
        info.textContent = count + ' pickers with this shift pattern';
        setTimeout(() => document.getElementById('wr-generate').click(), 300);
    });

    // ── Generate ───────────────────────────────────────────────────────────────
    document.getElementById('wr-generate-all').addEventListener('click', async () => {
        const btn = document.getElementById('wr-generate-all');
        const status = document.getElementById('wr-status');
        btn.disabled = true;
        status.style.display = 'block';

        const allShiftPatterns = [...new Set(Object.values(shiftPreloadMap))].filter(s => s && s !== '-').sort();
        if (allShiftPatterns.length === 0) {
            status.textContent = 'No shift patterns loaded. Click Load Shift Patterns first.';
            btn.disabled = false;
            return;
        }

        const dates = getDateRange('shift');

        // Build weeks array (same logic as generateGroupReport)
        const fromUnix = Math.floor(new Date(dates.from + 'T00:00:00').getTime() / 1000);
        const toUnix   = Math.floor(new Date(dates.to   + 'T23:59:59').getTime() / 1000);
        const _d = new Date(dates.from);
        _d.setDate(_d.getDate() + 3 - (_d.getDay() + 6) % 7);
        const _week1 = new Date(_d.getFullYear(), 0, 4);
        const _weekNum = 1 + Math.round(((_d - _week1) / 86400000 - 3 + (_week1.getDay() + 6) % 7) / 7);
        const weekLabel = 'W' + _weekNum;
        const weeks = [
            { start: fromUnix - 2*7*86400, end: toUnix - 2*7*86400, label: 'W'+(_weekNum-2), startDate: dates.from, endDate: dates.to },
            { start: fromUnix - 7*86400,   end: toUnix - 7*86400,   label: 'W'+(_weekNum-1), startDate: dates.from, endDate: dates.to },
            { start: fromUnix,             end: toUnix,             label: weekLabel,         startDate: dates.from, endDate: dates.to }
        ];

        // Fetch scorecard for all weeks
        let weeklyScorecard;
        try {
            status.textContent = 'Fetching 3 weeks scorecard...';
            weeklyScorecard = await Promise.all(weeks.map(w => fetchScorecard(w.start, w.end)));
            scorecardCache = weeklyScorecard[2]; // Fix: populate scorecardCache for recalcDpmo
        } catch(e) {
            status.textContent = 'Error fetching scorecard: ' + e.message;
            btn.disabled = false;
            return;
        }

        // Fetch pick history for all pickers
        const allPickers = weeklyScorecard[2].filter(p => p.login && p.login !== 'Unknown');
        const pickHistoryMap = {};
        for (let i = 0; i < allPickers.length; i++) {
            status.textContent = 'Fetching pick history ' + (i+1) + '/' + allPickers.length + ' — ' + allPickers[i].login;
            try {
                // Fix: convert dates to Unix timestamps before passing to fetchPickHistory
                const picks = await fetchPickHistory(allPickers[i].login, fromUnix, toUnix);
                if (picks && picks.length > 0) {
                    pickHistoryMap[allPickers[i].login] = analyzePickHistory(picks);
                } else {
                    console.warn('[GenerateAll] No picks for:', allPickers[i].login, 'picks:', picks ? picks.length : 'null');
                }
            } catch(e) {
                console.error('[GenerateAll] fetchPickHistory error for', allPickers[i].login, e);
            }
            await new Promise(r => setTimeout(r, 150));
        }
        console.log('[GenerateAll] pickHistoryMap size:', Object.keys(pickHistoryMap).length, '/', allPickers.length);

        // Fix: recalc DPMO now that scorecardCache is populated
        recalcDpmo();

        // Build combined HTML with all shifts
        const combinedPickerList = allPickers.filter(p => shiftPreloadMap[p.login]);
        status.textContent = 'Building report...';
        const html = buildReportHTML(combinedPickerList, weeks, weeklyScorecard, pickHistoryMap, shiftPreloadMap, atlasQualityMap, 'All Shifts — ' + weekLabel);
        const fname = 'WeeklyReport_AllShifts_' + weekLabel + '.html';
        const blob = new Blob([html], {type:'text/html'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fname;
        a.click();

        status.textContent = '✓ Done! ' + combinedPickerList.length + ' pickers — ' + weekLabel;
        btn.disabled = false;
    });

    // Stop butonu
    document.getElementById('wr-stop').addEventListener('click', () => {
        wrStopRequested = true;
        document.getElementById('wr-stop').style.display = 'none';
        document.getElementById('wr-generate').disabled = false;
        document.getElementById('wr-generate').textContent = '📥 Generate & Download';
        const status = document.getElementById('wr-status');
        if (status) { status.style.display = 'block'; status.textContent = '⏹ Stopped.'; }
    });

    // Restart butonu
    document.getElementById('wr-restart').addEventListener('click', () => {
        location.reload();
    });

    // Generate butonu — Stop göster/gizle
    document.getElementById('wr-generate').addEventListener('click', async () => {
        const btn = document.getElementById('wr-generate');
        const stopBtn = document.getElementById('wr-stop');
        const status = document.getElementById('wr-status');
        btn.disabled = true;
        btn.textContent = '⏳ Generating...';
        stopBtn.style.display = 'block';
        wrStopRequested = false;
        status.style.display = 'block';
        status.className = '';

        try {
            if (activeTab === 'picker') {
                await generatePickerReport(status);
            } else {
                await generateGroupReport(status);
            }
        } catch (e) {
            status.textContent = 'Error: ' + e;
            status.className = 'error';
        } finally {
            btn.disabled = false;
            btn.textContent = '📥 Generate & Download';
            stopBtn.style.display = 'none';
            wrStopRequested = false;
        }
    });

    // ── Picker raporu ─────────────────────────────────────────────────────────
    async function generatePickerReport(status) {
        const login = document.getElementById('wr-picker-login').value.trim();
        const fromDate = document.getElementById('wr-picker-from').value;
        const toDate = document.getElementById('wr-picker-to').value;

        if (!login) { status.textContent = 'Please enter a picker login.'; status.className = 'error'; return; }
        if (!fromDate || !toDate) { status.textContent = 'Please enter date range.'; status.className = 'error'; return; }

        const fromUnix = Math.floor(new Date(fromDate + 'T00:00:00').getTime() / 1000);
        const toUnix = Math.floor(new Date(toDate + 'T23:59:59').getTime() / 1000);

        status.textContent = 'Fetching scorecard...';
        const scVec = await fetchScorecard(fromUnix, toUnix);
        const sc = scVec.find(p => p.login === login);

        status.textContent = 'Fetching pick history...';
        const picks = await fetchPickHistory(login, fromUnix, toUnix);
        const ps = analyzePickHistory(picks);

        if (!sc && (!ps || ps.totalUnits === 0)) {
            status.textContent = 'No data found for ' + login + ' in this period.';
            status.className = 'error';
            return;
        }

        const scData = sc || { login, fullName: login, employeeId: '-', managerName: '-', daysSinceHired: '-', directPickRate: null, expectedPickRate: null, actualDirectTime: null, quantityPicked: ps ? ps.totalUnits : 0, veryLongPicks: 0, noOfRejects: 0 };

        status.textContent = 'Building report...';
        const html = buildSinglePickerHTML(scData, ps, fromDate, toDate);
        downloadHTML(html, 'PickerReport_' + login + '_' + fromDate + '.html');
        status.textContent = '✓ Done! ' + login + ' — ' + fromDate + ' to ' + toDate;
    }

    // ── Grup raporu (Manager / Shift / Vardiya) ───────────────────────────────
    async function generateGroupReport(status) {
        const fromDate = activeTab === 'shift' ? document.getElementById('wr-shift-from').value :
                         activeTab === 'vardiya' ? document.getElementById('wr-vardiya-from').value :
                         document.getElementById('wr-manager-from').value;
        const toDate = activeTab === 'shift' ? document.getElementById('wr-shift-to').value :
                       activeTab === 'vardiya' ? document.getElementById('wr-vardiya-to').value :
                       document.getElementById('wr-manager-to').value;

        if (!fromDate || !toDate) { status.textContent = 'Please enter date range.'; status.className = 'error'; return; }

        const fromUnix = Math.floor(new Date(fromDate + 'T00:00:00').getTime() / 1000);
        const toUnix = Math.floor(new Date(toDate + 'T23:59:59').getTime() / 1000);

        // Hafta etiketi
        const d = new Date(fromDate);
        d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
        const week1 = new Date(d.getFullYear(), 0, 4);
        const weekNum = 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
        const weekLabel = 'W' + weekNum;

        const weeks = [
            { start: fromUnix - 2*7*86400, end: toUnix - 2*7*86400, label: 'W'+(weekNum-2), startDate: fromDate, endDate: toDate },
            { start: fromUnix - 7*86400, end: toUnix - 7*86400, label: 'W'+(weekNum-1), startDate: fromDate, endDate: toDate },
            { start: fromUnix, end: toUnix, label: weekLabel, startDate: fromDate, endDate: toDate }
        ];

        status.textContent = 'Fetching 3 weeks scorecard...';
        const weeklyScorecard = await Promise.all(weeks.map(w => fetchScorecard(w.start, w.end)));
        scorecardCache = weeklyScorecard[2];

        // Picker listesini moda göre filtrele
        let pickerList = [];
        let reportTitle = '';
        let dayWindows = []; // vardiya sekmesi için gün gün pencereler

        if (activeTab === 'manager') {
            const manager = document.getElementById('wr-manager').value;
            if (!manager) { status.textContent = 'Please select a manager.'; status.className = 'error'; return; }
            const selectedShifts = [...document.querySelectorAll('.wr-shift-cb:checked')].map(cb => cb.value);
            pickerList = weeklyScorecard[2].filter(p => {
                if (p.managerName !== manager || !p.login || p.login === 'Unknown') return false;
                if (selectedShifts.length === 0) return true;
                const shift = shiftPreloadMap[p.login];
                if (!shift) return true;
                return selectedShifts.includes(shift);
            });
            reportTitle = manager;

        } else if (activeTab === 'shift') {
            const selectedShift = document.getElementById('wr-shift-select').value;
            if (!selectedShift) { status.textContent = 'Please select a shift pattern.'; status.className = 'error'; return; }
            if (selectedShift === '__ALL__') {
                pickerList = weeklyScorecard[2].filter(p => p.login && p.login !== 'Unknown' && shiftPreloadMap[p.login]);
                reportTitle = 'All Shifts';
            } else {
                pickerList = weeklyScorecard[2].filter(p => {
                    if (!p.login || p.login === 'Unknown') return false;
                    return shiftPreloadMap[p.login] === selectedShift;
                });
                reportTitle = 'Shift: ' + selectedShift;
            }

        } else if (activeTab === 'vardiya') {
            // Vardiya saat pencereleri
            // Vardiya süresi sabit 8 saat — timezone bağımsız hesap
            const vardiyaWindows = {
                'NS': { startH: '00:00:00', durationSec: 8*3600, label: 'NS (00:00–08:00)' },
                'ES': { startH: '08:00:00', durationSec: 8*3600, label: 'ES (08:00–16:00)' },
                'LS': { startH: '16:00:00', durationSec: 8*3600, label: 'LS (16:00–00:00)' }
            };
            const vw = vardiyaWindows[selectedVardiya];

            // Tarih araligindaki her gun icin vardiya penceresi olustur
            dayWindows = [];
            const startMs = new Date(fromDate + 'T12:00:00').getTime();
            const endMs   = new Date(toDate   + 'T12:00:00').getTime();
            for (let ms = startMs; ms <= endMs; ms += 86400000) {
                const dt = new Date(ms);
                const y = dt.getFullYear();
                const mo = String(dt.getMonth()+1).padStart(2,'0');
                const d = String(dt.getDate()).padStart(2,'0');
                const dayStr = y + '-' + mo + '-' + d;
                const fromSec = Math.floor(new Date(dayStr + 'T' + vw.startH).getTime() / 1000);
                dayWindows.push({
                    from: fromSec,
                    to:   fromSec + vw.durationSec
                });
            }

            // Her gun icin scorecard cek, unique pickerlari biriktir
            const seenLogins = new Set();
            const mergedScorecard = [];
            for (let di = 0; di < dayWindows.length; di++) {
                status.textContent = selectedVardiya + ' scorecard ' + (di+1) + '/' + dayWindows.length + '. gun...';
                const daySC = await fetchScorecard(dayWindows[di].from, dayWindows[di].to);
                daySC.forEach(p => {
                    if (!p.login || p.login === 'Unknown') return;
                    if (!seenLogins.has(p.login)) {
                        seenLogins.add(p.login);
                        mergedScorecard.push(p);
                    }
                });
            }

            pickerList = mergedScorecard;
            scorecardCache = pickerList;
            console.log('[Vardiya] ' + selectedVardiya + ' — ' + pickerList.length + ' unique pickers found across ' + dayWindows.length + ' days');

            // weeks: pick history icin tum aralik, rapor icin vardiya etiketi
            const vFromUnix = dayWindows[0].from;
            const vToUnix   = dayWindows[dayWindows.length - 1].to;
            reportTitle = selectedVardiya + ' Shift — ' + vw.label;
            weeks[0] = { start: vFromUnix, end: vToUnix, label: '-', startDate: fromDate, endDate: toDate };
            weeks[1] = { start: vFromUnix, end: vToUnix, label: '-', startDate: fromDate, endDate: toDate };
            weeks[2] = { start: vFromUnix, end: vToUnix, label: selectedVardiya, startDate: fromDate, endDate: toDate };
            weeklyScorecard[0] = pickerList;
            weeklyScorecard[1] = pickerList;
            weeklyScorecard[2] = pickerList;
        }

        if (pickerList.length === 0) {
            status.textContent = 'No pickers found.';
            status.className = 'error';
            return;
        }

        // Pick history + shift
        // Vardiya sekmesinde: dayWindows varsa her gun ayri cek ve vardiya saatinde pick yapanlari filtrele
        const pickHistoryMap = {};
        const shiftMap = {};
        for (let i = 0; i < pickerList.length; i++) {
            if (wrStopRequested) { status.textContent = '⏹ Stopped.'; break; }
            const sc = pickerList[i];
            status.textContent = 'Fetching data ' + (i+1) + '/' + pickerList.length + ' — ' + sc.login;
            try {
                let allPicks = [];
                if (activeTab === 'vardiya' && typeof dayWindows !== 'undefined' && dayWindows.length > 0) {
                    // Gün gün cek — sadece vardiya saatlerindeki pick'ler
                    for (const dw of dayWindows) {
                        const dayPicks = await fetchPickHistory(sc.login, dw.from, dw.to);
                        if (dayPicks && dayPicks.length > 0) {
                            // timestamputc ile vardiya penceresini dogrula
                            const fromMs = dw.from * 1000;
                            const toMs   = dw.to   * 1000;
                            const filtered = dayPicks.filter(p => {
                                if (!p.timestamputc) return true; // timestamp yoksa dahil et
                                return p.timestamputc >= fromMs && p.timestamputc <= toMs;
                            });
                            allPicks = allPicks.concat(filtered);
                        }
                        await new Promise(r => setTimeout(r, 80));
                    }
                } else {
                    allPicks = await fetchPickHistory(sc.login, weeks[2].start, weeks[2].end) || [];
                }

                if (allPicks.length > 0) {
                    pickHistoryMap[sc.login] = analyzePickHistory(allPicks);
                } else {
                    // Pick history bos — o vardiyada calısmamıs, listeden cikar
                    pickerList.splice(i, 1);
                    i--;
                    continue;
                }
            } catch(e) {}
            shiftMap[sc.login] = shiftPreloadMap[sc.login] || await fetchShiftPattern(sc.employeeId).catch(() => '-');
            await new Promise(r => setTimeout(r, 100));
        }
        console.log('[WeeklyReport] Aktif picker sayisi (pick history olan):', pickerList.length);

        // Recalc DPMO using current scorecardCache (now populated)
        recalcDpmo();
        console.log('[WeeklyReport] atlasQualityMap size:', Object.keys(atlasQualityMap).length);
        console.log('[WeeklyReport] atlasQualityMap keys (first 5):', Object.keys(atlasQualityMap).slice(0,5));
        console.log('--- ATLAS MATCH DEBUG ---');
        pickerList.forEach(function(p) {
            const matched = !!atlasQualityMap[p.login];
            const atlasKey = Object.keys(atlasQualityMap).find(k => k.toLowerCase() === (p.login||'').toLowerCase());
            if (!matched && atlasKey) {
                console.warn('[ATLAS] CASE MISMATCH — scorecard:', p.login, '| atlas key:', atlasKey);
            } else if (!matched) {
                console.log('[ATLAS] NO MATCH —', p.login);
            } else {
                console.log('[ATLAS] OK —', p.login);
            }
        });
        console.log('--- END DEBUG ---');
        status.textContent = 'Building report...';
        const html = buildReportHTML(pickerList, weeks, weeklyScorecard, pickHistoryMap, shiftMap, atlasQualityMap, reportTitle);
        const fname = 'WeeklyReport_' + reportTitle.replace(/[^a-zA-Z0-9]/g, '_') + '_' + weekLabel + '.html';
        downloadHTML(html, fname);
        status.textContent = '✓ Done! ' + pickerList.length + ' pickers — ' + weekLabel;
    }

    function downloadHTML(html, filename) {
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ── HTML Builder ─────────────────────────────────────────────────────────
    function buildSinglePickerHTML(sc, ps, fromDate, toDate) {
        const shiftVal = '-';
        const aq = atlasQualityMap[sc.login] || null;
        const tableHTML = buildPickerTable(sc, null, null, sc, ps, aq, { label: fromDate + ' → ' + toDate, startDate: fromDate, endDate: toDate }, 'Picker Report', [{ label: '-' }, { label: '-' }, { label: fromDate + ' → ' + toDate }], shiftVal);

        let html = '<!DOCTYPE html><html><head><meta charset="UTF-8">';
        html += '<title>Picker Report — ' + sc.login + '</title>';
        html += getCommonCSS();
        html += '</head><body style="margin:20px;background:#f0f0f0;">';
        html += tableHTML;
        html += '</body></html>';
        return html;
    }

    function buildReportHTML(pickerList, weeks, weeklyScorecard, pickHistoryMap, shiftMap, atlasQualityMap, manager) {
        const cw = weeks[2];

        let html = '<!DOCTYPE html><html><head><meta charset="UTF-8">';
        html += '<title>Weekly Report ' + cw.label + ' — ' + manager + '</title>';
        html += getCommonCSS();

        // Sidebar ve içerik CSS
        html += '<style>';
        html += 'body{font-family:Calibri,Arial,sans-serif;margin:0;background:#f0f0f0;}';
        html += '.sidebar{position:fixed;left:0;top:0;bottom:0;width:200px;background:#1A1A2E;overflow-y:auto;z-index:100;}';
        html += '.sidebar-header{padding:14px 12px;background:#0F3460;color:#E2B714;font-weight:bold;font-size:13px;border-bottom:1px solid #313244;}';
        html += '.sidebar-info{padding:6px 12px;color:#a6adc8;font-size:11px;border-bottom:1px solid #313244;}';
        html += '.shift-filter-box{padding:8px 12px;border-bottom:1px solid #313244;}';
        html += '.shift-filter-title{color:#a6adc8;font-size:10px;margin-bottom:4px;text-transform:uppercase;}';
        html += '.shift-filter-all{font-size:10px;color:#a6adc8;margin-bottom:6px;}';
        html += '.shift-filter-all span{color:#E2B714;text-decoration:underline;cursor:pointer;margin:0 2px;}';
        html += '.shift-filter-item{display:flex;align-items:center;gap:6px;font-size:11px;color:#cdd6f4;padding:2px 0;cursor:pointer;}';
        html += '.shift-filter-item input{accent-color:#E2B714;cursor:pointer;}';
        html += '.manager-filter-box{padding:8px 12px;border-bottom:1px solid #313244;}';
        html += '.manager-filter-select{width:100%;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:4px;padding:4px 6px;font-size:11px;font-family:Calibri,Arial,sans-serif;}';
        html += '.tab-btn{display:block;width:100%;padding:9px 12px;background:none;border:none;border-bottom:1px solid #313244;color:#cdd6f4;text-align:left;cursor:pointer;font-size:12px;font-family:Calibri,Arial,sans-serif;}';
        html += '.tab-btn:hover{background:#313244;}';
        html += '.tab-btn.active{background:#0F3460;color:#E2B714;font-weight:bold;}';
        html += '.tab-btn.hidden{display:none;}';
        html += '.content{margin-left:200px;padding:16px;}';
        html += '.picker-page{display:none;}';
        html += '.picker-page.active{display:block;}';
        html += '.print-bar{display:flex;gap:10px;margin-bottom:12px;align-items:center;flex-wrap:wrap;}';
        html += '.print-btn{padding:7px 18px;background:#0F3460;color:#FFFFFF;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;}';
        html += '.print-btn:hover{background:#E2B714;color:#1A1A2E;}';
        html += '.print-all-btn{padding:7px 18px;background:#27AE60;color:#FFFFFF;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;}';
        html += '.print-all-btn:hover{background:#1e8449;}';
        html += '.page-title{color:#1A1A2E;font-size:14px;font-weight:bold;}';
        html += '@media print{';
        html += '.sidebar,.print-bar{display:none!important;}';
        html += '.content{margin-left:0!important;padding:3mm!important;}';
        html += '.picker-page{display:block!important;page-break-after:always;}';
        html += 'table{width:100%!important;}';
        html += '}';
        html += '@page{margin:4mm;size:A5 landscape;}';
        html += '</style>';

        html += '<script>';
        html += 'function showTab(id){';
        html += 'document.querySelectorAll(".picker-page").forEach(function(el){el.classList.remove("active");});';
        html += 'document.querySelectorAll(".tab-btn").forEach(function(el){el.classList.remove("active");});';
        html += 'document.getElementById("page-"+id).classList.add("active");';
        html += 'document.getElementById("tab-"+id).classList.add("active");';
        html += '}';
        html += 'function printCurrent(){';
        html += 'var active=document.querySelector(".picker-page.active");if(!active)return;';
        html += 'document.querySelectorAll(".picker-page").forEach(function(el){el.style.display="none";});';
        html += 'active.style.display="block";window.print();';
        html += 'document.querySelectorAll(".picker-page").forEach(function(el){el.style.display="";});';
        html += 'active.classList.add("active");}';
        html += 'function printAll(){';
        html += 'var visibleTabs=[...document.querySelectorAll(".tab-btn:not(.hidden)")].map(function(b){return b.id.replace("tab-","");});';
        html += 'document.querySelectorAll(".picker-page").forEach(function(el){el.style.display="none";});';
        html += 'visibleTabs.forEach(function(id){var p=document.getElementById("page-"+id);if(p)p.style.display="block";});';
        html += 'window.print();';
        html += 'document.querySelectorAll(".picker-page").forEach(function(el){el.style.display="";});';
        html += 'var active=document.querySelector(".tab-btn.active");';
        html += 'if(active){var id=active.id.replace("tab-","");document.getElementById("page-"+id).classList.add("active");}';
        html += '}';
        html += 'function applyFilters(){';
        html += 'var selectedShifts=[...document.querySelectorAll(".shift-cb:checked")].map(function(cb){return cb.value;});';
        html += 'var mgrEl=document.getElementById("manager-filter-select");';
        html += 'var selectedMgr=mgrEl?mgrEl.value:"";';
        html += 'var tabs=document.querySelectorAll(".tab-btn");var firstVisible=null;var cnt=0;';
        html += 'tabs.forEach(function(btn){';
        html += 'var shift=btn.getAttribute("data-shift")||"-";';
        html += 'var mgr=btn.getAttribute("data-manager")||"";';
        html += 'var shiftOk=selectedShifts.length===0||selectedShifts.includes(shift);';
        html += 'var mgrOk=!selectedMgr||mgr===selectedMgr;';
        html += 'if(shiftOk&&mgrOk){btn.classList.remove("hidden");cnt++;if(!firstVisible)firstVisible=btn;}';
        html += 'else{btn.classList.add("hidden");}});';
        html += 'var vc=document.getElementById("visible-count");if(vc)vc.textContent=cnt;';
        html += 'if(firstVisible){var id=firstVisible.id.replace("tab-","");showTab(parseInt(id));}';
        html += '}';
        html += 'function applyShiftFilter(){applyFilters();}';
        html += 'function selectAllShifts(){document.querySelectorAll(".shift-cb").forEach(function(cb){cb.checked=true;});applyFilters();}';
        html += 'function selectNoneShifts(){document.querySelectorAll(".shift-cb").forEach(function(cb){cb.checked=false;});';
        html += 'document.querySelectorAll(".tab-btn").forEach(function(b){b.classList.add("hidden");});';
        html += 'document.querySelectorAll(".picker-page").forEach(function(p){p.classList.remove("active");});';
        html += 'var vc=document.getElementById("visible-count");if(vc)vc.textContent=0;}';
        html += '<' + '/script>';
        html += '</head><body>';

        // Shift listesi topla
        const htmlShifts = [...new Set(pickerList.map(function(sc) {
            return shiftMap && shiftMap[sc.login] ? shiftMap[sc.login] : '-';
        }))].sort();

        // Sidebar
        html += '<div class="sidebar">';
        html += '<div class="sidebar-header">📋 ' + cw.label + ' Report</div>';
        html += '<div class="sidebar-info">' + manager + '<br><span id="visible-count">' + pickerList.length + '</span> / ' + pickerList.length + ' pickers</div>';

        // Manager filter dropdown
        const htmlManagers = [...new Set(pickerList.map(p => p.managerName).filter(m => m && m !== 'Unknown'))].sort();
        if (htmlManagers.length > 0) {
            html += '<div class="manager-filter-box">';
            html += '<div class="shift-filter-title">Manager Filter</div>';
            html += '<select class="manager-filter-select" id="manager-filter-select" onchange="applyFilters()">';
            html += '<option value="">— All Managers —</option>';
            htmlManagers.forEach(function(m) {
                html += '<option value="' + m + '">' + m + '</option>';
            });
            html += '</select>';
            html += '</div>';
        }

        if (htmlShifts.length > 0) {
            html += '<div class="shift-filter-box">';
            html += '<div class="shift-filter-title">Shift Filter</div>';
            html += '<div class="shift-filter-all"><span onclick="selectAllShifts()">All</span> / <span onclick="selectNoneShifts()">None</span></div>';
            htmlShifts.forEach(function(shift) {
                html += '<label class="shift-filter-item"><input type="checkbox" class="shift-cb" value="' + shift + '" checked onchange="applyFilters()"> ' + shift + '</label>';
            });
            html += '</div>';
        }

        pickerList.forEach(function(sc, idx) {
            const shift = shiftMap && shiftMap[sc.login] ? shiftMap[sc.login] : '-';
            const mgrName = sc.managerName || '';
            html += '<button class="tab-btn' + (idx === 0 ? ' active' : '') + '" id="tab-' + idx + '" data-shift="' + shift + '" data-manager="' + mgrName + '" onclick="showTab(' + idx + ')">';
            html += sc.login || sc.fullName;
            html += '</button>';
        });
        html += '</div>';

        // Content
        html += '<div class="content">';
        pickerList.forEach(function(sc, idx) {
            const w0 = weeklyScorecard[0].find(function(p) { return p.login === sc.login; });
            const w1 = weeklyScorecard[1].find(function(p) { return p.login === sc.login; });
            const w2 = weeklyScorecard[2].find(function(p) { return p.login === sc.login; });
            const ps = pickHistoryMap[sc.login] || null;
            const aq = atlasQualityMap && atlasQualityMap[sc.login] || null;
            const shift = shiftMap && shiftMap[sc.login] || '-';

            html += '<div class="picker-page' + (idx === 0 ? ' active' : '') + '" id="page-' + idx + '">';
            html += '<div class="print-bar">';
            html += '<span class="page-title">' + (sc.fullName || sc.login) + '</span>';
            html += '<button class="print-btn" onclick="printCurrent()">🖨️ Print This</button>';
            html += '<button class="print-all-btn" onclick="printAll()">🖨️ Print All</button>';
            html += '</div>';
            html += buildPickerTable(sc, w0, w1, w2, ps, aq, cw, manager, weeks, shift);
            html += '</div>';
        });
        html += '</div></body></html>';
        return html;
    }

    function getCommonCSS() {
        return '<style>* { box-sizing: border-box; }</style>';
    }

    function buildPickerTable(sc, w0, w1, w2, ps, aq, cw, manager, weeks, shiftVal) {
        const C = {
            headerBg: '#2C3E50', headerFg: '#FFFFFF',
            subheaderBg: '#5D6D7E', subheaderFg: '#FFFFFF',
            labelBg: '#EBF5FB', labelFg: '#1A252F',
            rowA: '#FFFFFF', rowB: '#F8F9FA',
            border: '#BDC3C7',
            red: '#E74C3C', redFg: '#FFFFFF',
            orange: '#E67E22', orangeFg: '#FFFFFF',
            green: '#27AE60', greenFg: '#FFFFFF',
        };
        const fs = '6.5pt';
        const ff = 'Arial,sans-serif';
        const bd = '1px solid ' + C.border;

        function s(bg, fg, bold, align, pad, fs2, colspan) {
            let st = 'font-size:' + (fs2||fs) + ';font-family:' + ff + ';border:' + bd + ';vertical-align:middle;';
            st += 'padding:' + (pad||'2px 4px') + ';';
            if (bg) st += 'background:' + bg + ';';
            if (fg) st += 'color:' + fg + ';';
            if (bold) st += 'font-weight:bold;';
            st += 'text-align:' + (align||'left') + ';';
            return '<td' + (colspan ? ' colspan="'+colspan+'"':'') + ' style="' + st + '">';
        }

        function hdr(label, cols, bg, fg) {
            return '<tr><td colspan="' + cols + '" style="background:' + (bg||C.headerBg) + ';color:' + (fg||C.headerFg) + ';font-size:7pt;font-family:' + ff + ';font-weight:bold;padding:3px 5px;border:' + bd + ';letter-spacing:0.5px;">' + label + '</td></tr>';
        }

        function row4(l1, v1, l2, v2, bg) {
            return '<tr>' + s(C.labelBg,C.labelFg,true,'left') + l1 + '</td>' + s(bg||C.rowA,'#1A252F',false,'left') + (v1||'-') + '</td>' +
                s(C.labelBg,C.labelFg,true,'left') + l2 + '</td>' + s(bg||C.rowA,'#1A252F',false,'left') + (v2||'-') + '</td></tr>';
        }

        function fmt(v, dec) {
            if (v === null || v === undefined) return '-';
            const n = Number(v); if (isNaN(n)) return '-';
            return dec ? n.toFixed(dec) : Math.round(n).toString();
        }

        function uphBg(uph, exp) {
            if (!uph || !exp || uph === '-') return '';
            const r = uph/exp;
            return r < 0.80 ? C.red : r < 1.0 ? C.orange : C.green;
        }

        const uph = sc.directPickRate || null;
        const exp = sc.expectedPickRate || null;
        const ubg = uphBg(uph, exp);
        const ufg = ubg ? '#FFFFFF' : '#1A252F';

        const cwLabel = cw ? cw.label : '-';
        const cwStart = cw ? cw.startDate : '-';
        const cwEnd = cw ? cw.endDate : '-';
        const weeksArr = weeks || [{label:'-'},{label:'-'},{label:cwLabel}];

        let t = '<div style="display:flex;gap:5px;width:100%;box-sizing:border-box;align-items:stretch;">';

        // ── SOL ──
        t += '<div style="flex:1;min-width:0;display:flex;flex-direction:column;">';

        // Başlık
        t += '<table style="width:100%;border-collapse:collapse;margin-bottom:3px;">';
        t += '<tr><td colspan="4" style="background:' + C.headerBg + ';color:#FFFFFF;font-size:8pt;font-family:' + ff + ';font-weight:bold;padding:4px 8px;border:' + bd + ';text-align:center;">IST2 PICK PERFORMANCE REPORT</td></tr>';
        t += '<tr><td colspan="4" style="background:' + C.subheaderBg + ';color:#FFFFFF;font-size:6.5pt;font-family:' + ff + ';padding:2px 8px;border:' + bd + ';text-align:center;">' + cwLabel + ' | ' + cwStart + ' → ' + cwEnd + ' | ' + manager + '</td></tr>';
        t += '</table>';

        // Employee Details
        t += '<table style="width:100%;border-collapse:collapse;margin-bottom:3px;">';
        t += hdr('EMPLOYEE DETAILS', 4);
        t += row4('Full Name', sc.fullName||'-', 'Login', sc.login||'-', C.rowA);
        t += row4('Employee ID', sc.employeeId||'-', 'Manager', sc.managerName||'-', C.rowB);
        t += row4('Days in Amazon', sc.daysSinceHired ? sc.daysSinceHired+' days' : '-', 'Shift Pattern', shiftVal||'-', C.rowA);
        t += '</table>';

        // Overall Summary
        t += '<table style="width:100%;border-collapse:collapse;margin-bottom:3px;">';
        t += hdr('OVERALL SUMMARY', 4);
        t += '<tr>' + s(C.labelBg,C.labelFg,true,'center') + 'Total Units</td>' + s(C.labelBg,C.labelFg,true,'center') + 'UPH Actual</td>' + s(C.labelBg,C.labelFg,true,'center') + 'Exp UPH</td>' + s(C.labelBg,C.labelFg,true,'center') + 'Direct Time (h)</td></tr>';
        t += '<tr>' +
            s(C.rowA,'#1A252F',true,'center') + (ps ? ps.totalUnits : (sc.quantityPicked||0)) + '</td>' +
            s(ubg||C.rowA, ufg, true, 'center') + fmt(uph,1) + '</td>' +
            s(C.rowA,'#555',false,'center') + fmt(exp,1) + '</td>' +
            s(C.rowA,'#1A252F',false,'center') + fmt(sc.actualDirectTime,2) + '</td></tr>';
        t += '<tr>' + s(C.labelBg,C.labelFg,true,'center') + 'Shorted</td>' + s(C.labelBg,C.labelFg,true,'center') + 'Damaged</td>' + s(C.labelBg,C.labelFg,true,'center') + 'VLP</td>' + s(C.labelBg,C.labelFg,true,'center') + 'Rejects</td></tr>';
        t += '<tr>' +
            s(C.rowB,'#1A252F',false,'center') + (ps&&ps.totalShorted||0) + '</td>' +
            s(C.rowB,'#1A252F',false,'center') + (ps&&ps.totalDamaged||0) + '</td>' +
            s(C.rowB,'#1A252F',false,'center') + (sc.veryLongPicks||0) + '</td>' +
            s(C.rowB,'#1A252F',false,'center') + (sc.noOfRejects||0) + '</td></tr>';
        t += '</table>';

        // Performance Trend
        t += '<table style="width:100%;border-collapse:collapse;margin-bottom:3px;">';
        t += hdr('PERFORMANCE TREND — LAST 3 WEEKS', 4);
        t += '<tr>' + s(C.labelBg,C.labelFg,true,'left') + 'Metric</td>' + s(C.labelBg,C.labelFg,true,'center') + weeksArr[0].label + '</td>' + s(C.labelBg,C.labelFg,true,'center') + weeksArr[1].label + '</td>' + s(C.labelBg,C.labelFg,true,'center') + weeksArr[2].label + '</td></tr>';
        const trendRows = [
            ['UPH Actual', 'directPickRate', true],
            ['UPH Expected', 'expectedPickRate', false],
            ['Direct Time (h)', 'actualDirectTime', false],
            ['Units Picked', 'quantityPicked', false],
            ['Very Long Picks', 'veryLongPicks', false],
            ['Rejects', 'noOfRejects', false]
        ];
        trendRows.forEach(function(item, ti) {
            const label = item[0], field = item[1], isUph = item[2];
            const bg = ti%2===0 ? C.rowA : C.rowB;
            const wds = [w0, w1, w2];
            let cells = s(C.labelBg,C.labelFg,true,'left') + label + '</td>';
            wds.forEach(function(wd) {
                const val = wd && wd[field] != null ? Math.round(Number(wd[field])*10)/10 : null;
                let cellBg = bg;
                if (isUph && val !== null) {
                    const expV = wd && wd.expectedPickRate;
                    if (expV) cellBg = uphBg(val, expV) || bg;
                }
                const cellFg = (isUph && cellBg !== bg) ? '#FFFFFF' : '#1A252F';
                cells += s(cellBg, cellFg, isUph && cellBg!==bg, 'center') + (val !== null ? val : '-') + '</td>';
            });
            t += '<tr>' + cells + '</tr>';
        });
        t += '</table>';

        // Floor + Hourly Distribution — yan yana
        const hasFloor = ps && ps.floorMap && Object.keys(ps.floorMap).length > 0;
        const hasHourly = ps && ps.hourMap && Object.keys(ps.hourMap).length > 0;
        if (hasFloor || hasHourly) {
            t += '<div style="display:flex;gap:4px;margin-bottom:3px;">';

            if (hasFloor) {
                t += '<div style="flex:1;min-width:0;">';
                t += '<table style="width:100%;border-collapse:collapse;">';
                t += hdr('FLOOR DISTRIBUTION', 3);
                t += '<tr>' + s(C.labelBg,C.labelFg,true,'left') + 'Floor</td>' + s(C.labelBg,C.labelFg,true,'center') + 'Units</td>' + s(C.labelBg,C.labelFg,true,'center') + 'Bar</td></tr>';
                const floors = Object.entries(ps.floorMap).sort(function(a,b){return a[0].localeCompare(b[0]);});
                const maxU = Math.max.apply(null, floors.map(function(f){return f[1];}));
                floors.forEach(function(entry, fi) {
                    const bg = fi%2===0 ? C.rowA : C.rowB;
                    const pct = Math.round(entry[1]/maxU*50);
                    t += '<tr>' +
                        s(C.labelBg,C.labelFg,true,'left') + entry[0] + '</td>' +
                        s(bg,'#1A252F',false,'center') + entry[1] + '</td>' +
                        '<td style="background:' + bg + ';border:' + bd + ';padding:2px 4px;">' +
                        '<div style="background:' + C.subheaderBg + ';height:6px;width:' + pct + 'px;border-radius:2px;"></div></td></tr>';
                });
                t += '</table></div>';
            }

            if (hasHourly) {
                t += '<div style="flex:1;min-width:0;">';
                t += '<table style="width:100%;border-collapse:collapse;">';
                t += hdr('HOURLY DISTRIBUTION', 3);
                t += '<tr>' + s(C.labelBg,C.labelFg,true,'left') + 'Hour</td>' + s(C.labelBg,C.labelFg,true,'center') + 'Units</td>' + s(C.labelBg,C.labelFg,true,'center') + 'Bar</td></tr>';
                const hours = Object.entries(ps.hourMap).sort(function(a,b){return parseInt(a[0])-parseInt(b[0]);});
                const maxHU = Math.max.apply(null, hours.map(function(h){return h[1];}));
                hours.forEach(function(entry, hi) {
                    const bg = hi%2===0 ? C.rowA : C.rowB;
                    const h = parseInt(entry[0]);
                    const label = h.toString().padStart(2,'0') + ':00';
                    const pct = Math.round(entry[1]/maxHU*50);
                    t += '<tr>' +
                        s(C.labelBg,C.labelFg,true,'left') + label + '</td>' +
                        s(bg,'#1A252F',false,'center') + entry[1] + '</td>' +
                        '<td style="background:' + bg + ';border:' + bd + ';padding:2px 4px;">' +
                        '<div style="background:' + C.subheaderBg + ';height:6px;width:' + pct + 'px;border-radius:2px;"></div></td></tr>';
                });
                t += '</table></div>';
            }

            t += '</div>';
        }

        t += '</div>'; // Sol bitti

        // ── SAĞ ──
        t += '<div style="flex:1;min-width:0;display:flex;flex-direction:column;">';

        // Pick Performance
        t += '<table style="width:100%;border-collapse:collapse;margin-bottom:3px;">';
        t += hdr('PICK PERFORMANCE — THIS WEEK', 4);
        t += '<tr>' + s(C.labelBg,C.labelFg,true,'center') + 'Pick Process</td>' + s(C.labelBg,C.labelFg,true,'center') + 'Units</td>' + s(C.labelBg,C.labelFg,true,'center') + '%</td>' + s(C.labelBg,C.labelFg,true,'center') + 'UPH</td></tr>';
        if (ps && ps.procMap && Object.keys(ps.procMap).length > 0) {
            const procs = Object.entries(ps.procMap).sort(function(a,b){return b[1]-a[1];});
            const totalU = ps.totalUnits || sc.quantityPicked || 1;
            const generalUPH = parseFloat(sc.directPickRate) || 0;
            procs.forEach(function(entry, pi) {
                const bg = pi%2===0 ? C.rowA : C.rowB;
                const pct = (entry[1]/totalU*100).toFixed(1) + '%';
                // UPH from actualTimeBetweenScans (scan interval based)
                const scanSecs = ps.procTimeMap && ps.procTimeMap[entry[0]] ? ps.procTimeMap[entry[0]] : 0;
                const scanHours = scanSecs / 3600;
                const uph = scanHours > 0 ? Math.round(entry[1] / scanHours) : '-';
                const uphColor = (typeof uph === 'number' && generalUPH > 0) ? (
                    uph >= generalUPH ? '#27AE60' : uph >= generalUPH * 0.8 ? '#E67E22' : '#E74C3C'
                ) : null;
                const uphStyle = uphColor ? 'background:' + uphColor + ';color:#FFFFFF;font-weight:bold;' : '';
                t += '<tr>' + s(bg,'#1A252F',false,'left') + entry[0] + '</td>' + s(bg,'#1A252F',false,'center') + entry[1] + '</td>' + s(bg,'#555',false,'center') + pct + '</td><td style="' + uphStyle + 'font-size:6.5pt;font-family:' + ff + ';border:' + bd + ';padding:2px 4px;text-align:center;">' + uph + '</td></tr>';
            });
            // Note about UPH calculation method
            t += '<tr><td colspan="4" style="font-size:6pt;color:#777;font-style:italic;padding:2px 4px;border:' + bd + ';background:#F8F9FA;">Process UPH calculated from scan intervals (actualTimeBetweenScans)</td></tr>';
        }
        t += '</table>';

        // Quality Metrics — always show, use zeros if no ATLAS data
        {
            const aqData = aq || { totalDefects:'0', dpmo:'0', opportunities:'0', damage:'0', short:'0', reject:'0', errorIndicator:'0', wrongAsin:'0' };
            const noAtlas = !aq;
            const thresholds = { damage:1000, short:1700, reject:400, errorIndicator:700, wrongAsin:10000 };
            t += '<table style="width:100%;border-collapse:collapse;margin-bottom:3px;">';
            t += hdr('QUALITY METRICS' + (noAtlas ? ' — No ATLAS Data' : ''), 4);
            t += '<tr>' + s(C.labelBg,C.labelFg,true,'left') + 'Defect Type</td>' + s(C.labelBg,C.labelFg,true,'center') + 'Count</td>' + s(C.labelBg,C.labelFg,true,'center') + 'DPMO</td>' + s(C.labelBg,C.labelFg,true,'center') + 'Threshold</td></tr>';
            t += '<tr>' + s(C.rowB,'#1A252F',true,'left') + 'Total Pick</td>' +
                s(parseInt(aqData.totalDefects)>0?'#FADBD8':C.rowB,'#1A252F',true,'center') + aqData.totalDefects + '</td>' +
                s(C.rowB,'#1A252F',false,'center') + aqData.dpmo + ' DPMO</td>' +
                s(C.rowB,'#555',false,'center') + '-</td></tr>';
            t += '<tr><td colspan="4" style="font-size:6pt;color:#777;font-style:italic;padding:2px 4px;border:' + bd + ';background:#F8F9FA;">' + (noAtlas ? 'ATLAS verisi bulunamadı' : 'Individual Metrics') + '</td></tr>';
            const defects = [
                {label:'Damage', key:'damage', threshold:thresholds.damage},
                {label:'Short', key:'short', threshold:thresholds.short},
                {label:'Reject', key:'reject', threshold:thresholds.reject},
                {label:'Error Indicator', key:'errorIndicator', threshold:thresholds.errorIndicator},
                {label:'Wrong Asin', key:'wrongAsin', threshold:thresholds.wrongAsin}
            ];
            defects.forEach(function(d, di) {
                const count = parseInt(aqData[d.key])||0;
                const opp = parseInt(aqData.opportunities)||1;
                const dpmoVal = noAtlas ? 0 : Math.round(count/opp*1000000);
                const bg = di%2===0 ? C.rowA : C.rowB;
                const countBg = count>0 ? C.red : bg;
                const countFg = count>0 ? '#FFFFFF' : '#1A252F';
                const dpmoBg = noAtlas ? '#BDC3C7' : (dpmoVal > d.threshold ? C.red : dpmoVal >= d.threshold*0.80 ? C.orange : C.green);
                t += '<tr>' +
                    s(bg,'#1A252F',false,'left') + d.label + '</td>' +
                    s(countBg,countFg,count>0,'center') + count + '</td>' +
                    s(dpmoBg,'#FFFFFF',true,'center') + dpmoVal + ' DPMO</td>' +
                    s(bg,'#555',false,'center') + d.threshold + '</td></tr>';
            });
            t += '</table>';
        }

        // Performance Legend
        t += '<table style="width:100%;border-collapse:collapse;margin-bottom:3px;">';
        t += hdr('PERFORMANCE LEGEND', 4);
        const legends = [
            [C.red, 'Below 80% of expected UPH', 'Low Performance'],
            [C.orange, '80-100% of expected UPH', 'Average Performance'],
            [C.green, 'Above expected UPH', 'High Performance']
        ];
        legends.forEach(function(lg, li) {
            const bg = li%2===0 ? C.rowA : C.rowB;
            t += '<tr><td style="background:' + lg[0] + ';width:8px;border:' + bd + ';"></td>' +
                s(bg,'#1A252F',false,'left','2px 4px','','2') + lg[1] + '</td>' +
                s(bg,lg[0],true,'left') + lg[2] + '</td></tr>';
        });
        t += '</table>';

        t += '</div>'; // Sağ bitti
        t += '</div>'; // Wrapper bitti

        return t;
    }

    // ── Başlangıç ─────────────────────────────────────────────────────────────
    setTimeout(loadManagers, 800);

    // ── ATLAS saved data loader ────────────────────────────────────────────────
    // BroadcastChannel listener — ATLAS sekmesinden veri al
    (function setupAtlasChannel() {
        try {
            const bc = new BroadcastChannel('wr_ist2_atlas');
            bc.onmessage = function(event) {
                if (event.data && event.data.type === 'atlasData') {
                    console.log('[WeeklyReport] BroadcastChannel veri alındı');
                    try {
                        const parsed = JSON.parse(event.data.payload);
                        atlasQualityMap = parsed.data || {};
                        window.atlasQualityMap = atlasQualityMap;
                        const count = Object.keys(atlasQualityMap).length;
                        // Tüm sekmelerin status'larını güncelle
                        ['', '-shift', '-vardiya', '-picker'].forEach(suffix => {
                            const el = document.getElementById('wr-atlas-status' + suffix);
                            const btn = document.getElementById('wr-atlas-fetch-btn' + suffix);
                            if (el) { el.style.color = '#a6e3a1'; el.textContent = '✓ ' + count + ' pickers loaded (live)'; }
                            if (btn) { btn.style.borderColor = '#a6e3a1'; btn.style.color = '#a6e3a1'; }
                        });
                        recalcDpmo();
                        console.log('[WeeklyReport] atlasQualityMap güncellendi:', count, 'pickers');
                        // Also try to read from localStorage as backup
                        try {
                            const lsData = localStorage.getItem('wr_atlas_rawCounts');
                            if (lsData) console.log('[WeeklyReport] localStorage also has data');
                        } catch(e) {}
                    } catch(e) {
                        console.error('[WeeklyReport] BroadcastChannel parse hatası:', e);
                    }
                }
            };
            console.log('[WeeklyReport] Listening on BroadcastChannel...');
        } catch(e) {
            console.warn('[WeeklyReport] BroadcastChannel desteklenmiyor:', e);
        }
    })();

    function loadAtlasFromStorage(statusEl, btnEl) {
        // Try localStorage with cross-origin data from ATLAS window
        let saved = null;
        try { saved = localStorage.getItem('atlasQualityData_IST2'); } catch(e) {}
        // Also try rawCounts format
        if (!saved) {
            try {
                const raw = localStorage.getItem('wr_atlas_rawCounts');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    const rawCounts = parsed.rawCounts || {};
                    const cache = scorecardCache.length > 0 ? scorecardCache : allPickersCache;
                    atlasQualityMap = {};
                    Object.entries(rawCounts).forEach(([userId, counts]) => {
                        const sc = cache.find(p => p.login === userId);
                        const opp = sc ? (parseInt(sc.quantityPicked) || 1000) : 1000;
                        const total = (counts.short||0) + (counts.errorIndicator||0) + (counts.wrongAsin||0) + (counts.damage||0) + (counts.reject||0);
                        atlasQualityMap[userId] = {
                            opportunities: String(opp), short: String(counts.short||0),
                            errorIndicator: String(counts.errorIndicator||0), wrongAsin: String(counts.wrongAsin||0),
                            damage: String(counts.damage||0), reject: String(counts.reject||0),
                            totalDefects: String(total), dpmo: String(Math.round(total / opp * 1000000))
                        };
                    });
                    const count = Object.keys(atlasQualityMap).length;
                    if (statusEl) { statusEl.style.color = '#a6e3a1'; statusEl.textContent = '✓ ' + count + ' pickers loaded'; }
                    if (btnEl) { btnEl.style.borderColor = '#a6e3a1'; btnEl.style.color = '#a6e3a1'; }
                    console.log('[WeeklyReport] Loaded from localStorage rawCounts:', count);
                    return;
                }
            } catch(e) { console.warn('[WeeklyReport] localStorage rawCounts error:', e); }
        }
        const saved2 = saved;
        if (!saved) {
            if (statusEl) { statusEl.style.color = '#f38ba8'; statusEl.textContent = '✗ No data — open ATLAS page first'; }
            return;
        }
        try {
            const parsed = JSON.parse(saved);
            atlasQualityMap = parsed.data || {};
            window.atlasQualityMap = atlasQualityMap;
            const count = Object.keys(atlasQualityMap).length;
            const savedDate = parsed.savedAt ? new Date(parsed.savedAt).toLocaleString('tr-TR') : '?';
            if (statusEl) { statusEl.style.color = '#a6e3a1'; statusEl.textContent = '✓ ' + count + ' pickers (' + savedDate + ')'; }
            if (btnEl) { btnEl.style.borderColor = '#a6e3a1'; btnEl.style.color = '#a6e3a1'; }
        } catch(e) {
            if (statusEl) { statusEl.style.color = '#f38ba8'; statusEl.textContent = '✗ Data error'; }
        }
    }

    // ── FCLM Employee Search page ─────────────────────────────────────────────
    if (IS_FCLM_SEARCH) {
        injectFCLMSearchPanel();
        return;
    }

})();

// ── FCLM Search page handler ───────────────────────────────────────────────────
function injectFCLMSearchPanel() {
    if (!window.opener) return;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;background:#1e1e2e;color:#cdd6f4;padding:16px 20px;border-radius:10px;font-family:Segoe UI,Arial,sans-serif;font-size:13px;box-shadow:0 4px 20px rgba(0,0,0,0.5);min-width:280px;';
    overlay.innerHTML = '<div style="font-weight:700;">📋 Weekly Report — Waiting for logins...</div>';
    document.body.appendChild(overlay);

    const BATCH = 20;
    const STORAGE_KEY = 'wr_fclm_session';

    function parseCurrentPage(shiftMap) {
        const html = document.body.innerHTML;
        const cardRe = /class="label">Login<\/span>([\w-]+)<\/li>[\s\S]*?class="label">Shift<\/span>([\w-]+)<\/li>/g;
        let m;
        while ((m = cardRe.exec(html)) !== null) {
            shiftMap[m[1]] = m[2];
        }
        return shiftMap;
    }

    function submitBatch(logins) {
        const input = document.getElementById('term');
        const form = input ? input.closest('form') : null;
        if (!input || !form) { console.error('[FCLM] Form not found'); return; }
        input.value = logins.join(', ');
        // Submit butonu bul
        const submitBtn = form.querySelector('input[type=submit], button[type=submit]');
        if (submitBtn) submitBtn.click();
        else form.submit();
    }

    function sendAndClose(shiftMap) {
        const count = Object.keys(shiftMap).length;
        overlay.innerHTML = '<div style="font-weight:700;color:#a6e3a1;">✓ ' + count + ' shift patterns found, sending...</div>';
        sessionStorage.removeItem(STORAGE_KEY);
        try { window.opener.postMessage({ type: 'WR_FCLM_SHIFTS', shiftMap }, '*'); } catch(e) {}
        setTimeout(() => {
            overlay.innerHTML = '<div style="font-weight:700;color:#a6e3a1;">✓ Done! This tab can be closed.</div>';
            setTimeout(() => window.close(), 1500);
        }, 500);
    }

    // Sayfa yüklenince — devam eden session var mı?
    function onPageLoad() {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) {
            // Devam eden session — parse et ve sonraki batch'e geç
            const session = JSON.parse(raw);
            const shiftMap = session.shiftMap || {};
            parseCurrentPage(shiftMap);
            session.shiftMap = shiftMap;
            session.batchIndex++;

            const totalBatches = Math.ceil(session.logins.length / BATCH);
            overlay.innerHTML = '<div style="font-weight:700;">📋 Batch ' + session.batchIndex + '/' + totalBatches + ' — ' + Object.keys(shiftMap).length + ' pickers loaded...</div>';

            if (session.batchIndex >= totalBatches) {
                sendAndClose(shiftMap);
                return;
            }

            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
            const batch = session.logins.slice(session.batchIndex * BATCH, (session.batchIndex + 1) * BATCH);
            setTimeout(() => submitBatch(batch), 800);
        } else {
            // Yeni session — opener'a hazır olduğumuzu bildir
            overlay.innerHTML = '<div style="font-weight:700;">📋 Weekly Report — Ready, waiting...</div>';
            try { window.opener.postMessage({ type: 'WR_FCLM_READY' }, '*'); } catch(e) {}

            // Opener'dan login listesini bekle
            window.addEventListener('message', function(e) {
                if (!e.data || e.data.type !== 'WR_FCLM_START') return;
                const logins = e.data.logins || [];
                if (logins.length === 0) return;

                const session = { logins, batchIndex: 0, shiftMap: {} };
                sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));

                const totalBatches = Math.ceil(logins.length / BATCH);
                overlay.innerHTML = '<div style="font-weight:700;">📋 Batch 1/' + totalBatches + ' — Starting...</div>';
                const batch = logins.slice(0, BATCH);
                setTimeout(() => submitBatch(batch), 500);
            });
        }
    }

    if (document.readyState === 'complete') {
        setTimeout(onPageLoad, 800);
    } else {
        window.addEventListener('load', () => setTimeout(onPageLoad, 800));
    }
}

// ── ATLAS page functions ───────────────────────────────────────────────────────
async function autoFetchForOpener(params) {
    const hash = window.location.hash || '';
    const wrMatch = hash.match(/_wr_fetch=([^&]+)/);
    if (!wrMatch) return;

    const fromDate = params.wr_from;
    const toDate = params.wr_to;
    const dashboards = params.wr_dashboards;
    if (!fromDate || !toDate || !dashboards) {
        console.error('[ATLAS-AUTO] Missing params:', params);
        return;
    }

    const fromISO = fromDate + 'T00:00:00.000Z';
    const toISO   = toDate   + 'T23:59:59.999Z';
    const BASE = window.location.origin + '/_dashboards';
    const BULK = '/api/saved_objects/_bulk_get';

    // Show status overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;background:#1e1e2e;color:#cdd6f4;padding:16px 20px;border-radius:10px;font-family:Segoe UI,Arial,sans-serif;font-size:13px;box-shadow:0 4px 20px rgba(0,0,0,0.5);min-width:280px;';
    overlay.innerHTML = '<div style="font-weight:700;margin-bottom:8px;">📊 Weekly Report — ATLAS Fetch</div><div id="wr-auto-status">Baglaniyor...</div>';
    document.body.appendChild(overlay);

    function setStatus(msg) {
        const el = document.getElementById('wr-auto-status');
        if (el) el.textContent = msg;
        console.log('[ATLAS-AUTO]', msg);
    }

    async function osdPost(path, body) {
        const resp = await fetch(BASE + path, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'osd-xsrf': 'osd-fetch', 'Accept': 'application/json' },
            body: JSON.stringify(body)
        });
        const text = await resp.text();
        if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + text.slice(0,200));
        return JSON.parse(text);
    }

    async function fetchDash(dashId, fromISO, toISO) {
        const dashResp = await osdPost(BULK, [{ id: dashId, type: 'dashboard' }]);
        const dashObj = (dashResp.saved_objects || [])[0];
        if (!dashObj) throw new Error('Dashboard not found: ' + dashId);

        const searchRefs = (dashObj.references || []).filter(r => r.type === 'search').map(r => ({ type: r.type, id: r.id }));
        const searchResp = await osdPost(BULK, searchRefs);
        const searchObj = (searchResp.saved_objects || [])[0];
        if (!searchObj) throw new Error('Search not found');

        const indexRefs = (searchObj.references || []).filter(r => r.type === 'index-pattern').map(r => ({ type: r.type, id: r.id }));
        const indexResp = await osdPost(BULK, indexRefs);
        const indexObj = (indexResp.saved_objects || [])[0];
        if (!indexObj) throw new Error('Index not found');

        const result = await osdPost('/internal/search/opensearch', {
            params: {
                index: indexObj.attributes.title,
                body: {
                    version: true, size: 10000,
                    stored_fields: ['*'], _source: { excludes: [] }, docvalue_fields: [],
                    query: { bool: { filter: [{ range: { timestamp: { gte: fromISO, lte: toISO } } }] } }
                }
            }
        });
        return ((result.rawResponse || {}).hits || {}).hits || [];
    }

    const rawCounts = {};
    try {
        for (const dash of dashboards) {
            setStatus(dash.type + ' fetching...');
            try {
                const hits = await fetchDash(dash.id, fromISO, toISO);
                hits.forEach(hit => {
                    const src = hit._source || {};
                    const uid = src.user_id || src.user_id_raw || '';
                    if (!uid) return;
                    if (!rawCounts[uid]) rawCounts[uid] = { short:0, errorIndicator:0, wrongAsin:0, damage:0, reject:0 };
                    rawCounts[uid][dash.type] += parseInt(src[dash.countField]) || 1;
                });
                setStatus('✓ ' + dash.type + ': ' + hits.length + ' hits');
            } catch(e) {
                setStatus('⚠ ' + dash.type + ' atlandı: ' + e.message.slice(0,50));
            }
            await new Promise(r => setTimeout(r, 300));
        }

        const count = Object.keys(rawCounts).length;
        setStatus('✓ ' + count + ' pickers found. Sending...');

        // Send via BroadcastChannel (works between same-browser tabs regardless of domain)
        try {
            const bc = new BroadcastChannel('wr_ist2_atlas');
            bc.postMessage({ type: 'WR_ATLAS_RESULT', rawCounts, fromDate, toDate });
            setTimeout(() => bc.close(), 1000);
            console.log('[ATLAS-AUTO] Sent via BroadcastChannel');
        } catch(e) {
            console.warn('[ATLAS-AUTO] BroadcastChannel failed:', e);
        }
        // Also try postMessage to opener
        try {
            if (window.opener) window.opener.postMessage({ type: 'WR_ATLAS_RESULT', rawCounts }, '*');
        } catch(e) {}

        // BroadcastChannel - manual panel
        try {
            const bc2 = new BroadcastChannel('wr_ist2_atlas');
            bc2.postMessage({ type: 'WR_ATLAS_RESULT', rawCounts, fromDate, toDate });
            setTimeout(() => bc2.close(), 1000);
            console.log('[ATLAS] Panel BroadcastChannel sent:', Object.keys(rawCounts).length, 'users');
        } catch(e) { console.warn('[ATLAS] Panel BC error:', e); }

        setStatus('✓ Done! Switch to Picking Console.');
        overlay.style.borderLeft = '4px solid #a6e3a1';
        setTimeout(() => window.close(), 2000);

    } catch(e) {
        setStatus('✗ Error: ' + String(e).slice(0,100));
        overlay.style.borderLeft = '4px solid #f38ba8';
    }
}

function readTableAndSend() {
    // Check if opened by our script
    if (!window.opener) {
        console.log('[RAW-REPORTS] No opener, skipping');
        return;
    }

    // Click Raw Reports tab first
    function clickRawReports() {
        const tabs = Array.from(document.querySelectorAll('[role=tab], button'));
        const rawTab = tabs.find(el => el.innerText.trim() === 'Raw Reports');
        if (rawTab) {
            rawTab.click();
            console.log('[RAW-REPORTS] Clicked Raw Reports tab');
            return true;
        }
        return false;
    }

    // Overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;background:#1e1e2e;color:#cdd6f4;padding:16px 20px;border-radius:10px;font-family:Segoe UI,Arial,sans-serif;font-size:13px;box-shadow:0 4px 20px rgba(0,0,0,0.5);min-width:220px;';
    overlay.innerHTML = '<div style="font-weight:700;">📊 Weekly Report — Waiting...</div>';
    document.body.appendChild(overlay);

    const qualityMap = {};
    let idx = null;

    function parseCurrentPage() {
        const rows = document.querySelectorAll('table tr');
        if (rows.length < 2) return 0;
        // Build idx once from headers
        if (!idx) {
            const headers = [];
            rows[0].querySelectorAll('th,td').forEach(cell => headers.push(cell.innerText.trim()));
            idx = {
                userId:        headers.findIndex(h => h.toLowerCase() === 'user' || h.toLowerCase().includes('user manager')),
                opportunities: headers.findIndex(h => h.toLowerCase().includes('opportunit')),
                totalDefects:  headers.findIndex(h => h.toLowerCase().includes('total defect')),
                dpmo:          headers.findIndex(h => h.toLowerCase().includes('dpmo')),
                damage:        headers.findIndex(h => h.toLowerCase().includes('damage')),
                short:         headers.findIndex(h => h.toLowerCase().includes('short')),
                reject:        headers.findIndex(h => h.toLowerCase().includes('reject')),
                errorIndicator:headers.findIndex(h => h.toLowerCase().includes('error')),
                wrongAsin:     headers.findIndex(h => h.toLowerCase().includes('wrong')),
            };
        }
        let parsed = 0;
        rows.forEach((row, i) => {
            if (i === 0) return;
            const cells = row.querySelectorAll('td');
            if (cells.length < 3) return;
            const userId = idx.userId >= 0 ? cells[idx.userId]?.innerText.trim() : '';
            if (!userId || userId === 'User' || userId === 'User Manager ID') return;
            const parseNum = (ci) => {
                if (ci < 0 || !cells[ci]) return 0;
                return parseInt(cells[ci].innerText.replace(/[^0-9]/g, '')) || 0;
            };
            qualityMap[userId] = {
                opportunities:  String(parseNum(idx.opportunities)),
                totalDefects:   String(parseNum(idx.totalDefects)),
                dpmo:           String(parseNum(idx.dpmo)),
                damage:         String(parseNum(idx.damage)),
                short:          String(parseNum(idx.short)),
                reject:         String(parseNum(idx.reject)),
                errorIndicator: String(parseNum(idx.errorIndicator)),
                wrongAsin:      String(parseNum(idx.wrongAsin)),
            };
            parsed++;
        });
        return parsed;
    }

    function getNextBtn() {
        // ATLAS pagination: aria-label starts with "Go to next page"
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.find(b => {
            const label = (b.getAttribute('aria-label') || '').trim();
            return label.startsWith('Go to next page') && !b.disabled;
        }) || null;
    }

    function sendAndClose() {
        const count = Object.keys(qualityMap).length;
        console.log('[RAW-REPORTS] Total parsed:', count);
        overlay.innerHTML = '<div style="font-weight:700;color:#a6e3a1;">✓ ' + count + ' pickers found, sending...</div>';
        window.opener.postMessage({ type: 'WR_ATLAS_RESULT', qualityMap }, '*');
        setTimeout(() => {
            overlay.innerHTML = '<div style="font-weight:700;color:#a6e3a1;">✓ Done! This tab can be closed.</div>';
            setTimeout(() => window.close(), 1500);
        }, 500);
    }

    function processAllPages(pageNum, maxWait) {
        const rows = document.querySelectorAll('table tr');
        const firstRowText = rows.length > 0 ? rows[0].innerText : '';
        const hasCorrectTable = firstRowText.includes('User') && rows.length > 1;

        if (!hasCorrectTable) {
            clickRawReports();
            if (maxWait > 0) {
                setTimeout(() => processAllPages(pageNum, maxWait - 1), 1000);
            } else {
                overlay.innerHTML = '<div style="color:#f38ba8;">✗ Table not found</div>';
            }
            return;
        }

        const parsed = parseCurrentPage();
        const total = Object.keys(qualityMap).length;
        overlay.innerHTML = '<div style="font-weight:700;">📊 Page ' + pageNum + ' — ' + total + ' pickers read...</div>';
        console.log('[RAW-REPORTS] Page', pageNum, '- parsed:', parsed, '- total:', total);

        // Next butonuna bak
        setTimeout(() => {
            const nextBtn = getNextBtn();
            if (nextBtn) {
                console.log('[RAW-REPORTS] Next button found, clicking page', pageNum + 1);
                nextBtn.click();
                // Yeni sayfanın yüklenmesini bekle
                setTimeout(() => processAllPages(pageNum + 1, 10), 2000);
            } else {
                console.log('[RAW-REPORTS] No next button — last page reached');
                sendAndClose();
            }
        }, 500);
    }

    // Başlat
    setTimeout(() => {
        clickRawReports();
        setTimeout(() => processAllPages(1, 20), 2000);
    }, 1000);
}

function injectAtlasPanel() {
    const ATLAS_DASHBOARDS = [
        { id: '4c8c3d90-445c-11e9-86f1-a72adc4935ed', type: 'short',         countField: 'quantity' },
        { id: '1800ba30-4464-11e9-86f1-a72adc4935ed', type: 'errorIndicator', countField: 'quantity' },
        { id: '68a5a240-4462-11e9-8a46-bbf85c8a8a5d', type: 'wrongAsin',      countField: 'num_bad_scans' },
        { id: '8bceba30-4459-11e9-a572-c3a1576aa62f', type: 'damage',         countField: 'quantity' },
        { id: 'b784a950-445e-11e9-86f1-a72adc4935ed', type: 'reject',         countField: 'quantity' },
    ];

    const BASE = window.location.origin + '/_dashboards';

    async function osdPost(path, body) {
        const resp = await fetch(BASE + path, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'osd-xsrf': 'osd-fetch', 'Accept': '*/*' },
            body: JSON.stringify(body)
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
    }

    async function fetchDashboard(dashId, fromISO, toISO) {
        const bulk = '/api/saved_objects/_bulk_get';
        const dashResp = await osdPost(bulk, [{ id: dashId, type: 'dashboard' }]);
        const dashObj = dashResp.saved_objects[0];
        if (!dashObj) throw new Error('Dashboard not found: ' + dashId);

        const searchRefs = (dashObj.references || []).filter(r => r.type === 'search').map(r => ({ type: r.type, id: r.id }));
        if (!searchRefs.length) throw new Error('No search in dashboard');
        const searchResp = await osdPost(bulk, searchRefs);
        const searchObj = searchResp.saved_objects[0];

        const indexRefs = (searchObj.references || []).filter(r => r.type === 'index-pattern').map(r => ({ type: r.type, id: r.id }));
        const indexResp = await osdPost(bulk, indexRefs);
        const indexObj = indexResp.saved_objects[0];

        const meta = JSON.parse(searchObj.attributes.kibanaSavedObjectMeta.searchSourceJSON);

        const query = {
            params: {
                index: indexObj.attributes.title,
                body: {
                    version: true,
                    size: 10000,
                    stored_fields: ['*'],
                    _source: { excludes: [] },
                    docvalue_fields: [],
                    query: {
                        bool: {
                            must: [
                                meta.query && meta.query.query ? meta.query : { match_all: {} }
                            ],
                            filter: [
                                { range: { timestamp: { gte: fromISO, lte: toISO } } }
                            ]
                        }
                    }
                }
            }
        };

        const result = await osdPost('/internal/search/opensearch', query);
        return ((result.rawResponse || {}).hits || {}).hits || [];
    }

    // ── Panel UI ───────────────────────────────────────────────────────────────
    const panel = document.createElement('div');
    panel.id = 'wr-atlas-collector';
    panel.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;background:#1e1e2e;color:#cdd6f4;font-family:Segoe UI,Arial,sans-serif;font-size:13px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.6);width:320px;overflow:hidden;';
    panel.innerHTML = `
        <div style="background:#313244;padding:10px 14px;font-weight:700;font-size:13px;display:flex;justify-content:space-between;align-items:center;">
            <span>📊 Weekly Report — ATLAS Fetch</span>
            <button onclick="this.closest('#wr-atlas-collector').remove()" style="background:none;border:none;color:#f38ba8;font-size:16px;cursor:pointer;">×</button>
        </div>
        <div style="padding:12px 14px;">
            <div style="font-size:11px;color:#a6adc8;margin-bottom:4px;">From</div>
            <input id="wr-a-from" type="date" style="width:100%;background:#313244;border:1px solid #45475a;border-radius:6px;color:#cdd6f4;padding:6px 8px;font-size:13px;box-sizing:border-box;margin-bottom:8px;">
            <div style="font-size:11px;color:#a6adc8;margin-bottom:4px;">To</div>
            <input id="wr-a-to" type="date" style="width:100%;background:#313244;border:1px solid #45475a;border-radius:6px;color:#cdd6f4;padding:6px 8px;font-size:13px;box-sizing:border-box;margin-bottom:10px;">
            <button id="wr-a-fetch" style="width:100%;background:#f9e2af;color:#1e1e2e;border:none;border-radius:6px;padding:9px;font-weight:700;font-size:13px;cursor:pointer;">🔄 Fetch All Defect Data</button>
            <div id="wr-a-status" style="font-size:11px;margin-top:8px;min-height:16px;"></div>
        </div>
    `;
    document.body.appendChild(panel);

    // Set default dates (last Mon-Sun)
    const today = new Date();
    const dayOfWeek = today.getDay();
    const lastSun = new Date(today); lastSun.setDate(today.getDate() - dayOfWeek);
    const lastMon = new Date(lastSun); lastMon.setDate(lastSun.getDate() - 6);
    const fmt = d => d.toISOString().split('T')[0];
    document.getElementById('wr-a-from').value = fmt(lastMon);
    document.getElementById('wr-a-to').value = fmt(lastSun);

    // Re-inject if panel gets removed by ATLAS
    const observer = new MutationObserver(() => {
        if (!document.getElementById('wr-atlas-collector')) {
            observer.disconnect();
            setTimeout(injectAtlasPanel, 1000);
        }
    });
    observer.observe(document.body, { childList: true, subtree: false });

    document.getElementById('wr-a-fetch').addEventListener('click', async function() {
        const fromDate = document.getElementById('wr-a-from').value;
        const toDate = document.getElementById('wr-a-to').value;
        if (!fromDate || !toDate) { setStatus('✗ Set dates first', '#f38ba8'); return; }

        const fromISO = fromDate + 'T00:00:00.000Z';
        const toISO   = toDate   + 'T23:59:59.999Z';
        const btn = this;
        btn.disabled = true; btn.textContent = '⏳ Fetching...';

        function setStatus(msg, color) {
            const el = document.getElementById('wr-a-status');
            el.textContent = msg;
            el.style.color = color || '#cdd6f4';
        }

        const rawCounts = {};

        try {
            for (const dash of ATLAS_DASHBOARDS) {
                setStatus('Fetching ' + dash.type + '...', '#f9e2af');
                let hits = [];
                try {
                    hits = await fetchDashboard(dash.id, fromISO, toISO);
                } catch(e) {
                    console.warn('[ATLAS] ' + dash.type + ' failed:', e);
                }
                console.log('[ATLAS] ' + dash.type + ':', hits.length, 'hits');
                hits.forEach(hit => {
                    const src = hit._source || {};
                    const userId = src.user_id || src.user_id_raw || '';
                    if (!userId) return;
                    if (!rawCounts[userId]) rawCounts[userId] = { short:0, errorIndicator:0, wrongAsin:0, damage:0, reject:0 };
                    const val = parseInt(src[dash.countField]) || 1;
                    rawCounts[userId][dash.type] += val;
                });
                await new Promise(r => setTimeout(r, 300));
            }

            // Build quality map
            const qualityMap = {};
            Object.entries(rawCounts).forEach(([userId, counts]) => {
                const total = counts.short + counts.errorIndicator + counts.wrongAsin + counts.damage + counts.reject;
                qualityMap[userId] = {
                    opportunities: '1000',  // placeholder — will be overwritten by Scorecard data in Picking Console
                    short: String(counts.short),
                    errorIndicator: String(counts.errorIndicator),
                    wrongAsin: String(counts.wrongAsin),
                    damage: String(counts.damage),
                    reject: String(counts.reject),
                    totalDefects: String(total),
                    dpmo: '0'  // will be recalculated in Picking Console
                };
            });

            const saveData = JSON.stringify({ data: qualityMap, savedAt: Date.now(), fromDate, toDate });
            localStorage.setItem('atlasQualityData_IST2', saveData);

            // Send to Picking Console via window.opener.postMessage (cross-origin safe)
            try {
                if (window.opener && !window.opener.closed) {
                    window.opener.postMessage({ type: 'WR_ATLAS_RESULT', qualityMap }, '*');
                    console.log('[ATLAS] postMessage gönderildi → opener');
                } else {
                    console.warn('[ATLAS] window.opener yok veya kapalı');
                }
            } catch(e) {
                console.warn('[ATLAS] postMessage hatası:', e);
            }

            // BroadcastChannel fallback (same-origin durumunda çalışır)
            try {
                const bc = new BroadcastChannel('wr_ist2_atlas');
                bc.postMessage({ type: 'atlasData', payload: saveData });
                bc.close();
            } catch(e) {}

            const count = Object.keys(qualityMap).length;
            setStatus('✓ ' + count + ' pickers saved! Picking Console\'a dön.', '#a6e3a1');
            btn.textContent = '✅ Done!';

        } catch(e) {
            console.error('[ATLAS] Error:', e);
            setStatus('✗ Error: ' + String(e).slice(0, 80), '#f38ba8');
            btn.disabled = false; btn.textContent = '🔄 Fetch All Defect Data';
        }
    });
}
