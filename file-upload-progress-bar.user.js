// ==UserScript==
// @name         Flashii Chat - File Upload Progress Bar
// @namespace    https://patchii.net/lester/flashii-chat-userscripts
// @version      1.4.1
// @description  Show progress bar for file uploads in chat.
// @author       lester
// @match        *://chat.flashii.net/*
// @grant        unsafeWindow
// @downloadURL  https://patchii.net/lester/flashii-chat-userscripts/raw/branch/trunk/file-upload-progress-bar.user.js
// @updateURL    https://patchii.net/lester/flashii-chat-userscripts/raw/branch/trunk/file-upload-progress-bar.meta.js
// ==/UserScript==

(() => {
  "use strict";

  const W = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  const NativeXHR = W.XMLHttpRequest;
  const uploads = new Map();
  const xhrMeta = new WeakMap();
  const origOpen = NativeXHR.prototype.open;
  const origSend = NativeXHR.prototype.send;

  function createProgressBar() {
    if (document.getElementById("upload-progress-wrapper")) return;

    const spoilerBtn = [...document.querySelectorAll(".markup__button")].find(
      (btn) => btn.textContent.trim().toLowerCase() === "spoiler",
    );
    if (!spoilerBtn) return;

    const wrapper = document.createElement("div");
    wrapper.id = "upload-progress-wrapper";
    wrapper.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      margin-left: 10px;
      opacity: 0;
      transition: opacity 0.15s ease;
    `;

    const label = document.createElement("span");
    label.textContent = "Uploading File...";
    label.style.cssText = `
      color: var(--theme-colour-main-colour);
      font-size: 13px;
    `;

    const sizeLabel = document.createElement("span");
    sizeLabel.id = "upload-progress-size";
    sizeLabel.style.cssText = `
      color: var(--theme-colour-main-colour);
      font-size: 12px;
      min-width: 120px;
      white-space: nowrap;
    `;

    const barContainer = document.createElement("div");
    barContainer.style.cssText = `
      position: relative;
      width: 100px;
      height: 20px;
      background-color: var(--theme-colour-input-menu-button);
      border-radius: 2px;
      box-shadow: 0 0 0 1px var(--theme-colour-input-menu-box-shadow);
      overflow: hidden;
    `;

    const inner = document.createElement("div");
    inner.id = "upload-progress-inner";
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
    wrapper.append(label, barContainer, sizeLabel);
    spoilerBtn.parentElement?.appendChild(wrapper);
  }

  function formatUploadSize(bytes) {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(mb >= 100 ? 0 : mb >= 10 ? 1 : 2)} MB`;
  }

  function updateCombinedProgress() {
    let totalLoaded = 0;
    let totalSize = 0;
    let allDone = true;

    for (const { loaded, total, done } of uploads.values()) {
      totalLoaded += loaded;
      totalSize += total;
      if (!done) allDone = false;
    }

    const percent = totalSize === 0 ? 0 : Math.round((totalLoaded / totalSize) * 100);
    const wrapper = document.getElementById("upload-progress-wrapper");
    const inner = document.getElementById("upload-progress-inner");
    const sizeLabel = document.getElementById("upload-progress-size");
    if (!wrapper || !inner || !sizeLabel) return;

    wrapper.style.opacity = "1";
    inner.style.width = `${percent}%`;
    inner.textContent = `${percent}%`;
    sizeLabel.textContent = `${formatUploadSize(totalLoaded)}/${formatUploadSize(totalSize)}`;

    if (allDone) {
      setTimeout(() => {
        wrapper.style.opacity = "0";
        setTimeout(() => {
          inner.style.width = "0%";
          inner.textContent = "";
          sizeLabel.textContent = "";
          uploads.clear();
        }, 150);
      }, 800);
    }
  }

  function installUploadProgressPatchOnce() {
    if (NativeXHR.prototype.__ultremeUploadPatched) return;
    NativeXHR.prototype.__ultremeUploadPatched = true;

    NativeXHR.prototype.open = function (method, url) {
      try {
        const m = String(method || "").toUpperCase();
        const u = String(url || "");
        const isUpload = m === "POST" && u.includes("/uploads");
        xhrMeta.set(this, { isUpload, hooked: false, id: null });
      } catch {}
      return origOpen.apply(this, arguments);
    };

    NativeXHR.prototype.send = function () {
      try {
        const meta = xhrMeta.get(this);
        if (meta?.isUpload && !meta.hooked) {
          meta.hooked = true;
          meta.id = Math.random().toString(36).slice(2);
          xhrMeta.set(this, meta);

          createProgressBar();
          uploads.set(meta.id, { loaded: 0, total: 0, done: false });

          if (this.upload && this.upload.addEventListener) {
            this.upload.addEventListener("progress", (e) => {
              if (e.lengthComputable) {
                uploads.set(meta.id, { loaded: e.loaded, total: e.total, done: false });
                updateCombinedProgress();
              }
            });
          }

          this.addEventListener("loadend", () => {
            const current = uploads.get(meta.id);
            if (current) {
              uploads.set(meta.id, { ...current, done: true });
              updateCombinedProgress();
            }
          });
        }
      } catch {}

      return origSend.apply(this, arguments);
    };
  }

  installUploadProgressPatchOnce();
})();
