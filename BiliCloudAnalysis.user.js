// ==UserScript==
// @name         BiliBili云端解析
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  try to take over the world!
// @author       Miro(https://vrchat.com/home/user/usr_20b8e0e4-9e16-406a-a61d-8a627ec1a2e3)
// @match        https://www.bilibili.com/video*
// @match        https://www.bilibili.com/*bvid*
// @match        https://live.bilibili.com/*
// @match        https://music.163.com/song?id=*
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @require      https://lf26-cdn-tos.bytecdntp.com/cdn/expire-1-M/jquery/3.2.1/jquery.min.js
// ==/UserScript==
//20230405 修复解析1080p(需已登陆)
//20230626 修复加载慢导致无法添加按钮
//20230811 添加左上角和右下角解析按钮 加快按钮出现速度
(function () {
    'use strict';
    var BiliAnalysisbutton = `<button id="BiliAnalysis6" style="z-index:999;width: 40px;color: rgb(255, 255, 255); background: rgb(0, 174, 236); border: 1px solid rgb(241, 242, 243); border-radius: 6px; font-size: 14px;top:850px;right:0px;position:fixed;">云端解析</button>`;
    $("body").append(BiliAnalysisbutton)
    document.getElementById('BiliAnalysis6').addEventListener('click', clickBotton1)
    var BiliAnalysisbutton1 = `<button id="BiliAnalysis7" style="z-index:999;width: 40px;color: rgb(255, 255, 255); background: rgb(0, 174, 236); border: 1px solid rgb(241, 242, 243); border-radius: 6px; font-size: 14px;top:150px;left:0px;position:fixed;">云端解析</button>`;
    $("body").append(BiliAnalysisbutton1)
    document.getElementById('BiliAnalysis7').addEventListener('click', clickBotton1)
    function clickBotton1() {

        var url = window.location.href
     navigator.clipboard.writeText("https://jx.91vrchat.com/bl/?url="+url).catch(e => console.error(e))
        GM_notification({
            title: "解析成功",
            image: "https://i0.hdslb.com/bfs/archive/86848c76a76fe46d84d6ef1ab735d9398ed3ee8e.png",
            text: "解析成功",
            highlight: true,
            silent: false,
            timeout: 10000,
            onclick: function () {
            },
            ondone() {
            }
        })
    }
})();
