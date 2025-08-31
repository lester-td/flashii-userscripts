// ==UserScript==
// @name         Flashii Chat - File Upload Progress Bar
// @namespace    https://patchii.net/lester/flashii-chat-userscripts
// @version      1.2
// @description  Show prograss bar for file upload in chat.
// @author       lester
// @match        *://chat.flashii.net/*
// @grant        none
// @downloadURL  https://patchii.net/lester/flashii-chat-userscripts/raw/branch/trunk/file-upload-progress-bar.user.js
// @updateURL    https://patchii.net/lester/flashii-chat-userscripts/raw/branch/trunk/file-upload-progress-bar.meta.js
// ==/UserScript==

(function () {
  'use strict';

  const originalXHR = window.XMLHttpRequest;
  const uploads = new Map();

  function createProgressBar() {
    if (document.getElementById('upload-progress-wrapper')) return;

    const spoilerBtn = [...document.querySelectorAll('.markup__button')]
      .find(btn => btn.textContent.trim().toLowerCase() === 'spoiler');
    if (!spoilerBtn) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'upload-progress-wrapper';
    wrapper.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      margin-left: 10px;
      opacity: 0;
      transition: opacity 0.15s ease;
    `;

    const label = document.createElement('span');
    label.textContent = 'Uploading...';
    label.style.cssText = `
      color: var(--theme-colour-main-colour);
      font-size: 13px;
    `;

    const barContainer = document.createElement('div');
    barContainer.style.cssText = `
      position: relative;
      width: 100px;
      height: 20px;
      background-color: var(--theme-colour-input-menu-button);
      border-radius: 2px;
      box-shadow: 0 0 0 1px var(--theme-colour-input-menu-box-shadow);
      overflow: hidden;
    `;

    const inner = document.createElement('div');
    inner.id = 'upload-progress-inner';
    inner.style.cssText = `
      background-color: var(--theme-colour-input-menu-button-hover);
      height: 100%;
      width: 0%;
      transition: width 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--theme-colour-main-colour);
      font-size: 12px;
      font-weight: bold;
      font-family: sans-serif;
    `;

    barContainer.appendChild(inner);
    wrapper.append(label, barContainer);
    spoilerBtn.parentElement.appendChild(wrapper);
  }

  function updateCombinedProgress() {
    let totalLoaded = 0;
    let totalSize = 0;

    for (const { loaded, total } of uploads.values()) {
      totalLoaded += loaded;
      totalSize += total;
    }

    const percent = totalSize === 0 ? 0 : Math.round((totalLoaded / totalSize) * 100);
    const wrapper = document.getElementById('upload-progress-wrapper');
    const inner = document.getElementById('upload-progress-inner');
    if (!wrapper || !inner) return;

    wrapper.style.opacity = '1';
    inner.style.width = `${percent}%`;
    inner.textContent = `${percent}%`;

    if (percent >= 100) {
      setTimeout(() => {
        wrapper.style.opacity = '0';
        setTimeout(() => {
          inner.style.width = '0%';
          inner.textContent = '';
        }, 150);
      }, 800);
    }
  }

  function CustomXHR() {
    const xhr = new originalXHR();
    let id = Math.random().toString(36).slice(2);

    xhr.open = function (method, url) {
      this._isUpload = method === 'POST' && url.includes('/uploads');
      return originalXHR.prototype.open.apply(this, arguments);
    };

    xhr.send = function (body) {
      if (this._isUpload) {
        createProgressBar();

        uploads.set(id, { loaded: 0, total: 0 });

        this.upload.onprogress = e => {
          if (!e.lengthComputable) return;
          uploads.set(id, { loaded: e.loaded, total: e.total });
          updateCombinedProgress();
        };

        this.addEventListener('loadend', () => {
          uploads.delete(id);
          updateCombinedProgress();
        });
      }
      return originalXHR.prototype.send.apply(this, arguments);
    };

    return xhr;
  }

  window.XMLHttpRequest = CustomXHR;
})();
