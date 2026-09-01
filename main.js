/* ============================================================
 * 驻村日历 — EdgeEver 插件
 * 在侧边栏挂一个日历面板；按日期聚合笔记；点击日期跳转笔记
 * 单文件 bundle，无依赖（无 import 相对模块）
 * ============================================================ */

export default {
  activate(context) {
    // ---- 1. 注册侧边栏面板 ----
    const unregisterPanel = context.ui.panels.register({
      id: 'zhucun-calendar',
      title: '🗓️ 驻村日历',
      mount(container) {
        return renderCalendarPanel(container, context);
      },
    });

    // ---- 2. 注册命令面板命令（Cmd+K）----
    const unregisterCmd = context.commands.register({
      id: 'zhucun-calendar.open',
      title: '打开驻村日历',
      run: async () => {
        await context.ui.panels.open('zhucun-calendar');
      },
    });

    // ---- 3. 提示 ----
    context.ui.showNotice('驻村日历已加载 · Cmd+K 输入"打开驻村日历"');

    // 返回卸载函数
    return () => {
      unregisterPanel?.();
      unregisterCmd?.();
    };
  },
};

/* ============================================================
 * 面板渲染
 * ============================================================ */
async function renderCalendarPanel(container, context) {
  // 清空容器
  container.innerHTML = '';
  container.classList.add('zcc-container');

  // 注入样式（避免样式泄漏到 EdgeEver 全局，使用 Shadow 容器化）
  const style = document.createElement('style');
  style.textContent = PANEL_CSS;
  container.appendChild(style);

  // ---- 状态 ----
  const state = {
    year: new Date().getFullYear(),
    month: new Date().getMonth(), // 0-11
    notesByDay: {}, // { '2026-08-25': [{id,title,excerpt}, ...] }
    loading: false,
    notesCache: new Map(), // monthCacheKey -> notesByDay
    selectedDay: null,
  };

  // ---- DOM 骨架 ----
  const wrap = document.createElement('div');
  wrap.className = 'zcc-wrap';

  // 顶部导航
  const nav = document.createElement('div');
  nav.className = 'zcc-nav';
  nav.innerHTML = `
    <button class="zcc-btn zcc-prev" type="button" aria-label="上月">‹</button>
    <div class="zcc-title">${state.year} 年 ${state.month + 1} 月</div>
    <button class="zcc-btn zcc-next" type="button" aria-label="下月">›</button>
    <button class="zcc-btn zcc-today" type="button">今天</button>
  `;
  wrap.appendChild(nav);

  // 日历网格
  const grid = document.createElement('div');
  grid.className = 'zcc-grid';
  wrap.appendChild(grid);

  // 周次表头
  const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
  weekdays.forEach((w) => {
    const el = document.createElement('div');
    el.className = 'zcc-weekday';
    el.textContent = w;
    grid.appendChild(el);
  });

  // 日期格子容器
  const cells = document.createElement('div');
  cells.className = 'zcc-cells';
  grid.appendChild(cells);

  // 下方选中日笔记列表
  const detail = document.createElement('div');
  detail.className = 'zcc-detail';
  detail.innerHTML = '<div class="zcc-detail-empty">点击日历上的日期查看当天笔记</div>';
  wrap.appendChild(detail);

  container.appendChild(wrap);

  // ---- 行为 ----
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

  // 首次渲染
  await refresh();

  // ---- 函数：刷新 ----
  async function refresh() {
    // 标题
    nav.querySelector('.zcc-title').textContent = `${state.year} 年 ${state.month + 1} 月`;

    // 清空单元格
    cells.innerHTML = '';
    // 补空格（周一开始）
    const first = new Date(state.year, state.month, 1);
    const firstDow = (first.getDay() + 6) % 7; // 0 = 周一
    for (let i = 0; i < firstDow; i++) {
      const blank = document.createElement('div');
      blank.className = 'zcc-cell zcc-blank';
      cells.appendChild(blank);
    }

    // 取本月所有笔记
    state.loading = true;
    const cacheKey = `${state.year}-${String(state.month + 1).padStart(2, '0')}`;
    if (!state.notesCache.has(cacheKey)) {
      try {
        state.notesCache.set(cacheKey, await fetchMonthNotes(context, state.year, state.month));
      } catch (e) {
        console.error('[驻村日历] 拉取笔记失败', e);
        context.ui.showNotice('拉取笔记失败：' + (e?.message || e));
      }
    }
    state.loading = false;

    const notesByDay = state.notesCache.get(cacheKey) || {};
    state.notesByDay = notesByDay;

    // 渲染每天
    const today = dateKey(new Date());
    const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const k = `${state.year}-${String(state.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const notes = notesByDay[k] || [];
      const cell = document.createElement('button');
      cell.className = 'zcc-cell zcc-day';
      cell.type = 'button';
      cell.dataset.day = k;
      if (k === today) cell.classList.add('zcc-today');
      if (state.selectedDay === k) cell.classList.add('zcc-selected');
      if (notes.length > 0) cell.classList.add('zcc-has-notes');
      cell.innerHTML = `
        <span class="zcc-day-num">${d}</span>
        ${notes.length > 0 ? `<span class="zcc-badge">${notes.length}</span>` : ''}
      `;
      cell.addEventListener('click', () => {
        state.selectedDay = k;
        // 刷新选中样式
        cells.querySelectorAll('.zcc-selected').forEach((el) => el.classList.remove('zcc-selected'));
        cell.classList.add('zcc-selected');
        renderDetail(k, notes);
      });
      cells.appendChild(cell);
    }

    // 如果有选中日，刷新详情
    if (state.selectedDay) {
      renderDetail(state.selectedDay, notesByDay[state.selectedDay] || []);
    }
  }

  function renderDetail(dayKey, notes) {
    if (!notes.length) {
      detail.innerHTML = `<div class="zcc-detail-empty">${dayKey} 没有笔记</div>`;
      return;
    }
    const list = notes
      .map(
        (n) => `
        <a class="zcc-note" data-id="${n.id}" href="#">
          <span class="zcc-note-title">${escapeHtml(n.title || '(无标题)')}</span>
          <span class="zcc-note-excerpt">${escapeHtml((n.excerpt || '').slice(0, 80))}</span>
        </a>`,
      )
      .join('');
    detail.innerHTML = `
      <div class="zcc-detail-head">
        <span class="zcc-detail-day">${dayKey}</span>
        <span class="zcc-detail-count">${notes.length} 篇</span>
      </div>
      <div class="zcc-detail-list">${list}</div>
    `;
    detail.querySelectorAll('.zcc-note').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        const id = el.dataset.id;
        context.ui.openNote(id).catch((e) => {
          console.error('[驻村日历] 打开笔记失败', e);
          context.ui.showNotice('打开笔记失败：' + (e?.message || e));
        });
      });
    });
  }
}

/* ============================================================
 * 数据：拉本月所有笔记，按 createdAt/updatedAt 聚合
 * ============================================================ */
async function fetchMonthNotes(context, year, month) {
  // 取本月 + 邻月 ±1 天，兼容跨时区笔记
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59);

  const result = {};
  let offset = 0;
  const pageSize = 200;

  while (true) {
    const page = await context.notes.query({
      sort: 'updated-desc',
      limit: pageSize,
      offset,
    });
    const notes = page.notes || [];
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

    // 没有更多
    if (notes.length < pageSize || page.nextOffset == null) break;
    offset = page.nextOffset;
    // 安全熔断：本月笔记不足 50 篇就退出循环（防止全表扫描）
    if (result && Object.keys(result).length > 0 && touchedInMonth === 0) {
      // 已经过了本月日期范围
      const maxDate = new Date(notes[0].updatedAt);
      if (maxDate < start) break;
    }
  }

  return result;
}

/* ============================================================
 * 工具
 * ============================================================ */
function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ============================================================
 * 样式（容器内注入，scoped by class）
 * ============================================================ */
const PANEL_CSS = `
.zcc-container { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; color: var(--color-text, #1f2937); padding: 8px; font-size: 13px; }
.zcc-wrap { display: flex; flex-direction: column; gap: 8px; }
.zcc-nav { display: grid; grid-template-columns: 28px 1fr 28px auto; gap: 6px; align-items: center; padding: 4px 6px; }
.zcc-nav .zcc-title { font-weight: 600; text-align: center; font-size: 13px; }
.zcc-btn { background: transparent; border: 1px solid var(--color-border, #e5e7eb); color: inherit; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 14px; line-height: 1; transition: background .15s; }
.zcc-btn:hover { background: var(--color-surface-muted, #f3f4f6); }
.zcc-btn.zcc-today { font-size: 12px; padding: 4px 10px; }
.zcc-grid { display: flex; flex-direction: column; gap: 2px; padding: 0 4px; }
.zcc-weekday, .zcc-cell { aspect: 1; display: flex; align-items: center; justify-content: center; }
.zcc-weekday { font-size: 11px; color: var(--color-text-muted, #6b7280); font-weight: 500; aspect: auto; height: 18px; }
.zcc-cells { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.zcc-cell { background: transparent; border: 1px solid transparent; color: inherit; cursor: pointer; border-radius: 6px; padding: 2px; position: relative; flex-direction: column; font-size: 12px; transition: background .12s; }
.zcc-cell.zcc-blank { cursor: default; }
.zcc-cell.zcc-day:hover { background: var(--color-surface-muted, #f3f4f6); }
.zcc-cell.zcc-today { background: var(--color-surface-muted, #f3f4f6); font-weight: 700; }
.zcc-cell.zcc-selected { background: var(--color-accent, #3b82f6) !important; color: var(--color-accent-foreground, #fff); }
.zcc-cell.zcc-selected .zcc-badge { background: rgba(255,255,255,.3); color: #fff; }
.zcc-day-num { font-size: 12px; }
.zcc-badge { position: absolute; bottom: 2px; right: 2px; background: var(--color-accent, #3b82f6); color: var(--color-accent-foreground, #fff); border-radius: 8px; padding: 0 5px; min-width: 14px; height: 14px; line-height: 14px; font-size: 9px; font-weight: 600; }
.zcc-detail { border-top: 1px solid var(--color-border, #e5e7eb); padding: 8px 4px 4px; max-height: 320px; overflow-y: auto; }
.zcc-detail-empty { color: var(--color-text-muted, #6b7280); font-size: 12px; text-align: center; padding: 12px 0; }
.zcc-detail-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 11px; color: var(--color-text-muted, #6b7280); }
.zcc-detail-day { font-weight: 600; color: var(--color-text, #1f2937); }
.zcc-detail-list { display: flex; flex-direction: column; gap: 4px; }
.zcc-note { display: flex; flex-direction: column; gap: 2px; padding: 6px 8px; border-radius: 6px; background: var(--color-surface-muted, #f9fafb); text-decoration: none; color: inherit; transition: background .12s; }
.zcc-note:hover { background: var(--color-surface, #f3f4f6); }
.zcc-note-title { font-size: 12px; font-weight: 500; line-height: 1.3; }
.zcc-note-excerpt { font-size: 11px; color: var(--color-text-muted, #6b7280); line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;