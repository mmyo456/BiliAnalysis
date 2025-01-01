// ==UserScript==
// @name         BiliBili云端解析Dev
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.9
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

(function () {
    'use strict';

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
        // 正则获取BVID
        const bvID = window.location.href.match(/BV[0-9a-zA-Z]*/);
        const bvParam = bvID ? bvID[0] : "获取BV号失败";

        // 正则获取视频P数
        const pID = window.location.href.match(/p=[0-9]*/);
        const pParam = pID ? pID[0] : "p=1"; // 如果没有找到p参数，默认设置为 p=1

        // 判断 URL 是否已有查询参数，如果已有，就用 & 连接，否则用 ? 连接
        let url = "https://bil.ouo.chat/player/?url=" + bvParam;
        if (url.indexOf('?') === -1) {
            // 如果没有 ? ，则开始新的查询参数
            url += "?" + pParam;
        } else {
            // 如果已经有 ? ，则用 & 连接
            url += "&" + pParam;
        }

        // 复制链接到剪贴板
        navigator.clipboard.writeText(url).then(() => {
            // 显示提示框
            notificationBox.classList.add('show');
            // 设置定时器，在10秒后自动隐藏提示框
            setTimeout(() => {
                notificationBox.classList.remove('show');
            }, 10000);
        }).catch(e => console.error(e));
    }
})();
