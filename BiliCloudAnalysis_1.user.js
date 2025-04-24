// ==UserScript==
// @name         BiliBili云端解析Dev
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.2.3
// @description  try to take over the world!
// @author       Miro 鸭鸭 github.com/mmyo456/BiliAnalysis
// @match        https://www.bilibili.com/video*
// @match        https://www.bilibili.com/*bvid*
// @match        https://live.bilibili.com/*
// @match        https://music.163.com/song?id=*
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_addStyle
// @require      https://lf26-cdn-tos.bytecdntp.com/cdn/expire-1-M/jquery/3.2.1/jquery.min.js
// ==/UserScript==

//20230405 修复解析1080p(需已登陆)
//20230626 修复加载慢导致无法添加按钮
//20230811 添加左上角和右下角解析按钮 加快按钮出现速度
//20240305 适配网易云
//20241029 重写了新的解析成功告知方式
//20250424 添加AV号支持 缩短解析成功弹窗时间

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
    `);

    // 创建提示框元素
    const notificationBox = document.createElement('div');
    notificationBox.id = 'notificationBox';
    notificationBox.innerHTML = `
        <img src="https://i.ouo.chat/api/img/DLC3.gif" alt="图片" style="width: 50px; height: 50px;">
        <h3>解析成功</h3>
        <p>链接已复制到剪贴板</p>
    `;
    document.body.appendChild(notificationBox);

    // 解析按钮样式
    var BiliAnalysisbutton = `<button id="BiliAnalysis6" style="z-index:999;width: 45px;height:45px;color: rgb(255, 255, 255); background: rgb(0, 174, 236); border: 1px solid rgb(241, 242, 243); border-radius: 6px; font-size: 14px;top:900px;right:0px;position:fixed;">云端</br>解析ya</button>`;
    $("body").append(BiliAnalysisbutton);
    document.getElementById('BiliAnalysis6').addEventListener('click', clickButton);

    var BiliAnalysisbutton1 = `<button id="BiliAnalysis7" style="z-index:999;width: 45px;height:45px;color: rgb(255, 255, 255); background: rgb(0, 174, 236); border: 1px solid rgb(241, 242, 243); border-radius: 6px; font-size: 14px;top:200px;left:0px;position:fixed;">云端</br>解析ya</button>`;
    $("body").append(BiliAnalysisbutton1);
    document.getElementById('BiliAnalysis7').addEventListener('click', clickButton);

    // 弹出提示框并复制链接
    function clickButton() {
        /** @type {string} */
        let url;
        const currentUrl = window.location.href;

        if (currentUrl.includes("music.163.com")) {
            // 处理网易云 URL
            url = "https://jx.91vrchat.com/bl/?url=" + currentUrl;
        } else {
            // 处理 Bilibili 视频 URL
            const bvID = currentUrl.match(/BV[0-9a-zA-Z]*/);
            const avID = currentUrl.match(/av[0-9]*/);
            const bvParam = bvID ? bvID[0] : avID[0] ? av2bv(avID[0]) : null;
            const pID = currentUrl.match(/p=[0-9]*/);
            const pParam = pID ? pID[0] : "p=1";

            url = bvParam
                ? "https://bil.ouo.chat/player/?url=" + bvParam + "&" + pParam
                : "https://bil.ouo.chat/player/?url=" + currentUrl;
        }

        // 复制链接到剪贴板
        navigator.clipboard.writeText(url).then(() => {
            // 显示提示框
            notificationBox.classList.add('show');
            // 设置定时器，在5秒后自动隐藏提示框
            setTimeout(() => {
                notificationBox.classList.remove('show');
            }, 5000);
        }).catch(e => console.error(e));
    }
})();