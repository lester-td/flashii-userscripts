// ==UserScript==
// @name         Flashii Chat - Ultreme Script
// @namespace    https://patchii.net/lester/flashii-chat-userscripts
// @version      5.4.2
// @description  Better quotes & delete button, quote blocks, upload progress bar, and Go to Forum button with settings.
// @author       lester
// @match        *://chat.flashii.net/*
// @grant        unsafeWindow
// @grant        GM_info
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      patchii.net
// @downloadURL  https://patchii.net/lester/flashii-chat-userscripts/raw/branch/trunk/ultreme-script.user.js
// @updateURL    https://patchii.net/lester/flashii-chat-userscripts/raw/branch/trunk/ultreme-script.meta.js
// ==/UserScript==

(() => {
  "use strict";

  const W = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  const STORAGE_PREFIX = "ultreme_";
  const cssID = "chat-style";
  const ULTREME_MENU_ID = "ultreme";
  const DEFAULT_NAME_COLOR = "#ffffff";
  const DEFAULT_AVATAR_URL = "https://flashii.net/assets/avatar/";
  const PATCHII_PAGE_URL = "https://patchii.net/lester/flashii-chat-userscripts";
  const PATCHII_USERJS_URL = "https://patchii.net/lester/flashii-chat-userscripts/raw/branch/trunk/ultreme-script.user.js";
  const PATCHII_META_URL = "https://patchii.net/lester/flashii-chat-userscripts/raw/branch/trunk/ultreme-script.meta.js";

  const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const DEFAULT_UPLOAD_PROGRESS_BAR_WIDTH = 100;
  const UPLOAD_PROGRESS_BAR_TEXT_PADDING = 16;
  let didAutoUpdateCheck = false;

  const loadBoolSetting = (key, def) => {
    try {
      const v = localStorage.getItem(STORAGE_PREFIX + key);
      if (v === null) return def;
      return v === "1";
    } catch {
      return def;
    }
  };

  const saveBoolSetting = (key, val) => {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, val ? "1" : "0");
    } catch {}
  };

  const loadStringSetting = (key, def, allowed = null) => {
    try {
      const v = localStorage.getItem(STORAGE_PREFIX + key);
      if (v === null) return def;
      if (allowed && !allowed.includes(v)) return def;
      return v;
    } catch {
      return def;
    }
  };

  const saveStringSetting = (key, val) => {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, val);
    } catch {}
  };

  let showQuoteButton = loadBoolSetting("showQuoteButton", true);
  let showGotoButton = loadBoolSetting("showGotoButton", true);
  let enableDelete = loadBoolSetting("enableDelete", true);
  let showDeleteButton = loadBoolSetting("showDeleteButton", true);
  let enableQuoteBlocks = loadBoolSetting("enableQuoteBlocks", true);
  let enableUploadProgress = loadBoolSetting("enableUploadProgress", true);
  let uploadProgressTextMode = loadStringSetting(
    "uploadProgressTextMode",
    loadBoolSetting("showUploadFileSizeInBar", false) ? "size" : "percent",
    ["percent", "size", "both"],
  );
  let showUploadFileSize = loadBoolSetting("showUploadFileSize", true);
  let enableForumButton = loadBoolSetting("enableForumButton", true);

  let selectedText = "";
  let pendingQuote = null;
  let previewInterval = null;
  let selectedMessageIndex = -1;

  const processedMessages = new WeakSet();
  let mediaModal = null;
  const NativeXHR = W.XMLHttpRequest;
  const uploads = new Map();
  const __ultremeXhrMeta = new WeakMap();
  const __ultremeOrigOpen = NativeXHR.prototype.open;
  const __ultremeOrigSend = NativeXHR.prototype.send;
  const measureUploadProgressTextWidth = (() => {
    let canvas = null;
    let ctx = null;
    return (text) => {
      canvas ||= document.createElement("canvas");
      ctx ||= canvas.getContext("2d");
      if (!ctx) return DEFAULT_UPLOAD_PROGRESS_BAR_WIDTH;
      ctx.font = "bold 12px sans-serif";
      return Math.ceil(ctx.measureText(String(text || "")).width);
    };
  })();

  const getMessagesContainer = () => document.getElementById("umi-messages");

  const getVisibleMessages = () => {
    const container = getMessagesContainer();
    if (!container) return [];
    return [...container.children].filter((msg) => msg.classList.contains("message"));
  };

  const scrollToMessageId = (targetId) => {
    if (!targetId) return;
    const target = document.getElementById(`message-${targetId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("highlight-temp");
    setTimeout(() => target.classList.remove("highlight-temp"), 1500);
  };

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
      display: ${uploadProgressTextMode === "percent" && showUploadFileSize ? "" : "none"};
    `;

    const barContainer = document.createElement("div");
    barContainer.id = "upload-progress-bar";
    barContainer.style.cssText = `
      position: relative;
      width: ${DEFAULT_UPLOAD_PROGRESS_BAR_WIDTH}px;
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
      position: absolute;
      inset: 0 auto 0 0;
      height: 100%;
      width: 0%;
      transition: width 0.15s ease;
    `;

    const text = document.createElement("div");
    text.id = "upload-progress-text";
    text.style.cssText = `
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--theme-colour-main-colour);
      font-size: 12px;
      font-weight: bold;
      font-family: sans-serif;
      white-space: pre;
      pointer-events: none;
    `;

    barContainer.append(inner, text);
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
    const bar = document.getElementById("upload-progress-bar");
    const inner = document.getElementById("upload-progress-inner");
    const text = document.getElementById("upload-progress-text");
    const sizeLabel = document.getElementById("upload-progress-size");
    if (!wrapper || !bar || !inner || !text || !sizeLabel) return;

    const sizeText = `${formatUploadSize(totalLoaded)}/${formatUploadSize(totalSize)}`;
    const barText =
      uploadProgressTextMode === "size"
        ? sizeText
        : uploadProgressTextMode === "both"
          ? `${percent}%   ${sizeText}`
          : `${percent}%`;
    const barWidth =
      uploadProgressTextMode === "percent"
        ? DEFAULT_UPLOAD_PROGRESS_BAR_WIDTH
        : Math.max(DEFAULT_UPLOAD_PROGRESS_BAR_WIDTH, measureUploadProgressTextWidth(barText) + UPLOAD_PROGRESS_BAR_TEXT_PADDING);

    wrapper.style.opacity = "1";
    bar.style.width = `${barWidth}px`;
    inner.style.width = `${percent}%`;
    text.textContent = barText;
    sizeLabel.textContent = sizeText;

    if (allDone) {
      setTimeout(() => {
        wrapper.style.opacity = "0";
        setTimeout(() => {
          bar.style.width = `${DEFAULT_UPLOAD_PROGRESS_BAR_WIDTH}px`;
          inner.style.width = "0%";
          text.textContent = "";
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
        __ultremeXhrMeta.set(this, { isUpload, hooked: false, id: null });
      } catch {}
      return __ultremeOrigOpen.apply(this, arguments);
    };

    NativeXHR.prototype.send = function () {
      try {
        const meta = __ultremeXhrMeta.get(this);

        if (enableUploadProgress && meta?.isUpload && !meta.hooked) {
          meta.hooked = true;
          meta.id = Math.random().toString(36).slice(2);
          __ultremeXhrMeta.set(this, meta);

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

      return __ultremeOrigSend.apply(this, arguments);
    };
  }

  function disableUploadProgressUI() {
    document.getElementById("upload-progress-wrapper")?.remove();
    uploads.clear();
  }

  installUploadProgressPatchOnce();

  function addForumButton() {
    if (!enableForumButton) return;

    const sidebarSelector = document.querySelector(".sidebar__selector");
    const firstButton = sidebarSelector?.querySelector(".sidebar__selector-mode");
    if (!sidebarSelector || !firstButton) return;
    if (sidebarSelector.querySelector(".custom-button")) return;

    const newButton = document.createElement("button");
    newButton.classList.add("sidebar__selector-mode", "custom-button");
    newButton.title = "Go to Forum";
    newButton.style.cssText = `
      width: 40px;
      height: 40px;
      border: none;
      background-color: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    const favicon = document.querySelector('link[rel~="icon"]')?.href || "/favicon.ico";
    const faviconImg = document.createElement("img");
    faviconImg.src = favicon;
    faviconImg.alt = "Flashii Forum";
    faviconImg.style.width = "32px";
    faviconImg.style.height = "32px";
    newButton.appendChild(faviconImg);

    newButton.addEventListener("click", (event) => {
      event.preventDefault();
      W.open("https://flashii.net/forum", "_blank");
    });

    sidebarSelector.insertBefore(newButton, firstButton);
  }

  function removeForumButton() {
    document.querySelector(".custom-button")?.remove();
  }

  function smartSlice(text, limit = 100, edge = 50, spill = 10) {
    const isWhiteSpace = (char) => /\s/.test(char || "");

    const n = text.length;
    if (n <= limit) return text;
    if (n <= limit + spill) {
      if (!isWhiteSpace(text[limit]) && !isWhiteSpace(text[limit - 1])) return text;
    }

    let startEnd = Math.min(edge, n);
    if (!isWhiteSpace(text[startEnd]) && !isWhiteSpace(text[startEnd - 1])) {
      const before = text.lastIndexOf(" ", startEnd);
      const after = text.indexOf(" ", startEnd);
      if (before !== -1 && (after === -1 || startEnd - before <= after - startEnd)) startEnd = before;
      else if (after !== -1) startEnd = after;
    }
    if (startEnd <= 0) startEnd = Math.min(edge, n);
    const start = text.slice(0, startEnd).trimEnd();

    let endStart = Math.max(n - edge, 0);
    if (!isWhiteSpace(text[endStart]) && !isWhiteSpace(text[endStart - 1])) {
      const after = text.indexOf(" ", endStart);
      const before = text.lastIndexOf(" ", endStart);
      if (after !== -1) endStart = after + 1;
      else if (before !== -1) endStart = before + 1;
      else endStart = Math.max(n - edge, 0);
    }
    const end = text.slice(endStart).trimStart();

    return `${start} ... ${end}`;
  }

  function cleanMessage(msg) {
    let msgText = msg || "";
    const endQuoteIdx = msgText.lastIndexOf("[/quote]");
    if (endQuoteIdx !== -1) msgText = msgText.slice(endQuoteIdx + 8).trim();
    return msgText
      .replace(/\[Embed\]|\[Remove\]/g, "")
      .replace(/\[color=var\(--theme-colour-message-time-colour\)\][^\w\[\]]{1,3}\[\/color\]/g, "")
      .trim();
  }

  const getAvatarUrl = (authorId, avatarVersion = null) => {
    if (!authorId) return DEFAULT_AVATAR_URL;
    if (avatarVersion) return `${DEFAULT_AVATAR_URL}${authorId}?ver=${avatarVersion}`;
    return `${DEFAULT_AVATAR_URL}${authorId}`;
  };

  const parseQuoteHref = (href) => {
    const m = String(href || "").match(/^#(\d{17})(?::([^:#\s]+))?(?::([^#\s]+))?$/);
    if (!m) return { messageId: null, authorId: null, avatarVersion: null };
    return { messageId: m[1], authorId: m[2] || null, avatarVersion: m[3] || null };
  };

  const extractAvatarVersion = (msg) => {
    const bg = msg.querySelector(".message__avatar")?.style?.backgroundImage || "";
    const m = bg.match(/[?&]ver=(\d+)/);
    return m ? m[1] : null;
  };

  const VIDEO_EXTS = ["mp4", "webm", "ogg"];
  const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "svg"];
  const AUDIO_EXTS = ["mp3", "wav", "flac", "aac", "m4a", "opus", "oga"];

  const getMediaKind = (url) => {
    const cleanUrl = String(url || "").split("#")[0];
    const extMatch = cleanUrl.split("?")[0].match(/\.([a-z0-9]+)$/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : "";
    if (VIDEO_EXTS.includes(ext)) return "video";
    if (IMAGE_EXTS.includes(ext)) return "image";
    if (AUDIO_EXTS.includes(ext)) return "audio";
    return null;
  };

  const getMediaLabel = (kind) => {
    if (kind === "image") return "View Image";
    if (kind === "video") return "View Video";
    if (kind === "audio") return "View Audio";
    return null;
  };

  const createQuoteEmbedToggle = (url, mediaKind) => {
    const wrapper = document.createElement("span");
    wrapper.className = "message__quote-embed-wrap";

    const toggle = document.createElement("a");
    toggle.href = "#";
    toggle.textContent = "Embed";
    toggle.className = "message__quote-embed-toggle";

    const embed = document.createElement("div");
    embed.className = "message__quote-embed";
    embed.style.display = "none";

    const appendMedia = () => {
      if (embed.childElementCount > 0) return;

      if (mediaKind === "video") {
        const video = document.createElement("video");
        video.src = url;
        video.controls = true;
        video.preload = "metadata";
        embed.appendChild(video);
      } else if (mediaKind === "audio") {
        const audio = document.createElement("audio");
        audio.src = url;
        audio.controls = true;
        audio.preload = "metadata";
        embed.appendChild(audio);
      } else {
        const img = document.createElement("img");
        img.src = url;
        img.alt = "Embedded media";
        img.loading = "lazy";
        embed.appendChild(img);
      }
    };

    toggle.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const isOpen = embed.style.display !== "none";
      if (isOpen) {
        embed.style.display = "none";
        toggle.textContent = "Embed";
        return;
      }

      appendMedia();
      embed.style.display = "";
      toggle.textContent = "Remove";
    });

    wrapper.append(document.createTextNode("["), toggle, document.createTextNode("]"), embed);
    return wrapper;
  };

  const escapeHtml = (text) =>
    String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const getPreviewMediaLabel = (url, explicitKind = null) => {
    const kind = explicitKind || getMediaKind(url);
    return getMediaLabel(kind) || "View Media";
  };

  const buildPreviewMediaLink = (url, explicitKind = null) => {
    const mediaUrl = String(url || "").trim();
    const label = getPreviewMediaLabel(mediaUrl, explicitKind);
    return `(<a href="${escapeHtml(mediaUrl)}" class="ultreme-preview-media" data-media-url="${escapeHtml(mediaUrl)}">${escapeHtml(label)}</a>)`;
  };

  const formatQuotePreviewHtml = (msg) => {
    const placeholders = [];
    const stash = (html) => {
      const idx = placeholders.push(html) - 1;
      return `\uE000${idx}\uE001`;
    };

    let text = cleanMessage(msg);

    text = text.replace(/\[img\]([\s\S]*?)\[\/img\]/gi, (_, url) => stash(buildPreviewMediaLink(url, "image")));
    text = text.replace(/\[video\]([\s\S]*?)\[\/video\]/gi, (_, url) => stash(buildPreviewMediaLink(url, "video")));
    text = text.replace(/\[audio\]([\s\S]*?)\[\/audio\]/gi, (_, url) => stash(buildPreviewMediaLink(url, "audio")));
    text = text.replace(/\[code\]([\s\S]*?)\[\/code\]/gi, (_, code) => stash(`<code>${escapeHtml(code)}</code>`));
    text = text.replace(/\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi, (_, spoiler) => stash(`<span class="ultreme-preview-spoiler">${escapeHtml(spoiler)}</span>`));
    text = text.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, "$1");

    text = escapeHtml(text);

    text = text.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, "$2");
    text = text.replace(/\[url\]([\s\S]*?)\[\/url\]/gi, "$1");

    text = text.replace(/\[b\]/gi, "<b>");
    text = text.replace(/\[\/b\]/gi, "</b>");
    text = text.replace(/\[i\]/gi, "<i>");
    text = text.replace(/\[\/i\]/gi, "</i>");
    text = text.replace(/\[u\]/gi, "<u>");
    text = text.replace(/\[\/u\]/gi, "</u>");
    text = text.replace(/\[s\]/gi, "<s>");
    text = text.replace(/\[\/s\]/gi, "</s>");
    text = text.replace(/\[color=([^\]]+)\]/gi, (_, color) => {
      const value = String(color || "").trim();
      if (/^#(?:[0-9a-f]{3,8})$/i.test(value) || /^var\(--[a-z0-9-]+\)$/i.test(value)) {
        return `<span style="color:${value};">`;
      }
      return "<span>";
    });
    text = text.replace(/\[\/color\]/gi, "</span>");

    text = text.replace(/\[(?:\/)?[a-z]+(?:=[^\]]+)?\]/gi, "");

    text = text.replace(/\uE000(\d+)\uE001/g, (_, idx) => placeholders[Number(idx)] || "");

    return text;
  };

  const closeMediaModal = () => {
    if (!mediaModal) return;
    mediaModal.style.display = "none";
    const content = mediaModal.querySelector(".umi-media-modal-content");
    const link = mediaModal.querySelector(".umi-media-modal-download");
    if (content) content.innerHTML = "";
    if (link) {
      link.removeAttribute("href");
      link.removeAttribute("download");
    }
  };

  function ensureMediaModal() {
    if (mediaModal) return;
    mediaModal = document.createElement("div");
    mediaModal.id = "umi-media-modal";
    mediaModal.innerHTML = `
      <div class="umi-media-modal-backdrop">
        <div class="umi-media-modal-shell">
          <div class="umi-media-modal-toolbar">
            <div class="umi-media-modal-title">Ultreme Script Media Viewer</div>
            <div class="umi-media-modal-actions">
              <a class="umi-media-modal-download" target="_blank" rel="noopener noreferrer">Download</a>
              <button type="button" class="umi-media-modal-close" aria-label="Close preview">X</button>
            </div>
          </div>
          <div class="umi-media-modal-content"></div>
        </div>
      </div>
    `;
    mediaModal.addEventListener("click", (event) => {
      if (event.target?.classList?.contains("umi-media-modal-close")) {
        closeMediaModal();
        return;
      }

      if (event.target?.closest?.(".umi-media-modal-toolbar")) return;
      if (event.target?.closest?.(".umi-media-modal-content img, .umi-media-modal-content video")) return;

      closeMediaModal();
    });
    document.body.appendChild(mediaModal);
  }

  async function openMediaModal(url) {
    ensureMediaModal();
    const content = mediaModal.querySelector(".umi-media-modal-content");
    const downloadLink = mediaModal.querySelector(".umi-media-modal-download");
    if (!content) return;

    content.innerHTML = "";
    if (downloadLink) {
      downloadLink.href = url;
      downloadLink.setAttribute("download", "");
    }

    const mediaKind = getMediaKind(url);

    if (mediaKind === "video") {
      const video = document.createElement("video");
      video.src = url;
      video.controls = true;
      video.autoplay = true;
      video.loop = true;
      video.style.maxWidth = "100%";
      video.style.maxHeight = "100%";
      content.appendChild(video);
    } else if (mediaKind === "image") {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "Media preview";
      img.style.maxWidth = "100%";
      img.style.maxHeight = "100%";
      content.appendChild(img);
    } else if (mediaKind === "audio") {
      const audio = document.createElement("audio");
      audio.src = url;
      audio.controls = true;
      audio.autoplay = true;
      audio.style.width = "min(100%, 640px)";
      content.appendChild(audio);
    } else {
      W.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    mediaModal.style.display = "flex";
  }

  const getInstalledVersion = () => {
    try {
      if (typeof GM_info !== "undefined" && GM_info?.script?.version) return String(GM_info.script.version);
    } catch {}
    try {
      if (typeof GM !== "undefined" && GM?.info?.script?.version) return String(GM.info.script.version);
    } catch {}
    return null;
  };

  const parseSemverish = (v) =>
    String(v || "")
      .trim()
      .split(/[^\d]+/)
      .filter(Boolean)
      .map((x) => parseInt(x, 10) || 0);

  const isVersionNewer = (remote, local) => {
    const a = parseSemverish(remote);
    const b = parseSemverish(local);
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const av = a[i] ?? 0;
      const bv = b[i] ?? 0;
      if (av > bv) return true;
      if (av < bv) return false;
    }
    return false;
  };

  const gmGetText = (url) =>
    new Promise((resolve, reject) => {
      const bust = `${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`;

      if (typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function") {
        GM.xmlHttpRequest({
          method: "GET",
          url: bust,
          onload: (r) => resolve(r.responseText || ""),
          onerror: () => reject(new Error("GM.xmlHttpRequest failed")),
        });
        return;
      }

      if (typeof GM_xmlhttpRequest === "function") {
        GM_xmlhttpRequest({
          method: "GET",
          url: bust,
          onload: (r) => resolve(r.responseText || ""),
          onerror: () => reject(new Error("GM_xmlhttpRequest failed")),
        });
        return;
      }

      fetch(bust, { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.text();
        })
        .then(resolve)
        .catch(reject);
    });

  const fetchRemoteVersion = async () => {
    const text = await gmGetText(PATCHII_META_URL);
    const m = text.match(/^\s*\/\/\s*@version\s+([^\s]+)\s*$/m);
    return m ? m[1].trim() : null;
  };

  const insertBanner = (el) => {
    const form = document.querySelector("form.input");
    const main = form?.querySelector(".input__main");
    if (!form || !main) return;

    const quotePreview = document.getElementById("quote-preview");
    if (quotePreview && quotePreview.parentElement === form) form.insertBefore(el, quotePreview);
    else form.insertBefore(el, main);
  };

  const showAutoUpdatePrompt = (remoteVer) => {
    const existing = document.getElementById("ultreme-update-prompt");
    if (existing) existing.remove();

    const prompt = document.createElement("div");
    prompt.id = "ultreme-update-prompt";

    const span = document.createElement("span");
    span.textContent = `Ultreme Script — Update to Version ${remoteVer} available.`;

    const actions = document.createElement("div");
    actions.className = "ultreme-update-actions";

    const view = document.createElement("a");
    view.href = PATCHII_PAGE_URL;
    view.target = "_blank";
    view.rel = "noopener noreferrer";
    view.textContent = "View on Patchii";

    const upd = document.createElement("a");
    upd.href = PATCHII_USERJS_URL;
    upd.target = "_blank";
    upd.rel = "noopener noreferrer";
    upd.textContent = "Update now";

    actions.append(view, upd);

    const dismiss = document.createElement("button");
    dismiss.id = "ultreme-update-dismiss";
    dismiss.textContent = "×";
    dismiss.title = "Dismiss";
    dismiss.onclick = () => prompt.remove();
    prompt.append(span, actions, dismiss);
    insertBanner(prompt);
  };

  const runAutoUpdateCheckOnce = async () => {
    if (didAutoUpdateCheck) return;
    didAutoUpdateCheck = true;

    const updateInfo = await checkForUpdates();
    if (!updateInfo) return;

    if (updateInfo.isNewer) showAutoUpdatePrompt(updateInfo.remoteVer);
  };

  const runManualUpdateCheck = async (ui) => {
    ui.setStatus("Checking for updates...");
    ui.setUpdateAvailable(false);

    const updateInfo = await checkForUpdates();
    if (!updateInfo) {
      ui.setStatus("Update check failed. Please try again.");
      ui.setUpdateAvailable(false);
      return;
    }

    if (!updateInfo.localVer) {
      ui.setStatus("Unable to read installed version.");
      ui.setUpdateAvailable(false);
      return;
    }

    if (!updateInfo.remoteVer) {
      ui.setStatus("Unable to determine remote version.");
      ui.setUpdateAvailable(false);
      return;
    }

    if (updateInfo.isNewer) {
      ui.setStatus(`Update available: ${updateInfo.remoteVer}`);
      ui.setUpdateAvailable(true);
      return;
    }

    ui.setStatus(`You're on the latest!`);
    ui.setUpdateAvailable(false);
  };

  const checkForUpdates = async () => {
    const localVer = getInstalledVersion();
    if (!localVer) return { localVer: null, remoteVer: null, isNewer: false };

    try {
      const remoteVer = await fetchRemoteVersion();
      return {
        localVer,
        remoteVer,
        isNewer: remoteVer ? isVersionNewer(remoteVer, localVer) : false,
      };
    } catch {
      return null;
    }
  };

  setInterval(() => {
    didAutoUpdateCheck = false;
    runAutoUpdateCheckOnce();
  }, UPDATE_CHECK_INTERVAL_MS);

  document.addEventListener("mouseup", () => {
    const sel = W.getSelection?.();
    const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
    const inside =
      range?.commonAncestorContainer?.closest?.("#umi-messages") ||
      range?.commonAncestorContainer?.parentElement?.closest?.("#umi-messages");
    if (inside) selectedText = sel.toString().trim();
  });

  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!t || !(t instanceof Element)) return;

    const previewMediaLink = t.closest(".ultreme-preview-media");
    if (previewMediaLink instanceof HTMLAnchorElement) {
      e.preventDefault();
      openMediaModal(previewMediaLink.dataset.mediaUrl || previewMediaLink.href);
      return;
    }

    if (t.matches("button.markup__button") && t.textContent.trim().toLowerCase() === "quote") {
      setTimeout(() => {
        const input = document.querySelector("textarea.input__text");
        if (input && selectedText) {
          const quoted = `[quote]${selectedText}[/quote]`;
          input.value = input.value.trim() === "[quote][/quote]" ? quoted : input.value + quoted;
          input.focus();
          selectedText = "";
        }
      }, 50);
    }
  });

  W.addEventListener("umi:connect", () => {
    const uid = W.Umi?.User?.getCurrentUser?.()?.id;
    if (!uid) return;

    runAutoUpdateCheckOnce();

    document.body.dataset.ultremeQuoteBlocks = enableQuoteBlocks ? "1" : "0";

    const rgbToHex = (rgb) => {
      const m = rgb?.match(/\d+/g);
      return m?.length >= 3
        ? "#" +
            m
              .slice(0, 3)
              .map((x) => (+x).toString(16).padStart(2, "0"))
              .join("")
        : "#000";
    };

    const getRelativeTime = (dateString) => {
      if (!dateString) return "";
      const createdDate = new Date(dateString);
      const now = new Date();
      const diffMs = now - createdDate;

      const seconds = Math.floor(diffMs / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (seconds < 60) return `${seconds}s ago`;
      if (minutes < 60) return `${minutes}m ago`;
      if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
      return `${days}d ${hours % 24}h ${minutes % 60}m ago`;
    };

    const injectCSS = () => {
      if (document.getElementById(cssID)) return;
      const style = document.createElement("style");
      style.id = cssID;
      style.textContent = `
        .message .message-button-container {
          position: absolute;
          top: 50%;
          right: 10px;
          transform: translateY(-50%);
          display: flex;
          gap: 4px;
        }
        .message .quote-button,
        .message .delete-button,
        .message .goto-button {
          opacity: 0;
          border: none;
          border-radius: 2px;
          padding: 1px 6px;
          font-size: 13px;
          cursor: pointer;
          background: var(--theme-colour-input-menu-button);
          color: var(--theme-colour-main-colour);
          transition: opacity 0.15s ease;
        }
        .message .quote-button:hover,
        .message .delete-button:hover,
        .message .goto-button:hover {
          background: var(--theme-colour-input-menu-button-hover);
        }
        .message .quote-button:active,
        .message .delete-button:active,
        .message .goto-button:active {
          background: var(--theme-colour-input-menu-button-active);
        }
        .message:hover .quote-button,
        .message:hover .delete-button,
        .message:hover .goto-button {
          opacity: 1;
        }
        #quote-preview {
          background: var(--theme-colour-input-background);
          border: 1px solid var(--theme-colour-settings-input-border);
          padding: 6px 10px;
          font-size: 13px;
          margin: 4px -1px;
          display: flex;
          align-items: flex-start;
          max-width: 100%;
        }
        #quote-preview span {
          flex: 1 1 auto;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: normal;
        }
        #quote-preview code {
          font-family: Consolas, "Courier New", monospace;
          font-size: 12px;
          padding: 1px 4px;
          border-radius: 2px;
          background: var(--theme-colour-input-menu-button);
        }
        #quote-preview .ultreme-preview-media {
          color: var(--theme-colour-main-accent);
          text-decoration: underline;
          cursor: pointer;
        }
        #quote-preview .ultreme-preview-spoiler {
          padding: 0 4px;
          border-radius: 2px;
          background: var(--theme-colour-input-menu-button);
          color: var(--theme-colour-main-colour);
          filter: brightness(0.8);
        }
        #cancel-quote {
          flex: 0 0 auto;
          margin-left: 6px;
          background: none;
          border: none;
          color: var(--theme-colour-main-colour);
          cursor: pointer;
          font-weight: bold;
          padding: 0 6px;
          font-size: 13px;
          align-self: flex-start;
        }
        #ultreme-update-prompt {
          background: var(--theme-colour-input-background);
          border: 1px solid var(--theme-colour-settings-input-border);
          padding: 6px 10px;
          font-size: 13px;
          margin: 4px -1px;
          display: flex;
          align-items: center;
          gap: 10px;
          max-width: 100%;
        }
        #ultreme-update-prompt > span {
          flex: 1 1 auto;
          min-width: 0;
        }
        .ultreme-update-actions {
          display: flex;
          gap: 8px;
          flex: 0 0 auto;
          white-space: nowrap;
        }
        .ultreme-update-actions a {
          border: none;
          border-radius: 2px;
          padding: 1px 6px;
          font-size: 13px;
          cursor: pointer;
          background: var(--theme-colour-input-menu-button);
          color: var(--theme-colour-main-colour);
          text-decoration: none;
        }
        .ultreme-update-actions a:hover {
          background: var(--theme-colour-input-menu-button-hover);
        }
        .ultreme-update-actions a:active {
          background: var(--theme-colour-input-menu-button-active);
        }
        #ultreme-update-dismiss {
          flex: 0 0 auto;
          background: none;
          border: none;
          color: var(--theme-colour-main-colour);
          cursor: pointer;
          font-weight: bold;
          padding: 0 6px;
          font-size: 13px;
        }

        .highlight-temp {
          animation: blinkOutline 1s ease-in-out;
          outline: 2px solid transparent;
          border-radius: 4px;
          outline-offset: 1px;
        }
        @keyframes blinkOutline {
          0%   { outline-color: transparent; }
          50%  { outline-color: var(--theme-colour-main-accent); }
          100% { outline-color: transparent; }
        }
        .message__time,
        .message__text i {
          cursor: pointer;
        }
        .message__time:hover,
        .message__text i:hover {
          text-decoration: underline;
        }
        .message.selected-quote::after {
          content: "";
          position: absolute;
          inset: 0;
          opacity: 0.1;
          background-color: color-mix(in srgb, var(--theme-colour-main-accent) 50%, black);
        }
        .message__container.has-inline-quote {
          display: flex;
          align-items: flex-start;
        }
        .message__container.has-inline-quote .message__meta {
          flex: 0 0 auto;
        }
        .message__container.has-inline-quote .message__body {
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
        }
        .message.message--first .message__container.has-inline-quote {
          flex-direction: column;
        }
        .message.message--first .message__container.has-inline-quote .message__meta {
          margin-right: 0;
          margin-bottom: 2px;
        }
        .message:not(.message--first) .message__container.has-inline-quote {
          flex-direction: row;
        }
        .message__quote {
          margin-top: 2px;
          margin-bottom: 2px;
          padding: 4px 8px;
          font-size: 12px;
          border-radius: 3px;
          border: 2px solid var(--theme-colour-settings-input-border);
          background: var(--theme-colour-input-background);
          cursor: pointer;
          opacity: 0.97;
          display: flex;
          align-items: flex-start;
          gap: 6px;
          max-width: 100%;
          box-sizing: border-box;
        }
        .message__quote:hover {
          border-color: var(--theme-colour-main-accent);
        }
        .message__quote-avatar {
          width: 20px;
          height: 20px;
          border-radius: 0;
          flex: 0 0 auto;
          object-fit: cover;
        }
        .message__quote-body {
          flex: 1 1 auto;
          min-width: 0;
        }
        .message__quote-header {
          margin-bottom: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .message__quote-text {
          white-space: normal;
          word-break: break-word;
        }
        .message__quote-text a.message__quote-media {
          color: var(--theme-colour-main-accent);
          text-decoration: underline;
          cursor: pointer;
        }
        .message__quote-text .message__quote-embed-toggle {
          color: var(--theme-colour-main-accent);
          text-decoration: underline;
          cursor: pointer;
        }
        .message__quote-embed {
          margin-top: 6px;
        }
        .message__quote-embed img,
        .message__quote-embed video {
          max-width: min(100%, 420px);
          max-height: 240px;
          display: block;
          border-radius: 3px;
        }
        .message__quote-embed audio {
          width: min(100%, 420px);
          display: block;
        }
        .message__quote + .message__text {
          display: block;
          margin-top: 2px;
        }
        #umi-media-modal {
          display: none;
          position: fixed;
          inset: 0;
          z-index: 9999;
          align-items: center;
          justify-content: center;
        }
        #umi-media-modal .umi-media-modal-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        #umi-media-modal .umi-media-modal-shell {
          position: relative;
          width: min(96vw, 1600px);
          height: min(96vh, 1000px);
          display: flex;
          flex-direction: column;
          align-items: stretch;
          justify-content: flex-start;
        }
        #umi-media-modal .umi-media-modal-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          width: 100%;
          box-sizing: border-box;
          padding: 10px 12px;
          margin-bottom: 8px;
          border-radius: 4px;
          background: rgba(0, 0, 0, 0.72);
          box-shadow: 0 0 16px rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(2px);
        }
        #umi-media-modal .umi-media-modal-title {
          color: var(--theme-colour-main-colour);
          font-size: 13px;
          font-family: Tahoma, Geneva, Arial, Helvetica, sans-serif;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        #umi-media-modal .umi-media-modal-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          min-width: 0;
        }
        #umi-media-modal .umi-media-modal-download,
        #umi-media-modal .umi-media-modal-close {
          border: none;
          border-radius: 2px;
          padding: 3px 8px;
          font-size: 13px;
          cursor: pointer;
          background: var(--theme-colour-input-menu-button);
          color: var(--theme-colour-main-colour);
          text-decoration: none;
          font-family: Tahoma, Geneva, Arial, Helvetica, sans-serif;
        }
        #umi-media-modal .umi-media-modal-download:hover,
        #umi-media-modal .umi-media-modal-close:hover {
          background: var(--theme-colour-input-menu-button-hover);
        }
        #umi-media-modal .umi-media-modal-download:active,
        #umi-media-modal .umi-media-modal-close:active {
          background: var(--theme-colour-input-menu-button-active);
        }
        #umi-media-modal .umi-media-modal-content {
          width: 100%;
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px;
          box-sizing: border-box;
          overflow: hidden;
        }
        #umi-media-modal img,
        #umi-media-modal video {
          max-width: 100%;
          max-height: 100%;
          display: block;
          box-shadow: 0 0 16px rgba(0, 0, 0, 0.8);
          object-fit: contain;
        }
        body[data-ultreme-quote-blocks="1"] .ultreme-inline-quote {
          display: none !important;
        }
        body[data-ultreme-quote-blocks="0"] .message__quote {
          display: none !important;
        }
        .setting__hint {
          margin-bottom: 4px;
          font-size: 12px;
          color: var(--theme-colour-message-time-colour);
        }
        .ultreme-setting-group-title {
          margin: 10px 0 4px;
          font-size: 12px;
          font-weight: bold;
          color: var(--theme-colour-main-colour);
        }
        .ultreme-setting-group {
          padding-left: 8px;
          border-left: 2px solid var(--theme-colour-settings-input-border);
          margin-bottom: 8px;
        }
        .ultreme-setting-group .setting__container:last-child {
          margin-bottom: 0;
        }
        .ultreme-setting-disabled {
          opacity: 0.55;
          pointer-events: none;
        }
      `;
      document.head.appendChild(style);
    };

    const showQuotePreview = ({ name, msg, color, created }) => {
      clearInterval(previewInterval);

      let preview = document.getElementById("quote-preview");
      if (!preview) {
        preview = document.createElement("div");
        preview.id = "quote-preview";

        const span = document.createElement("span");
        const cancel = document.createElement("button");
        cancel.id = "cancel-quote";
        cancel.textContent = "×";
        cancel.title = "Cancel quote";
        cancel.onclick = () => {
          clearPendingQuote();
        };

        preview.append(span, cancel);
        insertBanner(preview);
      }

      const span = preview.querySelector("span");

      const updateTime = () => {
        const time = getRelativeTime(created);
        const displayHtml = formatQuotePreviewHtml(msg);
        const showColor = color || DEFAULT_NAME_COLOR;
        const nameHtml = `<b style="color:${showColor};">${name}</b>`;
        span.innerHTML = `Quoting ${nameHtml} @ ${time} — ${displayHtml}`;
      };

      updateTime();
      previewInterval = setInterval(updateTime, 1000);
    };

    const clearPendingQuote = ({ clearSelection = true } = {}) => {
      pendingQuote = null;
      document.getElementById("quote-preview")?.remove();
      clearInterval(previewInterval);
      previewInterval = null;
      if (clearSelection) clearSelectedMessage();
    };

    const applyQuote = (messageData) => {
      pendingQuote = messageData;
      showQuotePreview(pendingQuote);
      document.querySelector("textarea.input__text")?.focus();
    };

    const clearSelectedMessage = () => {
      const messages = getVisibleMessages();
      for (const m of messages) m.classList.remove("selected-quote");
      selectedMessageIndex = -1;
    };

    const selectMessage = (index) => {
      const messages = getVisibleMessages();
      clearSelectedMessage();

      if (index >= 0 && index < messages.length) {
        selectedMessageIndex = index;
        const msg = messages[index];
        msg.classList.add("selected-quote");
        const messageData = extractMessageData(msg);
        if (messageData) applyQuote(messageData);
        return;
      }

      clearPendingQuote({ clearSelection: false });
    };

    const extractMessageData = (msg) => {
      const userEl = msg.querySelector(".message__user");
      const textEl = msg.querySelector(".message__text") || msg.querySelector(".message-tiny-text");
      if (!userEl || !textEl) return null;

      const dataCreated = msg.getAttribute("data-created");
      const raw = userEl.style?.color;
      const userColor = !raw || raw === "inherit" ? null : rgbToHex(raw);
      const name = userEl.textContent?.trim() || "Unknown";
      const msgText = cleanMessage(msg.dataset.body || textEl.textContent?.trim() || "");

      return {
        name,
        color: userColor,
        created: dataCreated,
        id: msg.dataset.id,
        authorId: msg.dataset.author,
        avatarVersion: extractAvatarVersion(msg),
        msg: msgText,
      };
    };

    const appendMessageButton = (container, { className, text, title, visible = true, onClick, html = false }) => {
      const button = document.createElement("button");
      button.className = className;
      if (html) button.innerHTML = text;
      else button.textContent = text;
      button.title = title;
      button.onclick = onClick;
      button.style.display = visible ? "" : "none";
      container.appendChild(button);
      return button;
    };

    const enhanceScriptQuote = (msg, textEl) => {
      if (!textEl) return;
      if (msg.dataset.enhancedQuote === "1") return;

      const anchor = textEl.querySelector('a[href^="#"]');
      const qEl = textEl.querySelector("q");
      const metaI = textEl.querySelector("i");
      if (!anchor || !qEl || !metaI) return;

      const aText = anchor.textContent || "";
      if (aText.length !== 1 || aText.charCodeAt(0) !== 0x200c) return;

      const href = anchor.getAttribute("href") || "";
      const { messageId: targetId, authorId: quotedAuthorIdFromHref, avatarVersion: quotedAvatarVersion } = parseQuoteHref(href);

      const arrowSpan = [...textEl.querySelectorAll("span")].find((s) => (s.textContent || "").includes("└"));
      const br = textEl.querySelector("br");

      metaI.classList.add("ultreme-inline-quote");
      anchor.classList.add("ultreme-inline-quote");
      qEl.classList.add("ultreme-inline-quote");
      if (arrowSpan) arrowSpan.classList.add("ultreme-inline-quote");
      if (br) br.classList.add("ultreme-inline-quote");

      const targetMsg = targetId ? document.getElementById(`message-${targetId}`) : null;

      const quoteContainer = document.createElement("div");
      quoteContainer.className = "message__quote";

      const avatarImg = document.createElement("img");
      avatarImg.className = "message__quote-avatar";
      avatarImg.alt = "";
      avatarImg.src = DEFAULT_AVATAR_URL;

      let quotedName = "Unknown";
      let quotedColor = null;
      let quotedCreated = null;
      let relTime = "";

      {
        const headerText = metaI.textContent || "";
        const atIdx = headerText.indexOf("@ ");
        const dashIdx = headerText.lastIndexOf("—");
        if (atIdx !== -1) {
          const namePart = headerText.slice(0, atIdx).trim();
          if (namePart) quotedName = namePart;
        }
        if (atIdx !== -1 && dashIdx !== -1 && dashIdx > atIdx + 2) {
          relTime = headerText.slice(atIdx + 2, dashIdx).trim();
        }
      }

      if (targetMsg) {
        const targetUserEl = targetMsg.querySelector(".message__user");
        const rawColor = targetUserEl?.style?.color;
        const targetName = targetUserEl?.textContent?.trim();
        if (targetName) quotedName = targetName;
        if (rawColor && rawColor !== "inherit") {
          quotedColor = rawColor.startsWith("#") ? rawColor : rgbToHex(rawColor);
        }
        quotedCreated = targetMsg.getAttribute("data-created");
      } else {
        const nameB = metaI.querySelector("b");
        const colourSource = metaI.querySelector('span[style*="color"]') || nameB?.parentElement || nameB;
        const rawColor = colourSource?.style?.color || null;
        if (rawColor && rawColor !== "inherit") {
          quotedColor = rawColor.startsWith("#") ? rawColor : rgbToHex(rawColor);
        }
      }

      const quotedAuthorId = targetMsg?.dataset?.author || quotedAuthorIdFromHref;
      const quotedAvatarVersionLive = targetMsg ? extractAvatarVersion(targetMsg) : null;
      if (quotedAuthorId) {
        avatarImg.src = getAvatarUrl(quotedAuthorId, quotedAvatarVersionLive || quotedAvatarVersion);
      }

      if (!relTime && quotedCreated) relTime = getRelativeTime(quotedCreated);

      const body = document.createElement("div");
      body.className = "message__quote-body";

      const header = document.createElement("div");
      header.className = "message__quote-header";
      const showColor = quotedColor || DEFAULT_NAME_COLOR;
      header.innerHTML = `<b style="color:${showColor};">${quotedName}</b>${
        relTime ? ` <span style="color:var(--theme-colour-message-time-colour);">@ ${relTime}</span>` : ""
      }`;

      const textDiv = document.createElement("div");
      textDiv.className = "message__quote-text";

      const rawQuoted = qEl.textContent || "";
      const withoutEmbed = rawQuoted.replace(/\[Embed\]/gi, "").trim();

      const urlRe = /(https?:)?\/\/\S+/g;
      const hasUrl = urlRe.test(withoutEmbed);
      urlRe.lastIndex = 0;

      if (hasUrl) {
        let lastIndex = 0;
        let match;
        while ((match = urlRe.exec(withoutEmbed)) !== null) {
          const urlStart = match.index;
          const urlEnd = urlRe.lastIndex;

          const before = withoutEmbed.slice(lastIndex, urlStart);
          if (before) textDiv.appendChild(document.createTextNode(before));

          let url = match[0];
          if (!/^https?:\/\//i.test(url)) url = "https:" + url;

          const trailingWhitespace = url.match(/\s+$/)?.[0] || "";
          if (trailingWhitespace) {
            url = url.slice(0, -trailingWhitespace.length);
          }

          const mediaKind = getMediaKind(url);
          if (mediaKind) {
            textDiv.appendChild(document.createTextNode("("));
            const link = document.createElement("a");
            link.href = url;
            link.textContent = getMediaLabel(mediaKind);
            link.className = "message__quote-media";
            link.addEventListener("click", (ev) => {
              ev.preventDefault();
              openMediaModal(url);
            });
            textDiv.appendChild(link);
            textDiv.appendChild(document.createTextNode(") "));
            textDiv.appendChild(createQuoteEmbedToggle(url, mediaKind));
          } else {
            const link = document.createElement("a");
            link.href = url;
            link.textContent = match[0];
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            textDiv.appendChild(link);
          }

          if (trailingWhitespace) {
            textDiv.appendChild(document.createTextNode(trailingWhitespace));
          }

          lastIndex = urlEnd;
        }

        const tail = withoutEmbed.slice(lastIndex);
        if (tail) textDiv.appendChild(document.createTextNode(tail));
      } else {
        textDiv.textContent = withoutEmbed;
      }

      body.appendChild(header);
      body.appendChild(textDiv);

      quoteContainer.appendChild(avatarImg);
      quoteContainer.appendChild(body);

      const container = msg.querySelector(".message__container");
      const meta = msg.querySelector(".message__meta");

      if (container) {
        container.classList.add("has-inline-quote");

        let bodyWrapper = container.querySelector(".message__body");
        if (!bodyWrapper) {
          bodyWrapper = document.createElement("div");
          bodyWrapper.className = "message__body";

          if (textEl.parentNode === container) {
            container.insertBefore(bodyWrapper, textEl);
            bodyWrapper.appendChild(textEl);
          } else {
            container.appendChild(bodyWrapper);
          }
        }

        if (textEl.parentNode === bodyWrapper) bodyWrapper.insertBefore(quoteContainer, textEl);
        else bodyWrapper.insertBefore(quoteContainer, bodyWrapper.firstChild);
      } else if (meta?.parentNode) {
        meta.parentNode.insertBefore(quoteContainer, meta.nextSibling);
      }

      if (targetId) {
        quoteContainer.addEventListener("click", (ev) => {
          if (ev.target?.closest?.(".message__quote-media, .message__quote-embed-toggle, .message__quote-embed")) return;
          scrollToMessageId(targetId);
        });
      }

      msg.dataset.enhancedQuote = "1";
    };

    const setupUserscriptSettingsTab = () => {
      if (W.__ultremeSidebarMenuInstalled) return true;

      const menusApi = W.Umi?.UI?.Menus;
      if (!menusApi || typeof menusApi.Add !== "function") return false;

      try {
        menusApi.Add(ULTREME_MENU_ID, "Ultreme Script");
      } catch {}

      const panel = document.getElementById(`umi-menus-${ULTREME_MENU_ID}`);
      const iconHost = document.getElementById(`umi-menu-icons-${ULTREME_MENU_ID}`);
      if (!panel || !iconHost) return false;

      if (!iconHost.querySelector(".fa-code")) {
        const i = document.createElement("i");
        i.className = "fas fa-code sidebar-gutter-font-icon";
        iconHost.appendChild(i);
      }

      if (!panel.__ultremeBuilt) {
        panel.__ultremeBuilt = true;
        panel.classList.add("sidebar__menu--settings", "sidebar__menu--userscript");

        const createCategory = (titleText) => {
          const wrapper = document.createElement("div");

          const header = document.createElement("div");
          header.className = "setting__category-title";
          header.textContent = titleText;

          const body = document.createElement("div");
          body.className = "setting__category";

          wrapper.append(header, body);
          panel.appendChild(wrapper);

          let open = true;
          header.addEventListener("click", () => {
            const duration = 260;
            const ease = (t) => 1 - Math.pow(1 - t, 3);

            const startHeight = body.getBoundingClientRect().height;
            body.style.overflow = "hidden";

            let endHeight = 0;
            if (!open) {
              body.style.height = "auto";
              endHeight = body.getBoundingClientRect().height;
              body.style.height = `${startHeight}px`;
            }

            const from = startHeight;
            const to = open ? 0 : endHeight;
            open = !open;

            const start = performance.now();
            const tick = (now) => {
              const t = Math.min(1, (now - start) / duration);
              const v = from + (to - from) * ease(t);
              body.style.height = `${v}px`;
              if (t < 1) requestAnimationFrame(tick);
              else {
                body.style.height = open ? "auto" : "0";
                body.style.overflow = "";
              }
            };
            requestAnimationFrame(tick);
          });

          return body;
        };

        const addHint = (body, text) => {
          const hint = document.createElement("div");
          hint.className = "setting__hint";
          hint.textContent = text;
          body.appendChild(hint);
        };

        const createSettingGroup = (body, titleText, hintText = "") => {
          const title = document.createElement("div");
          title.className = "ultreme-setting-group-title";
          title.textContent = titleText;
          body.appendChild(title);

          const group = document.createElement("div");
          group.className = "ultreme-setting-group";
          body.appendChild(group);

          if (hintText) addHint(group, hintText);
          return group;
        };

        const addCheckbox = (body, cls, labelText) => {
          const container = document.createElement("div");
          container.className = "setting__container setting__container--checkbox";

          const label = document.createElement("label");
          label.className = "setting__label";

          const input = document.createElement("input");
          input.type = "checkbox";
          input.className = `setting__input ${cls}`;

          const text = document.createElement("div");
          text.textContent = labelText;

          label.append(input, text);
          container.appendChild(label);
          body.appendChild(container);
          return input;
        };

        const addRadio = (body, groupName, cls, labelText) => {
          const container = document.createElement("div");
          container.className = "setting__container setting__container--checkbox";

          const label = document.createElement("label");
          label.className = "setting__label";

          const input = document.createElement("input");
          input.type = "radio";
          input.name = groupName;
          input.className = `setting__input ${cls}`;

          const text = document.createElement("div");
          text.textContent = labelText;

          label.append(input, text);
          container.appendChild(label);
          body.appendChild(container);
          return input;
        };

        const bindCheckboxSetting = (input, key, getValue, setValue, onChange) => {
          input.checked = getValue();
          input.addEventListener("change", () => {
            const nextValue = input.checked;
            setValue(nextValue);
            saveBoolSetting(key, nextValue);
            onChange?.(nextValue);
          });
        };

        const createButtonRow = (body, text, onClick) => {
          const wrap = document.createElement("div");
          wrap.className = "setting__container setting__container--button";
          wrap.innerHTML = `<label class="setting__label"><button type="button" class="setting__input"></button></label>`;
          const btn = wrap.querySelector("button");
          btn.textContent = text;
          btn.addEventListener("click", onClick);
          body.appendChild(wrap);
          return { wrap, btn };
        };

        const bindRadioSetting = (inputs, key, getValue, setValue, onChange) => {
          const sync = () => {
            const value = getValue();
            for (const [radioValue, input] of Object.entries(inputs)) input.checked = value === radioValue;
          };

          sync();

          for (const [radioValue, input] of Object.entries(inputs)) {
            input.addEventListener("change", () => {
              if (!input.checked) return;
              setValue(radioValue);
              saveStringSetting(key, radioValue);
              onChange?.(radioValue);
            });
          }
        };

        const quotingBody = createCategory("Quoting");
        const deletingBody = createCategory("Deleting");
        const miscBody = createCategory("Misc.");
        const aboutBody = createCategory("About");
        aboutBody.classList.add("ultreme-about");

        const showQuoteButtonInput = addCheckbox(quotingBody, "js-ultreme-showQuoteButton", 'Show "Quote" button');
        const showGotoButtonInput = addCheckbox(quotingBody, "js-ultreme-showGotoButton", 'Show "Go to quote" button');
        const enableQuoteBlocksInput = addCheckbox(quotingBody, "js-ultreme-enableQuoteBlocks", "Render quotes as blocks");

        addHint(deletingBody, "Hold shift and click your message's timestamp to delete");
        const enableDeleteInput = addCheckbox(deletingBody, "js-ultreme-enableDelete", "Enable Delete");
        const showDeleteButtonInput = addCheckbox(deletingBody, "js-ultreme-showDeleteButton", "Show Delete button");

        const uploadGroup = createSettingGroup(miscBody, "Upload Progress");
        const enableUploadProgressInput = addCheckbox(uploadGroup, "js-ultreme-enableUploadProgress", "Show upload progress bar");
        const uploadInsideGroup = createSettingGroup(uploadGroup, "Inside Bar");
        const uploadProgressPercentInput = addRadio(uploadInsideGroup, "ultreme-upload-progress-text-mode", "js-ultreme-uploadProgressPercent", "Percentage");
        const uploadProgressSizeInput = addRadio(uploadInsideGroup, "ultreme-upload-progress-text-mode", "js-ultreme-uploadProgressSize", "File size");
        const uploadProgressBothInput = addRadio(uploadInsideGroup, "ultreme-upload-progress-text-mode", "js-ultreme-uploadProgressBoth", "Both");
        const uploadOutsideGroup = createSettingGroup(uploadGroup, "Outside Bar");
        const showUploadFileSizeInput = addCheckbox(uploadOutsideGroup, "js-ultreme-showUploadFileSize", "File size");

        const navigationGroup = createSettingGroup(miscBody, "Navigation");
        const enableForumButtonInput = addCheckbox(navigationGroup, "js-ultreme-enableForumButton", "Show Flashii logo (Go to Forum) button");

        const syncUploadFileSizeControls = () => {
          const sizeLabel = document.getElementById("upload-progress-size");
          const disableUploadTextControls = !enableUploadProgress;
          const disableSideSize = !enableUploadProgress || uploadProgressTextMode === "both";
          const sideSizeLabel = showUploadFileSizeInput.closest(".setting__label");
          const uploadTextLabels = [
            uploadProgressPercentInput.closest(".setting__label"),
            uploadProgressSizeInput.closest(".setting__label"),
            uploadProgressBothInput.closest(".setting__label"),
          ];

          for (const input of [uploadProgressPercentInput, uploadProgressSizeInput, uploadProgressBothInput]) {
            input.disabled = disableUploadTextControls;
          }
          for (const label of uploadTextLabels) {
            label?.classList.toggle("ultreme-setting-disabled", disableUploadTextControls);
          }

          if (disableUploadTextControls && uploadProgressTextMode !== "percent") {
            uploadProgressTextMode = "percent";
            saveStringSetting("uploadProgressTextMode", uploadProgressTextMode);
            uploadProgressPercentInput.checked = true;
          }

          if (disableSideSize && showUploadFileSize) {
            showUploadFileSize = false;
            saveBoolSetting("showUploadFileSize", false);
            showUploadFileSizeInput.checked = false;
          }

          showUploadFileSizeInput.disabled = disableSideSize;
          sideSizeLabel?.classList.toggle("ultreme-setting-disabled", disableSideSize);

          if (sizeLabel) sizeLabel.style.display = enableUploadProgress && !disableSideSize && showUploadFileSize ? "" : "none";
        };

        bindCheckboxSetting(showQuoteButtonInput, "showQuoteButton", () => showQuoteButton, (v) => {
          showQuoteButton = v;
        }, (v) => {
          document.querySelectorAll(".quote-button").forEach((btn) => (btn.style.display = v ? "" : "none"));
        });

        bindCheckboxSetting(showGotoButtonInput, "showGotoButton", () => showGotoButton, (v) => {
          showGotoButton = v;
        }, (v) => {
          document.querySelectorAll(".goto-button").forEach((btn) => (btn.style.display = v ? "" : "none"));
        });

        bindCheckboxSetting(enableQuoteBlocksInput, "enableQuoteBlocks", () => enableQuoteBlocks, (v) => {
          enableQuoteBlocks = v;
        }, (v) => {
          document.body.dataset.ultremeQuoteBlocks = v ? "1" : "0";
        });

        const syncDeleteButtons = () => {
          document.querySelectorAll(".delete-button").forEach((btn) => {
            btn.style.display = enableDelete && showDeleteButton ? "" : "none";
          });
        };

        bindCheckboxSetting(enableDeleteInput, "enableDelete", () => enableDelete, (v) => {
          enableDelete = v;
        }, syncDeleteButtons);

        bindCheckboxSetting(showDeleteButtonInput, "showDeleteButton", () => showDeleteButton, (v) => {
          showDeleteButton = v;
        }, syncDeleteButtons);

        bindCheckboxSetting(enableUploadProgressInput, "enableUploadProgress", () => enableUploadProgress, (v) => {
          enableUploadProgress = v;
        }, (v) => {
          if (!v) {
            disableUploadProgressUI();
          } else {
            createProgressBar();
          }
          syncUploadFileSizeControls();
        });

        bindRadioSetting(
          {
            percent: uploadProgressPercentInput,
            size: uploadProgressSizeInput,
            both: uploadProgressBothInput,
          },
          "uploadProgressTextMode",
          () => uploadProgressTextMode,
          (v) => {
            uploadProgressTextMode = v;
          },
          () => {
            syncUploadFileSizeControls();
            updateCombinedProgress();
          },
        );

        bindCheckboxSetting(showUploadFileSizeInput, "showUploadFileSize", () => showUploadFileSize, (v) => {
          showUploadFileSize = v;
        }, (v) => {
          const sizeLabel = document.getElementById("upload-progress-size");
          if (sizeLabel) sizeLabel.style.display = enableUploadProgress && uploadProgressTextMode === "percent" && v ? "" : "none";
        });

        syncUploadFileSizeControls();

        bindCheckboxSetting(enableForumButtonInput, "enableForumButton", () => enableForumButton, (v) => {
          enableForumButton = v;
        }, (v) => {
          if (v) addForumButton();
          else removeForumButton();
        });

        const ver = getInstalledVersion() || "unknown";

        const addLine = (text) => {
          const d = document.createElement("div");
          d.className = "mami-copyright";
          d.textContent = text;
          aboutBody.appendChild(d);
          return d;
        };

        addLine("Flashii Ultreme Script");
        addLine(`Version ${ver}`);
        addLine("thank you to all users of flashii <3");

        createButtonRow(aboutBody, "View Project on Patchii", () => W.open(PATCHII_PAGE_URL, "_blank", "noopener,noreferrer"));

        createButtonRow(aboutBody, "Check for updates", () => {
          runManualUpdateCheck(ui);
        });

        const updateStatusEl = addLine("");
        updateStatusEl.id = "ultreme-about-update-status";

        const updateNowRow = createButtonRow(aboutBody, "Update now", () => W.open(PATCHII_USERJS_URL, "_blank", "noopener,noreferrer"));
        updateNowRow.wrap.style.display = "none";

        const ui = {
          setStatus: (text) => {
            updateStatusEl.textContent = text || "";
          },
          setUpdateAvailable: (on) => {
            updateNowRow.wrap.style.display = on ? "" : "none";
          },
        };
      }

      W.__ultremeSidebarMenuInstalled = true;
      return true;
    };

    const installMenuRetry = () => {
      if (setupUserscriptSettingsTab()) return;
      setTimeout(installMenuRetry, 150);
    };

    const processMessage = (msg) => {
      if (processedMessages.has(msg)) return;
      processedMessages.add(msg);

      if (!document.querySelector("textarea.input__text")) return;

      const messageData = extractMessageData(msg);
      if (!messageData) return;

      const { id, name, color: userColor, created: dataCreated, authorId, avatarVersion, msg: msgText } = messageData;
      const author = msg.dataset.author;
      const bodyText = msg.dataset.body || "";

      if (["has disconnected", "has joined"].some((p) => bodyText.includes(p))) return;

      const textEl = msg.querySelector(".message__text") || msg.querySelector(".message-tiny-text");
      const timeEl = msg.querySelector(".message__time");
      if (!textEl) return;

      if (timeEl) {
        timeEl.onclick = (e) => {
          if (enableDelete && e.shiftKey && author === uid) {
            W.Umi?.Server?.SendMessage?.(`/delete ${id}`);
            return;
          }
          clearSelectedMessage();
          msg.classList.add("selected-quote");
          applyQuote({ name, color: userColor, created: dataCreated, id, authorId, avatarVersion, msg: msgText });
        };
      }

      const relTimeEl = textEl.querySelector("i");
      if (relTimeEl) {
        relTimeEl.onclick = () => {
          const a = textEl.querySelector('a[href^="#"]');
          const { messageId } = parseQuoteHref(a?.getAttribute("href"));
          if (messageId) scrollToMessageId(messageId);
        };
      }

      let btnContainer = msg.querySelector(".message-button-container");
      if (!btnContainer) {
        btnContainer = document.createElement("div");
        btnContainer.className = "message-button-container";
        msg.style.position = "relative";
        msg.appendChild(btnContainer);
      }

      if (!msg.querySelector(".delete-button") && author === uid) {
        appendMessageButton(btnContainer, {
          className: "delete-button",
          text: "&times;",
          title: "Delete this message",
          visible: enableDelete && showDeleteButton,
          onClick: () => W.Umi?.Server?.SendMessage?.(`/delete ${id}`),
          html: true,
        });
      }

      if (!msg.querySelector(".quote-button")) {
        appendMessageButton(btnContainer, {
          className: "quote-button",
          text: "Quote",
          title: "Quote this message",
          visible: showQuoteButton,
          onClick: () => {
            clearSelectedMessage();
            msg.classList.add("selected-quote");
            applyQuote({ name, color: userColor, created: dataCreated, id, authorId, avatarVersion, msg: msgText });
          },
        });
      }

      if (!msg.querySelector(".goto-button")) {
        const a = textEl.querySelector('a[href^="#"]');
        const { messageId: targetId } = parseQuoteHref(a?.getAttribute("href"));
        if (targetId) {
          appendMessageButton(btnContainer, {
            className: "goto-button",
            text: "Go to quoted",
            title: "Scroll to quoted message",
            visible: showGotoButton,
            onClick: () => scrollToMessageId(targetId),
          });
        }
      }

      enhanceScriptQuote(msg, textEl);
    };

    const processNewMessages = () => {
      const container = getMessagesContainer();
      if (!container) return;

      const children = [...container.children];
      for (let i = children.length - 1; i >= 0; i--) {
        const msg = children[i];
        if (!msg.classList.contains("message")) continue;
        if (processedMessages.has(msg)) break;
        processMessage(msg);
      }
    };

    injectCSS();
    installMenuRetry();
    processNewMessages();
    addForumButton();

    const container = getMessagesContainer();
    if (container) new MutationObserver(processNewMessages).observe(container, { childList: true });

    const form = document.querySelector("form.input");
    const input = document.querySelector("textarea.input__text");

    if (form && input && !form.__quoteIntercepted) {
      form.__quoteIntercepted = true;

      form.addEventListener(
        "submit",
        () => {
          if (!pendingQuote) return;

          const { name, color, id, authorId, avatarVersion, msg, created } = pendingQuote;
          const hidden = "\u200C";
          const cleanMsg = cleanMessage(msg);
          const time = getRelativeTime(created);
          const storedText = smartSlice(cleanMsg, 100, 50, 10);

          const nameColor = color || DEFAULT_NAME_COLOR;
          const quoteHref = authorId
            ? `#${id}:${authorId}${avatarVersion ? `:${avatarVersion}` : ""}`
            : `#${id}`;

          const quoteBlock = `[i][color=${nameColor}][b]${name}[/b][/color] [color=var(--theme-colour-message-time-colour)]@ ${time} —[/color][/i][url=${quoteHref}]${hidden}[/url][quote]${storedText}[/quote]`;

          const userText = (input.value || "").replace(/^[ \t]+/, "");
          const full = `${quoteBlock}${userText ? `\n[color=var(--theme-colour-message-time-colour)]└─ [/color]${userText}` : ""}`;

          input.value = full;
          clearPendingQuote();
        },
        true,
      );
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && pendingQuote) {
        e.preventDefault();
        clearPendingQuote();
        return;
      }

      if (!(e.ctrlKey && (e.key === "ArrowUp" || e.key === "ArrowDown"))) return;

      e.preventDefault();
      const messages = getVisibleMessages();
      if (messages.length === 0) return;

      if (e.key === "ArrowUp") {
        if (selectedMessageIndex === -1) selectMessage(messages.length - 1);
        else if (selectedMessageIndex > 0) selectMessage(selectedMessageIndex - 1);
      } else {
        if (selectedMessageIndex === -1) return;
        if (selectedMessageIndex < messages.length - 1) selectMessage(selectedMessageIndex + 1);
        else selectMessage(-1);
      }
    });
  });
})();
