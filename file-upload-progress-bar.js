// ==UserScript==
// @name         Flashii Chat - File Upload Progress Bar
// @version      1.1
// @description  Show progress bar beside Spoiler button during file upload
// @author       lester
// @match        *://chat.flashii.net/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const originalXHR = window.XMLHttpRequest;

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
    label.textContent = 'Uploading File...';
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

  function updateProgress(percent) {
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

    xhr.open = function (method, url) {
      this._isUpload = method === 'POST' && url.includes('/uploads');
      return originalXHR.prototype.open.apply(this, arguments);
    };

    xhr.send = function (body) {
      if (this._isUpload) {
        createProgressBar();
        this.upload.onprogress = e => {
          if (e.lengthComputable) updateProgress(Math.round((e.loaded / e.total) * 100));
        };
      }
      return originalXHR.prototype.send.apply(this, arguments);
    };

    return xhr;
  }

  window.XMLHttpRequest = CustomXHR;
})();