// ==UserScript==
// @name         BiliBili本地解析(Miro)
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.2.8
// @description  try to take over the world!
// @author       Miro 鸭鸭 github.com/mmyo456/BiliAnalysis
// @match        https://www.bilibili.com/video*
// @match        https://www.bilibili.com/*bvid*
// @match        https://www.bilibili.com/
// @match        https://www.bilibili.com/v/popular*
// @match        https://search.bilibili.com/*
// @match        https://space.bilibili.com/*
// @downloadURL  https://jsd.onmicrosoft.cn/gh/mmyo456/BiliAnalysis@main/BiliAnalysis.user.js
// @updateURL    https://jsd.onmicrosoft.cn/gh/mmyo456/BiliAnalysis@main/BiliAnalysis.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @require      https://jsd.onmicrosoft.cn/npm/jquery@3.7.1/dist/jquery.min.js
// ==/UserScript==
//20240521 移除多余按钮
//20230405 修复解析1080p(需已登陆)
//20230626 修复加载慢导致无法添加按钮
//20230811 添加左上角和右下角解析按钮 加快按钮出现速度
//20241029 重写了新的解析成功告知方式
//20241031 小修小补
//20250424 添加AV号支持 缩短解析成功弹窗时间
//20250610 修复本地解析分p匹配非数字 新增CID报错提示
//20250811 修复一些奇奇怪怪的bug？
//20251026 添加封面解析按钮功能

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
          bottom: -100px;
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
      #notificationBox.show {
          bottom: 20px;
          opacity: 1;
      }
      
      /* 封面解析按钮样式 */
      .video-cover-analysis-btn {
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
      a:hover .video-cover-analysis-btn,
      .video-card:hover .video-cover-analysis-btn,
      .bili-video-card:hover .video-cover-analysis-btn,
      [class*="cover"]:hover .video-cover-analysis-btn {
          opacity: 1 !important;
      }
      
      .video-cover-analysis-btn:hover {
          background: rgba(0, 174, 236, 1) !important;
          transform: scale(1.05) !important;
          box-shadow: 0 3px 6px rgba(0,0,0,0.4) !important;
          opacity: 1 !important;
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

  // 判断是否为视频播放页面
  const isVideoPage = window.location.href.includes('/video/') || window.location.href.includes('bvid=');
  
  // 只在视频播放页显示固定解析按钮
  if (isVideoPage) {
    // 创建右下角解析按钮
    const BiliAnalysisbutton = `<button id="BiliAnalysis" style="z-index:999;width: 45px;height:45px;color: rgb(255, 255, 255); background: rgb(0, 174, 236); border: 1px solid rgb(241, 242, 243); border-radius: 6px; font-size: 14px;top:800px;right:0px;position:fixed;">本地</br>解析</button>`;
    $("body").append(BiliAnalysisbutton);
    document.getElementById('BiliAnalysis').addEventListener('click', clickBotton);

    // 创建左上角解析按钮
    const BiliAnalysisbutton1 = `<button id="BiliAnalysis1" style="z-index:999;width: 45px;height:45px;color: rgb(255, 255, 255); background: rgb(0, 174, 236); border: 1px solid rgb(241, 242, 243); border-radius: 6px; font-size: 14px;top:100px;left:0px;position:fixed;">本地</br>解析</button>`;
    $("body").append(BiliAnalysisbutton1);
    document.getElementById('BiliAnalysis1').addEventListener('click', clickBotton);
  }

  // 按钮点击事件
  function clickBotton() {
    const url = window.location.href;
    const BV = /BV[0-9a-zA-Z]+/;
    const AV = /av[0-9]+/;
    const P = /p=(\d+)\b/;
    let BV1 = url.match(BV);
    let P1 = 1; // 默认值为数字 1

    if (BV1) {
      BV1 = BV1[0]; // 提取匹配的BV号
    } else {
      BV1 = url.match(/(?<=bvid=)[^&]+/);
      if (BV1) {
        BV1 = BV1[0];
      } else {
        const AV1 = url.match(AV);
        if (AV1) {
          BV1 = av2bv(AV1[0]);
        } else {
          showNotification('解析失败', '未找到有效的BV号或AV号', false);
          return;
        }
      }
    }

    const P1Match = url.match(P);
    if (P1Match) {
      P1 = parseInt(P1Match[1], 10) || 1;
    }

    // 调用解析逻辑
    parseLocalVideo(BV1, P1);
  }

  /**
   * 显示通知提示框
   * @param {string} title - 标题
   * @param {string} message - 消息内容
   */
  function showNotification(title, message, isSuccess = true) {
    notificationBox.innerHTML = `
      <img src="https://testingcf.jsdelivr.net/gh/mmyo456/BiliAnalysis@main/img/D26.gif" alt="图片" style="width: 50px; height: 50px;">
      <h3>${title}</h3>
      <p>${message}</p>
    `;
    notificationBox.classList.add('show');
    setTimeout(() => notificationBox.classList.remove('show'), 5000);
  }

  /**
   * 本地解析视频
   * @param {string} bvid - 视频BV号
   * @param {number} page - 分P页码
   */
  function parseLocalVideo(bvid, page) {
    // 获取cid
    const httpRequest = new XMLHttpRequest();
    httpRequest.open('GET', 'https://api.bilibili.com/x/player/pagelist?bvid=' + bvid, true);
    httpRequest.send();
    httpRequest.onreadystatechange = function () {
      if (httpRequest.readyState === 4) {
        if (httpRequest.status === 200) {
          let json;
          try {
            json = JSON.parse(httpRequest.responseText);
          } catch (e) {
            console.error("解析JSON失败:", e);
            showNotification('解析失败', '无法解析视频信息', false);
            return;
          }
          if (!json.data || !json.data[page - 1]) {
            console.error("无效的分P或无数据");
            showNotification('解析失败', '无效的分P或视频数据不可用', false);
            return;
          }
          const cid = json.data[page - 1].cid;
          console.log("CID:", cid);

          // 获取视频链接
          const httpRequest1 = new XMLHttpRequest();
          httpRequest1.open('GET', 'https://api.bilibili.com/x/player/playurl?bvid=' + bvid + '&cid=' + cid + '&qn=116&type=&otype=json&platform=html5&high_quality=1', true);
          httpRequest1.withCredentials = true;
          httpRequest1.send();
          httpRequest1.onreadystatechange = function () {
            if (httpRequest1.readyState === 4) {
              if (httpRequest1.status === 200) {
                let json;
                try {
                  json = JSON.parse(httpRequest1.responseText);
                } catch (e) {
                  console.error("解析JSON失败:", e);
                  showNotification('解析失败', '无法解析视频链接', false);
                  return;
                }
                if (!json.data || !json.data.durl || !json.data.durl[0]) {
                  console.error("无法获取视频链接");
                  showNotification('解析失败', '无法获取视频链接', false);
                  return;
                }
                
                const videoUrl = json.data.durl[0].url;
                console.log("视频链接:", videoUrl);
                
                // 复制到剪贴板
                navigator.clipboard.writeText(videoUrl).then(() => {
                  showNotification('解析成功', '链接已复制到剪贴板', true);
                }).catch(e => {
                  console.error("剪贴板写入失败:", e);
                  showNotification('解析成功', '链接解析成功，但剪贴板写入失败', true);
                });
              } else {
                console.error("视频链接请求失败，状态码:", httpRequest1.status);
                showNotification('解析失败', `无法获取视频链接（状态码: ${httpRequest1.status}）`, false);
              }
            }
          };
        } else {
          console.error("CID请求失败，状态码:", httpRequest.status);
          showNotification('解析失败', `无法获取视频信息（状态码: ${httpRequest.status}）`, false);
        }
      }
    };
  }

//封面解析功能
  
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
   * 创建封面解析按钮
   * @param {Element} coverElement - 封面元素
   * @param {string} videoId - 视频ID
   */
  function createCoverButton(coverElement, videoId) {
    // 使用唯一标识避免多脚本冲突
    const uniqueAttr = 'data-bili-analysis-local';
    const btnClass = 'video-cover-analysis-btn';
    
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
    const existingButtons = coverElement.querySelectorAll('.video-cover-analysis-btn');
    const buttonCount = existingButtons.length;
    const bottomOffset = 5 + (buttonCount * 35); // 每个按钮向上堆叠35px
    
    // 创建按钮
    const btn = document.createElement('button');
    btn.className = btnClass;
    btn.textContent = '本地解析';
    btn.dataset.id = videoId;
    btn.dataset.scriptVersion = 'local'; // 标识来源
    
    // 设置按钮位置（向上堆叠）
    btn.style.bottom = bottomOffset + 'px';
    
    // 添加点击事件
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      const bvid = this.dataset.id;
      
      // 调用本地解析逻辑
      parseLocalVideo(bvid, 1); // 默认第一分P
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
    createCoverButton(element, videoId);
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
