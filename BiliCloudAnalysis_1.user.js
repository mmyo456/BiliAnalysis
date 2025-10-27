// ==UserScript==
// @name         BiliBili云端解析Dev
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.2.7
// @description  try to take over the world!
// @author       Miro 鸭鸭 github.com/mmyo456/BiliAnalysis
// @match        https://www.bilibili.com/video*
// @match        https://www.bilibili.com/*bvid*
// @match        https://live.bilibili.com/*
// @match        https://music.163.com/song?id=*
// @match        https://www.bilibili.com/
// @match        https://www.bilibili.com/v/popular*
// @match        https://www.bilibili.com/history*
// @match        https://search.bilibili.com/*
// @match        https://space.bilibili.com/*
// @downloadURL  https://raw.gitmirror.com/mmyo456/BiliAnalysis/main/BiliCloudAnalysis_1.user.js
// @updateURL    https://raw.gitmirror.com/mmyo456/BiliAnalysis/main/BiliCloudAnalysis_1.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_addStyle
// @require      https://testingcf.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js
// ==/UserScript==

// 20230405 修复解析1080p(需已登陆)
// 20230626 修复加载慢导致无法添加按钮
// 20230811 添加左上角和右下角解析按钮 加快按钮出现速度
// 20240305 适配网易云
// 20241029 重写了新的解析成功告知方式
// 20241031 换了提示图片
// 20250424 添加AV号支持 缩短解析成功弹窗时间
// 20250811 修复一些奇奇怪怪的bug？
// 20251021 重构URL生成逻辑 更新jQuery源
// 20251026 添加封面解析按钮功能

(function () {
    'use strict';

    // https://github.com/SocialSisterYi/bilibili-API-collect/blob/7b22c145d25f3ad725fce78c525254ebe60cf673/docs/misc/bvid_desc.md#javascripttypescript
    const XOR_CODE = 23442827791579n;
    const MAX_AID = 1n << 51n;
    const BASE = 58n;
    const data = 'FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf';

    /**
     * 将av转换为bv
     * @param {string} av
     * @returns BV
     */
    const av2bv = (av) => {
        const aid = av.startsWith('av') ? av.slice(2) : av;
        const bytes = ['B', 'V', '1', '0', '0', '0', '0', '0', '0', '0', '0', '0'];
        let bvIndex = bytes.length - 1;
        let tmp = (MAX_AID | BigInt(aid)) ^ XOR_CODE;
        while (tmp > 0) {
            bytes[bvIndex] = data[Number(tmp % BigInt(BASE))];
            tmp = tmp / BASE;
            bvIndex -= 1;
        }
        [bytes[3], bytes[9]] = [bytes[9], bytes[3]];
        [bytes[4], bytes[7]] = [bytes[7], bytes[4]];
        return bytes.join('');
    }

    // 添加提示框的样式
    GM_addStyle(`
        #notificationBox {
            position: fixed;
            bottom: -100px; /* 初始位置在视口之外 */
            left: 50%;
            transform: translateX(-50%);
            width: 300px;
            padding: 20px;
            background-color: #333;
            color: #fff;
            text-align: center;
            border-radius: 10px;
            box-shadow: 0px 4px 10px rgba(0, 0, 0, 0.3);
            opacity: 0;
            transition: all 0.5s ease;
            z-index: 9999;
        }
        #notificationBox h3 {
            color: #fff; /* 使“解析成功”文本为白色 */
        }
        #notificationBox.show {
            bottom: 20px; /* 提示框弹出位置 */
            opacity: 1;
        }

        /* 封面解析按钮样式 */
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

        .live-cover-analysis-btn {
            background: rgba(242, 82, 154, 0.9) !important;
        }

        .live-cover-analysis-btn:hover {
            background: rgba(242, 82, 154, 1) !important;
        }
    `);

    // 创建提示框元素
    const notificationBox = document.createElement('div');
    notificationBox.id = 'notificationBox';
    notificationBox.innerHTML = `
        <img src="https://i.ouo.chat/api/img/D25.gif" alt="图片" style="width: 50px; height: 50px;">
        <h3>解析成功</h3>
        <p>链接已复制到剪贴板</p>
    `;
    document.body.appendChild(notificationBox);

    // 判断是否为视频播放页面或直播页面
    const isVideoPage = window.location.href.includes('/video/') || window.location.href.includes('bvid=');
    const isLivePage = window.location.href.includes('live.bilibili.com/') && /live\.bilibili\.com\/\d+/.test(window.location.href);
    const isMusicPage = window.location.href.includes('music.163.com/song');

    // 只在视频播放页、直播页和音乐页显示固定解析按钮
    if (isVideoPage || isLivePage || isMusicPage) {
        // 解析按钮样式
        var BiliAnalysisbutton = `<button id="BiliAnalysis6" class="fixed-analysis-btn" style="z-index:999;width: 45px;height:45px;color: rgb(255, 255, 255); background: rgb(0, 174, 236); border: 1px solid rgb(241, 242, 243); border-radius: 6px; font-size: 14px;top:900px;right:0px;position:fixed;">云端</br>解析ya</button>`;
        $("body").append(BiliAnalysisbutton);
        document.getElementById('BiliAnalysis6').addEventListener('click', clickButton);

        var BiliAnalysisbutton1 = `<button id="BiliAnalysis7" class="fixed-analysis-btn" style="z-index:999;width: 45px;height:45px;color: rgb(255, 255, 255); background: rgb(0, 174, 236); border: 1px solid rgb(241, 242, 243); border-radius: 6px; font-size: 14px;top:200px;left:0px;position:fixed;">云端</br>解析ya</button>`;
        $("body").append(BiliAnalysisbutton1);
        document.getElementById('BiliAnalysis7').addEventListener('click', clickButton);
    }


    // 配置域名
    const API_DOMAIN = "https://bil.ouo.chat/player/";

    /**
     * 生成解析URL
     * @param {string} currentUrl 当前页面URL
     * @returns {string} 解析URL
     */
    function generateParseUrl(currentUrl) {
        if (currentUrl.includes("music.163.com")) {
            // 处理网易云音乐 URL
            return API_DOMAIN + "?url=" + currentUrl;
        }

        if (currentUrl.includes("bilibili.com")) {
            // 处理 Bilibili 视频 URL
            const bvMatch = currentUrl.match(/BV[0-9a-zA-Z]+/);
            const avMatch = currentUrl.match(/av(\d+)/);
            const pMatch = currentUrl.match(/[?&]p=(\d+)/);

            let videoId = null;
            if (bvMatch) {
                videoId = bvMatch[0];
            } else if (avMatch) {
                videoId = av2bv(avMatch[0]);
            }

            if (videoId) {
                const pageParam = pMatch ? `p=${pMatch[1]}` : "p=1";
                return API_DOMAIN + "?url=" + videoId + "&" + pageParam;
            }
        }

        // 兜底：直接使用当前URL
        return API_DOMAIN + "?url=" + currentUrl;
    }

    // 弹出提示框并复制链接
    function clickButton() {
        try {
            const currentUrl = window.location.href;
            const parseUrl = generateParseUrl(currentUrl);

            // 复制链接到剪贴板
            navigator.clipboard.writeText(parseUrl).then(() => {
                // 显示提示框
                notificationBox.classList.add('show');
                // 设置定时器，在5秒后自动隐藏提示框
                setTimeout(() => {
                    notificationBox.classList.remove('show');
                }, 5000);
            }).catch(err => {
                console.error('复制到剪贴板失败:', err);
                // 兜底方案：显示错误提示
                alert('复制失败，请手动复制：\n' + parseUrl);
            });
        } catch (error) {
            console.error('生成解析链接失败:', error);
        }
    }

    // 封面解析功能

    /**
     * 从链接中提取视频ID
     * @param {string} link - 视频链接
     * @returns {string|null} BV号或null
     */
    function extractVideoId(link) {
        if (!link) return null;

        // 提取BV号
        if (link.includes('/video/')) {
            const match = link.match(/\/video\/(BV[a-zA-Z0-9]+)/);
            return match ? match[1] : null;
        } else if (link.includes('bvid=')) {
            const match = link.match(/bvid=(BV[a-zA-Z0-9]+)/);
            return match ? match[1] : null;
        }

        return null;
    }

    /**
     * 从链接中提取直播房间ID
     * @param {string} link - 直播链接
     * @returns {string|null} 房间ID或null
     */
    function extractLiveRoomId(link) {
        if (!link || !link.includes('live.bilibili.com')) return null;

        const match = link.match(/live\.bilibili\.com\/(\d+)/);
        return match ? match[1] : null;
    }

    /**
     * 创建封面解析按钮
     * @param {Element} coverElement - 封面元素
     * @param {string} id - 视频ID或房间ID
     * @param {boolean} isLive - 是否为直播
     */
    function createCoverButton(coverElement, id, isLive) {
        // 使用唯一标识避免多脚本冲突
        const uniqueAttr = 'data-bili-analysis-dev';
        const btnClass = isLive ? 'live-cover-analysis-btn' : 'video-cover-analysis-btn';

        // 检查是否已经被当前脚本处理过
        if (coverElement.hasAttribute(uniqueAttr)) {
            return;
        }

        // 标记已处理，避免重复
        coverElement.setAttribute(uniqueAttr, 'true');

        // 确保父元素是相对定位
        const computedStyle = window.getComputedStyle(coverElement);
        if (computedStyle.position === 'static') {
            coverElement.style.position = 'relative';
        }

        // 计算已存在的按钮数量，用于向上堆叠
        const existingButtons = coverElement.querySelectorAll('.video-cover-analysis-btn, .live-cover-analysis-btn');
        const buttonCount = existingButtons.length;
        const bottomOffset = 5 + (buttonCount * 35); // 每个按钮向上堆叠35px

        // 创建按钮
        const btn = document.createElement('button');
        btn.className = btnClass;
        btn.textContent = isLive ? '云端解析ya' : '云端解析ya';
        btn.dataset.id = id;
        btn.dataset.isLive = isLive;
        btn.dataset.scriptVersion = 'dev'; // 标识来源

        // 设置按钮位置（向上堆叠）
        btn.style.bottom = bottomOffset + 'px';

        // 添加点击事件
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();

            const videoId = this.dataset.id;
            const isLiveVideo = this.dataset.isLive === 'true';

            // 生成解析URL
            let parseUrl;
            if (isLiveVideo) {
                parseUrl = API_DOMAIN + "?url=https://live.bilibili.com/" + videoId;
            } else {
                parseUrl = API_DOMAIN + "?url=" + videoId + "&p=1";
            }

            // 复制到剪贴板
            navigator.clipboard.writeText(parseUrl).then(() => {
                notificationBox.classList.add('show');
                setTimeout(() => {
                    notificationBox.classList.remove('show');
                }, 5000);
            }).catch(err => {
                console.error('复制失败:', err);
                alert('复制失败，请手动复制：\n' + parseUrl);
            });
        });

        // 添加按钮到封面
        coverElement.appendChild(btn);
    }

    /**
     * 处理视频封面元素
     * @param {Element} element - 封面元素
     */
    function processVideoCover(element) {
        // 获取视频链接
        const link = element.href || element.querySelector('a')?.href;
        if (!link) return;

        // 提取视频ID
        const videoId = extractVideoId(link);
        if (!videoId) return;

        // 确认包含图片才是封面
        if (!element.querySelector('img')) return;

        // 创建解析按钮
        createCoverButton(element, videoId, false);
    }

    /**
     * 处理直播封面元素
     * @param {Element} element - 封面元素
     */
    function processLiveCover(element) {
        // 获取直播链接
        const link = element.href || element.querySelector('a')?.href;
        if (!link) return;

        // 提取房间ID
        const roomId = extractLiveRoomId(link);
        if (!roomId) return;

        // 确认包含图片才是封面
        if (!element.querySelector('img')) return;

        // 创建解析按钮
        createCoverButton(element, roomId, true);
    }

    /**
     * 添加封面解析按钮
     */
    function addCoverAnalysisButtons() {
        // 视频封面选择器
        const videoSelectors = [
            '.video-card .pic-box',
            '.bili-video-card .bili-video-card__image',
            '.small-item .cover',
            '.card-pic',
            'a[href*="/video/BV"]',
            '.cover-container',
            '.list-item .cover'
        ];

        // 直播封面选择器
        const liveSelectors = [
            'a[href*="live.bilibili.com"]',
            '.live-card .cover',
            '.room-card .cover'
        ];

        // 处理视频封面
        videoSelectors.forEach(selector => {
            try {
                document.querySelectorAll(selector).forEach(element => {
                    processVideoCover(element);
                });
            } catch (e) {
                console.error('处理视频封面出错:', e);
            }
        });

        // 处理直播封面
        liveSelectors.forEach(selector => {
            try {
                document.querySelectorAll(selector).forEach(element => {
                    processLiveCover(element);
                });
            } catch (e) {
                console.error('处理直播封面出错:', e);
            }
        });
    }

    // 防抖函数
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

    // 初始执行
    setTimeout(() => {
        addCoverAnalysisButtons();
    }, 1000);

    // 监听DOM变化，为新加载的封面添加按钮
    const observer = new MutationObserver(debounce(function() {
        addCoverAnalysisButtons();
    }, 300));

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // 监听滚动事件
    window.addEventListener('scroll', debounce(function() {
        addCoverAnalysisButtons();
    }, 500));

})();