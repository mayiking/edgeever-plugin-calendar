/* ============================================================
 * 驻村日历 — EdgeEver 插件 v1.0.3
 * 修复 panels.open 缺失：改为命令直接弹出 overlay 浮层
 * ============================================================ */

export default {
  activate(context) {
    // ---- 注册面板（侧边栏挂载）----
    let unregisterPanel = null;
    try {
      unregisterPanel = context.ui.panels.register({
        id: 'zhucun-calendar',
        title: '🗓️ 驻村日历',
        mount(container) {
          return renderCalendarPanel(container, context);
        },
      });
    } catch (e) {
      console.error('[驻村日历] 注册面板失败', e);
    }

    // ---- 注册命令：弹窗浮层打开日历 ----
    let unregisterCmd = null;
    try {
      unregisterCmd = context.commands.register({
        id: 'zhucun-calendar.open',
        title: '打开驻村日历',
        run() {
          openCalendarOverlay(context);
        },
      });
    } catch (e) {
      console.error('[驻村日历] 注册命令失败', e);
    }

    // ---- 注册第二个命令：弹窗直接跳到今天 ----
    let unregisterTodayCmd = null;
    try {
      unregisterTodayCmd = context.commands.register({
        id: 'zhucun-calendar.today',
        title: '驻村日历 · 跳到今天',
        run() {
          openCalendarOverlay(context, { goToday: true });
        },
      });
    } catch (e) {}

    try {
      context.ui.showNotice('驻村日历已加载 · ⌘K 输入"驻村日历"打开');
    } catch (_) {}

    return () => {
      try { unregisterPanel && unregisterPanel(); } catch (_) {}
      try { unregisterCmd && unregisterCmd(); } catch (_) {}
      try { unregisterTodayCmd && unregisterTodayCmd(); } catch (_) {}
    };
  },
};

/* ============================================================
 * 浮层模式：不依赖 ui.panels.open，命令触发时直接挂 DOM
 * ============================================================ */
let activeOverlayEl = null;
let activeOverlayRoot = null;

function openCalendarOverlay(context, opts) {
  // 已有浮层则聚焦
  if (activeOverlayEl) {
    activeOverlayEl.style.zIndex = '9999';
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'zcc-overlay';
  overlay.innerHTML =
    '<div class="zcc-overlay-backdrop"></div>' +
    '<div class="zcc-overlay-panel">' +
      '<div class="zcc-overlay-head">' +
        '<span class="zcc-overlay-title">🗓️ 驻村日历</span>' +
        '<button class="zcc-overlay-close" type="button" aria-label="关闭">×</button>' +
      '</div>' +
      '<div class="zcc-overlay-body"></div>' +
    '</div>';
  document.body.appendChild(overlay);
  activeOverlayEl = overlay;
  activeOverlayRoot = overlay.querySelector('.zcc-overlay-body');

  // 关闭逻辑
  const close = () => {
    try { overlay.remove(); } catch (_) {}
    activeOverlayEl = null;
    activeOverlayRoot = null;
  };
  overlay.querySelector('.zcc-overlay-close').addEventListener('click', close);
  overlay.querySelector('.zcc-overlay-backdrop').addEventListener('click', close);
  // ESC 关闭
  const onKey = (ev) => {
    if (ev.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);

  // 挂日历到浮层 body
  renderCalendarPanel(activeOverlayRoot, context, {
    onNoteOpen: (id) => {
      // 打开笔记前先关掉浮层，避免挡住
      close();
      try {
        context.ui.openNote(id).catch((e) => {
          console.error('[驻村日历] 打开笔记失败', e);
        });
      } catch (e) {
        console.error('[驻村日历] openNote 失败', e);
      }
    },
  }).then(() => {
    if (opts && opts.goToday) {
      // 模拟点击"今天"按钮
      const todayBtn = activeOverlayRoot && activeOverlayRoot.querySelector('.zcc-today');
      if (todayBtn) todayBtn.click();
    }
  }).catch((e) => {
    console.error('[驻村日历] 渲染失败', e);
    activeOverlayRoot.innerHTML = '<div style="padding:24px;color:#dc2626">日历加载失败：' + (e && e.message ? e.message : e) + '</div>';
  });
}

/* ============================================================
 * 面板渲染（同时支持面板容器 + 浮层 body 容器）
 * ============================================================ */
async function renderCalendarPanel(container, context, opts) {
  const isOverlay = !container.classList.contains('zcc-container');
  if (!isOverlay) {
    container.innerHTML = '';
    container.classList.add('zcc-container');
  }

  // 样式注入（仅一次）
  if (!document.getElementById('zcc-styles')) {
    const style = document.createElement('style');
    style.id = 'zcc-styles';
    style.textContent = PANEL_CSS;
    document.head.appendChild(style);
  }

  const state = {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    notesByDay: {},
    loading: false,
    notesCache: new Map(),
    selectedDay: null,
  };

  const wrap = document.createElement('div');
  wrap.className = 'zcc-wrap';

  const nav = document.createElement('div');
  nav.className = 'zcc-nav';
  nav.innerHTML =
    '<button class="zcc-btn zcc-prev" type="button" aria-label="上月">‹</button>' +
    '<div class="zcc-title">加载中…</div>' +
    '<button class="zcc-btn zcc-next" type="button" aria-label="下月">›</button>' +
    '<button class="zcc-btn zcc-today" type="button">今天</button>';
  wrap.appendChild(nav);

  const grid = document.createElement('div');
  grid.className = 'zcc-grid';
  wrap.appendChild(grid);

  const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
  weekdays.forEach((w) => {
    const el = document.createElement('div');
    el.className = 'zcc-weekday';
    el.textContent = w;
    grid.appendChild(el);
  });

  const cells = document.createElement('div');
  cells.className = 'zcc-cells';
  grid.appendChild(cells);

  const detail = document.createElement('div');
  detail.className = 'zcc-detail';
  detail.innerHTML = '<div class="zcc-detail-empty">点击日历上的日期查看当天笔记</div>';
  wrap.appendChild(detail);

  container.appendChild(wrap);

  nav.querySelector('.zcc-prev').addEventListener('click', () => {
    state.month--;
    if (state.month < 0) { state.month = 11; state.year--; }
    refresh();
  });
  nav.querySelector('.zcc-next').addEventListener('click', () => {
    state.month++;
    if (state.month > 11) { state.month = 0; state.year++; }
    refresh();
  });
  nav.querySelector('.zcc-today').addEventListener('click', () => {
    const t = new Date();
    state.year = t.getFullYear();
    state.month = t.getMonth();
    state.selectedDay = dateKey(t);
    refresh();
  });

  await refresh();

  async function refresh() {
    nav.querySelector('.zcc-title').textContent = state.year + ' 年 ' + (state.month + 1) + ' 月';

    cells.innerHTML = '';
    const first = new Date(state.year, state.month, 1);
    const firstDow = (first.getDay() + 6) % 7;
    for (let i = 0; i < firstDow; i++) {
      const blank = document.createElement('div');
      blank.className = 'zcc-cell zcc-blank';
      cells.appendChild(blank);
    }

    state.loading = true;
    const cacheKey = state.year + '-' + String(state.month + 1).padStart(2, '0');
    if (!state.notesCache.has(cacheKey)) {
      try {
        state.notesCache.set(cacheKey, await fetchMonthNotes(context, state.year, state.month));
      } catch (e) {
        console.error('[驻村日历] 拉取笔记失败', e);
        try { context.ui.showNotice('拉取笔记失败：' + (e && e.message ? e.message : e)); } catch (_) {}
      }
    }
    state.loading = false;

    const notesByDay = state.notesCache.get(cacheKey) || {};
    state.notesByDay = notesByDay;

    const today = dateKey(new Date());
    const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const k = state.year + '-' + String(state.month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const notes = notesByDay[k] || [];
      const cell = document.createElement('button');
      cell.className = 'zcc-cell zcc-day';
      cell.type = 'button';
      cell.dataset.day = k;
      if (k === today) cell.classList.add('zcc-today');
      if (state.selectedDay === k) cell.classList.add('zcc-selected');
      if (notes.length > 0) cell.classList.add('zcc-has-notes');
      cell.innerHTML =
        '<span class="zcc-day-num">' + d + '</span>' +
        (notes.length > 0 ? '<span class="zcc-badge">' + notes.length + '</span>' : '');
      cell.addEventListener('click', () => {
        state.selectedDay = k;
        cells.querySelectorAll('.zcc-selected').forEach((el) => el.classList.remove('zcc-selected'));
        cell.classList.add('zcc-selected');
        renderDetail(k, notes);
      });
      cells.appendChild(cell);
    }

    if (state.selectedDay) {
      renderDetail(state.selectedDay, notesByDay[state.selectedDay] || []);
    }
  }

  function renderDetail(dayKey, notes) {
    if (!notes.length) {
      detail.innerHTML = '<div class="zcc-detail-empty">' + dayKey + ' 没有笔记</div>';
      return;
    }
    const list = notes
      .map(function (n) {
        return (
          '<a class="zcc-note" data-id="' + n.id + '" href="#">' +
            '<span class="zcc-note-title">' + escapeHtml(n.title || '(无标题)') + '</span>' +
            '<span class="zcc-note-excerpt">' + escapeHtml((n.excerpt || '').slice(0, 80)) + '</span>' +
          '</a>'
        );
      })
      .join('');
    detail.innerHTML =
      '<div class="zcc-detail-head">' +
        '<span class="zcc-detail-day">' + dayKey + '</span>' +
        '<span class="zcc-detail-count">' + notes.length + ' 篇</span>' +
      '</div>' +
      '<div class="zcc-detail-list">' + list + '</div>';
    detail.querySelectorAll('.zcc-note').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        ev.preventDefault();
        const id = el.dataset.id;
        if (opts && opts.onNoteOpen) {
          opts.onNoteOpen(id);
          return;
        }
        context.ui.openNote(id).catch(function (e) {
          console.error('[驻村日历] 打开笔记失败', e);
          try { context.ui.showNotice('打开笔记失败：' + (e && e.message ? e.message : e)); } catch (_) {}
        });
      });
    });
  }
}

/* ============================================================
 * 数据
 * ============================================================ */
async function fetchMonthNotes(context, year, month) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59);

  const result = {};
  let offset = 0;
  const pageSize = 200;

  while (true) {
    let page;
    try {
      page = await context.notes.query({ sort: 'updated-desc', limit: pageSize, offset });
    } catch (e) {
      console.error('[驻村日历] query 失败', e);
      break;
    }
    const notes = (page && page.notes) || [];
    if (!notes.length) break;

    let touchedInMonth = 0;
    for (const n of notes) {
      const updated = new Date(n.updatedAt);
      if (updated >= start && updated <= end) {
        const k = dateKey(updated);
        if (!result[k]) result[k] = [];
        result[k].push(n);
        touchedInMonth++;
      }
    }

    if (notes.length < pageSize || page.nextOffset == null) break;
    const maxDate = new Date(notes[0].updatedAt);
    if (maxDate < start) break;
    if (touchedInMonth === 0 && Object.keys(result).length === 0 && maxDate < start) break;
    offset = page.nextOffset;
  }

  return result;
}

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const PANEL_CSS =
  /* 容器 */
  '.zcc-container{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#1f2937;padding:8px;font-size:13px;}' +
  '.zcc-wrap{display:flex;flex-direction:column;gap:8px;}' +
  /* 浮层 */
  '.zcc-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;}' +
  '.zcc-overlay-backdrop{position:absolute;inset:0;background:rgba(0,0,0,0.4);backdrop-filter:blur(2px);}' +
  '.zcc-overlay-panel{position:relative;background:#fff;color:#1f2937;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.25);width:480px;max-width:92vw;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;}' +
  '.zcc-overlay-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #e5e7eb;}' +
  '.zcc-overlay-title{font-weight:600;font-size:15px;}' +
  '.zcc-overlay-close{background:transparent;border:0;color:#6b7280;font-size:24px;line-height:1;cursor:pointer;padding:0 4px;border-radius:4px;}' +
  '.zcc-overlay-close:hover{background:#f3f4f6;color:#1f2937;}' +
  '.zcc-overlay-body{padding:8px 16px 16px;overflow-y:auto;}' +
  /* 导航 */
  '.zcc-nav{display:grid;grid-template-columns:32px 1fr 32px auto;gap:8px;align-items:center;padding:8px 4px;}' +
  '.zcc-nav .zcc-title{font-weight:600;text-align:center;font-size:14px;}' +
  '.zcc-btn{background:transparent;border:1px solid #e5e7eb;color:inherit;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:16px;line-height:1;transition:background .15s;}' +
  '.zcc-btn:hover{background:#f3f4f6;}' +
  '.zcc-btn.zcc-today{font-size:12px;padding:5px 12px;}' +
  /* 网格 */
  '.zcc-grid{display:flex;flex-direction:column;gap:4px;padding:0 4px;}' +
  '.zcc-weekday,.zcc-cell{aspect:1;display:flex;align-items:center;justify-content:center;}' +
  '.zcc-weekday{font-size:11px;color:#6b7280;font-weight:500;aspect:auto;height:20px;}' +
  '.zcc-cells{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;}' +
  '.zcc-cell{background:transparent;border:1px solid transparent;color:inherit;cursor:pointer;border-radius:8px;padding:4px;position:relative;flex-direction:column;font-size:13px;transition:background .12s;}' +
  '.zcc-cell.zcc-blank{cursor:default;}' +
  '.zcc-cell.zcc-day:hover{background:#f3f4f6;}' +
  '.zcc-cell.zcc-today{background:#fef3c7;font-weight:700;}' +
  '.zcc-cell.zcc-selected{background:#3b82f6!important;color:#fff;font-weight:700;}' +
  '.zcc-cell.zcc-selected .zcc-badge{background:rgba(255,255,255,.3);color:#fff;}' +
  '.zcc-day-num{font-size:13px;}' +
  '.zcc-badge{position:absolute;bottom:3px;right:3px;background:#3b82f6;color:#fff;border-radius:9px;padding:0 5px;min-width:16px;height:16px;line-height:16px;font-size:10px;font-weight:600;}' +
  /* 详情 */
  '.zcc-detail{border-top:1px solid #e5e7eb;padding:12px 4px 4px;max-height:300px;overflow-y:auto;}' +
  '.zcc-detail-empty{color:#6b7280;font-size:12px;text-align:center;padding:16px 0;}' +
  '.zcc-detail-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:12px;color:#6b7280;}' +
  '.zcc-detail-day{font-weight:600;color:#1f2937;}' +
  '.zcc-detail-list{display:flex;flex-direction:column;gap:6px;}' +
  '.zcc-note{display:flex;flex-direction:column;gap:2px;padding:8px 10px;border-radius:6px;background:#f9fafb;text-decoration:none;color:inherit;transition:background .12s;cursor:pointer;border:1px solid transparent;}' +
  '.zcc-note:hover{background:#f3f4f6;border-color:#e5e7eb;}' +
  '.zcc-note-title{font-size:13px;font-weight:500;line-height:1.4;}' +
  '.zcc-note-excerpt{font-size:11px;color:#6b7280;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
  '';