// ==UserScript==
// @name         BiliBili云端解析
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      1.0.0
// @description  B站、网易云音乐云端解析脚本，支持自定义按钮位置与封面解析
// @author       原作者@Miro@鸭鸭 重构@Chitoseraame github.com/mmyo456/BiliAnalysis
// @match        https://www.bilibili.com/
// @match        https://www.bilibili.com/video*
// @match        https://www.bilibili.com/*bvid*
// @match        https://www.bilibili.com/v/popular*
// @match        https://www.bilibili.com/history*
// @match        https://live.bilibili.com/*
// @match        https://search.bilibili.com/*
// @match        https://space.bilibili.com/*
// @match        https://music.163.com/song?id=*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @require      https://i.ouo.chat/jsd/npm/jquery@3.7.1/dist/jquery.min.js#sha384=1H217gwSVyLSIfaLxHbE7dRb3v4mYCKbpQvzx0cegeju1MVsGrX5xXxAvs/HgeFs
// ==/UserScript==

(function () {
    'use strict';

    /* =========================================================================
     * 1. JS 主代码 (Main State & Initialization)
     * ========================================================================= */

    // --- 常量配置 ---
    const API_DOMAIN = "https://jx.ouo.chat/bl/";
    const DEFAULT_SETTINGS = { buttonPositions: ['top-left', 'bottom-right'] };

    // AV 转 BV 所需算法常量
    const XOR_CODE = 23442827791579n;
    const MAX_AID = 1n << 51n;
    const BASE = 58n;
    const BV_DATA = 'FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf';

    // 页面状态判断
    const currentUrl = window.location.href;
    const isVideoPage = currentUrl.includes('/video/') || currentUrl.includes('bvid=');
    // const isLivePage = currentUrl.includes('live.bilibili.com/') && /live\.bilibili\.com\/\d+/.test(currentUrl); 可以直接使用正则匹配，B站直播界面URL有变化。
    const isLivePage = /live\.bilibili\.com\/blanc\/\d+/.test(currentUrl);
    const isMusicPage = currentUrl.includes('music.163.com/song');

    // 状态缓存
    let createdButtons = [];

    // --- 初始化入口 ---
    function init() {
        // 1. 注入 CSS 样式
        GM_addStyle(APP_CSS);

        // 2. 注册油猴菜单
        GM_registerMenuCommand('⚙️ 按钮位置设置', showSettingsPanel);

        // 3. 生成主解析按钮
        generateFixedButtons();

        // 4. 延迟加载封面解析按钮，避免阻碍页面主渲染
        setTimeout(addCoverAnalysisButtons, 1000);

        // 5. 挂载 DOM 变动与滚动监听（用于动态加载的封面）
        const observer = new MutationObserver(debounce(addCoverAnalysisButtons, 300));
        observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('scroll', debounce(addCoverAnalysisButtons, 500));

        // 6. 监听窗口大小变化以更新自定义按钮位置
        window.addEventListener('resize', debounce(generateFixedButtons, 300));
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
     * 在页面中显示自毁式通知气泡
     * @param {string} message - 提示消息
     * @param {string} [type='success'] - 提示类型: 'success', 'info', 'warning', 'error'
     */
    function showToast(message, type = 'success') {
        // 清理现存提示框避免堆叠
        const existingToast = document.querySelector('.bili-analysis-toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = `bili-analysis-toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        // 使用帧动画触发过渡效果
        requestAnimationFrame(() => toast.classList.add('show'));

        // 3秒后自动隐藏并销毁
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    }

    /**
     * 统一处理生成解析链接并复制到剪贴板的逻辑
     * @param {string} targetUrl - 目标视频/直播源链接
     */
    function handleParseAndCopy(targetUrl) {
        try {
            const parseUrl = generateParseUrl(targetUrl);
            navigator.clipboard.writeText(parseUrl).then(() => {
                showToast('☁️ 解析成功，链接已复制到剪贴板', 'info');
            }).catch(err => {
                console.error('复制到剪贴板失败:', err);
                showToast('✗ 复制失败，请手动复制', 'error');
            });
        } catch (error) {
            console.error('生成解析链接失败:', error);
            showToast('✗ 生成解析链接失败', 'error');
        }
    }

    /**
     * 根据当前页面或传入的 URL 生成用于云端解析的 API 链接
     * @param {string} url - 目标页面 URL
     * @returns {string} 完整的解析 API 链接
     */
    function generateParseUrl(url) {
        if (url.includes("music.163.com") || url.includes("live.bilibili.com")) {
            return API_DOMAIN + "?url=" + url;
        }

        if (url.includes("bilibili.com")) {
            const bvMatch = url.match(/BV[0-9a-zA-Z]+/);
            const avMatch = url.match(/av(\d+)/);
            const pMatch = url.match(/[?&]p=(\d+)/);

            let videoId = bvMatch ? bvMatch[0] : (avMatch ? av2bv(avMatch[0]) : null);

            if (videoId) {
                const pageParam = pMatch ? `p=${pMatch[1]}` : "p=1";
                return `${API_DOMAIN}?url=${videoId}&${pageParam}`;
            }
        }
        return API_DOMAIN + "?url=" + url;
    }

    /**
     * 初始化/重置固定解析按钮
     */
    function generateFixedButtons() {
        // 先清理可能存在的旧按钮
        createdButtons.forEach(btn => btn.parentNode?.removeChild(btn));
        createdButtons = [];

        // 若不是可用页面，不渲染悬浮按钮
        if (!isVideoPage && !isLivePage && !isMusicPage) return;

        const { positions, customX, customY } = getButtonPositionSettings();

        // 遍历设置中的位置并生成按钮
        positions.forEach((position, index) => {
            const button = document.createElement('button');
            button.className = 'fixed-analysis-btn';
            button.id = `BiliAnalysis_${index}`;
            button.innerHTML = '云端<br>解析';
            button.dataset.positionType = position;

            // 根据类型绑定样式
            if (position === 'custom') {
                button.style.left = `calc(${customX} / 100 * (100vw - 45px))`;
                button.style.top = `calc(${customY} / 100 * (100vh - 45px))`;
                button.style.transform = 'none';
            } else {
                const styles = {
                    'top-left': { top: '150px', left: '0px' },
                    'top-right': { top: '150px', right: '0px' },
                    'bottom-left': { bottom: '20px', left: '0px' },
                    'bottom-right': { bottom: '20px', right: '0px' }
                };
                Object.assign(button.style, styles[position] || styles['top-left']);
            }

            button.addEventListener('click', () => handleParseAndCopy(window.location.href));

            document.body.appendChild(button);
            createdButtons.push(button);
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

        // 重置所有复选框
        document.querySelectorAll('#biliAnalysisSettingsPanel .checkbox-item input[type="checkbox"]').forEach(cb => cb.checked = false);

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

        generateFixedButtons();
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
            button.style.left = `calc(${x} / 100 * (100vw - 45px))`;
            button.style.top = `calc(${y} / 100 * (100vh - 45px))`;
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

        // 监听位置复选框变化
        document.querySelectorAll('#biliAnalysisSettingsPanel .checkbox-item input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                updateCustomPositionVisibility();
                if (cb.value === 'custom' && cb.checked) updateRealtimeButtons();
            });
        });

        // 绑定滑块与输入框联动
        bindSliderEvents('X');
        bindSliderEvents('Y');
    }

    /**
     * 为视频和直播封面提取对应ID并创建解析按钮
     * @param {Element} element - 触发元素
     * @param {string} type - 'video' 或是 'live'
     */
    function processCover(element, type) {
        const link = element.href || element.querySelector('a')?.href;
        if (!link || !element.querySelector('img')) return; // 确认具有有效链接和图片

        let id = null;
        let isLive = type === 'live';

        if (isLive) {
            const match = link.match(/live\.bilibili\.com\/(\d+)/);
            id = match ? match[1] : null;
        } else {
            const match = link.match(/\/(?:video|bvid=)\/?(BV[a-zA-Z0-9]+)/);
            id = match ? match[1] : null;
        }

        if (!id) return;

        // 避免重复渲染
        if (element.hasAttribute('data-bili-analysis-main')) return;
        element.setAttribute('data-bili-analysis-main', 'true');

        // 确保父容器具备定位上下文
        if (window.getComputedStyle(element).position === 'static') {
            element.style.position = 'relative';
        }

        // 堆叠计算，防止覆盖原有按钮
        const buttonCount = element.querySelectorAll('.video-cover-analysis-btn, .live-cover-analysis-btn').length;

        const btn = document.createElement('button');
        btn.className = isLive ? 'live-cover-analysis-btn' : 'video-cover-analysis-btn';
        btn.textContent = '云端解析';
        btn.style.bottom = `${5 + (buttonCount * 35)}px`;

        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const url = isLive ? `https://live.bilibili.com/${id}` : `https://www.bilibili.com/video/${id}`;
            handleParseAndCopy(url);
        });

        element.appendChild(btn);
    }

    /**
     * 扫描页面中符合特征的封面 DOM 并附加解析按钮
     */
    function addCoverAnalysisButtons() {
        const videoSelectors = [
            '.video-card .pic-box', '.bili-video-card .bili-video-card__image',
            '.small-item .cover', '.card-pic', 'a[href*="/video/BV"]',
            '.cover-container', '.list-item .cover'
        ];

        const liveSelectors = [
            'a[href*="live.bilibili.com"]', '.live-card .cover', '.room-card .cover'
        ];

        try {
            videoSelectors.forEach(sel => document.querySelectorAll(sel).forEach(el => processCover(el, 'video')));
            liveSelectors.forEach(sel => document.querySelectorAll(sel).forEach(el => processCover(el, 'live')));
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
                <h2>云端解析按钮设置</h2>
                <button class="close-btn" id="settingsCloseBtn">×</button>
            </div>
            <div class="settings-body">
                <div class="settings-section">
                    <h3>选择按钮显示位置</h3>
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
                        <div class="position-tips">💡 提示：拖动滑块或输入数字，按钮会实时在页面上移动</div>
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
        /* ----------------------- 通用消息提示框 ----------------------- */
        .bili-analysis-toast {
            position: fixed;
            bottom: -100px;
            left: 50%;
            transform: translateX(-50%);
            min-width: 250px;
            max-width: 400px;
            padding: 16px 24px;
            background-color: #52c41a;
            color: #fff;
            text-align: center;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            opacity: 0;
            transition: all 0.4s ease;
            z-index: 99999;
            font-size: 14px;
            font-weight: 500;
        }
        .bili-analysis-toast.show { bottom: 30px; opacity: 1; }
        .bili-analysis-toast.info { background-color: #00aeec; }
        .bili-analysis-toast.success { background-color: #52c41a; }
        .bili-analysis-toast.warning { background-color: #faad14; }
        .bili-analysis-toast.error { background-color: #f5222d; }

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
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.5); z-index: 99999; display: none;
        }
        #biliAnalysisSettingsOverlay.show { display: block; }

        #biliAnalysisSettingsPanel {
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 450px; max-width: 90vw; background: white; border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3); z-index: 100000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            display: none;
        }
        #biliAnalysisSettingsPanel.show { display: block; }
        #biliAnalysisSettingsPanel .settings-header {
            padding: 20px; border-bottom: 1px solid #e0e0e0;
            display: flex; justify-content: space-between; align-items: center;
        }
        #biliAnalysisSettingsPanel .settings-header h2 { margin: 0; font-size: 20px; color: #333; font-weight: 600; }
        #biliAnalysisSettingsPanel .settings-header .close-btn {
            background: none; border: none; font-size: 24px; cursor: pointer;
            color: #999; padding: 0; width: 30px; height: 30px;
            display: flex; align-items: center; justify-content: center; border-radius: 4px; transition: all 0.2s;
        }
        #biliAnalysisSettingsPanel .settings-header .close-btn:hover { background: #f0f0f0; color: #333; }

        #biliAnalysisSettingsPanel .settings-body { padding: 20px; }
        #biliAnalysisSettingsPanel .settings-section { margin-bottom: 20px; }
        #biliAnalysisSettingsPanel .settings-section:last-child { margin-bottom: 0; }
        #biliAnalysisSettingsPanel .settings-section h3 { margin: 0 0 12px 0; font-size: 16px; color: #333; font-weight: 500; }

        #biliAnalysisSettingsPanel .checkbox-group { display: flex; flex-direction: column; gap: 8px; }
        #biliAnalysisSettingsPanel .checkbox-item {
            display: flex; align-items: center; gap: 8px; cursor: pointer;
            padding: 8px 12px; border-radius: 6px; transition: background 0.2s;
        }
        #biliAnalysisSettingsPanel .checkbox-item:hover { background: #f5f5f5; }
        #biliAnalysisSettingsPanel .checkbox-item input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; accent-color: #00aeec; }
        #biliAnalysisSettingsPanel .checkbox-item label { cursor: pointer; font-size: 14px; color: #333; flex: 1; }

        /* 滑块位置调整区域 */
        #biliAnalysisSettingsPanel .custom-position-group { margin-top: 12px; padding: 16px; background: #f9f9f9; border-radius: 8px; display: none; }
        #biliAnalysisSettingsPanel .custom-position-group.show { display: block; }
        .slider-row { margin-bottom: 16px; }
        .slider-row:last-child { margin-bottom: 0; }
        .slider-label { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 14px; color: #666; }
        .slider-label .value-input {
            font-weight: 600; color: #00aeec; width: 55px; text-align: right;
            padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;
        }
        .slider-label .value-input:focus { outline: none; border-color: #00aeec; }

        .slider-container { display: flex; align-items: center; gap: 12px; }
        .slider-container input[type="range"] {
            flex: 1; width: 100%; height: 6px; border-radius: 3px; background: #e0e0e0;
            outline: none; -webkit-appearance: none; cursor: pointer;
        }
        .slider-container input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none; appearance: none; width: 18px; height: 18px;
            border-radius: 50%; background: #00aeec; cursor: pointer;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2); transition: all 0.2s;
        }
        .slider-container input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.2); box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3); }
        .position-tips { margin-top: 12px; font-size: 12px; color: #999; text-align: center; }

        /* 底部操作按钮 */
        #biliAnalysisSettingsPanel .settings-footer {
            padding: 20px; border-top: 1px solid #e0e0e0; display: flex; justify-content: flex-end; gap: 12px;
        }
        #biliAnalysisSettingsPanel .btn { padding: 10px 20px; border-radius: 6px; font-size: 14px; cursor: pointer; transition: all 0.2s; border: none; font-weight: 500; }
        #biliAnalysisSettingsPanel .btn-cancel { background: #f0f0f0; color: #333; }
        #biliAnalysisSettingsPanel .btn-cancel:hover { background: #e0e0e0; }
        #biliAnalysisSettingsPanel .btn-save { background: #00aeec; color: white; }
        #biliAnalysisSettingsPanel .btn-save:hover { background: #0099d4; }
    `;

    // 执行初始化
    init();
})();