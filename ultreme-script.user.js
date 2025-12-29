// ==UserScript==
// @name         Flashii Chat - Ultreme Script
// @namespace    https://patchii.net/lester/flashii-chat-userscripts
// @version      5.1
// @description  Better quotes & delete button, quote blocks, upload progress bar, and Go to Forum button with settings.
// @author       lester
// @match        *://chat.flashii.net/*
// @grant        none
// @downloadURL  https://patchii.net/lester/flashii-chat-userscripts/raw/branch/trunk/ultreme-script.user.js
// @updateURL    https://patchii.net/lester/flashii-chat-userscripts/raw/branch/trunk/ultreme-script.meta.js
// ==/UserScript==

(() => {
  "use strict";

  const STORAGE_PREFIX = "ultreme_";
  const cssID = "chat-style";
  const ULTREME_MENU_ID = "ultreme";
  const DEFAULT_NAME_COLOR = "#ffffff";
  const DEFAULT_AVATAR_URL = "https://flashii.net/assets/avatar/";

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

  let showQuoteButton = loadBoolSetting("showQuoteButton", true);
  let showGotoButton = loadBoolSetting("showGotoButton", true);
  let enableDelete = loadBoolSetting("enableDelete", true);
  let showDeleteButton = loadBoolSetting("showDeleteButton", true);
  let enableQuoteBlocks = loadBoolSetting("enableQuoteBlocks", true);
  let enableUploadProgress = loadBoolSetting("enableUploadProgress", true);
  let enableForumButton = loadBoolSetting("enableForumButton", true);

  let selectedText = "";
  let pendingQuote = null;
  let previewInterval = null;
  let selectedMessageIndex = -1;

  const processedMessages = new WeakSet();
  let mediaModal = null;

  const NativeXHR = window.XMLHttpRequest;
  const uploads = new Map();

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
    wrapper.append(label, barContainer);
    spoilerBtn.parentElement?.appendChild(wrapper);
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
    if (!wrapper || !inner) return;

    wrapper.style.opacity = "1";
    inner.style.width = `${percent}%`;
    inner.textContent = `${percent}%`;

    if (allDone) {
      setTimeout(() => {
        wrapper.style.opacity = "0";
        setTimeout(() => {
          inner.style.width = "0%";
          inner.textContent = "";
          uploads.clear();
        }, 150);
      }, 800);
    }
  }

  function UploadXHR() {
    const xhr = new NativeXHR();

    xhr.open = function (method, url) {
      this._isUpload = method === "POST" && String(url || "").includes("/uploads");
      return NativeXHR.prototype.open.apply(this, arguments);
    };

    xhr.send = function () {
      if (this._isUpload && enableUploadProgress) {
        const id = Math.random().toString(36).slice(2);
        createProgressBar();
        uploads.set(id, { loaded: 0, total: 0, done: false });

        this.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            uploads.set(id, { loaded: e.loaded, total: e.total, done: false });
            updateCombinedProgress();
          }
        };

        this.addEventListener("loadend", () => {
          const current = uploads.get(id);
          if (current) {
            uploads.set(id, { ...current, done: true });
            updateCombinedProgress();
          }
        });
      }

      return NativeXHR.prototype.send.apply(this, arguments);
    };

    return xhr;
  }

  function installUploadProgress() {
    if (window.XMLHttpRequest === UploadXHR) return;
    window.XMLHttpRequest = UploadXHR;
  }

  function uninstallUploadProgress() {
    if (window.XMLHttpRequest === UploadXHR) window.XMLHttpRequest = NativeXHR;
    document.getElementById("upload-progress-wrapper")?.remove();
    uploads.clear();
  }

  if (enableUploadProgress) installUploadProgress();

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
      window.open("https://flashii.net/forum", "_blank");
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

  function ensureMediaModal() {
    if (mediaModal) return;
    mediaModal = document.createElement("div");
    mediaModal.id = "umi-media-modal";
    mediaModal.innerHTML = `
      <div class="umi-media-modal-backdrop">
        <div class="umi-media-modal-content"></div>
      </div>
    `;
    mediaModal.addEventListener("click", () => {
      mediaModal.style.display = "none";
      const content = mediaModal.querySelector(".umi-media-modal-content");
      if (content) content.innerHTML = "";
    });
    document.body.appendChild(mediaModal);
  }

  function openMediaModal(url) {
    ensureMediaModal();
    const content = mediaModal.querySelector(".umi-media-modal-content");
    if (!content) return;

    content.innerHTML = "";

    const cleanUrl = url.split("#")[0];
    const extMatch = cleanUrl.split("?")[0].match(/\.([a-z0-9]+)$/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : "";

    const videoExts = ["mp4", "webm", "ogg"];
    const imgExts = ["png", "jpg", "jpeg", "gif", "webp"];

    if (videoExts.includes(ext)) {
      const video = document.createElement("video");
      video.src = url;
      video.controls = true;
      video.autoplay = true;
      video.loop = true;
      video.style.maxWidth = "100%";
      video.style.maxHeight = "100%";
      content.appendChild(video);
    } else if (imgExts.includes(ext) || ext === "") {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "Media preview";
      img.style.maxWidth = "100%";
      img.style.maxHeight = "100%";
      content.appendChild(img);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    mediaModal.style.display = "flex";
  }

  document.addEventListener("mouseup", () => {
    const sel = window.getSelection();
    const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
    const inside =
      range?.commonAncestorContainer?.closest?.("#umi-messages") ||
      range?.commonAncestorContainer?.parentElement?.closest?.("#umi-messages");
    if (inside) selectedText = sel.toString().trim();
  });

  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!t || !(t instanceof Element)) return;

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

  window.addEventListener("umi:connect", () => {
    const uid = window.Umi?.User?.getCurrentUser?.()?.id;
    if (!uid) return;

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
          margin-right: 4px;
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
        #umi-media-modal .umi-media-modal-content {
          max-width: 90%;
          max-height: 90%;
        }
        #umi-media-modal img,
        #umi-media-modal video {
          max-width: 100%;
          max-height: 100%;
          display: block;
          box-shadow: 0 0 16px rgba(0, 0, 0, 0.8);
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
          pendingQuote = null;
          preview.remove();
          clearInterval(previewInterval);
          clearSelectedMessage();
        };

        preview.append(span, cancel);

        const form = document.querySelector("form.input");
        const main = form?.querySelector(".input__main");
        if (form && main) form.insertBefore(preview, main);
      }

      const span = preview.querySelector("span");
      const cleanMsg = cleanMessage(msg);

      const updateTime = () => {
        const time = getRelativeTime(created);
        const displayText = smartSlice(cleanMsg, 100, 50, 10);
        const showColor = color || DEFAULT_NAME_COLOR;
        const nameHtml = `<b style="color:${showColor};">${name}</b>`;
        span.innerHTML = `Quoting ${nameHtml} @ ${time} — ${displayText}`;
      };

      updateTime();
      previewInterval = setInterval(updateTime, 1000);
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

      pendingQuote = null;
      document.getElementById("quote-preview")?.remove();
      clearInterval(previewInterval);
    };

    const extractMessageData = (msg) => {
      const userEl = msg.querySelector(".message__user");
      const textEl = msg.querySelector(".message__text") || msg.querySelector(".message-tiny-text");
      const timeEl = msg.querySelector(".message__time");
      if (!userEl || !textEl || !timeEl) return null;

      const dataCreated = msg.getAttribute("data-created");
      const raw = userEl.style?.color;
      const userColor = !raw || raw === "inherit" ? null : rgbToHex(raw);
      const name = userEl.textContent?.trim() || "Unknown";
      const msgText = cleanMessage(msg.dataset.body || textEl.textContent?.trim() || "");

      return { name, color: userColor, created: dataCreated, id: msg.dataset.id, msg: msgText };
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
      const idMatch = href.match(/^#(\d{17})$/);
      const targetId = idMatch ? idMatch[1] : null;

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

      if (targetMsg?.dataset?.author) {
        avatarImg.src = `https://flashii.net/assets/avatar/${targetMsg.dataset.author}?res=80`;
      }

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

          const link = document.createElement("a");
          link.href = url;
          link.textContent = "Media...";
          link.className = "message__quote-media";
          link.addEventListener("click", (ev) => {
            ev.preventDefault();
            openMediaModal(url);
          });
          textDiv.appendChild(link);

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
          if (ev.target?.closest?.(".message__quote-media")) return;
          scrollToMessageId(targetId);
        });
      }

      msg.dataset.enhancedQuote = "1";
    };

    const setupUserscriptSettingsTab = () => {
      if (window.__ultremeSidebarMenuInstalled) return true;

      const menusApi = window.Umi?.UI?.Menus;
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

        const quotingBody = createCategory("Quoting");
        const deletingBody = createCategory("Deleting");
        const miscBody = createCategory("Misc.");

        const showQuoteButtonInput = addCheckbox(quotingBody, "js-ultreme-showQuoteButton", 'Show "Quote" button');
        const showGotoButtonInput = addCheckbox(quotingBody, "js-ultreme-showGotoButton", 'Show "Go to quote" button');
        const enableQuoteBlocksInput = addCheckbox(quotingBody, "js-ultreme-enableQuoteBlocks", "Render quotes as blocks");

        addHint(deletingBody, "Hold shift and click your message's timestamp to delete");
        const enableDeleteInput = addCheckbox(deletingBody, "js-ultreme-enableDelete", "Enable Delete");
        const showDeleteButtonInput = addCheckbox(deletingBody, "js-ultreme-showDeleteButton", "Show Delete button");

        const enableUploadProgressInput = addCheckbox(miscBody, "js-ultreme-enableUploadProgress", "Show upload progress bar");
        const enableForumButtonInput = addCheckbox(miscBody, "js-ultreme-enableForumButton", "Show Flashii logo (Go to Forum) button");

        showQuoteButtonInput.checked = showQuoteButton;
        showGotoButtonInput.checked = showGotoButton;
        enableQuoteBlocksInput.checked = enableQuoteBlocks;
        enableDeleteInput.checked = enableDelete;
        showDeleteButtonInput.checked = showDeleteButton;
        enableUploadProgressInput.checked = enableUploadProgress;
        enableForumButtonInput.checked = enableForumButton;

        showQuoteButtonInput.addEventListener("change", () => {
          showQuoteButton = showQuoteButtonInput.checked;
          saveBoolSetting("showQuoteButton", showQuoteButton);
          document.querySelectorAll(".quote-button").forEach((btn) => (btn.style.display = showQuoteButton ? "" : "none"));
        });

        showGotoButtonInput.addEventListener("change", () => {
          showGotoButton = showGotoButtonInput.checked;
          saveBoolSetting("showGotoButton", showGotoButton);
          document.querySelectorAll(".goto-button").forEach((btn) => (btn.style.display = showGotoButton ? "" : "none"));
        });

        enableQuoteBlocksInput.addEventListener("change", () => {
          enableQuoteBlocks = enableQuoteBlocksInput.checked;
          saveBoolSetting("enableQuoteBlocks", enableQuoteBlocks);
          document.body.dataset.ultremeQuoteBlocks = enableQuoteBlocks ? "1" : "0";
        });

        enableDeleteInput.addEventListener("change", () => {
          enableDelete = enableDeleteInput.checked;
          saveBoolSetting("enableDelete", enableDelete);
          document.querySelectorAll(".delete-button").forEach((btn) => {
            btn.style.display = enableDelete && showDeleteButton ? "" : "none";
          });
        });

        showDeleteButtonInput.addEventListener("change", () => {
          showDeleteButton = showDeleteButtonInput.checked;
          saveBoolSetting("showDeleteButton", showDeleteButton);
          document.querySelectorAll(".delete-button").forEach((btn) => {
            btn.style.display = enableDelete && showDeleteButton ? "" : "none";
          });
        });

        enableUploadProgressInput.addEventListener("change", () => {
          enableUploadProgress = enableUploadProgressInput.checked;
          saveBoolSetting("enableUploadProgress", enableUploadProgress);
          if (enableUploadProgress) installUploadProgress();
          else uninstallUploadProgress();
        });

        enableForumButtonInput.addEventListener("change", () => {
          enableForumButton = enableForumButtonInput.checked;
          saveBoolSetting("enableForumButton", enableForumButton);
          if (enableForumButton) addForumButton();
          else removeForumButton();
        });
      }

      window.__ultremeSidebarMenuInstalled = true;
      return true;
    };

    const installMenuRetry = () => {
      if (setupUserscriptSettingsTab()) return;
      setTimeout(installMenuRetry, 150);
    };

    const processMessage = (msg) => {
      if (processedMessages.has(msg)) return;
      processedMessages.add(msg);

      const inputEl = document.querySelector("textarea.input__text");
      if (!inputEl) return;

      const id = msg.dataset.id;
      const author = msg.dataset.author;
      const bodyText = msg.dataset.body || "";

      if (["has disconnected", "has joined"].some((p) => bodyText.includes(p))) return;

      const textEl = msg.querySelector(".message__text") || msg.querySelector(".message-tiny-text");
      const userEl = msg.querySelector(".message__user");
      const timeEl = msg.querySelector(".message__time");
      if (!textEl || !userEl) return;

      const dataCreated = msg.getAttribute("data-created");
      const raw = userEl.style?.color;
      const userColor = !raw || raw === "inherit" ? null : rgbToHex(raw);
      const name = userEl.textContent?.trim() || "Unknown";
      const msgText = cleanMessage(msg.dataset.body || textEl.textContent?.trim() || "");

      if (timeEl) {
        timeEl.onclick = (e) => {
          if (enableDelete && e.shiftKey && author === uid) {
            window.Umi?.Server?.SendMessage?.(`/delete ${id}`);
            return;
          }
          clearSelectedMessage();
          msg.classList.add("selected-quote");
          applyQuote({ name, color: userColor, created: dataCreated, id, msg: msgText });
        };
      }

      const relTimeEl = textEl.querySelector("i");
      if (relTimeEl) {
        relTimeEl.onclick = () => {
          const a = textEl.querySelector('a[href^="#"]');
          const idMatch = a?.getAttribute("href")?.match(/^#(\d{17})$/);
          if (idMatch) scrollToMessageId(idMatch[1]);
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
        const del = document.createElement("button");
        del.className = "delete-button";
        del.innerHTML = "&times;";
        del.title = "Delete this message";
        del.onclick = () => window.Umi?.Server?.SendMessage?.(`/delete ${id}`);
        del.style.display = enableDelete && showDeleteButton ? "" : "none";
        btnContainer.appendChild(del);
      }

      if (!msg.querySelector(".quote-button")) {
        const btn = document.createElement("button");
        btn.className = "quote-button";
        btn.textContent = "Quote";
        btn.title = "Quote this message";
        btn.onclick = () => {
          clearSelectedMessage();
          msg.classList.add("selected-quote");
          applyQuote({ name, color: userColor, created: dataCreated, id, msg: msgText });
        };
        btn.style.display = showQuoteButton ? "" : "none";
        btnContainer.appendChild(btn);
      }

      if (!msg.querySelector(".goto-button")) {
        const a = textEl.querySelector('a[href^="#"]');
        const idMatch = a?.getAttribute("href")?.match(/^#(\d{17})$/);
        if (idMatch) {
          const targetId = idMatch[1];
          const go = document.createElement("button");
          go.className = "goto-button";
          go.textContent = "Go to quoted";
          go.title = "Scroll to quoted message";
          go.onclick = () => scrollToMessageId(targetId);
          go.style.display = showGotoButton ? "" : "none";
          btnContainer.appendChild(go);
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

          const { name, color, id, msg, created } = pendingQuote;
          const hidden = "\u200C";
          const cleanMsg = cleanMessage(msg);
          const time = getRelativeTime(created);
          const storedText = smartSlice(cleanMsg, 100, 50, 10);

          const nameColor = color || DEFAULT_NAME_COLOR;

          const quoteBlock = `[i][color=${nameColor}][b]${name}[/b][/color] [color=var(--theme-colour-message-time-colour)]@ ${time} —[/color][/i][url=#${id}]${hidden}[/url][quote]${storedText}[/quote]`;

          const userText = (input.value || "").replace(/^[ \t]+/, "");
          const full = `${quoteBlock}${userText ? `\n[color=var(--theme-colour-message-time-colour)]└─ [/color]${userText}` : ""}`;

          input.value = full;
          pendingQuote = null;

          document.getElementById("quote-preview")?.remove();
          clearInterval(previewInterval);
          clearSelectedMessage();
        },
        true,
      );
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && pendingQuote) {
        e.preventDefault();
        pendingQuote = null;
        clearSelectedMessage();
        document.getElementById("quote-preview")?.remove();
        clearInterval(previewInterval);
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
