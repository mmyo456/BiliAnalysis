// ==UserScript==
// @name         BiliBili云端解析
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.4
// @description  try to take over the world!
// @author       Miro(https://vrchat.com/home/user/usr_20b8e0e4-9e16-406a-a61d-8a627ec1a2e3)
// @match        https://www.bilibili.com/video*
// @match        https://www.bilibili.com/*bvid*
// @match        https://live.bilibili.com/*
// @match        https://music.163.com/song?id=*
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @require      https://lf26-cdn-tos.bytecdntp.com/cdn/expire-1-M/jquery/3.2.1/jquery.min.js
// ==/UserScript==
//20230405 修复解析1080p(需已登陆)
//20230626 修复加载慢导致无法添加按钮
//20230811 添加左上角和右下角解析按钮 加快按钮出现速度
(function () {
    'use strict';
    // 创建右下角解析按钮
    var BiliAnalysisbutton = `<button id="BiliAnalysis8" style="z-index:999;width: 40px;height:45px;color: rgb(255, 255, 255); background: rgb(0, 174, 236); border: 1px solid rgb(241, 242, 243); border-radius: 6px; font-size: 14px;top:900px;right:0px;position:fixed;">云端</br>解析</button>`;
    $("body").append(BiliAnalysisbutton)
    document.getElementById('BiliAnalysis8').addEventListener('click', clickBotton1)

    // 创建左上角解析按钮
    var BiliAnalysisbutton1 = `<button id="BiliAnalysis9" style="z-index:999;width: 40px;height:45px;color: rgb(255, 255, 255); background: rgb(0, 174, 236); border: 1px solid rgb(241, 242, 243); border-radius: 6px; font-size: 14px;top:200px;left:0px;position:fixed;">云端</br>解析</button>`;
    $("body").append(BiliAnalysisbutton1)
    document.getElementById('BiliAnalysis9').addEventListener('click', clickBotton1)
    function clickBotton1() {

        var url = window.location.href
     navigator.clipboard.writeText("https://jx.91vrchat.com/bl/?url="+url).catch(e => console.error(e))
        GM_notification({
            title: "解析成功",
            image: "https://testingcf.jsdelivr.net/gh/mmyo456/BiliAnalysis-1@main/img/6.jpg",
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
