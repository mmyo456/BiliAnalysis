// ==UserScript==
// @name         BiliBili云端解析Dev
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.5Dev1
// @description  try to take over the world!
// @author       Miro
// @match        https://www.bilibili.com/video*
// @match        https://www.bilibili.com/*bvid*
// @match        https://live.bilibili.com/*
// @match        https://music.163.com/song?id=*
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_addStyle
// @require      https://lf26-cdn-tos.bytecdntp.com/cdn/expire-1-M/jquery/3.2.1/jquery.min.js
// ==/UserScript==

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
        const url = window.location.href;
        navigator.clipboard.writeText("https://bil.ouo.chat/player/?url=" + url).then(() => {
            // 显示提示框
            notificationBox.classList.add('show');
            // 设置定时器，在10秒后自动隐藏提示框
            setTimeout(() => {
                notificationBox.classList.remove('show');
            }, 10000);
        }).catch(e => console.error(e));
    }
})();
