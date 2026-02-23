// ==UserScript==
// @name         BiliBili直播间本地解析(Miro)
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.2.9
// @description  try to take over the world!
// @author       Miro 鸭鸭 github.com/mmyo456/BiliAnalysis
// @match        https://live.bilibili.com/*
// @downloadURL  https://i.ouo.chat/jsd/gh/mmyo456/BiliAnalysis@main/BiliRoomAnalysis.user.js
// @updateURL    https://i.ouo.chat/jsd/gh/mmyo456/BiliAnalysis@main/BiliRoomAnalysis.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @require      https://i.ouo.chat/jsd/npm/jquery@3.7.1/dist/jquery.min.js#sha384=1H217gwSVyLSIfaLxHbE7dRb3v4mYCKbpQvzx0cegeju1MVsGrX5xXxAvs/HgeFs
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
      #notificationBox img {
          display: block;
          margin: 0 auto 10px;
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
      <img src="https://jsd.onmicrosoft.cn/gh/mmyo456/BiliAnalysis@main/img/D26.gif" alt="图片" style="width: 50px; height: 50px;">
      <h3>解析成功</h3>
      <p>链接已复制到剪贴板</p>
  `;
  document.body.appendChild(notificationBox);

  var BiliAnalysisbutton = `<button id="BiliAnalysis" style="z-index:999; width: 45px;height:45px;color: rgb(255, 255, 255); background: rgb(0, 174, 236); border: 1px solid rgb(241, 242, 243); border-radius: 6px; font-size: 14px;top:800px;right:0px;position:fixed;">本地</br>解析</button>`;
  $("body").append(BiliAnalysisbutton);
  document.getElementById('BiliAnalysis').addEventListener('click', clickBotton);

  var BiliAnalysisbutton1 = `<button id="BiliAnalysis1" style="z-index:999; width: 45px;height:45px;color: rgb(255, 255, 255); background: rgb(0, 174, 236); border: 1px solid rgb(241, 242, 243); border-radius: 6px; font-size: 14px;top:100px;left:0px;position:fixed;">本地</br>解析</button>`;
  $("body").append(BiliAnalysisbutton1);
  document.getElementById('BiliAnalysis1').addEventListener('click', clickBotton);

  function clickBotton() {
    var url = window.location.href;
    var Roomid = /com\/(\d+)/;
    var Roomid1 = url.match(Roomid)[1];
    var httpRequest = new XMLHttpRequest();
    httpRequest.open('GET', 'https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id=' + Roomid1 + '&protocol=0,1&format=0,1,2&codec=0,1&qn=10000&platform=web&ptype=8&dolby=5&panorama=1', true);
    httpRequest.send();
    httpRequest.onreadystatechange = function () {
      if (httpRequest.readyState == 4 && httpRequest.status == 200) {
        var json = JSON.parse(httpRequest.responseText);
        var host = "";
        var baseurl = "";
        var extra = "";
        var roomurl;
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
        navigator.clipboard.writeText(roomurl).catch(e => console.error(e));

        // 显示弹出提示框
        notificationBox.classList.add('show');
        // 设置定时器，在10秒后自动隐藏提示框
        setTimeout(() => {
          notificationBox.classList.remove('show');
        }, 10000);
      }
    };
  }
})();
