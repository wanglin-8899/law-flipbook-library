(() => {
  "use strict";

  const data = window.BOOK_DATA;
  const bookElement = document.getElementById("book");
  const bookFrame = document.getElementById("book-frame");
  const gutter = document.getElementById("book-gutter");
  const coverEntry = document.getElementById("cover-entry");
  const openCoverButton = document.getElementById("open-cover");
  const contentsDrawer = document.getElementById("contents-drawer");
  const drawerScrim = document.getElementById("drawer-scrim");
  const openContentsButton = document.getElementById("open-contents");
  const closeContentsButton = document.getElementById("close-contents");
  const previousButtons = [
    document.getElementById("previous-page"),
    document.getElementById("previous-page-mobile"),
  ];
  const nextButtons = [
    document.getElementById("next-page"),
    document.getElementById("next-page-mobile"),
  ];
  const pageNumber = document.getElementById("page-number");
  const currentLocation = document.getElementById("current-location");
  const progress = document.getElementById("reading-progress");
  const progressBar = document.getElementById("reading-progress-bar");
  const fullscreenButton = document.getElementById("toggle-fullscreen");
  const frontMatterList = document.getElementById("front-matter-list");
  const chapterList = document.getElementById("chapter-list");
  const pdfLink = document.getElementById("pdf-link");
  const bookTitle = document.getElementById("book-title");
  const bookEdition = document.getElementById("book-edition");
  const coverImage = document.getElementById("cover-image");

  if (!data || !window.St || !window.lucide) {
    document.body.classList.add("is-ready");
    return;
  }

  const totalPages = data.totalPages;
  const savedPage = readSavedPage();
  const startingPage = Math.min(Math.max(savedPage, 0), totalPages - 1);
  let drawerOpen = false;
  let drawerHideTimer = 0;
  let pageFlip = null;
  let currentPageIndex = startingPage;
  let coverMode = startingPage === 0;
  let openingCover = false;
  let closingToCover = false;

  const displayTitle = data.title.replace(/（[^）]+）$/, "");
  bookTitle.textContent = displayTitle;
  bookEdition.textContent = `法规阅读本 · ${data.edition}`;
  coverImage.alt = `${data.title}封面`;
  openCoverButton.setAttribute("aria-label", `翻开${data.title}`);
  document.title = data.title;
  pdfLink.href = data.pdfHref;
  progress.setAttribute("aria-valuemax", String(totalPages));

  buildContents();
  syncLucide();

  pageFlip = new window.St.PageFlip(bookElement, {
    width: 420,
    height: 595,
    size: "stretch",
    minWidth: 230,
    maxWidth: 540,
    minHeight: 326,
    maxHeight: 766,
    drawShadow: true,
    flippingTime: 880,
    usePortrait: true,
    startPage: startingPage,
    autoSize: true,
    maxShadowOpacity: 0.34,
    showCover: true,
    mobileScrollSupport: true,
    swipeDistance: 24,
    clickEventForward: true,
    useMouseEvents: true,
    showPageCorners: true,
    disableFlipByClick: false,
  });

  pageFlip.on("init", (event) => {
    updateReadingState(event.data);
    if (startingPage === 0) {
      showCoverMode();
    } else {
      coverEntry.classList.add("is-hidden");
    }
    document.body.classList.add("is-ready");
  });

  pageFlip.on("flip", (event) => {
    const pageIndex = Number(event.data);
    updateReadingState(pageIndex);
    savePage(pageIndex);
    if (pageIndex === 0 && closingToCover) {
      closingToCover = false;
      window.setTimeout(showCoverMode, 180);
    }
  });

  pageFlip.on("changeOrientation", () => {
    window.setTimeout(() => updateReadingState(pageFlip.getCurrentPageIndex()), 40);
  });

  pageFlip.loadFromImages(data.pages);

  previousButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (currentPageIndex <= 1) {
        closingToCover = true;
      }
      if (currentPageIndex > 0) {
        pageFlip.flipPrev("bottom");
      }
    });
  });

  nextButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (coverMode) {
        openBook();
        return;
      }
      if (currentPageIndex < totalPages - 1) {
        pageFlip.flipNext("bottom");
      }
    });
  });

  openCoverButton.addEventListener("click", openBook);
  openContentsButton.addEventListener("click", openDrawer);
  closeContentsButton.addEventListener("click", closeDrawer);
  drawerScrim.addEventListener("click", closeDrawer);

  fullscreenButton.addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Some file:// browsers do not expose the Fullscreen API.
    }
  });

  document.addEventListener("fullscreenchange", updateFullscreenButton);
  document.addEventListener("keydown", handleKeyboard);

  window.addEventListener("resize", () => {
    window.clearTimeout(window.__bookResizeTimer);
    window.__bookResizeTimer = window.setTimeout(() => {
      updateReadingState(pageFlip.getCurrentPageIndex());
    }, 120);
  });

  function buildContents() {
    data.frontMatter.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "front-link";
      button.textContent = item.title;
      button.addEventListener("click", () => navigateToPage(item.page));
      button.dataset.page = String(item.page);
      frontMatterList.appendChild(button);
    });

    data.chapters.forEach((chapter, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chapter-link";
      button.dataset.page = String(chapter.page);
      button.dataset.chapterIndex = String(index);
      button.innerHTML = `
        <span class="chapter-thumb">
          <img src="${chapter.thumb}" alt="" loading="lazy">
        </span>
        <span class="chapter-copy">
          <strong>${chapter.number}　${chapter.title}</strong>
          <span>${chapter.range}</span>
        </span>
        <span class="chapter-page">${chapter.page}</span>
      `;
      button.addEventListener("click", () => navigateToPage(chapter.page));
      chapterList.appendChild(button);
    });
  }

  function navigateToPage(pageNumberValue) {
    const targetIndex = Math.min(Math.max(pageNumberValue - 1, 0), totalPages - 1);
    closeDrawer();
    exitCoverMode();
    if (targetIndex === currentPageIndex) {
      return;
    }
    window.setTimeout(() => {
      pageFlip.flip(targetIndex, "bottom");
    }, 120);
  }

  function updateReadingState(rawIndex) {
    currentPageIndex = Math.min(Math.max(Number(rawIndex) || 0, 0), totalPages - 1);
    const firstVisiblePage = currentPageIndex + 1;
    const orientation = pageFlip.getOrientation();
    const isSpread =
      orientation === "landscape" &&
      currentPageIndex > 0 &&
      currentPageIndex < totalPages - 1;
    const lastVisiblePage = isSpread
      ? Math.min(firstVisiblePage + 1, totalPages)
      : firstVisiblePage;
    const pageText =
      lastVisiblePage > firstVisiblePage
        ? `${firstVisiblePage}-${lastVisiblePage} / ${totalPages}`
        : `${firstVisiblePage} / ${totalPages}`;
    const percentage = Math.min(
      100,
      Math.max(2, (lastVisiblePage / totalPages) * 100),
    );

    pageNumber.textContent = pageText;
    progressBar.style.width = `${percentage}%`;
    progress.setAttribute("aria-valuenow", String(lastVisiblePage));
    progress.setAttribute(
      "aria-valuetext",
      `第 ${firstVisiblePage} 至 ${lastVisiblePage} 页，共 ${totalPages} 页`,
    );
    currentLocation.textContent = locationLabel(lastVisiblePage);
    gutter.classList.toggle("is-visible", isSpread);

    previousButtons.forEach((button) => {
      button.disabled = currentPageIndex <= 0;
    });
    nextButtons.forEach((button) => {
      button.disabled = currentPageIndex >= totalPages - 1;
    });
    updateContentsHighlight(lastVisiblePage);
  }

  function locationLabel(page) {
    if (page <= 1) {
      return "封面";
    }
    if (page === 2) {
      return "编辑说明";
    }
    if (page === 3) {
      return "目录";
    }

    let activeChapter = null;
    for (const chapter of data.chapters) {
      if (chapter.page <= page) {
        activeChapter = chapter;
      } else {
        break;
      }
    }
    if (!activeChapter) {
      return `第 ${page} 页`;
    }
    return `${activeChapter.number}　${activeChapter.title}`;
  }

  function updateContentsHighlight(page) {
    frontMatterList.querySelectorAll(".front-link").forEach((button) => {
      button.classList.toggle("is-current", Number(button.dataset.page) === page);
    });

    let activeChapterIndex = -1;
    data.chapters.forEach((chapter, index) => {
      if (chapter.page <= page) {
        activeChapterIndex = index;
      }
    });
    chapterList.querySelectorAll(".chapter-link").forEach((button) => {
      button.classList.toggle(
        "is-current",
        Number(button.dataset.chapterIndex) === activeChapterIndex,
      );
    });
  }

  function openDrawer() {
    if (drawerOpen) {
      return;
    }
    drawerOpen = true;
    window.clearTimeout(drawerHideTimer);
    document.activeElement?.setAttribute?.("data-drawer-return-focus", "true");
    contentsDrawer.hidden = false;
    drawerScrim.hidden = false;
    contentsDrawer.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => {
      contentsDrawer.classList.add("is-open");
      drawerScrim.classList.add("is-visible");
      closeContentsButton.focus();
    });
  }

  function openBook() {
    if (!coverMode || openingCover) {
      return;
    }
    openingCover = true;
    coverEntry.classList.add("is-opening");
    window.setTimeout(() => {
      pageFlip.turnToPage(1);
      coverMode = false;
      openingCover = false;
      bookFrame.classList.remove("is-cover-mode");
      coverEntry.classList.remove("is-opening");
      coverEntry.classList.add("is-hidden");
      updateReadingState(1);
      savePage(1);
    }, 430);
  }

  function showCoverMode() {
    if (openingCover) {
      return;
    }
    coverMode = true;
    bookFrame.classList.add("is-cover-mode");
    coverEntry.hidden = false;
    coverEntry.classList.remove("is-opening", "is-hidden");
    updateReadingState(0);
  }

  function exitCoverMode() {
    coverMode = false;
    openingCover = false;
    bookFrame.classList.remove("is-cover-mode");
    coverEntry.classList.remove("is-opening");
    coverEntry.classList.add("is-hidden");
  }

  function closeDrawer() {
    if (!drawerOpen) {
      return;
    }
    drawerOpen = false;
    contentsDrawer.classList.remove("is-open");
    contentsDrawer.setAttribute("aria-hidden", "true");
    drawerScrim.classList.remove("is-visible");
    drawerHideTimer = window.setTimeout(() => {
      contentsDrawer.hidden = true;
      drawerScrim.hidden = true;
    }, 260);

    const returnFocus = document.querySelector("[data-drawer-return-focus='true']");
    if (returnFocus) {
      returnFocus.removeAttribute("data-drawer-return-focus");
      returnFocus.focus?.();
    }
  }

  function handleKeyboard(event) {
    if (drawerOpen) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
      }
      if (event.key === "Tab") {
        trapDrawerFocus(event);
      }
      return;
    }

    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      if (coverMode) {
        return;
      }
      if (currentPageIndex <= 1) {
        closingToCover = true;
      }
      if (currentPageIndex > 0) {
        pageFlip.flipPrev("bottom");
      }
    } else if (event.key === "ArrowRight" || event.key === "PageDown") {
      event.preventDefault();
      if (coverMode) {
        openBook();
        return;
      }
      if (currentPageIndex < totalPages - 1) {
        pageFlip.flipNext("bottom");
      }
    } else if (event.key === "Home") {
      event.preventDefault();
      closingToCover = true;
      pageFlip.flip(0, "bottom");
    } else if (event.key === "End") {
      event.preventDefault();
      pageFlip.flip(totalPages - 1, "bottom");
    }
  }

  function trapDrawerFocus(event) {
    const focusable = Array.from(
      contentsDrawer.querySelectorAll(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function updateFullscreenButton() {
    const active = Boolean(document.fullscreenElement);
    fullscreenButton.setAttribute("aria-label", active ? "退出全屏" : "进入全屏");
    fullscreenButton.dataset.tooltip = active ? "退出全屏" : "全屏";
    fullscreenButton.innerHTML = `
      <i data-lucide="${active ? "minimize" : "maximize"}" aria-hidden="true"></i>
    `;
    syncLucide();
  }

  function syncLucide() {
    if (window.lucide?.createIcons) {
      window.lucide.createIcons({
        attrs: { width: 17, height: 17, "stroke-width": 1.7 },
      });
    }
  }

  function readSavedPage() {
    try {
      return Number.parseInt(
        localStorage.getItem(data.storageKey || "book-page") || "0",
        10,
      );
    } catch {
      return 0;
    }
  }

  function savePage(index) {
    try {
      localStorage.setItem(data.storageKey || "book-page", String(index));
    } catch {
      // Reading remains fully functional when file:// storage is unavailable.
    }
  }
})();
