// ==UserScript==
// @name         BiliBili直播间本地解析(Miro)
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.3
// @description  try to take over the world!
// @author       Miro(https://vrchat.com/home/user/usr_20b8e0e4-9e16-406a-a61d-8a627ec1a2e3)
// @match        https://live.bilibili.com/*
// @downloadURL  https://raw.githubusercontent.com/529565622/BiliAnalysis/main/BiliRoomAnalysis.user.js
// @updateURL    https://raw.githubusercontent.com/529565622/BiliAnalysis/main/BiliRoomAnalysis.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @require      https://lf26-cdn-tos.bytecdntp.com/cdn/expire-1-M/jquery/3.2.1/jquery.min.js
// ==/UserScript==

(function () {
  'use strict';
  var BiliAnalysisbutton = `<button id="BiliAnalysis" style="z-index:999; width: 45px;height:45px;color: rgb(255, 255, 255); background: rgb(0, 174, 236); border: 1px solid rgb(241, 242, 243); border-radius: 6px; font-size: 14px;top:800px;right:0px;position:fixed;">本地</br>解析</button>`;
  $("body").append(BiliAnalysisbutton)
  document.getElementById('BiliAnalysis').addEventListener('click', clickBotton)
  var BiliAnalysisbutton1 = `<button id="BiliAnalysis1" style="z-index:999; width: 45px;height:45px;color: rgb(255, 255, 255); background: rgb(0, 174, 236); border: 1px solid rgb(241, 242, 243); border-radius: 6px; font-size: 14px;top:100px;left:0px;position:fixed;">本地</br>解析</button>`;
  $("body").append(BiliAnalysisbutton1)
  document.getElementById('BiliAnalysis1').addEventListener('click', clickBotton)
  function clickBotton() {
    var url = window.location.href
    var Roomid = /com\/(\d+)/
    var Roomid1 = url.match(Roomid)[1]
    var httpRequest = new XMLHttpRequest();
    httpRequest.open('GET', 'https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id=' + Roomid1 + '&protocol=0,1&format=0,1,2&codec=0,1&qn=10000&platform=web&ptype=8&dolby=5&panorama=1', true);
    httpRequest.send();
    httpRequest.onreadystatechange = function () {
      if (httpRequest.readyState == 4 && httpRequest.status == 200) {
        var json = JSON.parse(httpRequest.responseText);
        var host = "";
        var baseurl = "";
        var extra = "";
        var roomurl
        if (json.data.playurl_info.playurl.stream[1] && json.data.playurl_info.playurl.stream[1].format[1] && json.data.playurl_info.playurl.stream[1].format[1].codec[0]) {
          host = json.data.playurl_info.playurl.stream[1].format[1].codec[0].url_info[0].host;
          baseurl = json.data.playurl_info.playurl.stream[1].format[1].codec[0].base_url;
          extra = json.data.playurl_info.playurl.stream[1].format[1].codec[0].url_info[0].extra;
        } else if (json.data.playurl_info.playurl.stream[1] && json.data.playurl_info.playurl.stream[1].format[0] && json.data.playurl_info.playurl.stream[1].format[0].codec[0]) {
          host = json.data.playurl_info.playurl.stream[1].format[0].codec[0].url_info[0].host;
          baseurl = json.data.playurl_info.playurl.stream[1].format[0].codec[0].base_url;
          extra = json.data.playurl_info.playurl.stream[1].format[0].codec[0].url_info[0].extra;
        } else if (json.data.playurl_info.playurl.stream[0] && json.data.playurl_info.playurl.stream[0].format[0] && json.data.playurl_info.playurl.stream[0].format[0].codec[0]) {
          host = json.data.playurl_info.playurl.stream[0].format[0].codec[0].url_info[0].host;
          baseurl = json.data.playurl_info.playurl.stream[0].format[0].codec[0].base_url;
          extra = json.data.playurl_info.playurl.stream[0].format[0].codec[0].url_info[0].extra;
        }
        roomurl = host + baseurl + extra;
        navigator.clipboard.writeText(roomurl).catch(e => console.error(e))
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
    };
  }
})();
