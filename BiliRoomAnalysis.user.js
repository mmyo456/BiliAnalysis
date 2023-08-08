// ==UserScript==
// @name         BiliBili直播间本地解析(Miro)
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  try to take over the world!
// @author       Miro(https://vrchat.com/home/user/usr_20b8e0e4-9e16-406a-a61d-8a627ec1a2e3)
// @match        https://live.bilibili.com/*
// @downloadURL  https://raw.githubusercontent.com/529565622/BiliAnalysis/main/BiliRoomAnalysis.user.js
// @updateURL    https://raw.githubusercontent.com/529565622/BiliAnalysis/main/BiliRoomAnalysis.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';
    var button = document.createElement("button")
    button.textContent = "本地解析"
    button.style.width = "80px"
    button.style.align = "center"
    button.style.color = "#FFFFFF"
    button.style.background = "#00AEEC"
    button.style.border = "1px solid #F1F2F3"
    button.style.borderRadius = "6px"
    button.style.fontSize = '14px'
    button.addEventListener("click", clickBotton)
    setTimeout(function () {
        var like_comment = document.getElementsByClassName('flex-block')[0]
        like_comment.appendChild(button)
    }, 5000)
        setTimeout(function () {
        var like_comment = document.getElementsByClassName('flex-block')[0]
        like_comment.appendChild(button)
    }, 10000)
    function clickBotton() {
        var url = window.location.href
        var Roomid=/(?<=com\/).*?(?=\?hotRank)/
        var Roomid1 = url.match(Roomid)
        var httpRequest = new XMLHttpRequest();
        httpRequest.open('GET', 'https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id='+Roomid1+'&protocol=0,1&format=0,1,2&codec=0,1&qn=10000&platform=web&ptype=8&dolby=5&panorama=1', true);
        httpRequest.send();
        httpRequest.onreadystatechange = function () {
            if (httpRequest.readyState == 4 && httpRequest.status == 200) {
                var json = JSON.parse(httpRequest.responseText);
                var host = json.data.playurl_info.playurl.stream[1].format[1].codec[0].url_info[0].host
                console.log(host);
                var baseurl=json.data.playurl_info.playurl.stream[1].format[1].codec[0].base_url
                console.log(baseurl);
                var extra=json.data.playurl_info.playurl.stream[1].format[1].codec[0].url_info[0].extra
                console.log(extra);
                var roomurl=host+baseurl+extra
                navigator.clipboard.writeText(roomurl).catch(e => console.error(e))
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
        };
    }
})();
