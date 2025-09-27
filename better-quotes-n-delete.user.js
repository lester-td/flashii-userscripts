// ==UserScript==
// @name         Flashii Chat - Better Quotes & Delete Button
// @namespace    https://patchii.net/lester/flashii-chat-userscripts
// @version      4.3.1
// @description  Adds message quoting and preview, via button and timestamp. Adds delete button to own messages.
// @author       lester
// @match        *://chat.flashii.net/*
// @grant        none
// @downloadURL  https://patchii.net/lester/flashii-chat-userscripts/raw/branch/trunk/better-quotes-n-delete.user.js
// @updateURL    https://patchii.net/lester/flashii-chat-userscripts/raw/branch/trunk/better-quotes-n-delete.meta.js
// ==/UserScript==

(() => {
  const showButtons = true; // true to show buttons, false to hide buttons
  // click timestamp                    -> quote
  // click quoted timestamp             -> go to quote
  // shift + click your message timestamp -> delete

  const enableDelete = true; // true to enable delete, false to disable

  let selectedText = "";
  let pendingQuote = null;
  let previewInterval = null;
  let selectedMessageIndex = -1;
  const cssID = "chat-style";
  const processedMessages = new WeakSet();

  function smartSlice(text, limit = 100, edge = 50, spill = 10) {
    const isWhiteSpace = (char) => /\s/.test(char || "");

    const n = text.length;
    if (n <= limit) return text;
    if (n <= limit + spill) {
      if (!isWhiteSpace(text[limit]) && !isWhiteSpace(text[limit - 1]))
        return text;
    }
    let startEnd = Math.min(edge, n);

    if (!isWhiteSpace(text[startEnd]) && !isWhiteSpace(text[startEnd - 1])) {
      const before = text.lastIndexOf(" ", startEnd);
      const after = text.indexOf(" ", startEnd);
      if (
        before !== -1 &&
        (after === -1 || startEnd - before <= after - startEnd)
      ) {
        startEnd = before;
      } else if (after !== -1) {
        startEnd = after;
      }
    }

    if (startEnd <= 0) startEnd = Math.min(edge, n);
    const start = text.slice(0, startEnd).trimEnd();

    let endStart = Math.max(n - edge, 0);
    if (!isWhiteSpace(text[endStart]) && !isWhiteSpace(text[endStart - 1])) {
      const after = text.indexOf(" ", endStart);
      const before = text.lastIndexOf(" ", endStart);
      if (after !== -1) {
        endStart = after + 1;
      } else if (before !== -1) {
        endStart = before + 1;
      } else {
        endStart = Math.max(n - edge, 0);
      }
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
      .replace(
        /\[color=var\(--theme-colour-message-time-colour\)\][^\w\[\]]{1,3}\[\/color\]/g,
        "",
      )
      .trim();
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
    if (
      e.target.matches("button.markup__button") &&
      e.target.textContent.trim().toLowerCase() === "quote"
    ) {
      setTimeout(() => {
        const input = document.querySelector("textarea.input__text");
        if (input && selectedText) {
          const quoted = `[quote]${selectedText}[/quote]`;
          input.value =
            input.value.trim() === "[quote][/quote]"
              ? quoted
              : input.value + quoted;
          input.focus();
          selectedText = "";
        }
      }, 50);
    }
  });

  window.addEventListener("umi:connect", () => {
    const uid = Umi.User.getCurrentUser().id;

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
        .message .quote-button, .message .delete-button, .message .goto-button {
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
        .message .quote-button:hover, .message .delete-button:hover, .message .goto-button:hover {
          background: var(--theme-colour-input-menu-button-hover);
        }
        .message .quote-button:active, .message .delete-button:active, .message .goto-button:active {
          background: var(--theme-colour-input-menu-button-active);
        }
        .message:hover .quote-button, .message:hover .delete-button, .message:hover .goto-button {
          opacity: 1;
        }
        #quote-preview {
          background: var(--theme-colour-input-background);
          border: 1px solid var(--theme-colour-settings-input-border);
          padding: 6px 10px;
          font-size: 13px;
          margin: 4px -1px;
          display: flex;
          align-items: flex-start;   /* align button to top */
          max-width: 100%;           /* prevent overflow */
        }

        #quote-preview span {
          flex: 1 1 auto;            /* text takes remaining space */
          min-width: 0;              /* allow shrink for ellipsis */
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: normal;       /* wrapping allowed */
        }

        #cancel-quote {
          flex: 0 0 auto;            /* button fixed size */
          margin-left: 6px;
          background: none;
          border: none;
          color: var(--theme-colour-main-colour);
          cursor: pointer;
          font-weight: bold;
          padding: 0 6px;
          font-size: 13px;
          align-self: flex-start;    /* stick to the top-right */
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
        const menus = form?.querySelector(".input__menus");
        const main = form?.querySelector(".input__main");
        if (menus && main) form.insertBefore(preview, main);
      }
      const span = preview.querySelector("span");
      const cleanMsg = cleanMessage(msg);
      const updateTime = () => {
        const time = getRelativeTime(created);
        const displayText = smartSlice(cleanMsg, 100, 50, 10);
        span.innerHTML = `<i>Quoting <b style="color: ${color};">${name}</b> @ ${time} </i>— "${displayText}"`;
      };
      updateTime();
      previewInterval = setInterval(updateTime, 1000);
    };

    const applyQuote = (messageData) => {
      pendingQuote = messageData;
      showQuotePreview(pendingQuote);
      const input = document.querySelector("textarea.input__text");
      if (input) input.focus();
    };

    const getVisibleMessages = () => {
      const container = document.getElementById("umi-messages");
      return [...container.children].filter((msg) =>
        msg.classList.contains("message"),
      );
    };

    const clearSelectedMessage = () => {
      const messages = getVisibleMessages();
      messages.forEach((msg) => msg.classList.remove("selected-quote"));
      selectedMessageIndex = -1;
    };

    const selectMessage = (index) => {
      const messages = getVisibleMessages();
      clearSelectedMessage();
      if (index >= 0 && index < messages.length) {
        selectedMessageIndex = index;
        messages[index].classList.add("selected-quote");
        const messageData = extractMessageData(messages[index]);
        if (messageData) {
          applyQuote(messageData);
        }
      } else {
        pendingQuote = null;
        const preview = document.getElementById("quote-preview");
        if (preview) preview.remove();
        clearInterval(previewInterval);
      }
    };

    const extractMessageData = (msg) => {
      const userEl = msg.querySelector(".message__user");
      const textEl =
        msg.querySelector(".message__text") ||
        msg.querySelector(".message-tiny-text");
      const timeEl = msg.querySelector(".message__time");
      const dataCreated = msg.getAttribute("data-created");
      const raw = userEl?.style?.color;
      const userColor = !raw || raw === "inherit" ? null : rgbToHex(raw);
      const name = userEl?.textContent?.trim() || "Unknown";
      const msgText = cleanMessage(
        msg.dataset.body || textEl?.textContent.trim() || "",
      );

      if (!userEl || !textEl || !timeEl) return null;

      return {
        name,
        color: userColor,
        created: dataCreated,
        id: msg.dataset.id,
        msg: msgText,
      };
    };

    const processMessage = (msg, input, uid) => {
      if (processedMessages.has(msg)) return;
      processedMessages.add(msg);

      const id = msg.dataset.id;
      const author = msg.dataset.author;
      const body = msg.dataset.body || "";
      if (
        !input ||
        ["has disconnected", "has joined"].some((p) => body.includes(p))
      )
        return;

      const textEl =
        msg.querySelector(".message__text") ||
        msg.querySelector(".message-tiny-text");
      const userEl = msg.querySelector(".message__user");
      const timeEl = msg.querySelector(".message__time");

      const dataCreated = msg.getAttribute("data-created");
      const raw = userEl?.style?.color;
      const userColor = !raw || raw === "inherit" ? null : rgbToHex(raw);
      const name = userEl?.textContent?.trim() || "Unknown";
      let msgText = cleanMessage(
        msg.dataset.body || textEl?.textContent.trim() || "",
      );

      if (timeEl) {
        timeEl.onclick = (e) => {
          if (enableDelete && e.shiftKey && author === uid) {
            Umi.Server.SendMessage(`/delete ${id}`);
          } else {
            clearSelectedMessage();
            msg.classList.add("selected-quote");
            applyQuote({
              name,
              color: userColor,
              created: dataCreated,
              id,
              msg: msgText,
            });
          }
        };
      }

      const relTimeEl = textEl?.querySelector("i");
      if (relTimeEl) {
        relTimeEl.onclick = () => {
          const anchor = textEl.querySelector('a[href^="#"]');
          const idMatch = anchor?.getAttribute("href")?.match(/^#(\d{17})$/);
          if (idMatch) {
            const targetId = idMatch[1];
            const target = document.getElementById(`message-${targetId}`);
            if (target) {
              target.scrollIntoView({ behavior: "smooth", block: "center" });
              target.classList.add("highlight-temp");
              setTimeout(() => target.classList.remove("highlight-temp"), 1500);
            }
          }
        };
      }

      let btnContainer = msg.querySelector(".message-button-container");
      if (!btnContainer) {
        btnContainer = document.createElement("div");
        btnContainer.className = "message-button-container";
        msg.style.position = "relative";
        msg.appendChild(btnContainer);
      }

      if (
        enableDelete &&
        showButtons &&
        !msg.querySelector(".delete-button") &&
        author === uid
      ) {
        const del = document.createElement("button");
        del.className = "delete-button";
        del.innerHTML = "&times;";
        del.title = "Delete this message";
        del.onclick = () => Umi.Server.SendMessage(`/delete ${id}`);
        btnContainer.appendChild(del);
      }

      if (
        showButtons &&
        !msg.querySelector(".quote-button") &&
        textEl &&
        userEl &&
        timeEl
      ) {
        const btn = document.createElement("button");
        btn.className = "quote-button";
        btn.textContent = "Quote";
        btn.title = "Quote this message";
        btn.onclick = () => {
          clearSelectedMessage();
          msg.classList.add("selected-quote");
          applyQuote({
            name,
            color: userColor,
            created: dataCreated,
            id,
            msg: msgText,
          });
        };
        btnContainer.appendChild(btn);
      }

      if (
        showButtons &&
        !msg.querySelector(".goto-button") &&
        textEl?.querySelector('a[href^="#"]')
      ) {
        const anchor = textEl.querySelector('a[href^="#"]');
        const idMatch = anchor?.getAttribute("href")?.match(/^#(\d{17})$/);
        if (idMatch) {
          const targetId = idMatch[1];
          const go = document.createElement("button");
          go.className = "goto-button";
          go.textContent = "Go to quoted";
          go.title = "Scroll to quoted message";
          go.onclick = () => {
            const target = document.getElementById(`message-${targetId}`);
            if (target) {
              target.scrollIntoView({ behavior: "smooth", block: "center" });
              target.classList.add("highlight-temp");
              setTimeout(() => target.classList.remove("highlight-temp"), 1500);
            }
          };
          btnContainer.appendChild(go);
        }
      }
    };

    const processNewMessages = () => {
      const input = document.querySelector("textarea.input__text");
      const container = document.getElementById("umi-messages");
      const children = [...container.children];
      for (let i = children.length - 1; i >= 0; i--) {
        const msg = children[i];
        if (msg.classList.contains("message")) {
          if (processedMessages.has(msg)) break;
          processMessage(msg, input, uid);
        }
      }
    };

    injectCSS();
    processNewMessages();

    new MutationObserver(processNewMessages).observe(
      document.getElementById("umi-messages"),
      { childList: true },
    );

    const form = document.querySelector("form.input");
    const input = document.querySelector("textarea.input__text");

    if (form && input && !form.__quoteIntercepted) {
      form.__quoteIntercepted = true;
      form.addEventListener(
        "submit",
        (e) => {
          if (pendingQuote) {
            const { name, color, id, msg, created } = pendingQuote;
            const hidden = "\u200C";
            const cleanMsg = cleanMessage(msg);
            const time = getRelativeTime(created);
            const storedText = smartSlice(cleanMsg, 100, 50, 10);
            const quoteBlock = `[i]${color ? `[color=${color}]` : ""}[b]${name}[/b]${color ? "[/color]" : ""} [color=var(--theme-colour-message-time-colour)]@ ${time} —[/color][/i][url=#${id}]${hidden}[/url] [quote]${storedText}[/quote]`;
            const full = `${quoteBlock}${input.value ? `\n[color=var(--theme-colour-message-time-colour)]└─[/color] ` + input.value.trimStart() : ""}`;
            input.value = full;
            pendingQuote = null;
            const preview = document.getElementById("quote-preview");
            if (preview) preview.remove();
            clearInterval(previewInterval);
            clearSelectedMessage();
          }
        },
        true,
      );
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && pendingQuote) {
        e.preventDefault();
        pendingQuote = null;
        clearSelectedMessage();
        const preview = document.getElementById("quote-preview");
        if (preview) preview.remove();
        clearInterval(previewInterval);
      } else if (e.ctrlKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const messages = getVisibleMessages();
        if (messages.length === 0) return;

        if (e.key === "ArrowUp") {
          if (selectedMessageIndex === -1) {
            selectMessage(messages.length - 1);
          } else if (selectedMessageIndex > 0) {
            selectMessage(selectedMessageIndex - 1);
          }
        } else if (e.key === "ArrowDown") {
          if (selectedMessageIndex === -1) {
            return;
          } else if (selectedMessageIndex < messages.length - 1) {
            selectMessage(selectedMessageIndex + 1);
          } else {
            selectMessage(-1);
          }
        }
      }
    });
  });
})();
