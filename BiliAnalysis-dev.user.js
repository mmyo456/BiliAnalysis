// ==UserScript==
// @name         BiliAnalysis
// @namespace    https://github.com/mmyo456/BiliAnalysis
// @version      0.3.4
// @description  获取哔哩哔哩视频和直播直链的脚本。
// @icon         https://i.ouo.chat/favicon.ico
// @author       https://github.com/mmyo456/BiliAnalysis
// @match        https://www.bilibili.com/
// @include      https://www.bilibili.com/?*
// @match        https://www.bilibili.com/video*
// @match        https://www.bilibili.com/*bvid*
// @match        https://www.bilibili.com/v/popular*
// @match        https://www.bilibili.com/history*
// @match        https://t.bilibili.com/*
// @match        https://live.bilibili.com/*
// @match        https://search.bilibili.com/*
// @match        https://space.bilibili.com/*
// @match        https://music.163.com/song?id=*
// @match        https://www.douyin.com/*
// @downloadURL  https://i.ouo.chat/jsd/gh/mmyo456/BiliAnalysis@main/BiliAnalysis-dev.user.js
// @updateURL    https://i.ouo.chat/jsd/gh/mmyo456/BiliAnalysis@main/BiliAnalysis-dev.user.js
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @connect      api.github.com
// @connect      api.bilibili.com
// @connect      api.live.bilibili.com
// @connect      jx.ouo.chat
// @connect      bil.ouo.chat
// @connect      i.ouo.chat
// @supportURL   https://github.com/mmyo456/BiliAnalysis/issues
// ==/UserScript==

/* global BigInt */

(function () {
    'use strict';

    /* =========================================================================
     * 1. JS 主代码 (Main State & Initialization)
     * ========================================================================= */

    // --- 常量配置 ---
    const SCRIPT_NAME = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.name) ? GM_info.script.name : "BiliBili云端解析";
    const SCRIPT_VERSION = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) ? GM_info.script.version : "1.0.0";
    const RELEASE_API_URL = "https://api.github.com/repos/mmyo456/BiliAnalysis/releases/latest";
    const API_DOMAIN = "https://jx.ouo.chat/bl/";
    const API_DOMAIN_YA = "https://bil.ouo.chat/player/";
    const MAX_PARSE_MODES = 2;
    const DEFAULT_NOTIFY_GIF_URL = "https://i.ouo.chat/api/img/D25.gif";
    const MAX_NOTIFY_GIF_FILE_SIZE = 10 * 1024 * 1024;
    const AUTO_UPDATE_LAST_CHECK_KEY = 'autoUpdateLastCheckDate';

    const DEFAULT_SETTINGS = {
        buttonPositions: ['top-left', 'bottom-right'],
        parseModes: ['local'],
        localDomainReplaceEnabled: false,
        localDomainReplaceValue: ''
    };

    const PARSE_MODES = [
        {
            id: 'cloud-jx',
            label: '云端解析',
            buttonHtml: '云端<br>解析',
            coverLabel: '云端解析',
            supports: { video: true, live: true, music: true },
            type: 'cloud',
            domain: API_DOMAIN
        },
        {
            id: 'cloud-ya',
            label: '云端解析ya',
            buttonHtml: '云端<br>解析ya',
            coverLabel: '云端解析ya',
            supports: { video: true, live: true, music: true },
            type: 'cloud',
            domain: API_DOMAIN_YA
        },
        {
            id: 'cloud-custom',
            label: '自定义云端',
            buttonHtml: '自定义<br>解析',
            coverLabel: '自定义解析',
            supports: { video: true, live: true, music: true },
            type: 'cloud',
            domain: null
        },
        {
            id: 'local',
            label: '本地解析',
            buttonHtml: '本地<br>解析',
            coverLabel: '本地解析',
            supports: { video: true, live: true, music: false },
            type: 'local'
        }
    ];
    const PARSE_MODE_MAP = Object.fromEntries(PARSE_MODES.map(mode => [mode.id, mode]));

    // AV 转 BV 所需算法常量
    const XOR_CODE = 23442827791579n;
    const MAX_AID = 1n << 51n;
    const BASE = 58n;
    const BV_DATA = 'FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf';

    // 页面状态判断
    const currentUrl = window.location.href;
    const isVideoPage = currentUrl.includes('/video/') || currentUrl.includes('bvid=');
    // const isLivePage = currentUrl.includes('live.bilibili.com/') && /live\.bilibili\.com\/\d+/.test(currentUrl); 可以直接使用正则匹配，B站直播界面URL有变化。
    const isLivePage = /live\.bilibili\.com\/(blanc\/)?\d+/.test(currentUrl);
    const isMusicPage = currentUrl.includes('music.163.com/song');
    const isDouyinPage = /(^|\.)douyin\.com$/i.test(window.location.hostname);

    // 状态缓存
    let createdButtons = [];
    let pendingNotifyGifLocalData = null;
    let pendingNotifyGifLocalName = '';
    let pendingNotifyGifLocalCleared = false;
    let douyinRecommendGuardTimer = null;
    let douyinRecommendInsertObserver = null;
    let douyinRecommendScanPending = false;
    const douyinRecommendFeedObservers = new WeakMap();
    const douyinRecommendHostObservers = new WeakMap();
    const douyinRecommendPendingFeeds = new WeakSet();

    // --- 初始化入口 ---
    function init() {
        // 1. 注入 CSS 样式
        GM_addStyle(APP_CSS);

        // 1.1 创建解析成功提示框元素
        if (document.body) {
            ensureParseSuccessNotificationBox();
        } else {
            window.addEventListener('DOMContentLoaded', ensureParseSuccessNotificationBox, { once: true });
        }

        // 2. 注册油猴菜单
        GM_registerMenuCommand('设置', showSettingsPanel);

        // 3. 生成主解析按钮
        generateFixedButtons();

        // 4. 延迟加载封面解析按钮，避免阻碍页面主渲染
        setTimeout(() => {
            addCoverAnalysisButtons();
            addDouyinRecommendButtons();
        }, 1000);

        // 5. 挂载 DOM 变动与滚动监听（用于动态加载的封面和抖音推荐流）
        const observer = new MutationObserver(debounce((mutations = []) => {
            if (isDouyinPage) {
                processDouyinMutationNodes(mutations);
                addDouyinCoverButtons(document, true);
                ensureDouyinFixedButtons();
                return;
            }

            addCoverAnalysisButtons();
        }, 150));
        observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('scroll', debounce(() => {
            if (isDouyinPage) {
                addDouyinRecommendButtons(true);
                addDouyinCoverButtons(document, true);
            } else {
                addCoverAnalysisButtons();
            }
            ensureDouyinFixedButtons();
        }, 250));

        // 6. 监听窗口大小变化以更新自定义按钮位置
        window.addEventListener('resize', debounce(generateFixedButtons, 300));

        // 7. 监听抖音等 SPA 页面 URL 变化，弹窗 modal_id 出现后刷新普通解析按钮
        setupUrlChangeListener();
        setupDouyinRecommendButtonGuard();
        setupDouyinRecommendInsertObserver();

        // 8. 每天自动检查一次更新（静默）
        maybeAutoCheckLatestVersion();
    }

    /* =========================================================================
     * 2. JS 函数 (Functions)
     * ========================================================================= */

    /**
     * 将 B 站 AV 号转换为 BV 号
     * @param {string} av - 需要转换的 AV 号
     * @returns {string} 转换后的 BV 号
     */
    function av2bv(av) {
        const aid = av.startsWith('av') ? av.slice(2) : av;
        const bytes = ['B', 'V', '1', '0', '0', '0', '0', '0', '0', '0', '0', '0'];
        let bvIndex = bytes.length - 1;
        let tmp = (MAX_AID | BigInt(aid)) ^ XOR_CODE;
        while (tmp > 0) {
            bytes[bvIndex] = BV_DATA[Number(tmp % BigInt(BASE))];
            tmp = tmp / BASE;
            bvIndex -= 1;
        }
        [bytes[3], bytes[9]] = [bytes[9], bytes[3]];
        [bytes[4], bytes[7]] = [bytes[7], bytes[4]];
        return bytes.join('');
    }

    /**
     * 防抖函数，限制高频事件的触发频率
     * @param {Function} func - 需要防抖的函数
     * @param {number} delay - 延迟时间(ms)
     * @returns {Function} 包装后的防抖函数
     */
    function debounce(func, delay) {
        let timer = null;
        return function(...args) {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                func.apply(this, args);
                timer = null;
            }, delay);
        };
    }

    /**
     * 获取用户设置的按钮位置状态
     * @returns {Object} 包含选中位置数组及自定义 X、Y 坐标的对象
     */
    function getButtonPositionSettings() {
        return {
            positions: GM_getValue('buttonPositions', DEFAULT_SETTINGS.buttonPositions),
            customX: parseInt(GM_getValue('customPositionX', 50)),
            customY: parseInt(GM_getValue('customPositionY', 50))
        };
    }

    /**
     * 获取自定义云端解析URL
     * @returns {string}
     */
    function getCustomApiDomain() {
        const value = GM_getValue('customApiDomain', '');
        return typeof value === 'string' ? value.trim() : '';
    }

    /**
     * 判断自定义URL是否可用
     * @param {string} value
     * @returns {boolean}
     */
    function isValidCustomApiDomain(value) {
        return /^https?:\/\//i.test(value);
    }

    /**
     * 获取自定义通知 GIF URL
     * @returns {string}
     */
    function getNotifyGifCustomUrl() {
        const value = GM_getValue('notifyGifCustomUrl', DEFAULT_NOTIFY_GIF_URL);
        const normalized = typeof value === 'string' ? value.trim() : '';
        return normalized || DEFAULT_NOTIFY_GIF_URL;
    }

    /**
     * 是否启用本地通知 GIF（与自定义 URL 互斥）
     * @returns {boolean}
     */
    function getNotifyGifUseLocal() {
        return !!GM_getValue('notifyGifUseLocal', false);
    }

    /**
     * 判断通知 GIF URL 是否可用（支持远程 URL 与 dataURL）
     * @param {string} value
     * @returns {boolean}
     */
    function isValidNotifyGifUrl(value) {
        return /^https?:\/\//i.test(value) || /^data:image\/gif;base64,/i.test(value);
    }

    /**
     * 获取本地通知 GIF 的 dataURL
     * @returns {string}
     */
    function getNotifyGifLocalData() {
        const value = GM_getValue('notifyGifLocalData', '');
        return typeof value === 'string' ? value.trim() : '';
    }

    /**
     * 计算通知弹窗应使用的 GIF 源
     * 优先级：本地 GIF > 自定义 URL > 默认 GIF
     * @returns {string}
     */
    function getResolvedNotifyGifSrc() {
        if (getNotifyGifUseLocal()) {
            const localGif = getNotifyGifLocalData();
            if (isValidNotifyGifUrl(localGif)) return localGif;
        }

        const customUrl = getNotifyGifCustomUrl();
        if (isValidNotifyGifUrl(customUrl)) return customUrl;

        return DEFAULT_NOTIFY_GIF_URL;
    }

    /**
     * 更新通知弹窗 GIF 的显示状态和资源地址
     */
    function applyNotificationGifState() {
        const imgEl = document.getElementById('notificationBoxGif');
        if (!imgEl) return;

        const gifEnabled = GM_getValue('notifyGifEnabled', false);
        imgEl.style.display = gifEnabled ? 'block' : 'none';
        if (gifEnabled) imgEl.src = getResolvedNotifyGifSrc();
    }

    /**
     * 读取文件为 DataURL
     * @param {File} file
     * @returns {Promise<string>}
     */
    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
            reader.onerror = () => reject(new Error('读取文件失败'));
            reader.readAsDataURL(file);
        });
    }

    /**
     * 更新本地 GIF 文件提示文本
     * @param {string} fileName
     * @param {boolean} pending
     */
    function updateNotifyGifLocalTip(fileName, pending = false) {
        const tipEl = document.getElementById('notifyGifLocalFileTip');
        if (!tipEl) return;

        if (!fileName) {
            tipEl.textContent = '未设置本地GIF';
            return;
        }
        tipEl.textContent = pending ? `当前本地GIF：${fileName}（待保存）` : `当前本地GIF：${fileName}`;
    }

    /**
     * 获取用户选择的解析方式
     * @returns {Array<string>}
     */
    function getSelectedParseModeIds() {
        const stored = GM_getValue('parseModes', DEFAULT_SETTINGS.parseModes);
        const ids = Array.isArray(stored) ? stored : [];
        const legacyMap = { 'local-video': 'local', 'local-live': 'local' };
        const normalized = ids.map(id => legacyMap[id] || id);
        return Array.from(new Set(normalized)).filter(id => PARSE_MODE_MAP[id]);
    }

    /**
     * 根据页面类型筛选可用解析方式
     * @returns {Array<Object>}
     */
    function getActiveParseModesForPage() {
        const modes = getSelectedParseModeIds().map(id => PARSE_MODE_MAP[id]).filter(Boolean);
        return modes.filter(mode =>
            (isVideoPage && mode.supports.video) ||
            (isLivePage && mode.supports.live) ||
            (isMusicPage && mode.supports.music) ||
            (isDouyinPage && !!getCurrentDouyinVideoId() && mode.supports.video && mode.type === 'cloud')
        ).filter(mode => {
            if (mode.id !== 'cloud-custom') return true;
            const customDomain = getCustomApiDomain();
            return isValidCustomApiDomain(customDomain);
        });
    }

    /**
     * 根据目标类型筛选解析方式
     * @param {'video'|'live'|'music'} targetType
     * @returns {Array<Object>}
     */
    function getActiveParseModesForTarget(targetType) {
        const modes = getSelectedParseModeIds().map(id => PARSE_MODE_MAP[id]).filter(Boolean);
        return modes.filter(mode => mode.supports[targetType]).filter(mode => {
            if (mode.id !== 'cloud-custom') return true;
            const customDomain = getCustomApiDomain();
            return isValidCustomApiDomain(customDomain);
        });
    }

    function getActiveCloudParseModesForTarget(targetType) {
        return getActiveParseModesForTarget(targetType).filter(mode => mode.type === 'cloud');
    }

    function getDouyinVideoIdFromUrl(url) {
        try {
            const target = new URL(url, window.location.href);
            const idFromPath = target.pathname.match(/\/video\/(\d+)/)?.[1];
            if (idFromPath) return idFromPath;

            const rawId = target.searchParams.get('modal_id') || target.searchParams.get('aweme_id');
            const idFromKnownParam = String(rawId || '').match(/\d{12,}/)?.[0];
            if (idFromKnownParam) return idFromKnownParam;

            // 兼容 ? 后参数名变化的情况，只要查询字符串里带有疑似抖音作品号就提取。
            const idFromAnyQuery = target.search.match(/\d{12,}/)?.[0];
            return idFromAnyQuery || null;
        } catch (e) {
            return String(url || '').match(/\/video\/(\d{12,})/)?.[1] ||
                String(url || '').split('?')[1]?.match(/\d{12,}/)?.[0] ||
                null;
        }
    }

    function isDouyinRecommendPage(url = window.location.href) {
        try {
            const target = new URL(url, window.location.href);
            const isRecommendPath = target.pathname === '/follow' || target.pathname === '/friend';
            return isDouyinPage &&
                target.hostname === 'www.douyin.com' &&
                (isRecommendPath ||
                    (target.pathname === '/' && (target.searchParams.has('recommend') || !!document.querySelector('[data-e2e="feed-video"]'))));
        } catch (e) {
            return isDouyinPage && /douyin\.com\/(?:\?[^#]*\brecommend=|(?:follow|friend)(?:[?#/]|$))/.test(String(url || ''));
        }
    }

    function normalizeDouyinVideoUrl(url) {
        const id = getDouyinVideoIdFromUrl(url);
        return id ? `https://www.douyin.com/video/${id}` : url;
    }

    function getCurrentDouyinVideoId() {
        if (!isDouyinPage) return null;

        const idFromUrl = getDouyinVideoIdFromUrl(window.location.href);
        if (idFromUrl) return idFromUrl;

        return getVisibleDouyinVideoId();
    }

    function getVisibleDouyinVideoId() {
        const candidates = Array.from(document.querySelectorAll('[data-e2e-vid], [data-e2e-aweme-id]'));
        let best = { id: null, score: 0 };

        candidates.forEach(el => {
            const id = el.getAttribute('data-e2e-vid') || el.getAttribute('data-e2e-aweme-id');
            if (!id || !/^\d{12,}$/.test(id)) return;

            const rect = el.getBoundingClientRect();
            const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
            const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
            const visibleArea = visibleWidth * visibleHeight;
            if (visibleArea <= 0) return;

            const centerY = rect.top + rect.height / 2;
            const centerPenalty = Math.abs(centerY - window.innerHeight / 2);
            const score = visibleArea - centerPenalty;
            if (score > best.score) best = { id, score };
        });

        return best.id;
    }

    function getCurrentParseTargetUrl() {
        if (!isDouyinPage) return window.location.href;
        const id = getCurrentDouyinVideoId();
        return id ? `https://www.douyin.com/video/${id}` : normalizeDouyinVideoUrl(window.location.href);
    }

    function ensureDouyinFixedButtons() {
        if (isDouyinRecommendPage()) {
            clearExistingButtons();
            return;
        }
        if (!isDouyinPage || createdButtons.length > 0 || !getCurrentDouyinVideoId()) return;
        generateFixedButtons();
    }

    function setupUrlChangeListener() {
        let lastUrl = window.location.href;
        const refreshOnUrlChange = debounce(() => {
            if (lastUrl === window.location.href) return;
            lastUrl = window.location.href;
            generateFixedButtons();
            addCoverAnalysisButtons();
            addDouyinRecommendButtons();
        }, 100);

        ['pushState', 'replaceState'].forEach(methodName => {
            const original = history[methodName];
            history[methodName] = function(...args) {
                const result = original.apply(this, args);
                refreshOnUrlChange();
                return result;
            };
        });

        window.addEventListener('popstate', refreshOnUrlChange);
        window.addEventListener('hashchange', refreshOnUrlChange);
    }

    function setupDouyinRecommendButtonGuard() {
        if (!isDouyinPage || douyinRecommendGuardTimer) return;

        douyinRecommendGuardTimer = setInterval(() => {
            if (document.hidden || !isDouyinRecommendPage()) return;

            clearExistingButtons();
            addDouyinRecommendButtons(true);
        }, 4000);
    }

    function queueDouyinRecommendButtonScan(delay = 0) {
        if (!isDouyinPage) return;

        if (delay > 0) {
            setTimeout(() => queueDouyinRecommendButtonScan(), delay);
            return;
        }

        if (douyinRecommendScanPending) return;
        douyinRecommendScanPending = true;

        requestAnimationFrame(() => {
            douyinRecommendScanPending = false;
            if (document.hidden || !isDouyinRecommendPage()) return;

            clearExistingButtons();
            addDouyinRecommendButtons(true);
        });
    }

    function hasDouyinRecommendButtonMountChange(node) {
        if (!(node instanceof Element)) return false;

        return node.matches('[data-e2e="feed-video"], [data-e2e="video-play-more"], .bili-analysis-douyin-recommend-slot') ||
            !!node.querySelector?.('[data-e2e="feed-video"], [data-e2e="video-play-more"], .bili-analysis-douyin-recommend-slot');
    }

    function setupDouyinRecommendInsertObserver() {
        if (!isDouyinPage || douyinRecommendInsertObserver) return;

        douyinRecommendInsertObserver = new MutationObserver(mutations => {
            if (document.hidden || !isDouyinRecommendPage()) return;

            const shouldScan = mutations.some(mutation =>
                Array.from(mutation.addedNodes).some(hasDouyinRecommendButtonMountChange) ||
                Array.from(mutation.removedNodes).some(hasDouyinRecommendButtonMountChange)
            );

            if (!shouldScan) return;
            processDouyinMutationNodes(mutations);
            setTimeout(() => processDouyinMutationNodes(mutations), 200);
        });

        douyinRecommendInsertObserver.observe(document.body, { childList: true, subtree: true });
    }

    /**
     * 在页面中显示自毁式通知气泡
     * @param {string} message - 提示消息
     * @param {string} [type='success'] - 提示类型: 'success', 'info', 'warning', 'error'
     */
    function showToast(message, type = 'success') {
        const titleMap = {
            success: '成功',
            info: '提示',
            warning: '警告',
            error: '错误'
        };
        showNotificationBox(titleMap[type] || '提示', message, type, 3000);
    }

    /**
     * 复制文本到剪贴板（优先 navigator.clipboard，失败则回退 GM_setClipboard）
     * @param {string} text
     * @param {Function} onSuccess
     * @param {Function} onFailure
     * @param {Function} onFallback
     */
    function copyTextWithFallback(text, onSuccess, onFailure, onFallback) {
        const handleFailure = () => {
            if (typeof onFailure === 'function') onFailure();
        };

        const tryGMClipboard = () => {
            if (typeof GM_setClipboard !== 'function') return false;
            try {
                GM_setClipboard(text);
                if (typeof onFallback === 'function') onFallback();
                return true;
            } catch (e) {
                console.error('GM_setClipboard失败:', e);
                return false;
            }
        };

        if (navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                if (typeof onSuccess === 'function') onSuccess();
            }).catch(err => {
                console.error('复制到剪贴板失败:', err);
                if (!tryGMClipboard()) handleFailure();
            });
        } else {
            if (!tryGMClipboard()) handleFailure();
        }
    }

    let notificationBoxHideTimer = null;

    /**
     * 创建/获取提示框（来自旧版脚本的 notificationBox 方案）
     * @returns {HTMLDivElement}
     */
    function ensureParseSuccessNotificationBox() {
        const existing = document.getElementById('notificationBox');
        if (existing) return /** @type {HTMLDivElement} */ (existing);

        const notificationBox = document.createElement('div');
        notificationBox.id = 'notificationBox';
        notificationBox.innerHTML = `
            <img id="notificationBoxGif" src="${DEFAULT_NOTIFY_GIF_URL}" alt="图片" style="width: 50px; height: 50px;">
            <h3 id="notificationBoxTitle"></h3>
            <p id="notificationBoxMessage"></p>
        `;
        document.body.appendChild(notificationBox);
        applyNotificationGifState();
        return notificationBox;
    }

    /**
     * 显示提示框（复用旧版 notificationBox UI）
     * @param {string} title
     * @param {string} message
     * @param {'success'|'info'|'warning'|'error'} type
     * @param {number} durationMs
     */
    function showNotificationBox(title, message, type = 'info', durationMs = 3000) {
        const notificationBox = ensureParseSuccessNotificationBox();
        notificationBox.dataset.type = type;

        const titleEl = notificationBox.querySelector('#notificationBoxTitle');
        if (titleEl) titleEl.textContent = title;
        const messageEl = notificationBox.querySelector('#notificationBoxMessage');
        if (messageEl) messageEl.textContent = message;
        applyNotificationGifState();

        notificationBox.classList.remove('show');
        requestAnimationFrame(() => notificationBox.classList.add('show'));
        if (notificationBoxHideTimer) clearTimeout(notificationBoxHideTimer);
        notificationBoxHideTimer = setTimeout(() => {
            notificationBox.classList.remove('show');
        }, durationMs);
    }

    /**
     * 统一处理生成解析链接并复制到剪贴板的逻辑
     * @param {string} targetUrl - 目标视频/直播源链接
     */
    function handleParseAndCopy(targetUrl, modeId) {
        try {
            const mode = PARSE_MODE_MAP[modeId] || PARSE_MODE_MAP['cloud-jx'];
            if (!mode) {
                showToast('✗ 未找到解析方式', 'error');
                return;
            }

            if (mode.type === 'cloud') {
                let domain = mode.domain;
                if (mode.id === 'cloud-custom') {
                    const customDomain = getCustomApiDomain();
                    if (!isValidCustomApiDomain(customDomain)) {
                        showToast('✗ 请先设置自定义解析URL', 'warning');
                        return;
                    }
                    domain = customDomain;
                }
                const parseUrl = generateParseUrl(targetUrl, domain);
                copyTextWithFallback(
                    parseUrl,
                    () => showToast('☁️ 解析成功，链接已复制到剪贴板', 'info'),
                    () => showToast('✗ 复制失败，请手动复制', 'error'),
                    () => showToast('☁️ 解析成功，已使用兼容方式复制', 'info')
                );
                return;
            }

            if (mode.type === 'local') {
                if (targetUrl.includes('live.bilibili.com')) {
                    parseLocalLiveFromUrl(targetUrl);
                } else {
                    parseLocalVideoFromUrl(targetUrl);
                }
                return;
            }

            showToast('✗ 解析方式不支持', 'error');
        } catch (error) {
            console.error('生成解析链接失败:', error);
            showToast('✗ 生成解析链接失败', 'error');
        }
    }

    /**
     * 提取直播间号并规范直播页URL（去除追踪参数）
     * @param {string} url
     * @returns {string}
     */
    function normalizeLiveRoomUrl(url) {
        const match = String(url || '').match(/live\.bilibili\.com\/(?:blanc\/)?(\d+)/i);
        if (!match) return url;
        return `https://live.bilibili.com/${match[1]}`;
    }

    /**
     * 根据当前页面或传入的 URL 生成用于云端解析的 API 链接
     * @param {string} url - 目标页面 URL
     * @returns {string} 完整的解析 API 链接
     */
    function generateParseUrl(url, apiDomain = API_DOMAIN) {
        if (url.includes("live.bilibili.com")) {
            return buildApiUrl(apiDomain, normalizeLiveRoomUrl(url));
        }
        if (url.includes("music.163.com")) {
            return buildApiUrl(apiDomain, url);
        }
        if (url.includes("douyin.com")) {
            return buildApiUrl(apiDomain, normalizeDouyinVideoUrl(url));
        }

        if (url.includes("bilibili.com")) {
            const bvMatch = url.match(/BV[0-9a-zA-Z]+/);
            const avMatch = url.match(/av(\d+)/);
            const pMatch = url.match(/[?&]p=(\d+)/);

            let videoId = bvMatch ? bvMatch[0] : (avMatch ? av2bv(avMatch[0]) : null);

            if (videoId) {
                const pageParam = pMatch ? `p=${pMatch[1]}` : "p=1";
                if (apiDomain.includes('{url}')) {
                    return buildApiUrl(apiDomain, `${videoId}&${pageParam}`);
                }
                const joiner = apiDomain.includes('?') ? '&' : '?';
                return `${apiDomain}${joiner}url=${videoId}&${pageParam}`;
            }
        }
        return buildApiUrl(apiDomain, url);
    }

    /**
     * 构造云端解析URL（支持 {url} 占位）
     * @param {string} apiDomain
     * @param {string} rawUrl
     * @returns {string}
     */
    function buildApiUrl(apiDomain, rawUrl) {
        if (apiDomain.includes('{url}')) {
            return apiDomain.replace('{url}', rawUrl);
        }
        const joiner = apiDomain.includes('?') ? '&' : '?';
        return `${apiDomain}${joiner}url=${rawUrl}`;
    }

    /**
     * 从URL中提取BV号与分P信息
     * @param {string} url
     * @returns {{ bvid: string|null, page: number }}
     */
    function extractVideoInfo(url) {
        const bvMatch = url.match(/BV[0-9a-zA-Z]+/);
        const avMatch = url.match(/av(\d+)/);
        const pMatch = url.match(/[?&]p=(\d+)/);

        const bvid = bvMatch ? bvMatch[0] : (avMatch ? av2bv(avMatch[0]) : null);
        const page = pMatch ? Math.max(1, parseInt(pMatch[1], 10) || 1) : 1;

        return { bvid, page };
    }

    /**
     * 本地解析：根据URL发起视频解析
     * @param {string} url
     */
    function parseLocalVideoFromUrl(url) {
        const { bvid, page } = extractVideoInfo(url);
        if (!bvid) {
            showToast('✗ 未找到有效的BV号或AV号', 'error');
            return;
        }
        parseLocalVideo(bvid, page);
    }

    /**
     * 本地解析：拉取视频直链
     * @param {string} bvid
     * @param {number} page
     */
    function parseLocalVideo(bvid, page) {
        const httpRequest = new XMLHttpRequest();
        httpRequest.open('GET', `https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`, true);
        httpRequest.send();
        httpRequest.onreadystatechange = function () {
            if (httpRequest.readyState !== 4) return;
            if (httpRequest.status !== 200) {
                console.error('CID请求失败，状态码:', httpRequest.status);
                showToast(`✗ 无法获取视频信息（状态码: ${httpRequest.status}）`, 'error');
                return;
            }
            let json;
            try {
                json = JSON.parse(httpRequest.responseText);
            } catch (e) {
                console.error('解析JSON失败:', e);
                showToast('✗ 无法解析视频信息', 'error');
                return;
            }
            if (!json.data || !json.data[page - 1]) {
                showToast('✗ 无效的分P或视频数据不可用', 'error');
                return;
            }

            const cid = json.data[page - 1].cid;
            const httpRequest1 = new XMLHttpRequest();
            httpRequest1.open('GET', `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=116&type=&otype=json&platform=html5&high_quality=1`, true);
            httpRequest1.withCredentials = true;
            httpRequest1.send();
            httpRequest1.onreadystatechange = function () {
                if (httpRequest1.readyState !== 4) return;
                if (httpRequest1.status !== 200) {
                    console.error('视频链接请求失败，状态码:', httpRequest1.status);
                    showToast(`✗ 无法获取视频链接（状态码: ${httpRequest1.status}）`, 'error');
                    return;
                }
                let json1;
                try {
                    json1 = JSON.parse(httpRequest1.responseText);
                } catch (e) {
                    console.error('解析JSON失败:', e);
                    showToast('✗ 无法解析视频链接', 'error');
                    return;
                }
                if (!json1.data || !json1.data.durl || !json1.data.durl[0]) {
                    showToast('✗ 无法获取视频链接', 'error');
                    return;
                }
                let videoUrl = json1.data.durl[0].url;
                videoUrl = replaceLocalDomainIfNeeded(videoUrl);
                copyTextWithFallback(
                    videoUrl,
                    () => showToast('✓ 解析成功，链接已复制到剪贴板', 'success'),
                    () => showToast('✓ 解析成功，但剪贴板写入失败', 'warning'),
                    () => showToast('✓ 解析成功，已使用兼容方式复制', 'success')
                );
            };
        };
    }

    /**
     * 本地解析：直播间直链
     * @param {string} url
     */
    function parseLocalLiveFromUrl(url) {
        const match = url.match(/live\.bilibili\.com\/(?:blanc\/)?(\d+)/);
        if (!match) {
            showToast('✗ 未找到直播间ID', 'error');
            return;
        }
        const roomId = match[1];
        const httpRequest = new XMLHttpRequest();
        httpRequest.open('GET', `https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id=${roomId}&protocol=0,1&format=0,1,2&codec=0,1&qn=10000&platform=web&ptype=8&dolby=5&panorama=1`, true);
        httpRequest.send();
        httpRequest.onreadystatechange = function () {
            if (httpRequest.readyState !== 4) return;
            if (httpRequest.status !== 200) {
                console.error('直播解析请求失败，状态码:', httpRequest.status);
                showToast(`✗ 无法获取直播信息（状态码: ${httpRequest.status}）`, 'error');
                return;
            }
            let json;
            try {
                json = JSON.parse(httpRequest.responseText);
            } catch (e) {
                console.error('解析JSON失败:', e);
                showToast('✗ 无法解析直播信息', 'error');
                return;
            }
            const streams = json?.data?.playurl_info?.playurl?.stream || [];
            let roomUrl = null;
            for (const streamIndex of [1, 0]) {
                const stream = streams[streamIndex];
                if (!stream || !stream.format) continue;
                for (const formatIndex of [1, 0]) {
                    const format = stream.format[formatIndex];
                    const codec = format?.codec?.[0];
                    const info = codec?.url_info?.[0];
                    if (codec && info) {
                        roomUrl = info.host + codec.base_url + info.extra;
                        break;
                    }
                }
                if (roomUrl) break;
            }
            if (!roomUrl) {
                showToast('✗ 无法获取直播链接', 'error');
                return;
            }
            copyTextWithFallback(
                roomUrl,
                () => showToast('✓ 解析成功，链接已复制到剪贴板', 'success'),
                () => showToast('✓ 解析成功，但剪贴板写入失败', 'warning'),
                () => showToast('✓ 解析成功，已使用兼容方式复制', 'success')
            );
        };
    }

    /**
     * 根据设置替换本地解析输出的域名
     * @param {string} url - 原始URL
     * @returns {string} 替换后的URL
     */
    function replaceLocalDomainIfNeeded(url) {
        const enabled = GM_getValue('localDomainReplaceEnabled', false);
        if (!enabled) return url;

        let customDomain = (GM_getValue('localDomainReplaceValue', '') || '').trim();
        if (!customDomain) return url;

        // 自动补充协议前缀
        if (!/^https?:\/\//i.test(customDomain)) {
            customDomain = 'https://' + customDomain;
        }

        try {
            const urlObj = new URL(url);
            const customUrlObj = new URL(customDomain);
            // 替换协议和主机名
            urlObj.protocol = customUrlObj.protocol;
            urlObj.host = customUrlObj.host;
            return urlObj.toString();
        } catch (e) {
            console.error('域名替换失败:', e);
            return url;
        }
    }

    /**
     * 初始化/重置固定解析按钮
     */
    function generateFixedButtons() {
        // 先清理可能存在的旧按钮
        createdButtons.forEach(btn => btn.parentNode?.removeChild(btn));
        createdButtons = [];

        // 若不是可用页面，不渲染悬浮按钮
        if (!isVideoPage && !isLivePage && !isMusicPage && !(isDouyinPage && !isDouyinRecommendPage() && !!getCurrentDouyinVideoId())) return;

        const { positions, customX, customY } = getButtonPositionSettings();
        const activeModes = getActiveParseModesForPage();
        if (activeModes.length === 0) return;

        // 遍历设置中的位置并生成按钮
        positions.forEach((position, index) => {
            activeModes.forEach((mode, modeIndex) => {
                const button = document.createElement('button');
                button.className = 'fixed-analysis-btn';
                button.id = `BiliAnalysis_${index}_${mode.id}`;
                button.innerHTML = mode.buttonHtml;
                button.dataset.positionType = position;
                button.dataset.stackIndex = String(modeIndex);
                button.dataset.mode = mode.id;

                // 根据类型绑定样式
                if (position === 'custom') {
                    button.style.left = `calc(${customX} / 100 * (100vw - 45px))`;
                    button.style.top = `calc(${customY} / 100 * (100vh - 45px) + ${modeIndex * 52}px)`;
                    button.style.transform = 'none';
                } else {
                    const styles = {
                        'top-left': { top: '150px', left: '0px' },
                        'top-right': { top: '150px', right: '0px' },
                        'bottom-left': { bottom: '20px', left: '0px' },
                        'bottom-right': { bottom: '20px', right: '0px' }
                    };
                    Object.assign(button.style, styles[position] || styles['top-left']);
                    if (button.style.top) {
                        const baseTop = parseInt(button.style.top, 10) || 0;
                        button.style.top = `${baseTop + (modeIndex * 52)}px`;
                    }
                    if (button.style.bottom) {
                        const baseBottom = parseInt(button.style.bottom, 10) || 0;
                        button.style.bottom = `${baseBottom + (modeIndex * 52)}px`;
                    }
                }

                button.addEventListener('click', () => handleParseAndCopy(getCurrentParseTargetUrl(), mode.id));

                document.body.appendChild(button);
                createdButtons.push(button);
            });
        });
    }

    /**
     * 显示设置面板，如果未创建则先创建
     */
    function showSettingsPanel() {
        let panel = document.getElementById('biliAnalysisSettingsPanel');
        if (!panel) {
            // 注入模板 HTML
            document.body.insertAdjacentHTML('beforeend', SETTINGS_HTML);
            bindSettingsEvents();
            panel = document.getElementById('biliAnalysisSettingsPanel');
        }

        loadSettingsToPanel();
        if (!panel.querySelector('.nav-item.active')) {
            setActiveSettingsSection('section-home');
        }
        panel.classList.add('show');
        document.getElementById('biliAnalysisSettingsOverlay').classList.add('show');
    }

    /**
     * 隐藏设置面板
     */
    function hideSettingsPanel() {
        document.getElementById('biliAnalysisSettingsPanel')?.classList.remove('show');
        document.getElementById('biliAnalysisSettingsOverlay')?.classList.remove('show');
    }

    /**
     * 加载保存的设置参数到面板的交互元素中
     */
    function loadSettingsToPanel() {
        const { positions, customX, customY } = getButtonPositionSettings();
        const parseModes = getSelectedParseModeIds();
        const notifyGifEnabled = GM_getValue('notifyGifEnabled', false);
        const notifyGifCustomUrl = getNotifyGifCustomUrl();
        const notifyGifUseLocal = getNotifyGifUseLocal();
        const notifyGifLocalName = GM_getValue('notifyGifLocalName', '');
        const customApiDomain = getCustomApiDomain();
        const localDomainReplaceEnabled = GM_getValue('localDomainReplaceEnabled', false);
        const localDomainReplaceValue = GM_getValue('localDomainReplaceValue', '');

        // 重置位置复选框
        document.querySelectorAll('#biliAnalysisSettingsPanel .checkbox-item input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
        });

        // 重置解析方式选择
        document.querySelectorAll('#biliAnalysisSettingsPanel .mode-card input[type="checkbox"]').forEach(cb => {
            cb.checked = parseModes.includes(cb.value);
            syncModeCardState(cb);
        });

        const gifToggle = document.getElementById('toggleNotifyGif');
        if (gifToggle) gifToggle.checked = !!notifyGifEnabled;
        const gifUseLocalToggle = document.getElementById('toggleNotifyGifUseLocal');
        if (gifUseLocalToggle) gifUseLocalToggle.checked = !!notifyGifUseLocal;
        const notifyGifCustomInput = document.getElementById('notifyGifCustomUrl');
        if (notifyGifCustomInput) notifyGifCustomInput.value = notifyGifCustomUrl;
        const notifyGifLocalInput = document.getElementById('notifyGifLocalFile');
        if (notifyGifLocalInput) notifyGifLocalInput.value = '';
        pendingNotifyGifLocalData = null;
        pendingNotifyGifLocalName = '';
        pendingNotifyGifLocalCleared = false;
        updateNotifyGifLocalTip(typeof notifyGifLocalName === 'string' ? notifyGifLocalName : '', false);
        updateNotifyGifSourceVisibility();
        const customApiInput = document.getElementById('customApiDomain');
        if (customApiInput) customApiInput.value = customApiDomain;
        updateCustomApiVisibility();

        const localDomainToggle = document.getElementById('toggleLocalDomainReplace');
        if (localDomainToggle) localDomainToggle.checked = !!localDomainReplaceEnabled;
        const localDomainInput = document.getElementById('localDomainReplaceValue');
        if (localDomainInput) localDomainInput.value = localDomainReplaceValue;
        updateLocalDomainVisibility();

        const nameEl = document.getElementById('scriptNameValue');
        if (nameEl) nameEl.textContent = SCRIPT_NAME;
        const currentEl = document.getElementById('currentVersionValue');
        if (currentEl) currentEl.textContent = SCRIPT_VERSION;
        const latestEl = document.getElementById('latestVersionValue');
        if (latestEl) latestEl.textContent = GM_getValue('latestVersion', '未检查');
        const statusEl = document.getElementById('updateStatus');
        if (statusEl) statusEl.textContent = '';

        // 勾选用户已保存的位置
        positions.forEach(pos => {
            const checkbox = document.getElementById(`pos-${pos}`);
            if (checkbox) checkbox.checked = true;
        });

        // 恢复自定义滑块/输入框的值
        ['X', 'Y'].forEach(axis => {
            const value = axis === 'X' ? customX : customY;
            document.getElementById(`slider${axis}`).value = value;
            document.getElementById(`slider${axis}Value`).value = value;
        });

        updateCustomPositionVisibility();
    }

    /**
     * 获取面板内已选择的解析方式
     * @returns {Array<string>}
     */
    function getSelectedParseModeIdsFromPanel() {
        return Array.from(document.querySelectorAll('#biliAnalysisSettingsPanel .mode-card input[type="checkbox"]:checked'))
            .map(cb => cb.value);
    }

    /**
     * 切换解析方式卡片选中态
     * @param {HTMLInputElement} checkbox
     */
    function syncModeCardState(checkbox) {
        const card = checkbox.closest('.mode-card');
        if (card) card.classList.toggle('checked', checkbox.checked);
    }

    /**
     * 切换自定义URL配置显示
     */
    function updateCustomApiVisibility() {
        const row = document.getElementById('customApiRow');
        const customChecked = document.getElementById('mode-cloud-custom')?.checked;
        if (row) row.style.display = customChecked ? 'flex' : 'none';
    }

    /**
     * 切换本地解析域名替换配置显示
     */
    function updateLocalDomainVisibility() {
        const row = document.getElementById('localDomainRow');
        const localChecked = document.getElementById('mode-local')?.checked;
        if (row) row.style.display = localChecked ? 'flex' : 'none';

        const inputRow = document.getElementById('localDomainInputRow');
        const toggleChecked = document.getElementById('toggleLocalDomainReplace')?.checked;
        if (inputRow) inputRow.style.display = toggleChecked ? 'flex' : 'none';
    }

    /**
     * 切换通知 GIF 来源显示（URL 与本地互斥）
     */
    function updateNotifyGifSourceVisibility() {
        const useLocal = !!document.getElementById('toggleNotifyGifUseLocal')?.checked;
        const localRow = document.getElementById('notifyGifLocalRow');
        const customInput = document.getElementById('notifyGifCustomUrl');

        if (useLocal && customInput) customInput.value = DEFAULT_NOTIFY_GIF_URL;
        if (localRow) localRow.style.display = useLocal ? 'flex' : 'none';
        if (customInput) customInput.disabled = useLocal;
    }

    /**
     * 切换自定义坐标设置容器的可见性
     */
    function updateCustomPositionVisibility() {
        const customGroup = document.getElementById('customPositionGroup');
        const isCustomChecked = document.getElementById('pos-custom').checked;
        customGroup.classList.toggle('show', isCustomChecked);
    }

    /**
     * 保存面板设置并重新渲染按钮
     */
    function saveSettings() {
        const positions = Array.from(document.querySelectorAll('#biliAnalysisSettingsPanel .checkbox-item input[type="checkbox"]:checked'))
            .map(cb => cb.value);
        const parseModes = getSelectedParseModeIdsFromPanel();
        const customApiDomain = (document.getElementById('customApiDomain')?.value || '').trim();
        const notifyGifEnabled = !!document.getElementById('toggleNotifyGif')?.checked;
        const notifyGifCustomUrl = (document.getElementById('notifyGifCustomUrl')?.value || '').trim() || DEFAULT_NOTIFY_GIF_URL;
        const notifyGifUseLocal = !!document.getElementById('toggleNotifyGifUseLocal')?.checked;
        const localDomainReplaceEnabled = !!document.getElementById('toggleLocalDomainReplace')?.checked;
        const localDomainReplaceValue = (document.getElementById('localDomainReplaceValue')?.value || '').trim();

        if (parseModes.length === 0) {
            showToast('✗ 请至少选择一种解析方式', 'warning');
            return;
        }
        if (parseModes.length > MAX_PARSE_MODES) {
            showToast('✗ 最多选择两种解析方式', 'warning');
            return;
        }
        if (parseModes.includes('cloud-custom') && !isValidCustomApiDomain(customApiDomain)) {
            showToast('✗ 自定义解析URL无效', 'warning');
            return;
        }

        if (notifyGifCustomUrl && !isValidNotifyGifUrl(notifyGifCustomUrl)) {
            showToast('❌ 自定义GIF地址无效', 'warning');
            return;
        }
        if (notifyGifUseLocal && notifyGifCustomUrl !== DEFAULT_NOTIFY_GIF_URL) {
            showToast('❌ 本地GIF与自定义URL不能共存，请先恢复默认URL', 'warning');
            return;
        }
        if (notifyGifUseLocal && !pendingNotifyGifLocalData && !getNotifyGifLocalData()) {
            showToast('❌ 已开启本地GIF，但尚未选择本地文件', 'warning');
            return;
        }

        let customX = 50, customY = 50;

        if (positions.includes('custom')) {
            const valX = parseInt(document.getElementById('sliderXValue').value);
            const valY = parseInt(document.getElementById('sliderYValue').value);
            customX = isNaN(valX) ? 50 : Math.max(0, Math.min(100, valX));
            customY = isNaN(valY) ? 50 : Math.max(0, Math.min(100, valY));
        }

        GM_setValue('buttonPositions', positions);
        GM_setValue('customPositionX', customX);
        GM_setValue('customPositionY', customY);
        GM_setValue('parseModes', parseModes);
        GM_setValue('customApiDomain', customApiDomain);
        GM_setValue('notifyGifEnabled', notifyGifEnabled);
        GM_setValue('notifyGifCustomUrl', notifyGifCustomUrl);
        GM_setValue('notifyGifUseLocal', notifyGifUseLocal);
        if (!notifyGifUseLocal && notifyGifCustomUrl !== DEFAULT_NOTIFY_GIF_URL) {
            GM_setValue('notifyGifLocalData', '');
            GM_setValue('notifyGifLocalName', '');
        } else if (pendingNotifyGifLocalCleared) {
            GM_setValue('notifyGifLocalData', '');
            GM_setValue('notifyGifLocalName', '');
        } else if (pendingNotifyGifLocalData !== null) {
            GM_setValue('notifyGifLocalData', pendingNotifyGifLocalData);
            GM_setValue('notifyGifLocalName', pendingNotifyGifLocalName);
        }
        GM_setValue('localDomainReplaceEnabled', localDomainReplaceEnabled);
        GM_setValue('localDomainReplaceValue', localDomainReplaceValue);
        applyNotificationGifState();

        generateFixedButtons();
        clearCoverAnalysisButtons();
        addCoverAnalysisButtons();
        hideSettingsPanel();
        showToast('✓ 设置已保存，按钮位置已更新', 'success');
    }

    /**
     * 实时更新自定义位置的按钮位置 (拖动滑块时)
     */
    function updateRealtimeButtons() {
        const x = parseInt(document.getElementById('sliderX').value) || 50;
        const y = parseInt(document.getElementById('sliderY').value) || 50;

        document.getElementById('sliderXValue').value = x;
        document.getElementById('sliderYValue').value = y;

        createdButtons.filter(btn => btn.dataset.positionType === 'custom').forEach(button => {
            const offsetIndex = parseInt(button.dataset.stackIndex || '0', 10);
            button.style.left = `calc(${x} / 100 * (100vw - 45px))`;
            button.style.top = `calc(${y} / 100 * (100vh - 45px) + ${offsetIndex * 52}px)`;
        });
    }

    /**
     * 绑定滑块与输入框的联动事件，实现复用抽象
     * @param {string} axis - 坐标轴 'X' 或 'Y'
     */
    function bindSliderEvents(axis) {
        const slider = document.getElementById(`slider${axis}`);
        const input = document.getElementById(`slider${axis}Value`);
        if (!slider || !input) return;

        const syncValues = (val) => {
            let num = parseInt(val);
            if (isNaN(num)) return; // 等待失焦再处理空值
            num = Math.max(0, Math.min(100, num));
            slider.value = num;
            input.value = num;
            updateRealtimeButtons();
        };

        slider.addEventListener('input', e => syncValues(e.target.value));
        input.addEventListener('input', e => syncValues(e.target.value));
        input.addEventListener('blur', e => {
            if (e.target.value === '' || isNaN(parseInt(e.target.value))) syncValues(50);
        });
    }

    /**
     * 处理本地 GIF 文件选择
     * @param {Event} event
     */
    async function handleNotifyGifLocalFileChange(event) {
        const inputEl = /** @type {HTMLInputElement} */ (event.target);
        const file = inputEl?.files?.[0];
        if (!file) return;

        const isGifType = file.type === 'image/gif' || /\.gif$/i.test(file.name);
        if (!isGifType) {
            showToast('❌ 仅支持 GIF 文件', 'warning');
            inputEl.value = '';
            return;
        }
        if (file.size > MAX_NOTIFY_GIF_FILE_SIZE) {
            showToast('❌ 本地GIF过大，请控制在10MB以内', 'warning');
            inputEl.value = '';
            return;
        }

        try {
            const dataUrl = await readFileAsDataUrl(file);
            if (!isValidNotifyGifUrl(dataUrl)) {
                showToast('❌ 本地GIF读取失败', 'error');
                inputEl.value = '';
                return;
            }
            pendingNotifyGifLocalData = dataUrl;
            pendingNotifyGifLocalName = file.name;
            pendingNotifyGifLocalCleared = false;
            updateNotifyGifLocalTip(file.name, true);
            showToast('✅ 本地GIF已加载，点击保存后生效', 'info');
        } catch (error) {
            console.error('读取本地GIF失败:', error);
            showToast('❌ 读取本地GIF失败', 'error');
            inputEl.value = '';
        }
    }

    /**
     * 清除本地 GIF 配置（待保存）
     */
    function clearNotifyGifLocalSelection() {
        pendingNotifyGifLocalData = null;
        pendingNotifyGifLocalName = '';
        pendingNotifyGifLocalCleared = true;
        const notifyGifLocalInput = document.getElementById('notifyGifLocalFile');
        if (notifyGifLocalInput) notifyGifLocalInput.value = '';
        updateNotifyGifLocalTip('', true);
        showToast('✅ 已清除本地GIF，点击保存后生效', 'info');
    }

    /**
     * 统一绑定设置面板的所有交互事件
     */
    function bindSettingsEvents() {
        document.getElementById('settingsCloseBtn').addEventListener('click', hideSettingsPanel);
        document.getElementById('biliAnalysisSettingsOverlay').addEventListener('click', hideSettingsPanel);

        document.getElementById('settingsCancelBtn').addEventListener('click', () => {
            hideSettingsPanel();
            loadSettingsToPanel();
        });

        document.getElementById('settingsSaveBtn').addEventListener('click', saveSettings);

        // 阻止点击面板内部时冒泡关闭
        document.getElementById('biliAnalysisSettingsPanel').addEventListener('click', e => e.stopPropagation());

        // 左侧功能导航切换
        document.querySelectorAll('#biliAnalysisSettingsPanel .nav-item').forEach(btn => {
            btn.addEventListener('click', () => {
                setActiveSettingsSection(btn.dataset.target);
            });
        });

        const checkBtn = document.getElementById('checkUpdateBtn');
        if (checkBtn) checkBtn.addEventListener('click', checkLatestVersion);

        // 监听位置复选框变化
        document.querySelectorAll('#biliAnalysisSettingsPanel .checkbox-item input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                updateCustomPositionVisibility();
                if (cb.value === 'custom' && cb.checked) updateRealtimeButtons();
            });
        });

        // 监听解析方式选择
        document.querySelectorAll('#biliAnalysisSettingsPanel .mode-card input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                const selected = getSelectedParseModeIdsFromPanel();
                if (selected.length > MAX_PARSE_MODES) {
                    cb.checked = false;
                    showToast('✗ 最多选择两种解析方式', 'warning');
                }
                syncModeCardState(cb);
                updateCustomApiVisibility();
                updateLocalDomainVisibility();
            });
        });

        // 监听本地解析域名替换开关
        const localDomainToggle = document.getElementById('toggleLocalDomainReplace');
        if (localDomainToggle) {
            localDomainToggle.addEventListener('change', updateLocalDomainVisibility);
        }

        const notifyGifLocalInput = document.getElementById('notifyGifLocalFile');
        if (notifyGifLocalInput) {
            notifyGifLocalInput.addEventListener('change', handleNotifyGifLocalFileChange);
        }
        const clearNotifyGifLocalBtn = document.getElementById('clearNotifyGifLocalBtn');
        if (clearNotifyGifLocalBtn) {
            clearNotifyGifLocalBtn.addEventListener('click', clearNotifyGifLocalSelection);
        }
        const notifyGifUseLocalToggle = document.getElementById('toggleNotifyGifUseLocal');
        if (notifyGifUseLocalToggle) {
            notifyGifUseLocalToggle.addEventListener('change', updateNotifyGifSourceVisibility);
        }
        const notifyGifCustomInput = document.getElementById('notifyGifCustomUrl');
        if (notifyGifCustomInput) {
            notifyGifCustomInput.addEventListener('input', () => {
                const normalized = (notifyGifCustomInput.value || '').trim() || DEFAULT_NOTIFY_GIF_URL;
                const useLocalToggle = document.getElementById('toggleNotifyGifUseLocal');
                if (normalized !== DEFAULT_NOTIFY_GIF_URL && useLocalToggle?.checked) {
                    useLocalToggle.checked = false;
                    updateNotifyGifSourceVisibility();
                    showToast('ℹ️ 已切换为URL优先，本地GIF已关闭', 'info');
                }
            });
        }

        // 绑定滑块与输入框联动
        bindSliderEvents('X');
        bindSliderEvents('Y');
    }

    /**
     * 切换设置面板的功能区域
     * @param {string} sectionId
     */
    function setActiveSettingsSection(sectionId) {
        if (!sectionId) return;
        document.querySelectorAll('#biliAnalysisSettingsPanel .nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.target === sectionId);
        });
        document.querySelectorAll('#biliAnalysisSettingsPanel .settings-section').forEach(section => {
            section.classList.toggle('is-active', section.id === sectionId);
        });
    }

    /**
     * 比较版本号（简单语义化比较）
     * @param {string} a
     * @param {string} b
     * @returns {number}
     */
    function compareVersions(a, b) {
        const normalize = (v) => v.replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
        const aa = normalize(a || '0');
        const bb = normalize(b || '0');
        const len = Math.max(aa.length, bb.length);
        for (let i = 0; i < len; i += 1) {
            const diff = (aa[i] || 0) - (bb[i] || 0);
            if (diff !== 0) return diff;
        }
        return 0;
    }

    /**
     * 获取本地日期键（YYYY-MM-DD）
     * @returns {string}
     */
    function getLocalDateKey() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * 每天自动检查一次更新（静默）
     */
    function maybeAutoCheckLatestVersion() {
        const todayKey = getLocalDateKey();
        const lastChecked = GM_getValue(AUTO_UPDATE_LAST_CHECK_KEY, '');
        if (lastChecked === todayKey) return;
        checkLatestVersion({
            silent: true,
            onSuccess: () => GM_setValue(AUTO_UPDATE_LAST_CHECK_KEY, todayKey)
        });
    }

    /**
     * 检查最新版本
     */
    function checkLatestVersion(options = {}) {
        const silent = !!options.silent;
        const onSuccess = typeof options.onSuccess === 'function' ? options.onSuccess : null;
        const latestEl = document.getElementById('latestVersionValue');
        const statusEl = document.getElementById('updateStatus');
        if (statusEl && !silent) statusEl.textContent = '检查中...';
        if (typeof GM_xmlhttpRequest !== 'function') {
            if (statusEl && !silent) statusEl.textContent = '无法检查（未授权）';
            return;
        }

        GM_xmlhttpRequest({
            method: 'GET',
            url: RELEASE_API_URL,
            onload: function (response) {
                let latest = '';
                try {
                    const data = JSON.parse(response.responseText || '{}');
                    latest = (data.tag_name || data.name || '').trim();
                } catch (e) {
                    console.error('解析版本信息失败:', e);
                }

                if (latest) {
                    latest = latest.replace(/^v/i, '');
                    if (latestEl) latestEl.textContent = latest;
                    GM_setValue('latestVersion', latest);
                    if (onSuccess) onSuccess(latest);
                    const cmp = compareVersions(SCRIPT_VERSION, latest);
                    if (statusEl && !silent) {
                        if (cmp >= 0) {
                            statusEl.textContent = '已是最新';
                        } else {
                            statusEl.textContent = '有新版本';
                        }
                    }
                } else {
                    if (statusEl && !silent) statusEl.textContent = '未找到版本号';
                }
            },
            onerror: function () {
                if (statusEl && !silent) statusEl.textContent = '检查失败';
            }
        });
    }

    /**
     * 清理已注入的封面解析按钮
     */
    function clearCoverAnalysisButtons() {
        document.querySelectorAll('button[data-bili-analysis-mode]').forEach(btn => btn.remove());
        document.querySelectorAll('.bili-analysis-douyin-slot').forEach(slot => slot.remove());
    }

    function isNearViewport(element, margin = 800) {
        if (!(element instanceof Element)) return false;

        const rect = element.getBoundingClientRect();
        return rect.bottom >= -margin &&
            rect.top <= window.innerHeight + margin &&
            rect.right >= -margin &&
            rect.left <= window.innerWidth + margin;
    }

    function collectElements(root, selectors, visibleOnly = false) {
        const elements = new Set();
        const scope = root && typeof root.querySelectorAll === 'function' ? root : document;

        selectors.forEach(selector => {
            if (root instanceof Element && root.matches(selector)) {
                elements.add(root);
            }
            scope.querySelectorAll(selector).forEach(element => elements.add(element));
        });

        return Array.from(elements).filter(element => !visibleOnly || isNearViewport(element));
    }

    function getDouyinCoverSelectors() {
        return [
            '.discover-video-card-item[data-aweme-id]',
            '[data-aweme-id][class*="video-card"]',
            '[data-aweme-id][class*="VideoCard"]',
            'li:has(a[href*="/video/"])',
            'a[href*="/video/"]',
            'img.discover-video-card-img',
            '.discover-video-card-img'
        ];
    }

    function addDouyinCoverButtons(root = document, visibleOnly = false) {
        if (!isDouyinPage || getActiveCloudParseModesForTarget('video').length === 0) return;

        collectElements(root, getDouyinCoverSelectors(), visibleOnly).forEach(element => {
            processDouyinCover(element);
        });
    }

    function hasDouyinMutationCandidate(node) {
        if (!(node instanceof Element)) return false;

        const selectors = [
            ...getDouyinCoverSelectors(),
            '[data-e2e="feed-video"]',
            '[data-e2e="video-play-more"]'
        ];

        return selectors.some(selector => node.matches(selector) || !!node.querySelector?.(selector));
    }

    function processDouyinMutationNodes(mutations) {
        if (!isDouyinPage || !Array.isArray(mutations)) return;

        mutations.forEach(mutation => {
            const removedDouyinCoverButton = Array.from(mutation.removedNodes).some(node =>
                node instanceof Element &&
                (node.matches('.bili-analysis-douyin-slot, .bili-analysis-douyin-slot .video-cover-analysis-btn') ||
                    !!node.querySelector?.('.bili-analysis-douyin-slot, .bili-analysis-douyin-slot .video-cover-analysis-btn'))
            );

            if (removedDouyinCoverButton) {
                addDouyinCoverButtons(document, true);
            }

            mutation.addedNodes.forEach(node => {
                if (!(node instanceof Element) || !hasDouyinMutationCandidate(node)) return;

                addDouyinCoverButtons(node, true);
                addDouyinRecommendButtons(true, node);
            });
        });
    }

    /**
     * 判断是否为关注/焦点卡片（不执行解析）
     * @param {Element|null} element
     * @returns {boolean}
     */
    function isFocusCardElement(element) {
        if (!element || !element.closest) return false;
        return !!element.closest('.focus-item, .focus-image-ctnr, .focus-name-fanse');
    }

    /**
     * 判断是否为头像/关注类小图
     * @param {HTMLImageElement|null} imgEl
     * @returns {boolean}
     */
    function isSmallAvatarImage(imgEl) {
        if (!imgEl) return true;
        if (imgEl.classList && imgEl.classList.contains('focus-image')) return true;
        const cls = (imgEl.className || '').toString();
        if (/avatar|face/i.test(cls)) return true;
        const src = imgEl.currentSrc || imgEl.getAttribute('src') || '';
        if (/\/bfs\/face\//.test(src)) return true;
        const w = imgEl.naturalWidth || imgEl.width || 0;
        const h = imgEl.naturalHeight || imgEl.height || 0;
        if (w && h && w <= 120 && h <= 120) return true;
        return false;
    }

    /**
     * 为视频和直播封面提取对应ID并创建解析按钮
     * @param {Element} element - 触发元素
     * @param {string} type - 'video' 或是 'live'
     */
    function processCover(element, type) {
        if (isFocusCardElement(element)) return;
        if (type === 'video' && element.matches?.('a.bili-dyn-card-video')) return;
        const link = element.href || element.querySelector('a')?.href || element.closest('a[href]')?.href;
        const imgEl = element.querySelector('img');
        if (!link || !imgEl) return; // 确认具有有效链接和图片
        if (isSmallAvatarImage(imgEl)) return;

        let id = null;
        let isLive = type === 'live';

        if (isLive) {
            const match = link.match(/live\.bilibili\.com\/(?:blanc\/)?(\d+)/);
            id = match ? match[1] : null;
        } else {
            const match = link.match(/\/(?:video|bvid=)\/?(BV[a-zA-Z0-9]+)/);
            id = match ? match[1] : null;
        }

        if (!id) return;

        const activeModes = getActiveParseModesForTarget(isLive ? 'live' : 'video');
        if (activeModes.length === 0) return;

        // 确保父容器具备定位上下文
        if (window.getComputedStyle(element).position === 'static') {
            element.style.position = 'relative';
        }

        let buttonCount = element.querySelectorAll('.video-cover-analysis-btn, .live-cover-analysis-btn').length;

        activeModes.forEach(mode => {
            if (element.querySelector(`button[data-bili-analysis-mode="${mode.id}"]`)) return;

            const btn = document.createElement('button');
            btn.className = isLive ? 'live-cover-analysis-btn' : 'video-cover-analysis-btn';
            btn.textContent = mode.coverLabel;
            btn.dataset.biliAnalysisMode = mode.id;
            btn.style.bottom = `${5 + (buttonCount * 35)}px`;
            buttonCount += 1;

            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                const url = isLive ? `https://live.bilibili.com/${id}` : `https://www.bilibili.com/video/${id}`;
                handleParseAndCopy(url, mode.id);
            });

            element.appendChild(btn);
        });
    }

    /**
     * 从抖音卡片或封面元素中提取作品 ID。
     * 优先读取外层卡片的 data-aweme-id，缺失时再从 /video/{id} 链接兜底。
     */
    function getDouyinAwemeId(element) {
        const card = getDouyinCoverCard(element);
        const idFromData = card?.getAttribute?.('data-aweme-id') || element.getAttribute?.('data-aweme-id');
        if (idFromData && /^\d+$/.test(idFromData)) return idFromData;

        const linkEl = card?.matches?.('[href*="/video/"]') ? card : card?.querySelector?.('[href*="/video/"]');
        const href = linkEl?.href || linkEl?.getAttribute?.('href') || '';
        const match = href.match(/\/video\/(\d+)/);
        return match ? match[1] : null;
    }

    function getDouyinCoverCard(element) {
        if (!(element instanceof Element)) return null;

        const dataCard = element.closest?.('[data-aweme-id]');
        if (dataCard) return dataCard;

        const link = element.matches?.('a[href*="/video/"]') ? element : element.closest?.('a[href*="/video/"]') || element.querySelector?.('a[href*="/video/"]');
        if (!link) return element;

        return link.closest?.('li') ||
            link.closest?.('[class*="video-card"], [class*="VideoCard"]') ||
            link.parentElement ||
            link;
    }

    /**
     * 处理抖音封面解析按钮。
     * 按钮样式沿用 B 站封面按钮，外层定位槽仅负责抖音卡片上的显示和排布。
     */
    function processDouyinCover(element) {
        const id = getDouyinAwemeId(element);
        if (!id) return;

        // 即使扫描命中的是 img，也统一把按钮挂到最近的作品卡片上，避免插入到图片节点内部。
        const card = getDouyinCoverCard(element);
        if (!card) return;
        const imgEl = element.matches?.('img') ? element : (card.querySelector?.('img.discover-video-card-img, img') || element.querySelector?.('img.discover-video-card-img, img'));
        if (!imgEl) return;

        const activeModes = getActiveCloudParseModesForTarget('video');
        if (activeModes.length === 0) return;

        if (window.getComputedStyle(card).position === 'static') {
            card.style.position = 'relative';
        }
        card.classList.add('bili-analysis-douyin-card');

        const activeModeIdList = activeModes.map(mode => mode.id);
        const activeModeIds = new Set(activeModeIdList);
        card.querySelectorAll('.bili-analysis-douyin-slot').forEach(slot => {
            if (!activeModeIds.has(slot.dataset.biliAnalysisMode)) slot.remove();
        });

        activeModes.forEach(mode => {
            let slot = card.querySelector(`.bili-analysis-douyin-slot[data-bili-analysis-mode="${mode.id}"]`);

            if (!slot) {
                // 定位槽负责抖音卡片上的悬停显示和排布，避免直接复用页面里其它插件的命名。
                slot = document.createElement('div');
                slot.className = 'bili-analysis-douyin-slot';
                card.appendChild(slot);
            }

            let btn = slot.querySelector('.video-cover-analysis-btn');
            if (!btn) {
                btn = document.createElement('button');
                btn.className = 'video-cover-analysis-btn';
                btn.style.right = '0';
                btn.style.bottom = 'auto';

                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const currentId = slot.dataset.biliAnalysisVideoId;
                    const currentModeId = slot.dataset.biliAnalysisMode;
                    if (currentId && currentModeId) {
                        handleParseAndCopy(`https://www.douyin.com/video/${currentId}`, currentModeId);
                    }
                });

                slot.appendChild(btn);
            }

            const buttonIndex = activeModeIdList.indexOf(mode.id);
            slot.dataset.biliAnalysisDouyinId = `${mode.id}-${id}`;
            slot.dataset.biliAnalysisVideoId = id;
            slot.dataset.biliAnalysisMode = mode.id;
            slot.style.right = '10px';
            slot.style.top = `${10 + (buttonIndex * 35)}px`;

            btn.textContent = mode.coverLabel;
            btn.dataset.biliAnalysisMode = mode.id;
        });
    }

    /**
     * 从抖音推荐流视频容器中提取作品 ID。
     * 推荐流 URL 本身不携带作品号，因此优先读取播放器和标题区域的 data-e2e 属性。
     */
    function getDouyinRecommendVideoId(feedVideo) {
        const idFromVideo = feedVideo.getAttribute?.('data-e2e-vid');
        if (idFromVideo && /^\d{12,}$/.test(idFromVideo)) return idFromVideo;

        const infoEl = feedVideo.querySelector?.('[data-e2e-aweme-id]');
        const idFromInfo = infoEl?.getAttribute?.('data-e2e-aweme-id');
        return idFromInfo && /^\d{12,}$/.test(idFromInfo) ? idFromInfo : null;
    }

    /**
     * 查找抖音推荐流右侧互动栏。
     * 位置参考下载按钮的挂载方式，但只复用布局思路，不复用对方插件的类名。
     */
    function getDouyinRecommendButtonHost(feedVideo) {
        const moreButton = feedVideo.querySelector?.('[data-e2e="video-play-more"]');
        if (!moreButton) return null;

        return moreButton.parentElement || moreButton.closest?.('.positionBox') || null;
    }

    function queueDouyinRecommendFeedProcess(feedVideo, delay = 0) {
        if (!(feedVideo instanceof Element)) return;

        if (delay > 0) {
            setTimeout(() => queueDouyinRecommendFeedProcess(feedVideo), delay);
            return;
        }

        if (douyinRecommendPendingFeeds.has(feedVideo)) return;
        douyinRecommendPendingFeeds.add(feedVideo);

        requestAnimationFrame(() => {
            douyinRecommendPendingFeeds.delete(feedVideo);
            if (document.hidden || !isDouyinRecommendPage() || !feedVideo.isConnected) return;

            processDouyinRecommendVideo(feedVideo);
        });
    }

    function observeDouyinRecommendFeed(feedVideo) {
        if (!(feedVideo instanceof Element) || douyinRecommendFeedObservers.has(feedVideo)) return;

        const observer = new MutationObserver(() => {
            queueDouyinRecommendFeedProcess(feedVideo);
            queueDouyinRecommendFeedProcess(feedVideo, 120);
        });

        observer.observe(feedVideo, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-e2e-vid', 'data-e2e-aweme-id']
        });
        douyinRecommendFeedObservers.set(feedVideo, observer);
    }

    function queueDouyinRecommendHostProcess(host, delay = 0) {
        if (!(host instanceof Element)) return;

        if (delay > 0) {
            setTimeout(() => queueDouyinRecommendHostProcess(host), delay);
            return;
        }

        const currentFeedVideo = host.closest?.('[data-e2e="feed-video"]');
        if (currentFeedVideo) {
            queueDouyinRecommendFeedProcess(currentFeedVideo);
        } else {
            queueDouyinRecommendButtonScan();
        }
    }

    function observeDouyinRecommendButtonHost(host) {
        if (!(host instanceof Element) || douyinRecommendHostObservers.has(host)) return;

        const observer = new MutationObserver(() => {
            queueDouyinRecommendHostProcess(host);
            queueDouyinRecommendHostProcess(host, 120);
        });

        // 抖音推荐流会复用右侧栏，触发时重新定位当前视频，避免补到旧作品。
        observer.observe(host, { childList: true, subtree: true });
        douyinRecommendHostObservers.set(host, observer);
    }

    /**
     * 给抖音推荐流视频添加解析按钮。
     * 只在播放器内部显示，不生成左上角全局悬浮按钮。
     */
    function processDouyinRecommendVideo(feedVideo) {
        observeDouyinRecommendFeed(feedVideo);

        const id = getDouyinRecommendVideoId(feedVideo);
        if (!id) return;

        const host = getDouyinRecommendButtonHost(feedVideo);
        if (!host) return;
        observeDouyinRecommendButtonHost(host);

        const activeModes = getActiveCloudParseModesForTarget('video');
        if (activeModes.length === 0) return;

        host.querySelectorAll('.bili-analysis-douyin-recommend-slot').forEach(slot => {
            if (slot.dataset.biliAnalysisVideoId !== id) slot.remove();
        });

        activeModes.forEach((mode, index) => {
            const buttonId = `${mode.id}-${id}`;
            if (host.querySelector(`[data-bili-analysis-douyin-recommend-id="${buttonId}"]`)) return;

            const wrapper = document.createElement('div');
            wrapper.className = 'bili-analysis-douyin-recommend-slot';
            wrapper.dataset.biliAnalysisDouyinRecommendId = buttonId;
            wrapper.dataset.biliAnalysisVideoId = id;
            wrapper.style.order = String(-10 - index);

            const btn = document.createElement('button');
            btn.className = 'bili-analysis-douyin-recommend-btn';
            btn.innerHTML = mode.buttonHtml;
            btn.dataset.biliAnalysisMode = mode.id;

            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                handleParseAndCopy(`https://www.douyin.com/video/${id}`, mode.id);
            });

            wrapper.appendChild(btn);
            host.appendChild(wrapper);
        });
    }

    function addDouyinRecommendButtons(visibleOnly = false, root = document) {
        if (!isDouyinPage || !isDouyinRecommendPage()) return;

        collectElements(root, ['[data-e2e="feed-video"]'], visibleOnly).forEach(feedVideo => {
            processDouyinRecommendVideo(feedVideo);
        });
    }

    function addCoverAnalysisButtons() {
        const hasVideoModes = getActiveParseModesForTarget('video').length > 0;
        const hasLiveModes = getActiveParseModesForTarget('live').length > 0;
        const hasDouyinModes = isDouyinPage && getActiveCloudParseModesForTarget('video').length > 0;
        if (!hasVideoModes && !hasLiveModes && !hasDouyinModes) return;

        const videoSelectors = [
            '.video-card .pic-box', '.bili-video-card .bili-video-card__image',
            '.small-item .cover', '.card-pic', 'a[href*="/video/BV"]',
            '.cover-container', '.list-item .cover',
            '.bili-dyn-card-video__cover'
        ];

        const liveSelectors = [
            'a[href*="live.bilibili.com"]', '.live-card .cover', '.room-card .cover'
        ];

        try {
            if (hasVideoModes && !isDouyinPage) {
                videoSelectors.forEach(sel => document.querySelectorAll(sel).forEach(el => processCover(el, 'video')));
            }
            if (hasLiveModes && !isDouyinPage) {
                liveSelectors.forEach(sel => document.querySelectorAll(sel).forEach(el => processCover(el, 'live')));
            }
            if (hasDouyinModes) {
                addDouyinCoverButtons();
            }
        } catch (e) {
            console.error('处理封面按钮出错:', e);
        }
    }


    /* =========================================================================
     * 3. HTML 模板 (HTML Templates)
     * ========================================================================= */

    // 设置面板与遮罩层的 DOM 结构
    const SETTINGS_HTML = `
        <div id="biliAnalysisSettingsOverlay" class="settings-overlay"></div>
        <div id="biliAnalysisSettingsPanel" class="settings-panel">
            <div class="settings-header">
                <div class="settings-title">
                    <h2>BiliAnalysis 设置</h2>
                    <p class="settings-subtitle">用于获取哔哩哔哩视频和直播直链的Tampermonkey脚本</p>
                </div>
                <button class="close-btn" id="settingsCloseBtn">×</button>
            </div>
            <div class="settings-body">
                <div class="settings-layout">
                    <div class="settings-nav">
                        <button class="nav-item active" data-target="section-home">关于</button>
                        <button class="nav-item" data-target="section-parse">解析方式</button>
                        <button class="nav-item" data-target="section-notify">通知提示</button>
                        <button class="nav-item" data-target="section-position">按钮位置</button>
                    </div>
                    <div class="settings-content">
                        <div class="settings-section is-active" id="section-home">
                            <div class="home-hero">
                                <div class="home-title" id="scriptNameValue"></div>
                                <div class="home-subtitle">用于获取哔哩哔哩视频和直播直链的Tampermonkey脚本</div>
                            </div>
                            <div class="home-stats">
                                <div class="home-stat">
                                    <span class="stat-label">当前版本</span>
                                    <span class="stat-value" id="currentVersionValue"></span>
                                </div>
                                <div class="home-stat">
                                    <span class="stat-label">最新版本</span>
                                    <span class="stat-value" id="latestVersionValue"></span>
                                </div>
                            </div>
                            <div class="home-actions">
                                <button class="home-btn" id="checkUpdateBtn">检查更新</button>
                                <a class="home-btn home-btn-bug" href="https://github.com/mmyo456/BiliAnalysis/issues" target="_blank" rel="noopener noreferrer">提交Bug</a>
                                <a class="home-link" href="https://github.com/mmyo456/BiliAnalysis" target="_blank" rel="noopener noreferrer">前往 GitHub 项目主页</a>
                                <span class="home-status" id="updateStatus"></span>
                            </div>
                            <div class="home-tips">
                                <div class="home-tip">左侧选择功能分类，右侧进行设置</div>
                                <div class="home-tip">云端服务提供来自：ouo.chat</div>
                            </div>
                            <div class="home-contributors">
                                <h4 class="contributors-title">贡献者们</h4>
                                <p class="contributors-desc">特别感谢以下开发者的贡献：</p>
                                <a href="https://github.com/mmyo456/BiliAnalysis/graphs/contributors" target="_blank" rel="noopener noreferrer">
                                    <img src="https://contrib.rocks/image?repo=mmyo456/BiliAnalysis" alt="Contributors" class="contributors-img" />
                                </a>
                            </div>
                        </div>
                        <div class="settings-section" id="section-parse">
                            <div class="section-head">
                                <h3>解析方式</h3>
                                <span class="section-note">最多选 2 项</span>
                            </div>
                            <div class="mode-grid">
                                <label class="mode-card">
                                    <input type="checkbox" id="mode-cloud-jx" value="cloud-jx">
                                    <span class="mode-title">云端解析</span>
                                    <span class="mode-desc">稳定可靠，无有效期限制</span>
                                    <span class="mode-tags">视频 / 直播 / 音乐</span>
                                </label>
                                <label class="mode-card">
                                    <input type="checkbox" id="mode-cloud-ya" value="cloud-ya">
                                    <span class="mode-title">云端解析ya</span>
                                    <span class="mode-desc">稳定可靠，无有效期限制</span>
                                    <span class="mode-tags">视频 / 直播 / 音乐</span>
                                </label>
                                <label class="mode-card">
                                    <input type="checkbox" id="mode-cloud-custom" value="cloud-custom">
                                    <span class="mode-title">自定义云端</span>
                                    <span class="mode-desc">使用自定义解析URL</span>
                                    <span class="mode-tags">取决于您提供的URL</span>
                                </label>
                                <label class="mode-card">
                                    <input type="checkbox" id="mode-local" value="local">
                                    <span class="mode-title">本地解析</span>
                                    <span class="mode-desc">视频直链（需登录）+ 直播直链</span>
                                    <span class="mode-tags">视频 / 直播</span>
                                </label>
                            </div>
                            <div class="local-domain-row" id="localDomainRow">
                                <div class="toggle-row">
                                    <label class="toggle-item">
                                        <input type="checkbox" id="toggleLocalDomainReplace">
                                        <span>启用本地视频解析域名替换</span>
                                    </label>
                                </div>
                                <div class="local-domain-input-row" id="localDomainInputRow">
                                    <label for="localDomainReplaceValue">自定义域名</label>
                                    <input type="text" id="localDomainReplaceValue" placeholder="https://your-cdn.com">
                                    <div class="custom-url-tip">仅对本地视频解析生效，不处理本地直播解析</div>
                                </div>
                            </div>
                            <div class="custom-url-row" id="customApiRow">
                                <label for="customApiDomain">自定义解析URL</label>
                                <input type="text" id="customApiDomain" placeholder="https://example.com/parse?url={url}">
                                <div class="custom-url-tip">支持 {url} 占位符；不填则自定义解析不生效</div>
                            </div>
                        </div>
                        <div class="settings-section" id="section-notify">
                            <h3>通知提示</h3>
                            <div class="toggle-row">
                                <label class="toggle-item">
                                    <input type="checkbox" id="toggleNotifyGif">
                                    <span>启用通知弹窗GIF</span>
                                </label>
                            </div>
                            <div class="custom-url-row notify-gif-row">
                                <label for="notifyGifCustomUrl">自定义GIF地址</label>
                                <input type="text" id="notifyGifCustomUrl" placeholder="https://i.ouo.chat/api/img/D25.gif">
                                <div class="custom-url-tip">默认：https://i.ouo.chat/api/img/D25.gif</div>
                            </div>
                            <div class="toggle-row">
                                <label class="toggle-item">
                                    <input type="checkbox" id="toggleNotifyGifUseLocal">
                                    <span>启用本地GIF</span>
                                </label>
                            </div>
                            <div class="custom-url-row notify-gif-row" id="notifyGifLocalRow">
                                <label for="notifyGifLocalFile">本地GIF文件</label>
                                <input type="file" id="notifyGifLocalFile" accept=".gif,image/gif">
                                <div class="custom-url-tip" id="notifyGifLocalFileTip">未设置本地GIF</div>
                                <button type="button" class="notify-gif-clear-btn" id="clearNotifyGifLocalBtn">清除本地GIF</button>
                            </div>
                        </div>
                        <div class="settings-section" id="section-position">
                            <h3>按钮位置</h3>
                            <div class="home-tip">解析方式最多可同时启用 2 项</div>
                            <div class="checkbox-group">
                                <div class="checkbox-item"><input type="checkbox" id="pos-top-left" value="top-left"><label for="pos-top-left">左上角</label></div>
                                <div class="checkbox-item"><input type="checkbox" id="pos-top-right" value="top-right"><label for="pos-top-right">右上角</label></div>
                                <div class="checkbox-item"><input type="checkbox" id="pos-bottom-left" value="bottom-left"><label for="pos-bottom-left">左下角</label></div>
                                <div class="checkbox-item"><input type="checkbox" id="pos-bottom-right" value="bottom-right"><label for="pos-bottom-right">右下角</label></div>
                                <div class="checkbox-item"><input type="checkbox" id="pos-custom" value="custom"><label for="pos-custom">自定义位置</label></div>
                            </div>
                            <div class="custom-position-group" id="customPositionGroup">
                                <div class="slider-row">
                                    <div class="slider-label">
                                        <span>水平位置 (0-100%)</span>
                                        <input type="number" class="value-input" id="sliderXValue" min="0" max="100" value="50">
                                    </div>
                                    <div class="slider-container">
                                        <input type="range" id="sliderX" min="0" max="100" value="50">
                                    </div>
                                </div>
                                <div class="slider-row">
                                    <div class="slider-label">
                                        <span>垂直位置 (0-100%)</span>
                                        <input type="number" class="value-input" id="sliderYValue" min="0" max="100" value="50">
                                    </div>
                                    <div class="slider-container">
                                        <input type="range" id="sliderY" min="0" max="100" value="50">
                                    </div>
                                </div>
                                <div class="position-tips">提示：拖动滑块或输入数字，按钮会实时在页面上移动</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="settings-footer">
                <button class="btn btn-cancel" id="settingsCancelBtn">取消</button>
                <button class="btn btn-save" id="settingsSaveBtn">保存</button>
            </div>
        </div>
    `;

    /* =========================================================================
     * 4. CSS 样式 (CSS Styles)
     * ========================================================================= */

    const APP_CSS = `
        /* ----------------------- 解析成功提示框 ----------------------- */
        #notificationBox {
            position: fixed;
            bottom: -100px; /* 初始位置在视口之外 */
            left: 50%;
            transform: translateX(-50%);
            width: 300px;
            padding: 20px;
            background-color: var(--bili-analysis-notify-bg);
            color: var(--bili-analysis-notify-fg);
            text-align: center;
            border-radius: 10px;
            border: 1px solid var(--bili-analysis-notify-border);
            box-shadow: 0px 4px 10px var(--bili-analysis-notify-shadow);
            opacity: 0;
            transition: all 0.5s ease;
            z-index: 99999;
            box-sizing: border-box;
            font-size: 14px;
            font-weight: 400;
            line-height: 1.4;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif;
            overflow: hidden;
        }
        #notificationBox h3 { color: inherit; margin: 0 0 6px; font-size: 16px; font-weight: 600; line-height: 1.2; }
        #notificationBox p { margin: 0; font-size: 13px; }
        #notificationBox img { display: block; margin: 0 auto 10px; }
        #notificationBox.show { bottom: 20px; opacity: 1; }

        :root {
            --bili-analysis-notify-bg: rgba(255, 255, 255, 0.96);
            --bili-analysis-notify-fg: #222;
            --bili-analysis-notify-border: rgba(0, 0, 0, 0.12);
            --bili-analysis-notify-shadow: rgba(0, 0, 0, 0.15);
        }
        @media (prefers-color-scheme: dark) {
            :root {
                --bili-analysis-notify-bg: #333;
                --bili-analysis-notify-fg: #fff;
                --bili-analysis-notify-border: rgba(255, 255, 255, 0.12);
                --bili-analysis-notify-shadow: rgba(0, 0, 0, 0.35);
            }
        }
        html[data-theme="dark"], html.dark, body.dark {
            --bili-analysis-notify-bg: #333;
            --bili-analysis-notify-fg: #fff;
            --bili-analysis-notify-border: rgba(255, 255, 255, 0.12);
            --bili-analysis-notify-shadow: rgba(0, 0, 0, 0.35);
        }

        /* 设置面板颜色变量 */
        :root {
            --bili-analysis-panel-bg: #fff;
            --bili-analysis-panel-fg: #333;
            --bili-analysis-panel-fg-heading: #222;
            --bili-analysis-panel-fg-secondary: #888;
            --bili-analysis-panel-fg-muted: #999;
            --bili-analysis-panel-border: #e0e0e0;
            --bili-analysis-panel-border-light: #e6e6e6;
            --bili-analysis-panel-bg-secondary: #fafafa;
            --bili-analysis-panel-bg-tertiary: #f6f7f9;
            --bili-analysis-panel-bg-stat: #fff;
            --bili-analysis-panel-bg-input: #fff;
            --bili-analysis-panel-nav-hover: #eef3f7;
            --bili-analysis-panel-nav-active-bg: #e6f6ff;
            --bili-analysis-panel-nav-active-fg: #006b99;
            --bili-analysis-panel-btn-cancel-bg: #f0f0f0;
            --bili-analysis-panel-btn-cancel-hover: #e0e0e0;
            --bili-analysis-panel-btn-bug-bg: #fff0f0;
            --bili-analysis-panel-btn-bug-hover: #fff1f0;
            --bili-analysis-panel-btn-bug-border: #ff4d4f;
            --bili-analysis-panel-btn-bug-fg: #cf1322;
            --bili-analysis-panel-mode-card-bg: #fafafa;
            --bili-analysis-panel-mode-card-fg: #222;
            --bili-analysis-panel-mode-card-desc: #666;
            --bili-analysis-panel-mode-card-tags: #999;
            --bili-analysis-panel-mode-card-checked-bg: #f2fbff;
            --bili-analysis-panel-input-border: #ddd;
            --bili-analysis-panel-toggle-hover: #f5f5f5;
            --bili-analysis-panel-slider-bg: #e0e0e0;
            --bili-analysis-panel-footer-bg: #fff;
            --bili-analysis-panel-contributors-border: #e6e6e6;
            --bili-analysis-panel-clear-btn-bg: #fff5f5;
            --bili-analysis-panel-clear-btn-border: #ff7875;
            --bili-analysis-panel-clear-btn-hover-bg: #fff1f0;
            --bili-analysis-panel-clear-btn-hover-border: #ff4d4f;
            --bili-analysis-panel-close-btn-hover: #f0f0f0;
        }
        @media (prefers-color-scheme: dark) {
            #biliAnalysisSettingsPanel {
                --bili-analysis-panel-bg: #2a2a2a;
                --bili-analysis-panel-fg: #d0d0d0;
                --bili-analysis-panel-fg-heading: #e0e0e0;
                --bili-analysis-panel-fg-secondary: #999;
                --bili-analysis-panel-fg-muted: #777;
                --bili-analysis-panel-border: #444;
                --bili-analysis-panel-border-light: #3a3a3a;
                --bili-analysis-panel-bg-secondary: #333;
                --bili-analysis-panel-bg-tertiary: #2e2e2e;
                --bili-analysis-panel-bg-stat: #333;
                --bili-analysis-panel-bg-input: #3a3a3a;
                --bili-analysis-panel-nav-hover: #3a3a3a;
                --bili-analysis-panel-nav-active-bg: #1a3a4a;
                --bili-analysis-panel-nav-active-fg: #5cc8f0;
                --bili-analysis-panel-btn-cancel-bg: #444;
                --bili-analysis-panel-btn-cancel-hover: #555;
                --bili-analysis-panel-btn-bug-bg: #3a2020;
                --bili-analysis-panel-btn-bug-hover: #4a2828;
                --bili-analysis-panel-btn-bug-border: #ff7875;
                --bili-analysis-panel-btn-bug-fg: #ff9999;
                --bili-analysis-panel-mode-card-bg: #333;
                --bili-analysis-panel-mode-card-fg: #e0e0e0;
                --bili-analysis-panel-mode-card-desc: #aaa;
                --bili-analysis-panel-mode-card-tags: #888;
                --bili-analysis-panel-mode-card-checked-bg: #1e3338;
                --bili-analysis-panel-input-border: #555;
                --bili-analysis-panel-toggle-hover: #3a3a3a;
                --bili-analysis-panel-slider-bg: #555;
                --bili-analysis-panel-footer-bg: #2a2a2a;
                --bili-analysis-panel-contributors-border: #444;
                --bili-analysis-panel-clear-btn-bg: #3a2020;
                --bili-analysis-panel-clear-btn-border: #ff7875;
                --bili-analysis-panel-clear-btn-hover-bg: #4a2828;
                --bili-analysis-panel-clear-btn-hover-border: #ff4d4f;
                --bili-analysis-panel-close-btn-hover: #3a3a3a;
            }
        }
        html[data-theme="dark"] #biliAnalysisSettingsPanel,
        html.dark #biliAnalysisSettingsPanel,
        body.dark #biliAnalysisSettingsPanel {
            --bili-analysis-panel-bg: #2a2a2a;
            --bili-analysis-panel-fg: #d0d0d0;
            --bili-analysis-panel-fg-heading: #e0e0e0;
            --bili-analysis-panel-fg-secondary: #999;
            --bili-analysis-panel-fg-muted: #777;
            --bili-analysis-panel-border: #444;
            --bili-analysis-panel-border-light: #3a3a3a;
            --bili-analysis-panel-bg-secondary: #333;
            --bili-analysis-panel-bg-tertiary: #2e2e2e;
            --bili-analysis-panel-bg-stat: #333;
            --bili-analysis-panel-bg-input: #3a3a3a;
            --bili-analysis-panel-nav-hover: #3a3a3a;
            --bili-analysis-panel-nav-active-bg: #1a3a4a;
            --bili-analysis-panel-nav-active-fg: #5cc8f0;
            --bili-analysis-panel-btn-cancel-bg: #444;
            --bili-analysis-panel-btn-cancel-hover: #555;
            --bili-analysis-panel-btn-bug-bg: #3a2020;
            --bili-analysis-panel-btn-bug-hover: #4a2828;
            --bili-analysis-panel-btn-bug-border: #ff7875;
            --bili-analysis-panel-btn-bug-fg: #ff9999;
            --bili-analysis-panel-mode-card-bg: #333;
            --bili-analysis-panel-mode-card-fg: #e0e0e0;
            --bili-analysis-panel-mode-card-desc: #aaa;
            --bili-analysis-panel-mode-card-tags: #888;
            --bili-analysis-panel-mode-card-checked-bg: #1e3338;
            --bili-analysis-panel-input-border: #555;
            --bili-analysis-panel-toggle-hover: #3a3a3a;
            --bili-analysis-panel-slider-bg: #555;
            --bili-analysis-panel-footer-bg: #2a2a2a;
            --bili-analysis-panel-contributors-border: #444;
            --bili-analysis-panel-clear-btn-bg: #3a2020;
            --bili-analysis-panel-clear-btn-border: #ff7875;
            --bili-analysis-panel-clear-btn-hover-bg: #4a2828;
            --bili-analysis-panel-clear-btn-hover-border: #ff4d4f;
            --bili-analysis-panel-close-btn-hover: #3a3a3a;
        }

        /* ----------------------- 封面解析按钮 ----------------------- */
        .video-cover-analysis-btn, .live-cover-analysis-btn {
            position: absolute !important;
            right: 5px !important;
            z-index: 10 !important;
            padding: 6px 12px !important;
            background: rgba(0, 174, 236, 0.9) !important;
            color: #fff !important;
            border: none !important;
            border-radius: 4px !important;
            font-size: 14px !important;
            cursor: pointer !important;
            transition: all 0.3s ease !important;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3) !important;
            opacity: 0 !important;
            pointer-events: auto !important;
        }
        /* 鼠标悬停激活显示效果 */
        .bili-cover-wrapper:hover .video-cover-analysis-btn,
        .bili-cover-wrapper:hover .live-cover-analysis-btn,
        a:hover .video-cover-analysis-btn,
        a:hover .live-cover-analysis-btn,
        .video-card:hover .video-cover-analysis-btn,
        .video-card:hover .live-cover-analysis-btn,
        .bili-video-card:hover .video-cover-analysis-btn,
        .bili-video-card:hover .live-cover-analysis-btn,
        [class*="cover"]:hover .video-cover-analysis-btn,
        [class*="cover"]:hover .live-cover-analysis-btn {
            opacity: 1 !important;
        }
        .video-cover-analysis-btn:hover, .live-cover-analysis-btn:hover {
            background: rgba(0, 174, 236, 1) !important;
            transform: scale(1.05) !important;
            box-shadow: 0 3px 6px rgba(0,0,0,0.4) !important;
            opacity: 1 !important;
        }
        .live-cover-analysis-btn { background: rgba(242, 82, 154, 0.9) !important; }
        .live-cover-analysis-btn:hover { background: rgba(242, 82, 154, 1) !important; }
        .bili-analysis-douyin-slot {
            position: absolute !important;
            z-index: 100 !important;
            width: max-content !important;
            min-width: 72px !important;
            height: 32px !important;
            display: none !important;
        }
        .discover-video-card-item:hover .bili-analysis-douyin-slot,
        .bili-analysis-douyin-card:hover .bili-analysis-douyin-slot,
        [data-aweme-id]:hover .bili-analysis-douyin-slot {
            display: block !important;
        }
        .bili-analysis-douyin-slot .video-cover-analysis-btn {
            opacity: 1 !important;
            bottom: auto !important;
            white-space: nowrap !important;
        }
        .bili-analysis-douyin-recommend-slot {
            position: relative !important;
            width: 40px !important;
            height: 40px !important;
            margin-bottom: 20px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
        }
        .bili-analysis-douyin-recommend-btn {
            width: 40px !important;
            height: 40px !important;
            color: #fff !important;
            background: rgb(0, 174, 236) !important;
            border: 1px solid rgba(255, 255, 255, 0.35) !important;
            border-radius: 6px !important;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28) !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            text-align: center !important;
            line-height: 1.15 !important;
            padding: 0 !important;
            font-size: 12px !important;
            font-weight: 600 !important;
            transition: background 0.2s, box-shadow 0.2s, transform 0.2s !important;
        }
        .bili-analysis-douyin-recommend-btn:hover {
            background: rgb(0, 153, 212) !important;
            box-shadow: 0 3px 10px rgba(0, 174, 236, 0.42) !important;
            transform: translateY(-1px) !important;
        }

        /* ----------------------- 全局悬浮主按钮 ----------------------- */
        .fixed-analysis-btn {
            position: fixed !important;
            z-index: 999 !important;
            width: 45px !important;
            height: 45px !important;
            color: rgb(255, 255, 255) !important;
            background: rgb(0, 174, 236) !important;
            border: 1px solid rgb(241, 242, 243) !important;
            border-radius: 6px !important;
            font-size: 14px !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            text-align: center !important;
            line-height: 1.2 !important;
            padding: 0 !important;
            transition: background 0.2s, box-shadow 0.2s !important;
        }
        .fixed-analysis-btn:hover {
            background: rgb(0, 153, 212) !important;
            box-shadow: 0 3px 8px rgba(0, 174, 236, 0.4) !important;
        }

        /* ----------------------- 设置面板及元素 ----------------------- */
        #biliAnalysisSettingsOverlay {
            all: initial;
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.5); z-index: 99999; display: none;
            box-sizing: border-box;
            zoom: 1 !important;
        }
        #biliAnalysisSettingsOverlay.show { display: block; }

        #biliAnalysisSettingsPanel {
            all: initial;
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 720px; max-width: 95vw; height: 530px; background: var(--bili-analysis-panel-bg); border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3); z-index: 100000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            font-size: 14px;
            line-height: 1.4;
            color: var(--bili-analysis-panel-fg);
            box-sizing: border-box;
            zoom: 1 !important;
            display: none;
        }
        #biliAnalysisSettingsPanel.show { display: flex; flex-direction: column; }
        #biliAnalysisSettingsPanel,
        #biliAnalysisSettingsPanel * {
            box-sizing: border-box;
            max-width: none;
        }
        #biliAnalysisSettingsPanel button,
        #biliAnalysisSettingsPanel input,
        #biliAnalysisSettingsPanel label,
        #biliAnalysisSettingsPanel a {
            font: inherit;
        }
        #biliAnalysisSettingsPanel .settings-header {
            padding: 20px; border-bottom: 1px solid var(--bili-analysis-panel-border);
            display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
        }
        #biliAnalysisSettingsPanel .settings-title { display: flex; flex-direction: column; gap: 4px; }
        #biliAnalysisSettingsPanel .settings-header h2 { margin: 0; font-size: 20px; color: var(--bili-analysis-panel-fg-heading); font-weight: 600; }
        #biliAnalysisSettingsPanel .settings-subtitle { margin: 0; font-size: 12px; color: var(--bili-analysis-panel-fg-secondary); }
        #biliAnalysisSettingsPanel .settings-header .close-btn {
            background: none; border: none; font-size: 24px; cursor: pointer;
            color: var(--bili-analysis-panel-fg-muted); padding: 0; width: 30px; height: 30px;
            display: flex; align-items: center; justify-content: center; border-radius: 4px; transition: all 0.2s;
        }
        #biliAnalysisSettingsPanel .settings-header .close-btn:hover { background: var(--bili-analysis-panel-close-btn-hover); color: var(--bili-analysis-panel-fg); }

        #biliAnalysisSettingsPanel .settings-body { padding: 16px 20px; width: 100%; box-sizing: border-box; flex: 1; min-height: 0; overflow: hidden; }
        #biliAnalysisSettingsPanel .settings-layout { display: grid; grid-template-columns: 140px 1fr; gap: 16px; height: 100%; }
        #biliAnalysisSettingsPanel .settings-nav {
            display: flex; flex-direction: column; gap: 6px; padding: 6px; background: var(--bili-analysis-panel-bg-tertiary); border-radius: 10px;
        }
        #biliAnalysisSettingsPanel .nav-item {
            border: none; background: transparent; padding: 10px 12px; text-align: left; border-radius: 8px;
            font-size: 13px; color: var(--bili-analysis-panel-fg); cursor: pointer; transition: background 0.2s, color 0.2s;
        }
        #biliAnalysisSettingsPanel .nav-item:hover { background: var(--bili-analysis-panel-nav-hover); color: var(--bili-analysis-panel-fg-heading); }
        #biliAnalysisSettingsPanel .nav-item.active { background: var(--bili-analysis-panel-nav-active-bg); color: var(--bili-analysis-panel-nav-active-fg); font-weight: 600; }
        #biliAnalysisSettingsPanel .settings-content { min-height: 260px; overflow-y: auto; }
        #biliAnalysisSettingsPanel .settings-section { display: none; height: auto; }
        #biliAnalysisSettingsPanel .settings-section.is-active { display: block; height: auto; }
        #biliAnalysisSettingsPanel .settings-section h3 { margin: 0; font-size: 16px; color: var(--bili-analysis-panel-fg-heading); font-weight: 500; }
        #biliAnalysisSettingsPanel .settings-content { font-size: 13px; }
        #biliAnalysisSettingsPanel .settings-content .mode-title { font-size: 14px; }
        #biliAnalysisSettingsPanel .settings-content .mode-desc { font-size: 12px; }
        #biliAnalysisSettingsPanel .settings-content .mode-tags { font-size: 11px; }
        #biliAnalysisSettingsPanel .section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        #biliAnalysisSettingsPanel .section-note { font-size: 12px; color: var(--bili-analysis-panel-fg-muted); }
        #biliAnalysisSettingsPanel .home-hero {
            padding: 9px 11px; border-radius: 8px; border: 1px solid var(--bili-analysis-panel-border-light);
            background: var(--bili-analysis-panel-bg-secondary); display: flex; flex-direction: column; gap: 2px;
        }
        #biliAnalysisSettingsPanel .home-title { font-size: 14px; font-weight: 600; color: var(--bili-analysis-panel-fg-heading); }
        #biliAnalysisSettingsPanel .home-subtitle { font-size: 11px; color: var(--bili-analysis-panel-fg-secondary); }
        #biliAnalysisSettingsPanel .home-stats { margin-top: 7px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
        #biliAnalysisSettingsPanel .home-stat {
            padding: 6px 8px; border-radius: 6px; border: 1px solid var(--bili-analysis-panel-border-light); background: var(--bili-analysis-panel-bg-stat);
            display: flex; flex-direction: column; gap: 2px;
        }
        #biliAnalysisSettingsPanel .stat-label { font-size: 10px; color: var(--bili-analysis-panel-fg-secondary); }
        #biliAnalysisSettingsPanel .stat-value { font-size: 12px; color: var(--bili-analysis-panel-fg-heading); font-weight: 600; }
        #biliAnalysisSettingsPanel .home-actions { display: flex; align-items: center; gap: 7px; margin-top: 7px; flex-wrap: wrap; }
        #biliAnalysisSettingsPanel .home-btn {
            padding: 5px 8px; border-radius: 6px; border: 1px solid #00aeec; background: var(--bili-analysis-panel-bg-stat);
            color: #0077aa; font-size: 11px; cursor: pointer; transition: all 0.2s;
        }
        #biliAnalysisSettingsPanel .home-btn:hover { background: #f4fbff; }
        #biliAnalysisSettingsPanel .home-link {
            font-size: 11px; color: #0077aa; text-decoration: none; padding: 5px 8px;
            border-radius: 6px; border: 1px solid #00aeec; background: var(--bili-analysis-panel-bg-stat); cursor: pointer; transition: all 0.2s;
        }
        #biliAnalysisSettingsPanel .home-link:hover { text-decoration: underline; }
        #biliAnalysisSettingsPanel .home-status { font-size: 11px; color: var(--bili-analysis-panel-fg-secondary); }
        #biliAnalysisSettingsPanel .home-tips { margin-top: 6px; display: flex; flex-direction: column; gap: 2px; }
        #biliAnalysisSettingsPanel .home-tip { font-size: 11px; color: var(--bili-analysis-panel-fg-secondary); }

        #biliAnalysisSettingsPanel .home-btn-bug {
            background: var(--bili-analysis-panel-btn-bug-bg);
            border-color: var(--bili-analysis-panel-btn-bug-border);
            color: var(--bili-analysis-panel-btn-bug-fg);
        }
        #biliAnalysisSettingsPanel .home-btn-bug:hover {
            background: var(--bili-analysis-panel-btn-bug-hover);
        }

        #biliAnalysisSettingsPanel .home-contributors {
            margin-top: 8px;
            padding: 8px;
            border-radius: 6px;
            border: 1px solid var(--bili-analysis-panel-contributors-border);
            background: var(--bili-analysis-panel-bg-secondary);
        }
        #biliAnalysisSettingsPanel .contributors-title {
            margin: 0 0 4px 0;
            font-size: 12px;
            font-weight: 600;
            color: var(--bili-analysis-panel-fg-heading);
        }
        #biliAnalysisSettingsPanel .contributors-desc {
            margin: 0 0 5px 0;
            font-size: 11px;
            color: var(--bili-analysis-panel-fg-secondary);
        }
        #biliAnalysisSettingsPanel .contributors-img {
            max-width: min(100%, 360px);
            height: auto;
            border-radius: 5px;
        }

        #biliAnalysisSettingsPanel .mode-grid {
            display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px;
        }
        #biliAnalysisSettingsPanel .mode-card {
            border: 1px solid var(--bili-analysis-panel-border-light); border-radius: 10px; padding: 12px 12px 10px;
            display: flex; flex-direction: column; gap: 6px; cursor: pointer; position: relative;
            transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
            background: var(--bili-analysis-panel-mode-card-bg);
        }
        #biliAnalysisSettingsPanel .mode-card.checked {
            border-color: var(--bili-analysis-panel-mode-card-checked-border); box-shadow: 0 0 0 2px rgba(0, 174, 236, 0.15); background: var(--bili-analysis-panel-mode-card-checked-bg);
        }
        #biliAnalysisSettingsPanel .mode-card input[type="checkbox"] {
            position: absolute; opacity: 0; pointer-events: none;
        }
        #biliAnalysisSettingsPanel .mode-title { font-size: 15px; color: var(--bili-analysis-panel-mode-card-fg); font-weight: 600; }
        #biliAnalysisSettingsPanel .mode-desc { font-size: 12px; color: var(--bili-analysis-panel-mode-card-desc); }
        #biliAnalysisSettingsPanel .mode-tags { font-size: 12px; color: var(--bili-analysis-panel-mode-card-tags); }

        #biliAnalysisSettingsPanel .custom-url-row {
            margin-top: 12px; display: none; flex-direction: column; gap: 6px;
        }
        #biliAnalysisSettingsPanel .custom-url-row label { font-size: 13px; color: var(--bili-analysis-panel-fg); font-weight: 500; }
        #biliAnalysisSettingsPanel .custom-url-row input {
            padding: 8px 10px; border: 1px solid var(--bili-analysis-panel-input-border); border-radius: 6px;
            background: var(--bili-analysis-panel-bg-input); color: var(--bili-analysis-panel-fg);
            font-size: 13px; outline: none; transition: border-color 0.2s, box-shadow 0.2s;
        }
        #biliAnalysisSettingsPanel .custom-url-row input:focus {
            border-color: #00aeec; box-shadow: 0 0 0 2px rgba(0, 174, 236, 0.15);
        }
        #biliAnalysisSettingsPanel .custom-url-tip { font-size: 12px; color: var(--bili-analysis-panel-fg-muted); }
        #biliAnalysisSettingsPanel #section-notify .notify-gif-row {
            display: flex;
            margin-top: 10px;
        }
        #biliAnalysisSettingsPanel #section-notify #notifyGifLocalRow {
            display: none;
        }
        #biliAnalysisSettingsPanel #section-notify #notifyGifLocalFile {
            padding: 6px 8px;
            border: 1px dashed var(--bili-analysis-panel-input-border);
            background: var(--bili-analysis-panel-bg-input);
        }
        #biliAnalysisSettingsPanel #section-notify #notifyGifCustomUrl:disabled {
            background: var(--bili-analysis-panel-bg-secondary);
            color: var(--bili-analysis-panel-fg-muted);
            cursor: not-allowed;
        }
        #biliAnalysisSettingsPanel .notify-gif-clear-btn {
            width: fit-content;
            padding: 6px 10px;
            border-radius: 6px;
            border: 1px solid var(--bili-analysis-panel-clear-btn-border);
            background: var(--bili-analysis-panel-clear-btn-bg);
            color: var(--bili-analysis-panel-btn-bug-fg);
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
        }
        #biliAnalysisSettingsPanel .notify-gif-clear-btn:hover {
            background: var(--bili-analysis-panel-clear-btn-hover-bg);
            border-color: var(--bili-analysis-panel-clear-btn-hover-border);
        }

        #biliAnalysisSettingsPanel .local-domain-row {
            margin-top: 12px; display: none; flex-direction: column; gap: 8px;
            padding: 12px; background: var(--bili-analysis-panel-bg-secondary); border-radius: 8px;
        }
        #biliAnalysisSettingsPanel .local-domain-input-row {
            display: none; flex-direction: column; gap: 6px;
        }
        #biliAnalysisSettingsPanel .local-domain-input-row label { font-size: 13px; color: var(--bili-analysis-panel-fg); font-weight: 500; }
        #biliAnalysisSettingsPanel .local-domain-input-row input {
            padding: 8px 10px; border: 1px solid var(--bili-analysis-panel-input-border); border-radius: 6px;
            background: var(--bili-analysis-panel-bg-input); color: var(--bili-analysis-panel-fg);
            font-size: 13px; outline: none; transition: border-color 0.2s, box-shadow 0.2s;
        }
        #biliAnalysisSettingsPanel .local-domain-input-row input:focus {
            border-color: #00aeec; box-shadow: 0 0 0 2px rgba(0, 174, 236, 0.15);
        }

        #biliAnalysisSettingsPanel .toggle-row { display: flex; }
        #biliAnalysisSettingsPanel .toggle-item {
            display: flex; align-items: center; gap: 8px; cursor: pointer;
            padding: 8px 12px; border-radius: 6px; transition: background 0.2s;
        }
        #biliAnalysisSettingsPanel .toggle-item:hover { background: var(--bili-analysis-panel-toggle-hover); }
        #biliAnalysisSettingsPanel .toggle-item input[type="checkbox"] {
            width: 18px;
            height: 18px;
            cursor: pointer;
            accent-color: #00aeec;
            border: 2px solid var(--bili-analysis-panel-input-border);
            border-radius: 4px;
            appearance: none;
            -webkit-appearance: none;
            background: var(--bili-analysis-panel-bg-stat);
            position: relative;
            transition: all 0.2s;
        }
        #biliAnalysisSettingsPanel .toggle-item input[type="checkbox"]:hover {
            border-color: #00aeec;
        }
        #biliAnalysisSettingsPanel .toggle-item input[type="checkbox"]:checked {
            background: #00aeec;
            border-color: #00aeec;
        }
        #biliAnalysisSettingsPanel .toggle-item input[type="checkbox"]:checked::after {
            content: '';
            position: absolute;
            top: 2px;
            left: 5px;
            width: 4px;
            height: 8px;
            border: solid white;
            border-width: 0 2px 2px 0;
            transform: rotate(45deg);
        }

        #biliAnalysisSettingsPanel .checkbox-group { display: flex; flex-direction: column; gap: 8px; }
        #biliAnalysisSettingsPanel .checkbox-item {
            display: flex; align-items: center; gap: 8px; cursor: pointer;
            padding: 8px 12px; border-radius: 6px; transition: background 0.2s;
        }
        #biliAnalysisSettingsPanel .checkbox-item:hover { background: var(--bili-analysis-panel-toggle-hover); }
        #biliAnalysisSettingsPanel .checkbox-item input[type="checkbox"] {
            width: 18px;
            height: 18px;
            cursor: pointer;
            accent-color: #00aeec;
            border: 2px solid var(--bili-analysis-panel-input-border);
            border-radius: 4px;
            appearance: none;
            -webkit-appearance: none;
            background: var(--bili-analysis-panel-bg-stat);
            position: relative;
            transition: all 0.2s;
        }
        #biliAnalysisSettingsPanel .checkbox-item input[type="checkbox"]:hover {
            border-color: #00aeec;
        }
        #biliAnalysisSettingsPanel .checkbox-item input[type="checkbox"]:checked {
            background: #00aeec;
            border-color: #00aeec;
        }
        #biliAnalysisSettingsPanel .checkbox-item input[type="checkbox"]:checked::after {
            content: '';
            position: absolute;
            top: 2px;
            left: 5px;
            width: 4px;
            height: 8px;
            border: solid white;
            border-width: 0 2px 2px 0;
            transform: rotate(45deg);
        }
        #biliAnalysisSettingsPanel .checkbox-item label { cursor: pointer; font-size: 14px; color: var(--bili-analysis-panel-fg); flex: 1; }

        /* 滑块位置调整区域 */
        #biliAnalysisSettingsPanel .custom-position-group { margin-top: 12px; padding: 16px; background: var(--bili-analysis-panel-bg-secondary); border-radius: 8px; display: none; }
        #biliAnalysisSettingsPanel .custom-position-group.show { display: block; }
        .slider-row { margin-bottom: 16px; }
        .slider-row:last-child { margin-bottom: 0; }
        .slider-label { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 14px; color: var(--bili-analysis-panel-fg-secondary); }
        .slider-label .value-input {
            font-weight: 600; color: #00aeec; width: 55px; text-align: right;
            padding: 4px 8px; border: 1px solid var(--bili-analysis-panel-input-border); border-radius: 4px; font-size: 14px;
            background: var(--bili-analysis-panel-bg-input); color: var(--bili-analysis-panel-fg);
        }
        .slider-label .value-input:focus { outline: none; border-color: #00aeec; }

        .slider-container { display: flex; align-items: center; gap: 12px; }
        .slider-container input[type="range"] {
            flex: 1; width: 100%; height: 6px; border-radius: 3px; background: var(--bili-analysis-panel-slider-bg);
            outline: none; -webkit-appearance: none; cursor: pointer;
        }
        .slider-container input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none; appearance: none; width: 18px; height: 18px;
            border-radius: 50%; background: #00aeec; cursor: pointer;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2); transition: all 0.2s;
        }
        .slider-container input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.2); box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3); }
        .position-tips { margin-top: 12px; font-size: 12px; color: var(--bili-analysis-panel-fg-muted); text-align: center; }

        /* 底部操作按钮 */
        #biliAnalysisSettingsPanel .settings-footer {
            padding: 20px; border-top: 1px solid var(--bili-analysis-panel-border); display: flex; justify-content: flex-end; gap: 12px;
            background: var(--bili-analysis-panel-footer-bg);
            border-radius: 0 0 16px 16px;
            flex-shrink: 0;
        }
        #biliAnalysisSettingsPanel .btn { padding: 10px 20px; border-radius: 6px; font-size: 14px; cursor: pointer; transition: all 0.2s; border: none; font-weight: 500; }
        #biliAnalysisSettingsPanel .btn-cancel { background: var(--bili-analysis-panel-btn-cancel-bg); color: var(--bili-analysis-panel-fg); }
        #biliAnalysisSettingsPanel .btn-cancel:hover { background: var(--bili-analysis-panel-btn-cancel-hover); }
        #biliAnalysisSettingsPanel .btn-save { background: #00aeec; color: white; }
        #biliAnalysisSettingsPanel .btn-save:hover { background: #0099d4; }
    `;

    // 执行初始化
    init();
})();
