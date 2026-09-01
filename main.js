/* ============================================================
 * 日历 — EdgeEver 插件 v1.1.0
 * macOS 备忘录风格日历，按笔记+附件改动日期聚合
 * ============================================================ */

export default {
  activate(context) {
    // ---- 注册面板 ----
    let unregisterPanel = null;
    try {
      unregisterPanel = context.ui.panels.register({
        id: 'calendar-plugin',
        title: '📅 日历',
        mount(container) {
          return renderCalendarPanel(container, context);
        },
      });
    } catch (e) {
      console.error('[日历] 注册面板失败', e);
    }

    // ---- 注册命令：浮层打开 ----
    let unregisterCmd = null;
    try {
      unregisterCmd = context.commands.register({
        id: 'calendar-plugin.open',
        title: '打开日历',
        run() {
          openCalendarOverlay(context);
        },
      });
    } catch (e) {
      console.error('[日历] 注册命令失败', e);
    }

    try {
      context.ui.showNotice('日历已加载 · ⌘K 输入"打开日历"');
    } catch (_) {}

    return () => {
      try { unregisterPanel && unregisterPanel(); } catch (_) {}
      try { unregisterCmd && unregisterCmd(); } catch (_) {}
    };
  },
};

/* ============================================================
 * 浮层
 * ============================================================ */
let activeOverlayEl = null;
let activeOverlayRoot = null;

function openCalendarOverlay(context) {
  if (activeOverlayEl) {
    activeOverlayEl.style.zIndex = '9999';
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'cal-overlay';
  overlay.innerHTML =
    '<div class="cal-overlay-backdrop"></div>' +
    '<div class="cal-overlay-panel">' +
      '<div class="cal-overlay-head">' +
        '<span class="cal-overlay-title">📅 日历</span>' +
        '<button class="cal-overlay-close" type="button" aria-label="关闭">×</button>' +
      '</div>' +
      '<div class="cal-overlay-body"></div>' +
    '</div>';
  document.body.appendChild(overlay);
  activeOverlayEl = overlay;
  activeOverlayRoot = overlay.querySelector('.cal-overlay-body');

  const close = () => {
    try { overlay.remove(); } catch (_) {}
    activeOverlayEl = null;
    activeOverlayRoot = null;
  };
  overlay.querySelector('.cal-overlay-close').addEventListener('click', close);
  overlay.querySelector('.cal-overlay-backdrop').addEventListener('click', close);
  const onKey = (ev) => {
    if (ev.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);

  renderCalendarPanel(activeOverlayRoot, context, {
    onNoteOpen: (id) => {
      close();
      try {
        context.ui.openNote(id).catch((e) => {
          console.error('[日历] 打开笔记失败', e);
        });
      } catch (e) {
        console.error('[日历] openNote 失败', e);
      }
    },
  }).catch((e) => {
    console.error('[日历] 渲染失败', e);
    activeOverlayRoot.innerHTML = '<div style="padding:24px;color:#dc2626">日历加载失败：' + (e && e.message ? e.message : e) + '</div>';
  });
}

/* ============================================================
 * 面板渲染
 * ============================================================ */
async function renderCalendarPanel(container, context, opts) {
  const isOverlay = !container.classList.contains('cal-container');
  if (!isOverlay) {
    container.innerHTML = '';
    container.classList.add('cal-container');
  }

  // 样式注入
  if (!document.getElementById('cal-styles')) {
    const style = document.createElement('style');
    style.id = 'cal-styles';
    style.textContent = PANEL_CSS;
    document.head.appendChild(style);
  }

  const state = {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    notesByDay: {}, // { 'YYYY-MM-DD': [{id, title, type:'note'|'attachment'}] }
    loading: false,
    cache: new Map(),
    selectedDay: null,
  };

  const wrap = document.createElement('div');
  wrap.className = 'cal-wrap';

  // 顶部：年/月 + + 今天按钮
  const nav = document.createElement('div');
  nav.className = 'cal-nav';
  nav.innerHTML =
    '<button class="cal-btn cal-prev" type="button" aria-label="上月">‹</button>' +
    '<div class="cal-title">加载中…</div>' +
    '<button class="cal-btn cal-next" type="button" aria-label="下月">›</button>' +
    '<button class="cal-btn cal-today" type="button">今天</button>';
  wrap.appendChild(nav);

  // 周次表头
  const grid = document.createElement('div');
  grid.className = 'cal-grid';
  const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
  weekdays.forEach((w) => {
    const el = document.createElement('div');
    el.className = 'cal-weekday';
    el.textContent = w;
    grid.appendChild(el);
  });

  // 日期格子容器
  const cells = document.createElement('div');
  cells.className = 'cal-cells';
  grid.appendChild(cells);

  // 详情区
  const detail = document.createElement('div');
  detail.className = 'cal-detail';
  detail.innerHTML = '<div class="cal-detail-empty">点击日历上的日期查看当日笔记</div>';
  wrap.appendChild(detail);

  container.appendChild(wrap);

  // 行为
  nav.querySelector('.cal-prev').addEventListener('click', () => {
    state.month--;
    if (state.month < 0) { state.month = 11; state.year--; }
    refresh();
  });
  nav.querySelector('.cal-next').addEventListener('click', () => {
    state.month++;
    if (state.month > 11) { state.month = 0; state.year++; }
    refresh();
  });
  nav.querySelector('.cal-today').addEventListener('click', () => {
    const t = new Date();
    state.year = t.getFullYear();
    state.month = t.getMonth();
    state.selectedDay = dateKey(t);
    refresh();
  });

  await refresh();

  async function refresh() {
    nav.querySelector('.cal-title').textContent = state.year + ' 年 ' + (state.month + 1) + ' 月';

    cells.innerHTML = '';
    const first = new Date(state.year, state.month, 1);
    const firstDow = (first.getDay() + 6) % 7; // 0 = 周一
    for (let i = 0; i < firstDow; i++) {
      const blank = document.createElement('div');
      blank.className = 'cal-cell cal-blank';
      cells.appendChild(blank);
    }

    state.loading = true;
    const cacheKey = state.year + '-' + String(state.month + 1).padStart(2, '0');
    if (!state.cache.has(cacheKey)) {
      try {
        state.cache.set(cacheKey, await fetchMonthData(context, state.year, state.month));
      } catch (e) {
        console.error('[日历] 拉取数据失败', e);
        try { context.ui.showNotice('拉取失败：' + (e && e.message ? e.message : e)); } catch (_) {}
      }
    }
    state.loading = false;

    const notesByDay = state.cache.get(cacheKey) || {};
    state.notesByDay = notesByDay;

    const today = dateKey(new Date());
    const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const k = state.year + '-' + String(state.month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const items = notesByDay[k] || [];
      const cell = document.createElement('button');
      cell.className = 'cal-cell cal-day';
      cell.type = 'button';
      cell.dataset.day = k;
      if (k === today) cell.classList.add('cal-today');
      if (state.selectedDay === k) cell.classList.add('cal-selected');
      if (items.length > 0) cell.classList.add('cal-has-items');

      // macOS 风格：数字 + 圆点
      const dotsHtml = items.length > 0
        ? '<span class="cal-dots">' +
            '<span class="cal-dot"></span>' +
            (items.length > 1 ? '<span class="cal-dot"></span>' : '') +
            (items.length > 2 ? '<span class="cal-dot"></span>' : '') +
            (items.length > 3 ? '<span class="cal-dot-more">+' + (items.length - 3) + '</span>' : '') +
          '</span>'
        : '';
      cell.innerHTML =
        '<span class="cal-day-num">' + d + '</span>' +
        dotsHtml;

      cell.addEventListener('click', () => {
        state.selectedDay = k;
        cells.querySelectorAll('.cal-selected').forEach((el) => el.classList.remove('cal-selected'));
        cell.classList.add('cal-selected');
        renderDetail(k, items);
      });
      cells.appendChild(cell);
    }

    if (state.selectedDay) {
      renderDetail(state.selectedDay, notesByDay[state.selectedDay] || []);
    }
  }

  function renderDetail(dayKey, items) {
    if (!items.length) {
      detail.innerHTML = '<div class="cal-detail-empty">' + dayKey + ' 没有改动</div>';
      return;
    }
    const list = items
      .map(function (n) {
        const icon = n.type === 'attachment' ? '📎' : '📝';
        return (
          '<a class="cal-event" data-id="' + n.id + '" href="#">' +
            '<span class="cal-event-icon">' + icon + '</span>' +
            '<span class="cal-event-title">' + escapeHtml(n.title || '(无标题)') + '</span>' +
          '</a>'
        );
      })
      .join('');
    detail.innerHTML =
      '<div class="cal-detail-head">' +
        '<span class="cal-detail-day">' + dayKey + '</span>' +
        '<span class="cal-detail-count">' + items.length + ' 项</span>' +
      '</div>' +
      '<div class="cal-detail-list">' + list + '</div>';
    detail.querySelectorAll('.cal-event').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        ev.preventDefault();
        const id = el.dataset.id;
        if (opts && opts.onNoteOpen) {
          opts.onNoteOpen(id);
          return;
        }
        context.ui.openNote(id).catch(function (e) {
          console.error('[日历] 打开笔记失败', e);
        });
      });
    });
  }
}

/* ============================================================
 * 数据：聚合"笔记+附件"改动日期
 * ============================================================ */
async function fetchMonthData(context, year, month) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59);

  const result = {}; // 'YYYY-MM-DD' -> [{id,title,type}]

  // 拉所有笔记（分页）
  let offset = 0;
  const pageSize = 100;
  let allNotes = [];

  while (true) {
    let page;
    try {
      page = await context.notes.query({ sort: 'updated-desc', limit: pageSize, offset });
    } catch (e) {
      console.error('[日历] query 失败', e);
      break;
    }
    const notes = (page && page.notes) || [];
    if (!notes.length) break;
    allNotes = allNotes.concat(notes);
    if (notes.length < pageSize || page.nextOffset == null) break;
    // 提前终止：最后一条 updatedAt 早于本月第一天就停
    const last = new Date(notes[notes.length - 1].updatedAt);
    if (last < start) break;
    offset = page.nextOffset;
    // 安全熔断
    if (allNotes.length > 5000) break;
  }

  // 收集本月的笔记（按 updatedAt）
  const monthNoteIds = new Set();
  for (const n of allNotes) {
    const d = new Date(n.updatedAt);
    if (d >= start && d <= end) {
      const k = dateKey(d);
      if (!result[k]) result[k] = [];
      result[k].push({ id: n.id, title: n.title, type: 'note' });
      monthNoteIds.add(n.id);
    }
  }

  // 再额外拉附件（仅本月日期）：用资源的 list + 资源本身的 updatedAt
  // API 设计：resources.list() 不带日期过滤；为节省开销，仅对本月有更新的笔记查附件
  // 实际策略：取所有笔记的附件（流式）
  try {
    let resOffset = 0;
    const resPageSize = 100;
    while (true) {
      let resPage;
      try {
        if (context.resources && context.resources.list) {
          // SDK 支持 resources.list
          resPage = await context.resources.list();
          // resPage 可能是数组或 {resources: [...]} — 做兼容
          const arr = Array.isArray(resPage) ? resPage : (resPage.resources || []);
          for (const r of arr) {
            const d = new Date(r.updatedAt || r.createdAt);
            if (d >= start && d <= end && r.noteId) {
              const k = dateKey(d);
              if (!result[k]) result[k] = [];
              // 避免同一 noteId 重复
              if (!result[k].some((x) => x.id === r.noteId)) {
                result[k].push({ id: r.noteId, title: '附件：' + (r.filename || '未命名'), type: 'attachment' });
              }
            }
          }
          // SDK 是否分页未知，保守跳出
          break;
        } else {
          break;
        }
      } catch (e) {
        console.warn('[日历] resources.list 失败，跳过附件', e);
        break;
      }
    }
  } catch (e) {
    // ignore
  }

  // 排序每天的 items：笔记在前，附件在后
  Object.keys(result).forEach((k) => {
    result[k].sort((a, b) => {
      if (a.type === b.type) return 0;
      return a.type === 'note' ? -1 : 1;
    });
  });

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
  '.cal-container{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#1f2937;padding:8px;font-size:13px;}' +
  '.cal-wrap{display:flex;flex-direction:column;gap:8px;}' +
  /* 浮层 */
  '.cal-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;}' +
  '.cal-overlay-backdrop{position:absolute;inset:0;background:rgba(0,0,0,0.45);backdrop-filter:blur(3px);}' +
  '.cal-overlay-panel{position:relative;background:#fff;color:#1f2937;border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.3);width:520px;max-width:94vw;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;}' +
  '.cal-overlay-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #e5e7eb;}' +
  '.cal-overlay-title{font-weight:600;font-size:16px;}' +
  '.cal-overlay-close{background:transparent;border:0;color:#6b7280;font-size:28px;line-height:1;cursor:pointer;padding:0 6px;border-radius:6px;}' +
  '.cal-overlay-close:hover{background:#f3f4f6;color:#1f2937;}' +
  '.cal-overlay-body{padding:10px 18px 18px;overflow-y:auto;}' +
  /* 导航 */
  '.cal-nav{display:grid;grid-template-columns:36px 1fr 36px auto;gap:10px;align-items:center;padding:6px 4px;}' +
  '.cal-nav .cal-title{font-weight:600;text-align:center;font-size:16px;color:#111827;}' +
  '.cal-btn{background:transparent;border:1px solid #e5e7eb;color:#374151;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:18px;line-height:1;transition:background .15s;}' +
  '.cal-btn:hover{background:#f3f4f6;border-color:#d1d5db;}' +
  '.cal-btn.cal-today{font-size:13px;padding:6px 14px;}' +
  /* 网格 */
  '.cal-grid{display:flex;flex-direction:column;gap:6px;padding:0 4px;}' +
  '.cal-weekday,.cal-cell{aspect:1;display:flex;align-items:center;justify-content:center;}' +
  '.cal-weekday{font-size:12px;color:#6b7280;font-weight:500;aspect:auto;height:22px;text-transform:uppercase;}' +
  '.cal-cells{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;}' +
  '.cal-cell{background:transparent;border:1px solid transparent;color:inherit;cursor:pointer;border-radius:10px;padding:4px;position:relative;flex-direction:column;font-size:14px;transition:background .12s;border:1px solid #f3f4f6;}' +
  '.cal-cell.cal-blank{cursor:default;border-color:transparent;}' +
  '.cal-cell.cal-day:hover{background:#f9fafb;border-color:#e5e7eb;}' +
  /* 今天：macOS 风格红字 */
  '.cal-cell.cal-today .cal-day-num{color:#ef4444;font-weight:700;}' +
  /* 选中：蓝色高亮 */
  '.cal-cell.cal-selected{background:#3b82f6!important;border-color:#3b82f6!important;color:#fff;}' +
  '.cal-cell.cal-selected .cal-day-num{color:#fff;}' +
  '.cal-cell.cal-selected .cal-dot{background:#fff;}' +
  '.cal-cell.cal-selected .cal-dot-more{color:#fff;background:rgba(255,255,255,.25);}' +
  /* 数字 */
  '.cal-day-num{font-size:15px;font-weight:500;line-height:1.2;}' +
  /* 圆点指示器 */
  '.cal-dots{position:absolute;bottom:5px;left:0;right:0;display:flex;justify-content:center;align-items:center;gap:3px;height:6px;}' +
  '.cal-dot{width:5px;height:5px;border-radius:50%;background:#3b82f6;display:inline-block;}' +
  '.cal-dot-more{font-size:9px;font-weight:600;color:#3b82f6;background:rgba(59,130,246,0.15);border-radius:8px;padding:0 4px;height:11px;line-height:11px;}' +
  /* 详情区 */
  '.cal-detail{border-top:1px solid #e5e7eb;padding:14px 4px 4px;max-height:320px;overflow-y:auto;}' +
  '.cal-detail-empty{color:#9ca3af;font-size:13px;text-align:center;padding:20px 0;}' +
  '.cal-detail-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-size:12px;color:#6b7280;padding:0 4px;}' +
  '.cal-detail-day{font-weight:600;color:#1f2937;font-size:13px;}' +
  '.cal-detail-list{display:flex;flex-direction:column;gap:6px;padding:0 4px;}' +
  /* 事件卡片（macOS 风格） */
  '.cal-event{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;background:#fff;text-decoration:none;color:inherit;transition:background .12s;cursor:pointer;border:1px solid #e5e7eb;border-left:3px solid #3b82f6;}' +
  '.cal-event:hover{background:#f9fafb;border-color:#3b82f6;}' +
  '.cal-event-icon{font-size:14px;flex-shrink:0;}' +
  '.cal-event-title{font-size:13px;font-weight:500;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;}' +
  '';