'use strict';

const api = window.apkstart;
const $ = (id) => document.getElementById(id);

const state = {
  apps: [],
  settings: null,
  status: null,
  filter: '',
  installing: false,
  setupBusy: null,
  menuPkg: null,
};

/* ---------------- 工具 ---------------- */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function initialOf(label) {
  const s = String(label || '?').trim();
  return (s[0] || '?').toUpperCase();
}

function fmtSize(bytes) {
  if (!bytes) return '';
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

function relTime(ts) {
  if (!ts) return '';
  const d = Date.now() - ts;
  if (d < 60000) return t('刚刚');
  if (d < 3600000) return t('{n} 分钟前', { n: Math.floor(d / 60000) });
  if (d < 86400000) return t('{n} 小时前', { n: Math.floor(d / 3600000) });
  if (d < 86400000 * 30) return t('{n} 天前', { n: Math.floor(d / 86400000) });
  return new Date(ts).toLocaleDateString(window.I18N_TAG || 'en-US');
}

/**
 * 迷你 toast
 *
 * 同一类消息做去重 + 数量上限：
 * 安装失败时里面有「运行时启动日志」在持续推送，以前每条都新建一个 toast，
 * 于是屏幕上会不停叠加同一条错误，看起来像「失败信息一直循环」。
 */
let _toastSeq = 0;
function toast({ title, body = '', type = 'info', progress = null, sticky = false, spinner = false }) {
  const wrap = $('toastWrap');
  // ① 去重：同样的标题 + 正文（4 秒内）只刷新那一条，不叠加
  const key = `${title}|${body}`;
  const dup = [...wrap.children].find((n) => n.dataset.key === key && Date.now() - Number(n.dataset.at || 0) < 4000);
  if (dup) {
    dup.dataset.at = String(Date.now());
    return {
      el: dup,
      dismiss: () => dup.remove(),
      update: ({ title: t2, body: b2 } = {}) => {
        if (t2 !== undefined) dup.querySelector('.t-title-text').textContent = t2;
        if (b2 !== undefined) dup.querySelector('.t-body').textContent = b2;
      },
    };
  }
  // ② 上限：同时最多 4 条，超出先挤掉最旧的
  while (wrap.children.length >= 4) wrap.firstElementChild.remove();

  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : ''}`;
  el.dataset.key = key;
  el.dataset.at = String(Date.now());
  el.dataset.seq = String(++_toastSeq);
  el.innerHTML = `
    <div class="t-title">
      ${spinner ? '<span class="spinner"></span>' : ''}
      <span class="t-title-text">${esc(title)}</span>
    </div>
    <div class="t-body">${esc(body)}</div>
    ${progress === null ? '' : '<div class="bar"><i></i></div>'}
  `;
  $('toastWrap').appendChild(el);

  const dismiss = () => {
    el.style.transition = 'opacity .18s, transform .18s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(4px)';
    setTimeout(() => el.remove(), 200);
  };

  const ctl = {
    el, dismiss,
    update({ title: t2, body: b2, progress: p2, type: ty } = {}) {
      if (t2 !== undefined) el.querySelector('.t-title-text').textContent = t2;
      if (b2 !== undefined) el.querySelector('.t-body').textContent = b2;
      if (p2 !== undefined && el.querySelector('.bar i')) {
        el.querySelector('.bar i').style.width = `${Math.max(2, Math.min(100, p2))}%`;
      }
      if (ty === 'error') el.classList.add('error');
      if (ty === 'ok') {
        el.querySelector('.spinner')?.remove();
        el.classList.remove('error');
      }
    },
  };

  if (!sticky) setTimeout(dismiss, type === 'error' ? 6000 : 3200);
  return ctl;
}

/* ---------------- 渲染 ---------------- */

function visibleApps() {
  const q = state.filter.trim().toLowerCase();
  if (!q) return state.apps;
  return state.apps.filter((a) => (
    a.label.toLowerCase().includes(q)
    || a.package.toLowerCase().includes(q)
  ));
}

function renderGrid() {
  const apps = visibleApps();
  const grid = $('grid');
  const empty = $('empty');

  const hasAny = state.apps.length > 0;
  grid.classList.toggle('hidden', apps.length === 0);
  empty.classList.toggle('hidden', apps.length > 0);

  if (!hasAny) {
    const s = state.status;
    $('emptyHint').textContent = s && s.adbOk === false
      ? t('首次使用：打开右上角设置 → 运行时 → 一键完成，再回来安装应用即可。')
      : t('提示：所有应用共享同一个 Android 运行时，所以第二个应用的启动几乎是瞬时的。');
    grid.innerHTML = '';
    return;
  }

  // 末尾放一块「添加应用」虚线卡片。
  // 目的不只是好看：应用少的时候下面是一大片空白，用户不知道该干什么；
  // 这块卡片把「还能拖 APK 进来」这件事直接摆在眼前，也顺手填掉了空白。
  grid.innerHTML = apps.map((a) => `
    <div class="card" data-pkg="${esc(a.package)}" title="${esc(a.label)} · ${esc(a.package)}">
      ${a.pinned ? '<span class="pin">★</span>' : ''}
      ${a.running ? `<span class="badge-run" title="${esc(t('正在运行'))}"></span>` : ''}
      <div class="icon">
        ${a.iconUrl
          ? `<img src="${esc(a.iconUrl)}" alt="" draggable="false" />`
          : `<div class="fallback" style="background:${esc(a.accent || '#9aa6b2')}">${esc(initialOf(a.label))}</div>`}
      </div>
      <div class="name">${esc(a.label)}</div>
      <div class="meta">${a.running ? t('运行中') : `v${esc(a.versionName)}${a.lastLaunchAt ? ' · ' + relTime(a.lastLaunchAt) : ''}`}</div>
      <div class="open-hint">${a.running ? t('切换到前台') : t('打开')}</div>
    </div>
  `).join('') + `
    <div class="card card-add" id="cardAdd" role="button" tabindex="0" title="${t('拖入 APK 文件，或点击选择')}">
      <div class="add-plus" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round"><path d="M12 6v12"/><path d="M6 12h12"/></svg>
      </div>
      <div class="name">${t('添加应用')}</div>
      <div class="meta">拖入 APK 即可安装</div>
    </div>
  `;
}

/* ---------------- 数据刷新 ---------------- */

async function refreshApps() {
  try {
    state.apps = await api.listApps();
    renderGrid();
    updateStats();
  } catch (e) {
    console.error(e);
  }
}

function updateStats() {
  const n = state.apps.length;
  $('statusStats').textContent = n ? t('{n} 个应用', { n }) : t('暂无应用');
}

async function refreshStatus() {
  try {
    state.status = await api.runtimeStatus();
    const s = state.status;
    const dot = $('statusDot');
    const text = $('statusText');
    const tag = $('engineTag');

    if (!s.adbOk) {
      dot.className = 'dot err';
      text.textContent = t('运行时未部署 —— 打开设置 → 运行时，一键完成');
      tag.textContent = t('需要部署');
      tag.className = 'brand-tag';
    } else if (s.deviceOnline) {
      dot.className = 'dot ok';
      text.textContent = t('运行时已就绪 · Android {v}', { v: s.android || '?' }) + (s.freeform ? ` · ${t('独立窗口已启用')}` : '');
      tag.textContent = `Android ${s.android || ''}`.trim();
      tag.className = 'brand-tag ok';
    } else if (s.phase === 'booting' || s.vmStarting) {
      dot.className = 'dot warn';
      text.textContent = t('正在引导 Android…');
      tag.textContent = t('引导中');
      tag.className = 'brand-tag';
    } else if (s.needsSetup === 'accel') {
      dot.className = 'dot warn';
      text.textContent = t('未检测到硬件加速：已自动回退软件模拟（首次开机较慢）');
      tag.textContent = t('软件模拟');
      tag.className = 'brand-tag';
    } else if (s.needsSetup === 'sysimg') {
      dot.className = 'dot err';
      text.textContent = t('缺少 Android 14 通用系统镜像 —— 设置 → 运行时里下载（约 1.5GB，只下一次）');
      tag.textContent = t('待下载镜像');
      tag.className = 'brand-tag';
    } else if (s.needsSetup === 'emulator') {
      dot.className = 'dot err';
      text.textContent = t('运行时引擎未安装 —— 打开设置 → 运行时一键完成');
      tag.textContent = t('需要部署');
      tag.className = 'brand-tag';
    } else if (s.needsSetup === 'boot') {
      dot.className = 'dot warn';
      text.textContent = t('运行时已就绪 —— 安装 APK 或双击桌面图标会自动开机');
      tag.textContent = t('待开机');
      tag.className = 'brand-tag';
    } else if (s.installing) {
      dot.className = 'dot warn';
      text.textContent = t('安装程序运行中 —— 请在虚拟机窗口里完成安装');
      tag.textContent = t('安装中');
      tag.className = 'brand-tag';
    } else {
      dot.className = 'dot';
      text.textContent = s.installed
        ? t('运行时待机（安装或打开应用时会自动拉起）')
        : t('运行时尚未安装 Android 系统 —— 打开设置 → 运行时继续');
      tag.textContent = s.installed ? t('待机') : t('待安装');
      tag.className = 'brand-tag';
    }
    $('statusDevice').textContent = s.deviceOnline ? (s.serial || '') : '';
    // 网络状态：这是用户最容易踩的坑（应用里一直「网络错误」，但看不出是虚拟机没网）。
    // 直接摆在状态栏，出问题时一眼能看到，不用去翻日志。
    const netEl = $('statusNet');
    const netSep = $('statusNetSep');
    if (netEl) {
      const show = !!s.deviceOnline && !!s.network;
      netEl.hidden = !show;
      if (netSep) netSep.hidden = !show;
      if (show) {
        netEl.textContent = s.network.ok ? t('网络正常 {ip}', { ip: s.network.ip || '' }).trim() : t('虚拟机未联网');
        netEl.className = 'status-item status-net ' + (s.network.ok ? 'ok' : 'warn');
        netEl.title = s.network.ok
          ? t('安卓虚拟机已联网，联网类应用可以正常加载')
          : t('安卓虚拟机没有网络，联网页面会一直是空白/报错。可在「设置 → 修复网络」处理');
      }
    }

    renderSetup(s);
  } catch (e) {
    $('statusText').textContent = t('状态检查失败：{msg}', { msg: e.message });
  }
}

/* ---------------- 运行时部署（固定在设置里） ---------------- */

/**
 * 运行时/部署/自检面板现在都收在「设置」里，主界面只留已安装应用。
 * 保留 showSetup 给托盘菜单与 ui:navigate 复用，语义改为「打开设置并定位到运行时」。
 */
function showSetup(on) {
  if (!on) { $('setupGuide').hidden = true; return; }
  openSettings().then(() => {
    const box = $('runtimeGroup');
    if (box) box.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }).catch(() => {});
}

function fmtGB(n) { return n ? `${(n / 1073741824).toFixed(2)} GB` : ''; }

function stepRow(opt) {
  const cls = ['step'];
  if (opt.done) cls.push('done');
  if (opt.busy) cls.push('busy');
  return `
    <div class="${cls.join(' ')}" data-step="${opt.key}">
      <div class="idx">${opt.done ? '✓' : opt.index}</div>
      <div class="body">
        <div class="t">${esc(opt.title)}${opt.tag ? `<span class="tag ${opt.req ? 'req' : ''}">${esc(opt.tag)}</span>` : ''}</div>
        <div class="d" data-desc>${esc(opt.desc)}</div>
        <div class="bar"><i data-bar></i></div>
      </div>
      <div class="act">${opt.actions || ''}</div>
    </div>`;
}

function renderSetup(s) {
  if (!s) return;
  const env = s.env || {};
  const hv = env.hypervisor || {};
  const accel = env.accel || s.accel || {};

  // 启动即见已安装应用：不再用部署向导整屏接管主界面，
  // 状态只在设置里的运行时面板 + 底部状态条上体现。
  const accelOk = accel.ok || hv.whpx;
  const adbDone = !!(env.adb && env.adb.ok);
  const emuDone0 = !!(env.emulator && env.emulator.ok);
  const imgDone0 = !!(env.sysimg && env.sysimg.ok);
  const allDone0 = adbDone && emuDone0 && imgDone0;
  const stateText = $('setupStateText');
  if (stateText) {
    const missing = [];
    if (!adbDone) missing.push('adb');
    if (!emuDone0) missing.push(t('引擎'));
    if (!imgDone0) missing.push(t('系统镜像'));
    stateText.textContent = s.deviceOnline
      ? t('已就绪 · Android {v}', { v: s.android || '' })
      : s.phase === 'booting' || s.vmStarting
        ? t('正在引导 Android…')
        : allDone0
          ? t('组件齐全 · 待开机（打开应用时自动拉起）')
          : t('缺少 {items}', { items: missing.join(t('、')) }) + (accelOk ? '' : t('（无硬件加速，将回退软件模拟）'));
    stateText.title = s.autoProfile || accel.note || hv.note || '';
  }

  const emuDone = !!(env.emulator && env.emulator.ok);
  const imgDone = !!(env.sysimg && env.sysimg.ok);
  const busy = state.setupBusy;
  const booting = s.phase === 'booting';

  // 只保留一个步骤：下载、参数自适应、开机全部由「一键完成」串起来，
  // 且首次启动会在后台自动跑，用户不需要逐步点击。
  const allDone = !!(env.adb && env.adb.ok) && emuDone && imgDone;
  const left = [];
  if (!(env.adb && env.adb.ok)) left.push(t('adb 工具链'));
  if (!emuDone) left.push(t('Android 运行时'));
  if (!imgDone) left.push(t('系统镜像'));
  const step = {
    key: 'all',
    index: 1,
    title: allDone ? t('一切就绪') : t('一键完成'),
    tag: allDone ? t('已自动完成') : t('自动'),
    done: allDone,
    busy: !!busy,
    desc: s.deviceOnline
      ? t('Android {v} 已就绪 · 应用窗口会按屏幕自动适配', { v: s.android || '' })
      : booting
        ? t('正在引导 Android…')
        : allDone
          ? t('组件齐全，双击任意 APK 或桌面图标即会自动开机')
          : t('还差 {items}；点下面「一键完成」，会在后台一次装好并自动开机', { items: left.join(t('、')) }),
    actions: s.deviceOnline
      ? `<button class="btn ghost sm" data-act="vmStop">${esc(t('停止运行时'))}</button>`
      : '',
  };

  $('setupSteps').innerHTML = stepRow(step);
  $('btnDeployAll').disabled = !!busy;
  $('btnDeployAll').textContent = busy ? t('准备中…') : (allDone ? t('已完成 · 点此复查') : t('一键完成'));
  // 「上次为什么没起来」优先显示落盘的失败记录：进程重启后内存里的 diagnosis 是空的，
  // 只显示 autoProfile 会让用户完全看不出原因（issue #20/#25 的报告就是这样）。
  const lf = s.lastFailure;
  const lastMsg = (lf && lf.diagnosis && lf.diagnosis.title)
    ? t('上次启动失败：{title}', { title: lf.diagnosis.title })
    : (s.diagnosis ? t('上次启动自动诊断：{title}', { title: s.diagnosis.title }) : '');
  $('setupNote').textContent = lastMsg
    || s.autoProfile || t('全自动：无需选择镜像、无需启用加速、无需调内存');
}

function store_getDiskSize() {
  return (state.settings && state.settings.runtime && state.settings.runtime.diskSizeGB) || 24;
}

function setStepBusy(key, on) {
  state.setupBusy = on ? key : null;
  // 五步已合并成一行，所有子步骤的进度都落在这唯一的进度条上
  const row = $('setupSteps').querySelector('[data-step="all"]');
  if (row) {
    row.classList.toggle('busy', !!on);
    if (on) {
      const bar = row.querySelector('[data-bar]');
      if (bar) bar.style.width = '3%';
    }
  }
}

function updateStepProgress(component, p) {
  if (!component) return;
  const row = $('setupSteps').querySelector('[data-step="all"]');
  if (!row) return;
  if (p.percent !== undefined) {
    const bar = row.querySelector('[data-bar]');
    if (bar) bar.style.width = `${Math.max(3, Math.min(100, p.percent))}%`;
  }
  if (p.message) {
    const d = row.querySelector('[data-desc]');
    if (d) d.textContent = p.message;
  }
}

async function deployAll() {
  if (state.setupBusy) return;
  setStepBusy('all', true);
  try {
    // 一次调用把 adb / 引擎 / 系统镜像全装完，进度统一显示在唯一那一行
    // 用户点「一键部署」属于明确的手动重试，绕过失败冷却
    const r = await api.autoDeploy({ force: true });
    if (!r || !r.ok) {
      toast({ title: t('准备失败'), body: (r && r.error) || t('请检查网络后重试'), type: 'error', sticky: true });
      return;
    }
    await refreshStatus();
    toast({ title: t('组件已就绪，正在自动开机…'), body: t('首次约 1-3 分钟，之后几秒即可。'), type: 'info' });
    const started = await api.runtimeStart();
    await refreshStatus();
    toast(started && started.ok
      ? { title: t('运行时已就绪'), body: t('现在把 APK 拖进窗口，或双击桌面图标即可。'), type: 'ok' }
      : { title: t('开机未完成'), body: (started && started.error) || t('请导出诊断报告查看原因'), type: 'error', sticky: true });
  } catch (e) {
    toast({ title: t('准备失败'), body: e.message, type: 'error', sticky: true });
  } finally {
    setStepBusy('all', false);
    await refreshStatus();
    selfCheck();
  }
}

async function runStep(key) {
  if (state.setupBusy) return { ok: false, error: t('已有部署任务进行中') };
  setStepBusy(key, true);
  let r;
  try {
    if (key === 'adb') r = await api.installAdb();
    else if (key === 'emulator') r = await api.installEmulator();
    else if (key === 'sysimg') r = await api.installSysimg();
    else if (key === 'accel') {
      const tt = toast({
        title: t('正在安装硬件加速驱动…'),
        body: t('请在弹出的是否允许窗口点「是」'),
        sticky: true,
        spinner: true,
      });
      r = await api.enableAccel();
      if (r.ok) tt.update({ title: t('硬件加速已启用'), type: 'ok' });
      else tt.update({ title: t('加速未启用'), body: r.error, type: 'error', sticky: true });
    } else if (key === 'qemu') r = await api.installQemu();
    else if (key === 'iso') r = await api.downloadIso();
    else if (key === 'disk') r = await api.createDisk(store_getDiskSize());
    else r = { ok: false, error: t('未知步骤') };
  } catch (e) {
    r = { ok: false, error: e.message };
  }
  setStepBusy(key, false);
  await refreshStatus();
  return r;
}

async function startInstall() {
  const r = await api.startInstaller();
  if (!r.ok) {
    toast({ title: t('无法启动安装环境'), body: r.error, type: 'error', sticky: true });
    return;
  }
  $('setupGuide').hidden = false;
  $('setupGuide').scrollIntoView({ behavior: 'smooth', block: 'start' });
  toast({ title: t('虚拟机窗口已打开'), body: t('按下方 6 步完成安装；装好后点「我已安装完成」。'), type: 'ok', sticky: true });
}

async function markInstalled() {
  await api.markInstalled();
  await api.runtimeStop();
  $('setupGuide').hidden = true;
  await refreshStatus();
  toast({ title: t('安装完成，运行时已接管'), body: t('现在可以直接把 APK 拖进来安装了。'), type: 'ok' });
}



/* ---------------- 安装 ---------------- */

/** 把安装失败翻译成「下一步该做什么」，只对最常见的几种做提示，其它原样显示 */
function friendlyInstallErrorText(msg) {
  const s = String(msg || t('未知错误'));
  if (/INSUFFICIENT_STORAGE|not enough (?:runtime )?(?:disk )?space|low disk space|空间不足|đủ dung lượng|ENOSPC/i.test(s)) {
    return `${s}\n${t('安卓数据分区不够用：设置 → 性能与资源占用 → 安卓数据分区调大后点「立即扩容」。')}`;
  }
  if (/NO_MATCHING_ABIS/i.test(s)) return `${s}\n${t('这个包只有 ARM 库，正在自动切换兼容镜像后重试。')}`;
  if (/INSTALL_FAILED_ALREADY_EXISTS|signatures do not match/i.test(s)) {
    return `${s}\n${t('同包名但签名不同（常见于从别的渠道装过）。在应用卡片右键「卸载」后再装。')}`;
  }
  if (/INSTALL_FAILED_VERSION_DOWNGRADE/i.test(s)) return `${s}\n${t('已装版本更高，先在右键菜单里卸载再装。')}`;
  if (/ERR_FS_FILE_TOO_LARGE|greater than possible Buffer|Cannot allocate|ENOMEM|out of memory/i.test(s)) {
    return `${s}\n${t('这个安装包过大或内存不足，解析被系统拒绝了。请确认磁盘与内存充足后重试；仍失败请把安装包路径换成纯英文短路径（如 D:\\a.apk）。')}`;
  }
  return s;
}

/* 当前那条「正在安装…」的 sticky 提示。install:error 事件要能把它收掉：
 * 主进程是先 send('install:error') 再让 invoke 失败的，两者都可能到得很晚，
 * 只靠 catch 收会出现「报错了右下角还在转圈」。 */
let installToast = null;

async function installFiles(paths) {
  if (!paths || !paths.length) return;
  if (state.installing) {
    toast({ title: t('已有安装任务在进行'), body: t('请等当前应用装完再继续。') });
    return;
  }
  state.installing = true;
  let ok = 0;
  let failed = 0;

  for (const p of paths) {
    const name = p.split(/[\\/]/).pop();
    const tt = toast({ title: t('正在安装 {name}', { name }), body: t('解析 APK…'), progress: 8, sticky: true, spinner: true });
    installToast = tt;
    let off = () => {};
    try {
      off = api.on('install:progress', (pr) => {
        const base = { parse: 12, 'parse-done': 24, runtime: 38, install: 62, shortcut: 88, done: 100 }[pr.stage] || 50;
        const pct = pr.percent != null ? Math.min(60, Math.round((pr.percent / 100) * 60)) : base;
        tt.update({ title: t('正在安装 {name}', { name: pr.meta ? pr.meta.label : name }), body: pr.message, progress: pct });
      });
      const r = await api.installApk(p);
      tt.update({ title: t('{name} 已安装', { name: r.app.label }), body: r.app.shortcutPath ? t('桌面快捷方式已创建，双击即可直接打开。') : t('可在应用卡片右键创建桌面快捷方式。'), progress: 100, type: 'ok' });
      tt.el.querySelector('.spinner')?.remove();
      setTimeout(tt.dismiss, 3600);
      if (r.warnings && r.warnings.length) {
        toast({ title: t('{name} 兼容性提示', { name: r.app.label }), body: r.warnings.join(' '), type: 'error', sticky: false });
      }
      ok++;
    } catch (e) {
      failed++;
      // 先把那条「正在安装…」的 sticky 提示收掉，否则它会一直转圈、还继续被
      // 运行时日志刷新 —— 用户看到的就是「失败信息一直在循环」。
      // 错误提示统一由下面的 install:error 监听器负责（带文件名与中文原因），
      // 这里不再重复弹一条。
      try { off(); } catch (_) { /* ignore */ }
      tt.dismiss();
      if (installToast === tt) installToast = null;
    } finally {
      try { off(); } catch (_) { /* ignore */ }
    }
  }

  state.installing = false;
  await refreshApps();
  if (ok && !failed) $('search').value = '';
}

/* ---------------- 应用操作 ---------------- */

async function launchApp(pkg) {
  const app = state.apps.find((a) => a.package === pkg);
  state.launchPkg = pkg;
  const tt = toast({
    title: t('正在打开 {name}', { name: app ? app.label : pkg }),
    body: t('首次启动需要预热运行时，请稍候…'),
    sticky: true,
    spinner: true,
  });
  const r = await api.launch(pkg);
  if (r.ok) {
    // 应用有自己的窗口，主界面自动收起；这里只留一句提示，然后隐藏窗口
    tt.update({ title: t('已启动'), body: t('应用正在独立窗口中运行（顶部可旋转屏幕）。'), type: 'ok' });
    setTimeout(tt.dismiss, 1600);
    setTimeout(() => api.winHide(), 900);
    setTimeout(refreshApps, 1200);
  } else {
    tt.update({ title: t('启动失败'), body: r.error, type: 'error' });
    setTimeout(tt.dismiss, 6000);
  }
}

async function createShortcut(pkg) {
  try {
    const r = await api.createShortcut(pkg);
    toast({ title: t('桌面快捷方式已创建'), body: r.path, type: 'ok' });
    refreshApps();
  } catch (e) {
    toast({ title: t('创建快捷方式失败'), body: e.message, type: 'error' });
  }
}

async function uninstall(pkg) {
  const app = state.apps.find((a) => a.package === pkg);
  if (!app) return;
  const ok = window.confirm(t('确定卸载「{name}」？\n\n应用数据会一并被清除，桌面快捷方式也会被删除。', { name: app.label }));
  if (!ok) return;
  try {
    await api.uninstall(pkg);
    toast({ title: t('已卸载'), body: app.label, type: 'ok' });
    refreshApps();
  } catch (e) {
    toast({ title: t('卸载失败'), body: e.message, type: 'error' });
  }
}

/* ---------------- 右键菜单 ---------------- */

const MENU_ITEMS = [
  { key: 'open', label: t('打开应用'), kbd: 'Enter' },
  // 只在应用真的在运行时才出现（见 showMenu 里的过滤）。
  // 以前完全没有这一项，独立窗口模式下又没有可点的关闭按钮，
  // 应用一起来就关不掉，只能退到托盘退出整个 ApkStart。
  { key: 'stop', label: t('关闭应用'), onlyRunning: true },
  { key: 'shortcut', label: t('创建桌面快捷方式') },
  { key: 'pin', label: t('固定到顶部') },
  { key: 'keymap', label: t('按键映射…') },
  { divider: true },
  { key: 'reveal', label: t('打开 APK 所在位置') },
  { key: 'clear', label: t('清除应用数据') },
  { divider: true },
  { key: 'uninstall', label: t('卸载'), danger: true },
];

function showMenu(x, y, pkg) {
  const menu = $('ctxmenu');
  state.menuPkg = pkg;
  const app = state.apps.find((a) => a.package === pkg);
  const items = MENU_ITEMS.filter((it) => !it.onlyRunning || (app && app.running));
  menu.innerHTML = items.map((it) => {
    if (it.divider) return '<div class="divider"></div>';
    const label = it.key === 'pin' ? (app && app.pinned ? t('取消固定') : t('固定到顶部')) : it.label;
    return `<div class="item ${it.danger ? 'danger' : ''}" data-key="${it.key}" data-act="${it.key}">
      <span>${esc(label)}</span>${it.kbd ? `<span class="k">${it.kbd}</span>` : ''}
    </div>`;
  }).join('');
  menu.classList.add('on');

  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - rect.width - 10)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - rect.height - 10)}px`;
}

// ---------------- 标题栏语言与主题菜单 ----------------

const LANG_SHORT = { tr: 'TR', en: 'EN' };

const THEME_ICONS = {
  dark: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  nord: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  light: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  system: '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>'
};

function applyTheme(theme) {
  const chosen = theme || (state.settings && state.settings.theme) || 'dark';
  let actual = chosen;
  if (chosen === 'system') {
    actual = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = actual;
  const iconEl = $('themeIcon');
  if (iconEl && THEME_ICONS[chosen]) {
    iconEl.innerHTML = THEME_ICONS[chosen];
  }
  const btn = $('btnTheme');
  if (btn) {
    const titles = { dark: t('Karanlık'), nord: t('Gece Mavisi (Nord)'), light: t('Aydınlık'), system: t('Sistem Teması') };
    btn.title = titles[chosen] || t('Tema');
  }
}

function initThemeButton() {
  const btn = $('btnTheme');
  if (!btn) return;
  const themes = ['dark', 'nord', 'light'];
  btn.addEventListener('click', async () => {
    const cur = (state.settings && state.settings.theme) || 'dark';
    const nextIdx = (themes.indexOf(cur) + 1) % themes.length;
    const next = themes[nextIdx >= 0 ? nextIdx : 0];
    applyTheme(next);
    if ($('setTheme')) $('setTheme').value = next;
    state.settings = await api.setSettings({ theme: next });
  });

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if ((state.settings && state.settings.theme) === 'system') {
        applyTheme('system');
      }
    });
  }
}

function initLangButton() {
  const btn = $('btnLang');
  if (!btn || !api.i18n) return;
  const cur = api.i18n.lang;
  $('langCode').textContent = LANG_SHORT[cur] || String(cur).toUpperCase();
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = $('langMenu');
    if (menu.classList.contains('on')) { hideLangMenu(); return; }
    hideMenu();
    menu.innerHTML = api.i18n.languages.map((l) => `<div class="item ${l.code === cur ? 'cur' : ''}" role="menuitemradio" aria-checked="${l.code === cur}" data-lang="${esc(l.code)}">
      <span class="k" style="margin:0;min-width:20px">${esc(LANG_SHORT[l.code] || l.code.toUpperCase())}</span><span>${esc(l.name)}</span>${l.code === cur ? '<span class="check">✓</span>' : ''}
    </div>`).join('');
    menu.classList.add('on');
    const r = btn.getBoundingClientRect();
    const mr = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(r.right - mr.width, window.innerWidth - mr.width - 8))}px`;
    menu.style.top = `${r.bottom + 6}px`;
  });
  $('langMenu').addEventListener('click', async (e) => {
    const item = e.target.closest('.item');
    if (!item) return;
    hideLangMenu();
    if (item.dataset.lang === cur) return;
    try { await api.setLanguage(item.dataset.lang); } catch (_) { /* 主进程会 reload 窗口 */ }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#langMenu') && !e.target.closest('#btnLang')) hideLangMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideLangMenu(); });
}

function hideLangMenu() {
  const m = $('langMenu');
  if (m) m.classList.remove('on');
}

function hideMenu() {
  $('ctxmenu').classList.remove('on');
  state.menuPkg = null;
}

async function handleMenu(act) {
  const pkg = state.menuPkg;
  const app = state.apps.find((a) => a.package === pkg);
  hideMenu();
  if (!app) return;
  switch (act) {
    case 'open': return launchApp(pkg);
    case 'stop': {
      try {
        const r = await api.stop(pkg);
        if (r && r.ok) {
          toast({ title: t('已关闭'), body: app.label, type: 'ok' });
        } else {
          toast({ title: t('关闭失败'), body: (r && r.error) || t('未知错误'), type: 'error' });
        }
      } catch (e) {
        toast({ title: t('关闭失败'), body: e.message, type: 'error' });
      }
      return refreshApps();
    }
    case 'shortcut': return createShortcut(pkg);
    case 'pin': return api.pin(pkg, !app.pinned).then(refreshApps);
    case 'keymap': return showKeymapPicker(pkg, app.label);
    case 'reveal': return api.revealApk(pkg);
    case 'clear': {
      if (!window.confirm(t('清除「{name}」的全部数据？此操作不可撤销。', { name: app.label }))) return;
      try {
        await api.clearData(pkg);
        toast({ title: t('数据已清除'), body: app.label, type: 'ok' });
      } catch (e) {
        toast({ title: t('清除失败'), body: e.message, type: 'error' });
      }
      return;
    }
    case 'uninstall': return uninstall(pkg);
    default: return undefined;
  }
}

/**
 * 按键映射预设选择器。用 confirm + prompt 做最简交互（不引入新 UI 组件）。
 * 后续可以做成更精致的弹窗编辑器。
 */
async function showKeymapPicker(pkg, label) {
  try {
    const presets = await api.keymap.getPresets();
    const current = await api.keymap.getMap(pkg);
    const hasCurrent = current && current.length > 0;
    const lines = presets.map((p, i) => `${i + 1}. ${p.label} — ${p.desc}`);
    if (hasCurrent) lines.unshift(t('0. 清除当前映射'));
    const msg = t('为「{label}」选择按键映射预设：{list}输入编号：', { label, list: `\n\n${lines.join('\n')}\n\n` });
    const input = window.prompt(msg, hasCurrent ? '0' : '1');
    if (input === null) return; // 取消
    const idx = parseInt(input, 10);
    if (hasCurrent && idx === 0) {
      await api.keymap.setMap(pkg, []);
      toast({ title: t('已清除按键映射'), body: label, type: 'ok' });
      return;
    }
    const presetIdx = hasCurrent ? idx - 1 : idx;
    if (presetIdx < 1 || presetIdx > presets.length) {
      toast({ title: t('无效编号'), type: 'error' });
      return;
    }
    const chosen = presets[presetIdx - 1];
    await api.keymap.applyPreset(pkg, chosen.id);
    toast({ title: t('已套用「{name}」', { name: chosen.label }), body: t('{label} · 打开应用后键盘即可操控', { label }), type: 'ok' });
  } catch (e) {
    toast({ title: t('按键映射设置失败'), body: e.message, type: 'error' });
  }
}

/* ---------------- 设置 ---------------- */

// ---------------- 安卓系统设置 ----------------

let volumeTimer = null;

async function refreshAndroid() {
  const el = $('androidStatus');
  if (!el) return;
  el.textContent = t('读取中…');
  const r = await api.android.status().catch(() => null);
  if (!r || !r.ok) {
    el.textContent = r && r.error ? t('运行时未就绪（{err}）', { err: String(r.error).slice(0, 36) }) : t('运行时未启动');
    return;
  }
  el.textContent = `Android ${r.sdk || '?'} · ${r.wifi ? t('Wi-Fi 已开') : t('Wi-Fi 已关')}`
    + `${r.airplane ? ` · ${t('飞行模式')}` : ''} · ${t('音量 {n}%', { n: r.volume })}`;
  $('setAndroidWifi').checked = !!r.wifi;
  $('setAndroidAirplane').checked = !!r.airplane;
  $('setAndroidAnim').checked = !r.animationsOff;
  $('setAndroidVolume').value = r.volume;
  $('androidVolumeText').textContent = `${r.volume}%`;
  if (r.fontScale) $('setAndroidFont').value = Number(r.fontScale).toFixed(2);
  if (r.density) {
    const opt = [...$('setAndroidDensity').options].find((o) => o.value === String(r.density));
    if (opt) $('setAndroidDensity').value = String(r.density);
  }
}

function bindAndroid() {
  const set = async (key, value, msg) => {
    const r = await api.android.set(key, value).catch(() => null);
    toast({
      type: r && r.ok ? 'ok' : 'error',
      title: r && r.ok ? (msg || t('已生效')) : t('失败：{err}', { err: (r && r.error) || t('运行时未就绪') }),
    });
    if (r && r.ok) refreshAndroid();
  };
  $('setAndroidWifi').addEventListener('change', (e) => set('wifi', e.target.checked, e.target.checked ? t('Wi-Fi 已开启') : t('Wi-Fi 已关闭')));
  $('setAndroidAirplane').addEventListener('change', (e) => set('airplane', e.target.checked, e.target.checked ? t('已进入飞行模式') : t('已退出飞行模式')));
  $('setAndroidAnim').addEventListener('change', (e) => set('animations', e.target.checked, e.target.checked ? t('系统动画已开启') : t('系统动画已关闭，界面更快')));
  $('setAndroidFont').addEventListener('change', (e) => set('fontScale', Number(e.target.value), t('字体大小已调整')));
  $('setAndroidDensity').addEventListener('change', (e) => set('density', Number(e.target.value), t('显示大小已调整')));
  $('setAndroidVolume').addEventListener('input', (e) => {
    $('androidVolumeText').textContent = `${e.target.value}%`;
    clearTimeout(volumeTimer);
    volumeTimer = setTimeout(() => set('volume', Number(e.target.value), t('音量已调整')), 260);
  });
  $('btnAndroidRefresh').addEventListener('click', () => refreshAndroid());
  $('btnAndroidTune').addEventListener('click', async () => {
    const r = await api.android.tune(state.launchPkg || '').catch(() => null);
    toast({ type: r && r.ok ? 'ok' : 'error', title: r && r.ok ? t('已优化：动画关闭、后台放宽、电池白名单') : t('优化失败，运行时可能未启动') });
    if (r && r.ok) refreshAndroid();
  });
  const open = async (action) => {
    const r = await api.android.open(action).catch(() => null);
    if (!r || !r.ok) {
      toast({ type: 'error', title: t('需要先打开一次应用，让运行时启动') });
    }
  };
  $('btnAndroidSettings').addEventListener('click', () => open('settings'));
  $('btnAndroidDisplay').addEventListener('click', () => open('display'));
  $('btnAndroidSound').addEventListener('click', () => open('sound'));
  $('btnAndroidLocale').addEventListener('click', () => open('locale'));
  $('btnAndroidApps').addEventListener('click', () => open('apps'));
}

/** 按当前底座的 id 决定哪些字段要露出来（自带 = 镜像/内存那些，第三方 = 它自己的路径） */
function syncBackendFields() {
  const mode = $('setEngineMode') ? $('setEngineMode').value : 'builtin';
  const builtin = mode === 'builtin' || mode === 'attach';
  const show = (id, on) => { const el = $(id); if (el && el.closest('.field')) el.closest('.field').hidden = !on; };
  show('setMumuPath', mode === 'mumu');
  show('setFydeosHost', mode === 'fydeos');
  show('setSystemImage', builtin);
  show('setMemory', builtin);
  show('setCores', builtin);
  show('setCompat', builtin);
  show('compatInstallField', builtin && !$('compatInstallField').hidden);
  show('setIdle', true);
  show('setDevice', mode === 'attach');
}

function fillSettings(s) {
  const themeSel = $('setTheme');
  if (themeSel) {
    themeSel.value = s.theme || 'dark';
  }
  const langSel = $('setLanguage');
  if (langSel && api.i18n) {
    if (!langSel.options.length) {
      langSel.innerHTML = (api.i18n.languages || [])
        .map((l) => `<option value="${esc(l.code)}">${esc(l.name)}</option>`).join('');
    }
    langSel.value = api.i18n.lang;
  }
  $('setEngineMode').value = s.engine.mode;
  if ($('setMumuPath')) $('setMumuPath').value = s.engine.mumuPath || '';
  if ($('setFydeosHost')) $('setFydeosHost').value = s.engine.fydeosHost || '';
  syncBackendFields();
  $('setAdbPath').value = s.adbPath || '';
  $('setDevice').value = s.device || '';
  $('setSystemImage').value = s.runtime.isoPath || '';
  $('setMemory').value = s.engine.memoryMB;
  $('setCores').value = s.engine.cores;
  $('setIdle').value = s.engine.idleShutdownMinutes;
  if ($('setSourcePref')) $('setSourcePref').value = (s.runtime && s.runtime.sourcePreference) || 'auto';
  if ($('setAutoMirror')) $('setAutoMirror').checked = (s.runtime && s.runtime.autoMirror) !== false;
  if ($('setGiteeToken')) $('setGiteeToken').value = (s.runtime && s.runtime.giteeToken) || '';
  if ($('setMirrorPrefix')) $('setMirrorPrefix').value = (s.runtime && s.runtime.mirrorPrefix) || '';
  if ($('setConnections')) $('setConnections').value = Number((s.runtime && s.runtime.downloadConnections) || 8);
  $('setAudio').checked = s.engine.audio !== false;
  $('setLiteMode').checked = s.engine.liteMode !== false;
  $('setPrewarm').checked = s.engine.prewarm !== false;
  $('setPriorityMode').value = ['performance', 'game'].includes(s.engine.priorityMode)
    ? s.engine.priorityMode : 'balanced';
  $('setDeepTrim').checked = !!s.engine.deepTrim;
  $('setMouseRightBack').checked = s.engine.mouseRightBack !== false;
  $('setMouseWheelMode').value = ['smooth', 'native', 'off'].includes(s.engine.mouseWheelMode)
    ? s.engine.mouseWheelMode : 'smooth';
  $('setMouseSideButtons').checked = !!s.engine.mouseSideButtons;
  if ($('setKeymapEnabled')) $('setKeymapEnabled').checked = s.engine.keymapEnabled !== false;
  $('setCompat').checked = !!(s.runtime && s.runtime.compatImage);
  $('setAutoShortcut').checked = !!s.createShortcutOnInstall;
  $('setStartMenuShortcut').checked = s.createStartMenuShortcut !== false;
  $('setShortcutDir').value = s.shortcutDir || '';
  $('setSharedDir').value = s.sharedDir || '';
  $('setDeviceSharedDir').value = s.deviceSharedDir || '';
  const d = s.display || {};
  $('setAutoStart').checked = s.autoStart !== false;
  const eng = s.engine || {};
  if ($('setResourceMode')) $('setResourceMode').value = eng.resourceMode || 'balanced';
  if ($('setRenderSize')) $('setRenderSize').value = eng.renderSize || 'auto';
  if ($('setDataGB')) $('setDataGB').value = String(Number(eng.dataPartitionGB || 0));
  if ($('setFastDns')) $('setFastDns').checked = eng.fastDns !== false;
  if ($('setLocale')) $('setLocale').value = eng.locale || 'tr-TR';
  if ($('setChineseIme')) $('setChineseIme').checked = eng.chineseIme !== false;
  if ($('setKeepSnapshot')) $('setKeepSnapshot').checked = eng.keepSnapshot !== false;
  $('setDisplayMode').value = d.mode === 'fullscreen' ? 'fullscreen' : 'window';
  if ($('setAutoFullscreen')) $('setAutoFullscreen').value = d.autoFullscreenOnLaunch === true ? 'on' : 'off';
  if ($('setLandscape')) $('setLandscape').value = d.landscape === true ? 'landscape' : 'portrait';
  if ($('setOrientationMode')) $('setOrientationMode').value = d.orientationMode || 'auto';
  if ($('setTabletMode')) $('setTabletMode').value = d.tabletMode === false ? 'off' : 'on';
  $('setPortrait').value = d.portrait || '900x1600';
  if ($('setWindowEmbed')) $('setWindowEmbed').value = d.windowEmbed === false ? 'detached' : 'embed';
  $('portraitField').hidden = $('setDisplayMode').value === 'fullscreen';
}

/** 数据分区实际大小 + 磁盘余量，显示在设置页容量选择下方 */
async function refreshDataInfo() {
  const el = $('dataNote');
  if (!el) return;
  const info = await api.dataInfo().catch(() => null);
  if (!info) { el.textContent = t('读取数据分区信息失败'); return; }
  const auto = Number(($('setDataGB') || {}).value || 0) === 0;
  const img = info.imageGB ? `${info.imageGB} GB` : t('尚未创建');
  const free = info.freeDiskMB ? `${(info.freeDiskMB / 1024).toFixed(1)} GB` : t('未知');
  el.textContent = t('当前数据分区镜像：{img}{auto} · 所在磁盘剩余 {free}。', { img, auto: auto ? t('（自动）') : '', free })
    + t('游戏提示「存储空间不足」就把这里调大后点「立即扩容」——扩容是就地做的，已装应用与存档都保留。');
}

async function openSettings() {
  state.settings = await api.getSettings();
  fillSettings(state.settings);
  const info = await api.info();
  $('setRuntimeDir').value = info.runtimeDir || info.dataDir;
  if ($('setAvdDir')) {
    const di = await api.dataInfo().catch(() => null);
    $('setAvdDir').value = (di && di.avdDir) || '';
  }
  const verEl = document.getElementById('aboutVer');
  if (verEl && info.version) verEl.textContent = `v${info.version}`;
  const curVerEl = document.getElementById('updateCurrent');
  if (curVerEl && info.version) curVerEl.textContent = `v${info.version}`;
  const assoc = await api.assocStatus();
  const btn = $('btnAssoc');
  btn.textContent = assoc.registered ? t('已关联 · 点击取消') : t('未关联 · 点击开启');
  btn.dataset.on = assoc.registered ? '1' : '0';

  api.doctorProfile().then((r) => {
    if (r && r.text) $('autoProfileText').textContent = r.text;
  }).catch(() => { $('autoProfileText').textContent = t('自动模式'); });
  api.runtimeUsage().then((u) => {
    $('usageText').textContent = u
      ? `${t('共 {total}', { total: u.totalText })} · ${u.reclaimable ? t('可回收 {size}（{n} 项）', { size: u.reclaimableText, n: u.count }) : t('已是精简状态')}`
      : t('统计不可用');
  }).catch(() => { $('usageText').textContent = t('统计不可用'); });

  $('settingsMask').classList.add('on');
  refreshAndroid();
  refreshDataInfo();
}

function closeSettings() {
  $('settingsMask').classList.remove('on');
}

/* ---------------- 软件更新 ---------------- */

let lastUpdate = null;

/** 把一次检查结果画到设置面板（也用于启动时静默检查推送过来的状态） */
function renderUpdate(info) {
  lastUpdate = info || null;
  const cur = $('updateCurrent');
  const st = $('updateState');
  const btn = $('btnDoUpdate');
  const bar = $('updateBar');
  if (!cur || !st || !btn) return;
  if (!info) return;
  if (info.current) cur.textContent = `v${info.current}`;

  if (info.ok === false) {
    st.textContent = t('检查失败：{err}', { err: info.error || t('网络不可用') });
    // 检查失败也要给一条出路：直接把发布页打开，用户至少能手动下载。
    // 以前这里是「什么都不显示」，用户只会觉得「更新功能坏了」。
    showUpdateBtn(true);
    btn.textContent = t('打开下载页');
    btn.dataset.mode = 'manual';
    lastUpdate = { htmlUrl: info.htmlUrl || '' };
    if (bar) bar.hidden = true;
    return;
  }
  if (info.hasUpdate) {
    // 如实说明这次是哪个源给出的版本、另一个源为什么没参与 ——
    // 用户排查「为什么检查更新很慢」时，这一行比任何日志都直接。
    const src = (info.sources || []).map((x) => `${x.name} ${x.tag || ''}`.trim()).join(' / ');
    const bad = (info.unreachable || []).map((x) => x.name).join(t('、'));
    const stale = info.stale ? t('（离线缓存，可能不是最新）') : '';
    st.textContent = `${t('发现新版本 {tag}', { tag: info.tag })}${src ? t('（{src}）', { src }) : ''}${bad ? t('；{list} 不可达', { list: bad }) : ''}${stale}`;
    showUpdateBtn(true);
    btn.textContent = info.asset ? t('立即更新') : t('打开下载页');
    btn.dataset.mode = info.asset ? 'auto' : 'manual';
    const note = $('updateNote');
    if (note && info.notes) {
      const brief = String(info.notes).split('\n').slice(0, 8).join('\n').trim();
      if (brief) note.textContent = `${t('更新内容：')}\n${brief}`;
    }
    if (bar) bar.hidden = true;
  } else {
    const src = (info.sources || []).map((x) => x.name).join(' / ');
    const stale = info.stale ? t('（离线缓存）') : '';
    st.textContent = `${t('已是最新版本（v{v}）', { v: info.current })}${src ? ` · ${t('经由 {src}', { src })}` : ''}${stale}`;
    showUpdateBtn(false);
    if (bar) bar.hidden = true;
  }
}

/** .btn 自带 display:inline-flex，会盖掉 hidden 属性，所以这里直接改 display */
function showUpdateBtn(on) {
  const btn = $('btnDoUpdate');
  if (!btn) return;
  btn.hidden = !on;
  btn.style.display = on ? '' : 'none';
}

function renderUpdateProgress(p) {
  if (!p) return;
  const st = $('updateState');
  const bar = $('updateBar');
  const fill = $('updateBarFill');
  if (p.stage === 'error') {
    if (st) st.textContent = t('更新失败：{err}', { err: p.message || '' });
    if (bar) bar.hidden = true;
    toast({ title: t('更新失败'), body: p.message || '', type: 'error' });
    return;
  }
  if (st) st.textContent = p.message || t('正在更新…');
  if (bar && fill) {
    bar.hidden = false;
    fill.style.width = `${Math.max(0, Math.min(100, p.percent || 0))}%`;
  }
}

function bindUpdate() {
  const check = $('btnCheckUpdate');
  const go = $('btnDoUpdate');
  if (!check || !go) return;

  const runCheck = async (silent) => {
    if (!silent) {
      check.disabled = true;
      const old = check.textContent;
      check.textContent = t('检查中…');
      $('updateState').textContent = t('正在连接 GitHub…');
      try {
        const info = await api.updateCheck();
        renderUpdate(info);
        if (info && info.hasUpdate) toast({ title: t('发现新版本 {tag}', { tag: info.tag }), body: t('点「立即更新」自动下载安装'), type: 'info' });
        else if (info && info.ok !== false) toast({ title: t('已是最新版本'), body: `v${info.current}`, type: 'ok' });
      } catch (e) {
        $('updateState').textContent = t('检查失败：{err}', { err: e.message });
      } finally {
        check.disabled = false;
        check.textContent = old;
      }
      return;
    }
    const info = await api.updateCheck().catch(() => null);
    if (info) renderUpdate(info);
  };

  check.addEventListener('click', () => runCheck(false));

  go.addEventListener('click', async () => {
    if (go.dataset.mode === 'manual') {
      api.updateOpenRelease(lastUpdate && lastUpdate.htmlUrl);
      return;
    }
    go.disabled = true;
    go.textContent = t('更新中…');
    const r = await api.updateApply().catch((e) => ({ ok: false, error: e.message }));
    if (!r || !r.ok) {
      go.disabled = false;
      go.textContent = t('立即更新');
      if (r && r.error && !r.manual) {
        $('updateState').textContent = t('更新失败：{err}', { err: r.error });
        toast({ title: t('更新失败'), body: r.error, type: 'error' });
      }
    } else {
      $('updateState').textContent = t('已下载 v{v}，正在重启完成安装…', { v: r.version });
    }
  });

  // 打开设置时如果还没结果，就顺手查一次（放后台，不打扰）
  runCheck(true).catch(() => {});
}

function bindSettings() {
  const save = async (patch) => {
    state.settings = await api.setSettings(patch);
  };

  if ($('setTheme')) {
    $('setTheme').addEventListener('change', async (e) => {
      const newTheme = e.target.value;
      applyTheme(newTheme);
      await save({ theme: newTheme });
    });
  }

  if ($('setLanguage')) {
    $('setLanguage').addEventListener('change', async (e) => {
      // 主进程保存后会 reload 所有窗口，界面按新语言重新加载
      await api.setLanguage(e.target.value);
    });
  }

  $('setEngineMode').addEventListener('change', async (e) => {
    await save({ engine: { mode: e.target.value } });
    syncBackendFields();
    refreshStatus();
  });
  if ($('setMumuPath')) {
    $('setMumuPath').addEventListener('change', (e) => save({ engine: { mumuPath: e.target.value.trim() } }));
  }
  if ($('setFydeosHost')) {
    $('setFydeosHost').addEventListener('change', (e) => save({ engine: { fydeosHost: e.target.value.trim() } }));
  }
  $('setAdbPath').addEventListener('change', (e) => save({ adbPath: e.target.value.trim() }));
  $('setDevice').addEventListener('change', async (e) => {
    await save({ device: e.target.value.trim() });
    refreshStatus();
  });
  $('setSystemImage').addEventListener('change', (e) => save({ runtime: { isoPath: e.target.value.trim() } }));
  // 内存 / 核心：填了具体值就关掉「自动」，填 0 又回到自动。
  // 旧代码只写 memoryMB，而 overridesFromSettings 只在 autoMemory=false 时才认它，
  // 于是「手动填了内存」一直被忽略 —— 这是设置页最容易被当成“没用”的一项。
  $('setMemory').addEventListener('change', (e) => {
    const v = Number(e.target.value) || 0;
    save(v > 0 ? { engine: { memoryMB: v, autoMemory: false } } : { engine: { memoryMB: 0, autoMemory: true } });
  });
  $('setCores').addEventListener('change', (e) => {
    const v = Number(e.target.value) || 0;
    save(v > 0 ? { engine: { cores: v, autoMemory: false } } : { engine: { cores: 0, autoMemory: true } });
  });
  if ($('setResourceMode')) {
    $('setResourceMode').addEventListener('change', async (e) => {
      // 资源策略会连带改 liteMode / priorityMode / renderSize（主进程里翻译）
      state.settings = await api.setSettings({ engine: { resourceMode: e.target.value } });
      fillSettings(state.settings);
      toast({ title: t('资源策略已切换'), body: t('下一次打开应用生效'), type: 'ok' });
    });
  }
  if ($('setRenderSize')) {
    $('setRenderSize').addEventListener('change', (e) => save({ engine: { renderSize: e.target.value } }));
  }
  if ($('setFastDns')) {
    $('setFastDns').addEventListener('change', (e) => save({ engine: { fastDns: e.target.checked } }));
  }
  if ($('setLocale')) {
    $('setLocale').addEventListener('change', async (e) => {
      state.settings = await api.setSettings({ engine: { locale: e.target.value } });
      toast({ title: t('系统语言已更新'), body: t('下次重启安卓运行时后生效'), type: 'ok' });
    });
  }
  if ($('setChineseIme')) {
    $('setChineseIme').addEventListener('change', async (e) => {
      state.settings = await api.setSettings({ engine: { chineseIme: e.target.checked } });
      toast({
        title: e.target.checked ? t('已开启中文输入法') : t('已关闭中文输入法'),
        body: t('下次重启安卓运行时后生效'),
        type: 'ok',
      });
    });
  }
  if ($('setKeepSnapshot')) {
    $('setKeepSnapshot').addEventListener('change', (e) => save({ engine: { keepSnapshot: e.target.checked } }));
  }
  if ($('setDataGB')) {
    $('setDataGB').addEventListener('change', (e) => {
      save({ engine: { dataPartitionGB: Number(e.target.value) || 0 } });
      refreshDataInfo();
    });
  }
  if ($('btnGrowData')) {
    $('btnGrowData').addEventListener('click', async () => {
      const gb = Number($('setDataGB').value) || 0;
      if (!gb) { toast({ title: t('先选一个容量'), body: t('「自动」表示由软件按磁盘余量决定，不需要扩容'), type: 'info' }); return; }
      const { response } = await api.confirm({
        title: t('立刻把安卓数据分区扩容？'),
        message: t('将把 /data 调整为 {gb} GB（就地扩容，已装应用和存档都会保留）。', { gb }),
        detail: t('扩容需要先关掉正在运行的安卓应用，完成后下次打开应用会重新引导，约多花十几秒。'),
        okLabel: t('开始扩容'),
      });
      if (response !== 1) return;
      $('btnGrowData').disabled = true;
      const old = $('btnGrowData').textContent;
      $('btnGrowData').textContent = t('扩容中…');
      const r = await api.setDataSize(gb).catch((e) => ({ ok: false, error: e.message }));
      $('btnGrowData').disabled = false;
      $('btnGrowData').textContent = old;
      toast({
        type: r && r.ok ? 'ok' : 'error',
        title: r && r.ok ? t('数据分区已扩容') : t('扩容失败'),
        body: r && r.ok ? t('现在约 {gb} GB 可用', { gb: r.imageGB || gb }) : (r && r.error) || t('未知错误'),
      });
      refreshDataInfo();
    });
  }
  $('setIdle').addEventListener('change', (e) => save({ engine: { idleShutdownMinutes: Number(e.target.value) || 0 } }));
  if ($('setSourcePref')) {
    $('setSourcePref').addEventListener('change', (e) => save({ runtime: { sourcePreference: e.target.value } }));
  }
  if ($('setAutoMirror')) {
    $('setAutoMirror').addEventListener('change', (e) => save({ runtime: { autoMirror: e.target.checked } }));
  }
  if ($('setGiteeToken')) {
    $('setGiteeToken').addEventListener('change', (e) => save({ runtime: { giteeToken: e.target.value.trim() } }));
  }
  if ($('setMirrorPrefix')) {
    $('setMirrorPrefix').addEventListener('change', (e) => save({ runtime: { mirrorPrefix: e.target.value.trim() } }));
  }
  if ($('setConnections')) {
    $('setConnections').addEventListener('change', (e) => {
      const n = Math.max(1, Math.min(16, Number(e.target.value) || 8));
      e.target.value = n;
      save({ runtime: { downloadConnections: n } });
    });
  }
  $('setAudio').addEventListener('change', (e) => save({ engine: { audio: e.target.checked } }));
  $('setLiteMode').addEventListener('change', (e) => save({ engine: { liteMode: e.target.checked } }));
  $('setPrewarm').addEventListener('change', (e) => save({ engine: { prewarm: e.target.checked } }));
  $('setPriorityMode').addEventListener('change', (e) => save({ engine: { priorityMode: e.target.value } }));
  const savePointer = async (patch) => {
    await save({ engine: patch });
    // 立刻按当前窗口焦点重装/卸载钩子，不用等下次切窗口
    api.refreshPointerMapping().catch(() => {});
  };
  $('setMouseRightBack').addEventListener('change', (e) => savePointer({ mouseRightBack: e.target.checked }));
  $('setMouseWheelMode').addEventListener('change', (e) => savePointer({ mouseWheelMode: e.target.value }));
  $('setMouseSideButtons').addEventListener('change', (e) => savePointer({ mouseSideButtons: e.target.checked }));
  if ($('setKeymapEnabled')) {
    $('setKeymapEnabled').addEventListener('change', async (e) => {
      await api.keymap.setEnabled(e.target.checked);
      toast({ title: e.target.checked ? t('键盘映射已开启') : t('键盘映射已关闭'), type: 'ok' });
    });
  }
  $('setDeepTrim').addEventListener('change', async (e) => {
    await save({ engine: { deepTrim: e.target.checked } });
    // 关掉深度裁剪必须把之前 pm disable-user 的包恢复回来，否则影响是持久的
    if (!e.target.checked) {
      api.restoreSystemApps().catch(() => {});
      toast({ title: t('已恢复系统组件'), body: t('深度裁剪关闭，后台包正在恢复'), type: 'info' });
    }
  });
  $('setCompat').addEventListener('change', async (e) => {
    const on = e.target.checked;
    await save({ runtime: { compatImage: on } });
    const env = ((state.status = await api.runtimeStatus()).env) || {};
    const ok = env.playImage && env.playImage.ok;
    $('compatInstallField').hidden = !on || !!ok;
    if (on && !ok) toast({ title: t('ARM 兼容模式已开启'), body: t('还需要下载 Google Play 兼容镜像（Android 14，约 1.5GB），点击下方按钮开始'), type: 'info' });
    else if (on) toast({ title: t('ARM 兼容模式已开启'), body: t('重启运行时后生效'), type: 'info' });
  });
  $('setAutoShortcut').addEventListener('change', (e) => save({ createShortcutOnInstall: e.target.checked }));
  $('setStartMenuShortcut').addEventListener('change', (e) => save({ createStartMenuShortcut: e.target.checked }));
  $('setShortcutDir').addEventListener('change', (e) => save({ shortcutDir: e.target.value.trim() }));
  $('setDeviceSharedDir').addEventListener('change', (e) => save({ deviceSharedDir: e.target.value.trim() }));
  $('setAutoStart').addEventListener('change', (e) => save({ autoStart: e.target.checked }));
  $('setDisplayMode').addEventListener('change', async (e) => {
    const mode = e.target.value;
    $('portraitField').hidden = mode === 'fullscreen';
    state.settings = await api.setSettings({ display: { mode } });
    toast({ title: mode === 'fullscreen' ? t('已切全屏') : t('已切竖屏窗口'), type: 'ok' });
  });
  if ($('setAutoFullscreen')) {
    $('setAutoFullscreen').addEventListener('change', async (e) => {
      const on = e.target.value === 'on';
      state.settings = await api.setSettings({ display: { autoFullscreenOnLaunch: on } });
      toast({ title: on ? t('已开启自动全屏') : t('已关闭自动全屏'), body: t('下次打开应用时生效'), type: 'ok' });
    });
  }
  if ($('setOrientationMode')) {
    $('setOrientationMode').addEventListener('change', async (e) => {
      const mode = e.target.value;
      state.settings = await api.setSettings({ display: { orientationMode: mode } });
      toast({
        title: mode === 'auto' ? t('已设为跟随应用') : (mode === 'landscape' ? t('已强制横屏') : t('已强制竖屏')),
        body: mode === 'auto'
          ? t('下次打开应用时会按应用自己的方向选面板，方向不一致的话会重启一次运行时。')
          : t('下次打开应用时会重启一次运行时把面板切到指定方向，之后不再重启。'),
        type: 'ok',
      });
    });
  }
  if ($('setTabletMode')) {
    $('setTabletMode').addEventListener('change', async (e) => {
      const on = e.target.value === 'on';
      state.settings = await api.setSettings({ display: { tabletMode: on } });
      toast({
        title: on ? t('已打开平板排版') : t('已关闭平板排版'),
        body: t('下次打开应用时生效（会重启一次运行时来改逻辑密度）。'),
        type: 'ok',
      });
    });
  }
  if ($('setLandscape')) {
    $('setLandscape').addEventListener('change', async (e) => {
      const landscape = e.target.value === 'landscape';
      state.settings = await api.setSettings({ display: { landscape } });
      toast({
        title: landscape ? t('已设为横屏') : t('已设为竖屏'),
        body: landscape
          ? t('下次打开应用时会重启一次运行时来切换物理面板方向（约十几秒），之后就不会再重启。')
          : t('下次打开应用时会把面板切回竖屏。'),
        type: 'ok',
      });
    });
  }
  $('setPortrait').addEventListener('change', async (e) => {
    state.settings = await api.setSettings({ display: { portrait: e.target.value } });
    toast({ title: t('画面大小已更新'), body: t('下次打开应用或切换应用时生效'), type: 'ok' });
  });
  $('setWindowEmbed').addEventListener('change', async (e) => {
    const embed = e.target.value === 'embed';
    state.settings = await api.setSettings({ display: { windowEmbed: embed } });
    toast({
      title: embed ? t('已切回嵌入模式') : t('已切到独立窗口模式'),
      body: t('下次打开应用时生效。独立模式下安卓画面由模拟器自己开窗口，方向与缩放都由它处理。'),
      type: 'ok',
    });
  });
  $('btnRebuildShortcuts').addEventListener('click', async () => {
    const r = await api.rebuildShortcuts();
    toast({
      title: r && r.fixed && r.fixed.length ? t('已补齐快捷方式') : t('快捷方式都还在'),
      body: r && r.fixed && r.fixed.length ? r.fixed.join(t('、')) : t('桌面与开始菜单入口正常'),
      type: 'ok',
    });
  });

  $('btnDiagnostics').addEventListener('click', async () => {
    try {
      const r = await api.doctorReport();
      toast({ title: t('诊断报告已导出'), body: `${r.diagnosis.title} · ${r.file}`, type: 'ok', sticky: true });
    } catch (e) {
      toast({ title: t('导出失败'), body: e.message, type: 'error' });
    }
  });

  $('btnCleanup').addEventListener('click', async () => {
    const btn = $('btnCleanup');
    const includeSnapshots = $('chkCleanSnapshots') && $('chkCleanSnapshots').checked;
    btn.disabled = true;
    try {
      const preview = await api.runtimeCleanup({ apply: false, includeSnapshots });
      if (!preview.candidates.length) {
        toast({ title: t('已经是精简状态'), body: t('没有可回收的旧镜像或快照。'), type: 'ok' });
        return;
      }
      const r = await api.runtimeCleanup({ apply: true, includeSnapshots });
      if (r.cancelled) return;
      toast({
        title: t('清理完成'),
        body: t('释放约 {mb} MB（{n} 项），已安装应用保留。', { mb: (r.saved / 1048576).toFixed(0), n: r.removed.length }),
        type: 'ok',
      });
      const u = await api.runtimeUsage();
      $('usageText').textContent = `${t('共 {total}', { total: u.totalText })} · ${t('可回收 {size}（{n} 项）', { size: u.reclaimableText, n: u.count })}`;
    } catch (e) {
      toast({ title: t('清理失败'), body: e.message, type: 'error' });
    } finally {
      btn.disabled = false;
    }
  });

  // 重置安卓数据：二级确认（先确认意图，再确认不可撤销），清完刷新占用统计
  $('btnResetData').addEventListener('click', async () => {
    const btn = $('btnResetData');
    btn.disabled = true;
    try {
      const first = await api.confirm({
        type: 'warning',
        title: t('重置安卓数据？'),
        message: t('这会把安卓系统还原成「刚装好系统」的干净状态：'),
        detail: t('• 删除全部已安装的第三方 app（含红果、游戏等）及其数据、登录态\n• 删除当前 AVD 的快速启动快照\n• 系统镜像本身不受影响，重新打开应用会再次冷启动建数据\n\n此操作不可撤销。是否继续？'),
        buttons: [t('取消'), t('继续')],
        defaultId: 0,
        cancelId: 0,
      });
      if (!first || first.response !== 1) return;
      const second = await api.confirm({
        type: 'warning',
        title: t('再确认一次'),
        message: t('已安装的 app 和它们的数据将被永久删除，确定要重置吗？'),
        detail: t('可放心的是：系统镜像、其它 AVD、本机的 APK 缓存和图标都不会动。'),
        buttons: [t('取消'), t('确定重置')],
        defaultId: 0,
        cancelId: 0,
      });
      if (!second || second.response !== 1) return;
      const r = await api.runtimeResetData();
      if (!r || !r.ok) {
        toast({ title: t('重置失败'), body: (r && r.error) || t('请重试'), type: 'error' });
        return;
      }
      toast({
        title: t('安卓数据已重置'),
        body: t('释放约 {mb} MB，已安装应用记录已清空。', { mb: r.reclaimedMB }),
        type: 'ok',
      });
      const u = await api.runtimeUsage();
      $('usageText').textContent = `${t('共 {total}', { total: u.totalText })} · ${t('可回收 {size}（{n} 项）', { size: u.reclaimableText, n: u.count })}`;
    } catch (e) {
      toast({ title: t('重置失败'), body: e.message, type: 'error' });
    } finally {
      btn.disabled = false;
    }
  });

  // 修复网络：安卓里联网页面一直黑屏（红果点「同意并继续」后整屏黑）时用。
  // 根因是虚拟机 /data 里的 Wi-Fi 配置坏了，wlan0 没起来、没有默认路由。
  // Play Store 镜像不允许 root，只能整体重置 /data；应用清单保留，点开时会自动重装。
  $('btnRepairNetwork').addEventListener('click', async () => {
    const btn = $('btnRepairNetwork');
    btn.disabled = true;
    try {
      const ok = await api.confirm({
        type: 'warning',
        title: t('修复虚拟机网络？'),
        message: t('应用里需要联网的页面一直黑屏/转圈，通常是安卓虚拟机没有网络。'),
        detail: t('修复会按「代价从小到大」依次尝试：\n\n1. 冷启动虚拟机（不加载快照）后等待联网 —— 不影响任何数据\n2. 仍不行才重置安卓数据 —— 应用清单保留、点开会自动重装，\n   但应用内的登录态、追剧记录等会丢失\n\n只影响当前 AVD，系统镜像和本机 APK 缓存都不动。整个过程约 1–5 分钟。是否继续？'),
        buttons: [t('取消'), t('开始修复')],
        defaultId: 0,
        cancelId: 0,
      });
      if (!ok || ok.response !== 1) return;
      const r = await api.runtimeRepairNetwork();
      if (!r || !r.ok) {
        toast({
          title: t('网络仍未恢复'),
          body: (r && r.error) || t('重置后虚拟机还是没网，请检查本机网络/防火墙是否拦住了模拟器。'),
          type: 'error',
        });
        return;
      }
      toast({
        title: t('网络已恢复'),
        body: `${(r.network && r.network.ip) || t('已联网')}${r.wiped ? t('（为修复网络重置过安卓数据，点开应用会自动重装）') : t('（未动你的数据）')}`,
        type: 'ok',
      });
    } catch (e) {
      toast({ title: t('修复失败'), body: e.message, type: 'error' });
    } finally {
      btn.disabled = false;
    }
  });

  // 清理旧版本残留：扫描旧程序目录 / 失效卸载项 / 更新临时文件，确认后一次性清掉。
  $('btnLeftovers').addEventListener('click', async () => {
    const btn = $('btnLeftovers');
    btn.disabled = true;
    try {
      const r = await api.leftoversScan();
      if (!r || !r.ok) {
        toast({ title: t('扫描失败'), body: (r && r.error) || t('请重试'), type: 'error' });
        return;
      }
      const items = r.items || [];
      if (!items.length) {
        toast({ title: t('很干净'), body: t('没有发现旧版本残留。'), type: 'ok' });
        return;
      }
      const mb = Math.round((r.totalBytes || 0) / 1048576);
      const lines = items.slice(0, 8).map((x) => `• ${x.note}${t('：')}${x.path}`);
      if (items.length > 8) lines.push(t('…另有 {n} 项', { n: items.length - 8 }));
      const ok = await api.confirm({
        type: 'warning',
        title: t('清理旧版本残留？'),
        message: t('找到 {n} 项残留，约 {mb} MB：', { n: items.length, mb }),
        detail: `${lines.join('\n')}\n\n${t('只删除「旧版本程序目录 / 已失效的卸载项 / 更新临时文件」，当前正在运行的版本和你的应用数据都不会动。')}`,
        buttons: [t('取消'), t('开始清理')],
        defaultId: 1,
        cancelId: 0,
      });
      if (!ok || ok.response !== 1) return;
      const c = await api.leftoversClean(items);
      if (!c || !c.ok) {
        toast({ title: t('清理失败'), body: (c && c.error) || t('请重试'), type: 'error' });
        return;
      }
      const failNote = (c.failed && c.failed.length) ? t('，{n} 项被占用未删', { n: c.failed.length }) : '';
      toast({
        title: t('已清理旧版本残留'),
        body: t('删除 {n} 项，释放 {mb} MB{note}。', { n: c.removed.length, mb: c.freedMB || 0, note: failNote }),
        type: 'ok',
      });
      const u = await api.runtimeUsage();
      $('usageText').textContent = `${t('共 {total}', { total: u.totalText })} · ${t('可回收 {size}（{n} 项）', { size: u.reclaimableText, n: u.count })}`;
    } catch (e) {
      toast({ title: t('清理失败'), body: e.message, type: 'error' });
    } finally {
      btn.disabled = false;
    }
  });

  $('btnOpenShared').addEventListener('click', () => api.openSharedDir());

  // 重建快捷方式：桌面图标被误删 / 被安全软件拦掉时的兜底入口
  $('btnRebuildShortcuts').addEventListener('click', async () => {
    const btn = $('btnRebuildShortcuts');
    btn.disabled = true;
    try {
      const r = await api.rebuildShortcuts().catch(() => ({ ok: false }));
      const fixed = (r && r.fixed) || [];
      toast(fixed.length
        ? { title: t('快捷方式已重建'), body: fixed.join(t('、')), type: 'ok' }
        : { title: t('快捷方式都在'), body: t('没有需要重建的入口'), type: 'info' });
    } finally {
      btn.disabled = false;
    }
  });

  // 共享目录：先浏览选目录，再「保存并迁移」把旧文件一次性搬到新目录
  $('btnBrowseShared').addEventListener('click', async () => {
    const picked = await api.openDir();
    if (!picked) return;
    $('setSharedDir').value = picked;
    toast({ title: t('已选新目录'), body: t('点「保存并迁移」把旧文件搬过去'), type: 'info' });
  });
  $('btnSaveShared').addEventListener('click', async () => {
    const dir = $('setSharedDir').value.trim();
    if (!dir) { toast({ title: t('请先填写或浏览目录'), type: 'error' }); return; }
    const btn = $('btnSaveShared');
    btn.disabled = true;
    const r = await api.setSharedDir(dir).catch(() => ({ ok: false }));
    btn.disabled = false;
    if (r.ok) {
      const moved = r.oldDir && r.oldDir !== r.newDir;
      toast({ title: t('共享目录已更新'), body: moved ? t('旧目录里已有的文件已迁移到新目录') : t('已保存'), type: 'ok' });
    } else {
      toast({ title: t('保存失败'), body: r.error, type: 'error' });
    }
  });

  // 一键卸载 ApkStart 本体（取消 .apk 关联 + 启动卸载程序；便携版手动删除）
  $('btnUninstall').addEventListener('click', async () => {
    const ok = window.confirm(t('确定卸载 ApkStart？\n\n将取消 .apk 文件关联并移除程序。此操作不可撤销。'));
    if (!ok) return;
    const btn = $('btnUninstall');
    btn.disabled = true;
    const r = await api.removeSelf().catch(() => ({ ok: false }));
    if (r.ok && r.portable) {
      btn.disabled = false;
      toast({
        title: t('便携版无法自动卸载'),
        body: t('请手动删除程序目录（{exe}）与数据目录（{data}）', { exe: r.exeDir, data: r.dataDir }),
        type: 'info', sticky: true,
      });
      return;
    }
    if (!r.ok) {
      btn.disabled = false;
      toast({ title: t('卸载失败'), body: r.error, type: 'error' });
      return;
    }
    toast({ title: t('正在卸载…'), body: t('卸载程序已启动，ApkStart 即将退出'), type: 'ok', sticky: true });
  });

  // ARM 兼容镜像下载（带进度 toast）
  $('btnInstallPlay').addEventListener('click', async () => {
    const btn = $('btnInstallPlay');
    btn.disabled = true;
    const tt = toast({ title: t('开始下载 ARM 兼容镜像'), body: t('准备中…'), sticky: true, spinner: true, progress: 3 });
    const un = api.on('provision:progress', (p) => {
      if (p.component !== 'playimg') return;
      tt.update({ title: t('下载 ARM 兼容镜像'), body: p.message || '', progress: p.percent });
    });
    try {
      const r = await api.installPlayImage();
      if (r && r.ok) {
        tt.update({ title: t('ARM 兼容镜像就绪'), body: t('重启运行时后生效'), progress: 100 });
        setTimeout(() => tt.dismiss(), 3000);
        $('compatInstallField').hidden = true;
        refreshStatus();
      } else {
        tt.update({ title: t('兼容镜像下载失败'), body: (r && r.error) || t('未知错误'), progress: null });
        tt.dismiss();
        toast({ title: t('兼容镜像下载失败'), body: (r && r.error) || t('未知错误'), type: 'error' });
      }
    } catch (e) {
      tt.dismiss();
      toast({ title: t('兼容镜像下载失败'), body: e.message, type: 'error' });
    } finally {
      un();
      btn.disabled = false;
    }
  });

  // 兼容镜像状态显示
  (async () => {
    const env = ((state.status = await api.runtimeStatus()).env) || {};
    const s = state.settings;
    const on = !!(s && s.runtime && s.runtime.compatImage);
    const ok = env.playImage && env.playImage.ok;
    $('compatInstallField').hidden = !on || !!ok;
    if (env.playImage) {
      $('compatImgStatus').textContent = ok
        ? t('已就绪（{gb} GB）', { gb: (env.playImage.size / 1073741824).toFixed(2) }) : t('未下载');
    }
  })();
  $('btnOpenData').addEventListener('click', async () => {
    const info = await api.info();
    const dir = info.runtimeDir || info.dataDir;
    window.open(`file:///${dir.replace(/\\/g, '/')}`);
  });
  $('btnBrowseRuntimeDir').addEventListener('click', async () => {
    const info = await api.info();
    const picked = await api.openDir();
    if (!picked) return;
    await api.setSettings({ runtime: { dir: picked } });
    $('setRuntimeDir').value = picked;
    toast({ title: t('数据目录已更新'), body: t('请重启 ApkStart 使其生效（旧数据不会自动搬移）'), type: 'ok', sticky: true });
  });

  // 安卓数据目录（AVD + 快照）：真正吃盘的那块，单独指到别的盘
  if ($('btnBrowseAvdDir')) {
    $('btnBrowseAvdDir').addEventListener('click', async () => {
      const picked = await api.openDir();
      if (!picked) return;
      await api.setSettings({ runtime: { avdDir: picked } });
      $('setAvdDir').value = picked;
      toast({
        title: t('安卓数据目录已更新'),
        body: t('请重启 ApkStart 使其生效。旧目录里的 apkstart.avd 可以整体搬到新目录，再删掉旧的。'),
        type: 'ok',
        sticky: true,
      });
    });
  }
  if ($('btnOpenAvdDir')) {
    $('btnOpenAvdDir').addEventListener('click', async () => {
      const info = await api.dataInfo().catch(() => null);
      const dir = (info && info.avdDir) || (await api.info()).dataDir;
      window.open(`file:///${String(dir).replace(/\\/g, '/')}`);
    });
  }

  $('btnProbe').addEventListener('click', async () => {
    const el = $('probeResult');
    el.textContent = t('探测中…');
    const found = await api.runtimeProbe();
    if (!found.length) {
      el.textContent = t('未发现已运行的运行时');
      return;
    }
    el.textContent = t('发现：{list}', { list: found.map((f) => f.name).join(t('、')) });
    await api.setSettings({ device: found[0].serial });
    $('setDevice').value = found[0].serial;
    refreshStatus();
  });

  $('btnRuntimeStart').addEventListener('click', async () => {
    const el = $('probeResult');
    el.textContent = t('正在启动…');
    const r = await api.runtimeStart();
    el.textContent = r.ok ? t('已就绪：{engine}', { engine: r.engine }) : t('启动失败：{err}', { err: r.error });
    refreshStatus();
  });

  $('btnRuntimeStop').addEventListener('click', async () => {
    await api.runtimeStop();
    $('probeResult').textContent = t('已停止内置虚拟机');
    refreshStatus();
  });

  $('btnAssoc').addEventListener('click', async () => {
    const btn = $('btnAssoc');
    if (btn.dataset.on === '1') {
      await api.assocUnregister();
      btn.textContent = t('未关联 · 点击开启');
      btn.dataset.on = '0';
      toast({ title: t('.apk 关联已取消') });
    } else {
      const r = await api.assocRegister();
      btn.textContent = t('已关联 · 点击取消');
      btn.dataset.on = '1';
      toast({ title: t('.apk 关联已开启'), body: r.ok ? t('现在双击 APK 会直接安装到 ApkStart') : '', type: r.ok ? 'ok' : 'error' });
    }
  });
}

/* ---------------- 事件绑定 ---------------- */

function bindEvents() {
  // 链接统一走系统浏览器
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="http"]');
    if (!a) return;
    e.preventDefault();
    api.openExternal(a.getAttribute('href'));
  });

  $('btnSettings').addEventListener('click', openSettings);
  initLangButton();
  // 状态标签也当入口：点「需要部署 / 引导中 / Android 14」直接进设置的运行时面板
  $('engineTag').addEventListener('click', () => showSetup(true));
  $('btnCloseSettings').addEventListener('click', closeSettings);
  $('btnDoneSettings').addEventListener('click', closeSettings);
  $('settingsMask').addEventListener('click', (e) => {
    if (e.target === $('settingsMask')) closeSettings();
  });

  // 运行时部署：入口已收进设置，这里只处理面板内的按钮
  $('btnDeployAll').addEventListener('click', deployAll);
  $('btnMarkInstalled').addEventListener('click', markInstalled);
  $('btnGuideClose').addEventListener('click', () => { $('setupGuide').hidden = true; });
  $('btnSetupAdvanced').addEventListener('click', () => {
    const adv = document.querySelector('.advanced-group');
    if (adv) {
      adv.open = true;
      adv.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  });

  // 状态条上的自检计数：点开就是设置里的运行时面板
  $('envChip').addEventListener('click', () => {
    openSettings().then(() => {
      const box = $('envCheck');
      if (box && !box.hidden) box.scrollIntoView({ block: 'center', behavior: 'smooth' });
      else $('runtimeGroup').scrollIntoView({ block: 'start', behavior: 'smooth' });
    }).catch(() => {});
  });

  $('setupSteps').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act;
    if (act === 'emulator' || act === 'sysimg' || act === 'accel'
      || act === 'adb' || act === 'qemu' || act === 'iso' || act === 'disk') {
      const r = await runStep(act);
      if (!r.ok) toast({ title: t('操作失败'), body: r.error, type: 'error', sticky: true });
      return;
    }
    if (act === 'isoImport') {
      const r = await api.importIso();
      if (r.ok) { toast({ title: t('系统镜像已导入'), body: r.path, type: 'ok' }); refreshStatus(); }
      else if (!r.canceled) toast({ title: t('导入失败'), body: r.error, type: 'error' });
      return;
    }
    if (act === 'diskImport') {
      const r = await api.importDisk();
      if (r.ok) { toast({ title: t('虚拟磁盘已导入'), body: t('可直接启动运行时'), type: 'ok' }); refreshStatus(); }
      else if (!r.canceled) toast({ title: t('导入失败'), body: r.error, type: 'error' });
      return;
    }
    if (act === 'install') { await startInstall(); return; }
    if (act === 'vmStart') {
      const tt = toast({ title: t('正在启动运行时…'), body: t('首次启动需要引导 Android 系统'), sticky: true, spinner: true });
      const r = await api.runtimeStart();
      if (r.ok) { tt.update({ title: t('运行时已就绪'), type: 'ok' }); setTimeout(tt.dismiss, 2200); }
      else tt.update({ title: t('启动失败'), body: r.error, type: 'error' });
      refreshStatus();
      return;
    }
    if (act === 'vmStop') {
      await api.runtimeStop();
      toast({ title: t('运行时会话已结束') });
      refreshStatus();
    }
  });

  const pick = async () => {
    const files = await api.pickApk();
    if (files.length) installFiles(files);
  };
  $('btnInstall').addEventListener('click', pick);
  $('btnInstall2').addEventListener('click', pick);
  // 共享目录入口移到设置里：同步 + 打开都在「文件互通」组内
  const btnSync = $('btnSyncShared');
  if (btnSync) btnSync.addEventListener('click', async () => {
    btnSync.disabled = true;
    try {
      await api.syncShared();
      toast({ title: t('已同步共享目录'), type: 'ok' });
    } catch (_) {
      toast({ title: t('同步失败'), body: t('运行时未就绪时会跳过同步'), type: 'error' });
    } finally {
      btnSync.disabled = false;
    }
  });

  $('search').addEventListener('input', (e) => {
    state.filter = e.target.value;
    renderGrid();
  });

  $('grid').addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    // 「添加应用」卡片没有 data-pkg，走安装流程而不是启动。
    // 直接转调工具栏那个「安装 APK」按钮，复用它的文件选择逻辑。
    if (card.classList.contains('card-add')) { $('btnInstall').click(); return; }
    if (card.dataset.pkg) launchApp(card.dataset.pkg);
  });

  $('grid').addEventListener('contextmenu', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    e.preventDefault();
    showMenu(e.clientX, e.clientY, card.dataset.pkg);
  });

  $('grid').addEventListener('dblclick', (e) => {
    const card = e.target.closest('.card');
    if (card) createShortcut(card.dataset.pkg);
  });

  $('ctxmenu').addEventListener('click', (e) => {
    const item = e.target.closest('.item');
    if (item) handleMenu(item.dataset.act);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#ctxmenu')) hideMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideMenu();
      closeSettings();
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      $('search').focus();
    }
  });

  // 拖放安装
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragDepth++;
    $('dropzone').classList.add('on');
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) $('dropzone').classList.remove('on');
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    $('dropzone').classList.remove('on');
    const files = [...(e.dataTransfer?.files || [])];
    const paths = files
      .map((f) => { try { return api.pathForFile(f); } catch (_) { return null; } })
      .filter((p) => p && /\.apk$/i.test(p));
    if (paths.length) installFiles(paths);
    else toast({ title: t('只能拖入 .apk 文件'), type: 'error' });
  });

  // 主进程事件
  api.on('install:error', (p) => {
    // 报错了就别再让「正在安装…」那条一直转圈（可能来自双击 APK 的另一条链路）
    if (installToast) { try { installToast.dismiss(); } catch (_) { /* ignore */ } installToast = null; }
    const name = p && p.file ? String(p.file).split(/[\\/]/).pop() : '';
    toast({
      title: name ? t('安装失败：{name}', { name }) : t('安装失败'),
      body: friendlyInstallErrorText((p && p.message) || t('未知错误')),
      type: 'error',
    });
  });
  api.on('toast', (p) => toast({ title: p.message, type: p.type === 'error' ? 'error' : 'info' }));
  api.on('app:launched', () => setTimeout(refreshApps, 800));
  // 应用被关掉（托盘「关闭当前应用」、右键菜单、或窗口被关）后要刷新「运行中」标记
  api.on('apps:changed', () => setTimeout(refreshApps, 300));
  api.on('runtime:log', (m) => console.log('[runtime]', m));
  api.on('ui:navigate', (v) => {
    if (v === 'settings') openSettings();
    if (v === 'setup') { showSetup(true); refreshStatus(); }
  });
  api.on('provision:progress', (p) => updateStepProgress(p.component, p));
  api.on('update:state', (info) => {
    if (!info) return;
    renderUpdate(info);
    // 启动 8 秒后才拿到更新信息：欢迎卡若还开着，把「发现新版本」这条补进去
    const wm = $('welcomeMask');
    if (wm && !wm.hidden) renderWelcomeTips();
  });
  api.on('update:progress', (p) => renderUpdateProgress(p));
}

/* ---------------- 启动 ---------------- */

async function init() {
  applyTheme('dark');
  if (window.translateDom) translateDom(document.body);
  bindEvents();
  bindSettings();
  bindUpdate();
  bindAndroid();
  bindWelcome();
  state.settings = await api.getSettings();
  applyTheme(state.settings && state.settings.theme);
  initThemeButton();
  await refreshStatus();
  await refreshApps();
  refreshAndroid();
  selfCheck();
  maybeShowWelcome();
  setInterval(refreshStatus, 6000);
  setInterval(refreshApps, 15000);
  setInterval(selfCheck, 60000);
}

/* ---------------- 启动欢迎卡 ---------------- */

let startupInfo = null;

function greetingOf(h) {
  if (h < 5) return t('夜深了');
  if (h < 11) return t('早上好');
  if (h < 13) return t('中午好');
  if (h < 18) return t('下午好');
  return t('晚上好');
}

function bindWelcome() {
  const mask = $('welcomeMask');
  if (!mask) return;
  const close = () => { mask.hidden = true; };
  const never = $('welcomeNever');
  $('welcomeOk').addEventListener('click', () => {
    if (never && never.checked) api.setSettings({ welcome: { disabled: true } }).catch(() => {});
    close();
  });
  $('welcomeSettings').addEventListener('click', () => { close(); openSettings(); });
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !mask.hidden) close(); });
}

/** 决定要不要弹：开机自启必弹；手动打开则每天最多一次，且用户可永久关闭 */
async function maybeShowWelcome() {
  const mask = $('welcomeMask');
  if (!mask) return;
  // 冒烟截图时不要弹欢迎卡：否则每次自动截图都被它挡住主界面
  try { if ((await api.startupInfo()).smoke) return; } catch (_) { /* ignore */ }
  try { startupInfo = await api.startupInfo(); } catch (_) { startupInfo = null; }
  const cfg = (state.settings && state.settings.welcome) || {};
  if (cfg.disabled) return;
  const today = new Date().toISOString().slice(0, 10);
  if (!(startupInfo && startupInfo.autostart) && cfg.lastDate === today) return;

  const h = new Date().getHours();
  $('welcomeHi').textContent = t('{greeting}，欢迎回来', { greeting: greetingOf(h) });
  const ver = (startupInfo && startupInfo.version) || (state.status && state.status.version) || '';
  const ready = state.status && state.status.ready;
  $('welcomeSub').textContent = `ApkStart${ver ? ` v${ver}` : ''} · ${ready ? t('运行时就绪，点开即用') : t('运行时会按需自动准备')}`;

  const apps = (state.apps || []).length;
  const dev = $('statusDevice') ? $('statusDevice').textContent.trim() : '';
  const chips = [
    { k: String(apps), v: t('已装应用') },
    { k: ready ? t('就绪') : t('待命'), v: t('安卓运行时') },
    { k: dev ? dev.replace(/^.*?(\d+)/, '$1') : '—', v: t('设备 / 端口') },
  ];
  $('welcomeStats').innerHTML = chips
    .map((c) => `<div class="welcome-stat"><b>${esc(c.k)}</b><span>${esc(c.v)}</span></div>`)
    .join('');

  const tips = [];
  $('welcomeTips').innerHTML = '';
  mask.hidden = false;
  renderWelcomeTips();
  api.setSettings({ welcome: { lastDate: today } }).catch(() => {});
}

/** 提示区单独渲染：启动 8 秒后才拿到更新信息，那时卡片可能还开着，需要补一次 */
function renderWelcomeTips() {
  const box = $('welcomeTips');
  if (!box) return;
  const apps = (state.apps || []).length;
  const tips = [];
  if (lastUpdate && lastUpdate.hasUpdate) {
    tips.push(t('发现新版本 <b>{tag}</b>，可在「设置 → 软件更新」一键更新', { tag: esc(lastUpdate.tag || '') }));
  }
  if (!apps) {
    tips.push(t('把 APK 拖进窗口就能安装，装完会自动生成桌面图标'));
  } else {
    tips.push(t('双击应用卡片即可在独立窗口中运行，右上角可旋转 / 缩放 / 关闭'));
  }
  tips.push(t('关窗口只是退出那个应用，安卓环境会留着，下次点开更快'));
  box.innerHTML = tips
    .map((tip, i) => `<div class="welcome-tip"><i>${i + 1}</i><span>${tip}</span></div>`)
    .join('');
}

/* ---------------- 环境自检 ---------------- */

let envBusy = false;

/** 拉取 doctor:selfCheck：把问题渲染到设置里的自检面板，并在状态条上留一个计数 */
async function selfCheck() {
  if (envBusy) return;
  envBusy = true;
  try {
    const r = await api.selfCheck().catch(() => null);
    if (r) renderEnvCheck(r);
  } catch (_) { /* 自检失败不阻断主流程 */ }
  finally { envBusy = false; }
}

function renderEnvCheck(r) {
  const box = $('envCheck');
  if (!box) return;
  // 「组件缺失」在同一个面板的一键完成里已经覆盖，不再重复列出
  const needDeploy = !!(state.status && state.status.needsSetup);
  const issues = (r.issues || []).filter((i) => !(needDeploy && i.fix === 'deploy'));

  // 主界面不再放横幅：只在底部状态条上留一个可点的计数，点开就是设置里的自检面板
  const chip = $('envChip');
  if (chip) {
    const errs = issues.filter((i) => i.severity === 'error').length;
    chip.hidden = issues.length === 0;
    chip.textContent = errs ? t('{n} 项待修复', { n: errs }) : t('{n} 项提示', { n: issues.length });
    chip.className = `status-chip${errs ? ' err' : ''}`;
    chip.title = issues.map((i) => i.title).join(t('；'));
  }

  if (!issues.length) {
    box.hidden = false;
    box.innerHTML = `
      <div class="env-check-ok">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
        <span>${esc(t('环境自检通过，没有发现会影响运行的问题。'))}</span>
        <span style="flex:1"></span>
        <button class="btn ghost sm" id="btnEnvRecheck">${esc(t('重新检查'))}</button>
      </div>`;
    const re = $('btnEnvRecheck');
    if (re) re.addEventListener('click', selfCheck);
    return;
  }
  const errs = issues.filter((i) => i.severity === 'error').length;
  const warns = issues.length - errs;
  box.hidden = false;
  box.innerHTML = `
    <div class="env-check-head">
      <span class="ec-title">${esc(t('环境自检'))}</span>
      ${errs ? `<span class="ec-count">${esc(t('{n} 个严重', { n: errs }))}</span>` : ''}
      ${warns ? `<span class="ec-count warn">${esc(t('{n} 个提示', { n: warns }))}</span>` : ''}
      <span class="ec-spacer"></span>
      <button class="btn ghost sm" id="btnEnvRecheck">${esc(t('重新检查'))}</button>
      <button class="btn primary sm" id="btnEnvFixAll">${esc(t('一键修复全部'))}</button>
    </div>
    <div class="env-check-list">
      ${issues.map((i) => `
        <div class="env-check-item ${i.severity}">
          <span class="ec-sev"></span>
          <div class="ec-body">
            <div class="ec-name">${esc(i.title)}</div>
            <div class="ec-hint">${esc(i.hint || '')}</div>
          </div>
          ${i.fix ? `<button class="ec-fix" data-code="${esc(i.code)}">${esc(t('修复'))}</button>` : ''}
        </div>`).join('')}
    </div>`;
  const re = $('btnEnvRecheck');
  if (re) re.addEventListener('click', selfCheck);
  const fixAll = $('btnEnvFixAll');
  if (fixAll) fixAll.addEventListener('click', () => fixAllIssues(issues));
  box.querySelectorAll('.ec-fix').forEach((b) => {
    b.addEventListener('click', () => {
      const issue = issues.find((x) => x.code === b.dataset.code);
      if (issue) fixIssue(issue);
    });
  });
}

async function fixIssue(issue) {
  switch (issue.fix) {
    case 'vcRedist': {
      const r = await api.installVcRedist().catch(() => ({ ok: false }));
      if (!r.ok && r.reason === 'no-installer') {
        api.openExternal(`https://learn.microsoft.com/${window.I18N_TAG || 'en-US'}/cpp/windows/latest-supported-vc-redist?view=msvc-170#visual-studio-2015-2017-2019-and-2022`);
        toast({ title: t('未找到内置安装包'), body: t('已打开微软官方下载页，请下载 x64 版本'), type: 'info' });
        break;
      }
      toast(r.ok
        ? { title: t('VC++ 运行库已安装'), type: 'ok' }
        : { title: t('安装未完成'), body: r.error || t('请重试'), type: 'error' });
      break;
    }
    case 'virtualization': {
      const tt = toast({ title: t('正在开启硬件加速…'), body: t('请在弹出的窗口点「是」'), sticky: true, spinner: true });
      const r = await api.enableVirtualization().catch(() => ({ ok: false }));
      if (r.ok) {
        tt.update({ title: t('硬件加速已启用'), body: r.restartNeeded ? t('请重启电脑以获得最佳性能') : (r.note || ''), type: 'ok' });
        setTimeout(tt.dismiss, 3200);
      } else {
        tt.update({ title: t('未能开启'), body: r.error || t('请重试'), type: 'error', sticky: true });
      }
      break;
    }
    case 'disk': {
      // 主进程会弹出原生确认框（含可释放空间预览），这里不再重复 confirm
      const r = await api.runtimeCleanup({ apply: true }).catch(() => null);
      if (!r) { toast({ title: t('清理失败'), body: t('请重试'), type: 'error' }); break; }
      if (r.cancelled) break;
      toast({ title: t('清理完成'), body: t('释放约 {mb} MB', { mb: ((r.saved || 0) / 1048576).toFixed(0) }), type: 'ok' });
      break;
    }
    case 'path': {
      toast({ title: t('建议改到纯英文目录'), body: t('在 设置 → 系统集成 里修改「运行时数据目录」，再重启软件。'), type: 'info', sticky: true });
      openSettings();
      break;
    }
    case 'deploy': {
      toast({ title: t('正在补齐缺失的运行时组件…'), type: 'info', sticky: true, spinner: true });
      await deployAll();
      break;
    }
    case 'lock': {
      const r = await api.clearLocks().catch(() => ({ ok: false }));
      toast(r.ok ? { title: t('已清理残留锁文件'), type: 'ok' } : { title: t('清理失败'), body: r.error, type: 'error' });
      break;
    }
    default:
      toast({ title: t('暂不支持自动修复'), body: issue.hint || '', type: 'info' });
  }
  // 修复后重新自检，刷新横幅与状态
  setTimeout(selfCheck, 600);
  setTimeout(refreshStatus, 600);
}

async function fixAllIssues(issues) {
  const fixable = issues.filter((i) => i.fix);
  for (const i of fixable) {
    // eslint-disable-next-line no-await-in-loop
    await fixIssue(i);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((res) => setTimeout(res, 500));
  }
}

init().catch((e) => {
  console.error(e);
  toast({ title: t('初始化失败'), body: e.message, type: 'error', sticky: true });
});
