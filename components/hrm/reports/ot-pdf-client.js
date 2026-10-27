const POINT_TO_CSS_PIXEL = 96 / 72;
const CAPTURE_SCALE = 2;
const PAGE_MARGIN_LEFT_PT = 20;
const PAGE_MARGIN_RIGHT_PT = 20;
const PAGE_MARGIN_TOP_PT = 51;
const PAGE_MARGIN_BOTTOM_PT = 20;

function waitForFrame(frame) {
  return new Promise((resolve, reject) => {
    frame.addEventListener("load", resolve, { once: true });
    frame.addEventListener("error", reject, { once: true });
  });
}

function canvasOptions(frame, width, height) {
  return {
    scale: CAPTURE_SCALE,
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#ffffff",
    logging: false,
    width,
    height,
    windowWidth: frame.contentWindow?.innerWidth || width,
    windowHeight: frame.contentWindow?.innerHeight || height,
    scrollX: 0,
    scrollY: 0,
  };
}

function getRowBoundaries(block) {
  const blockTop = block.getBoundingClientRect().top;
  return Array.from(block.querySelectorAll("tr"))
    .map((row) => row.getBoundingClientRect().bottom - blockTop)
    .filter((bottom) => Number.isFinite(bottom) && bottom > 0)
    .sort((a, b) => a - b);
}

function findTableAt(block, y) {
  const blockTop = block.getBoundingClientRect().top;
  return Array.from(block.querySelectorAll("table")).find((table) => {
    const bounds = table.getBoundingClientRect();
    const top = bounds.top - blockTop;
    const bottom = bounds.bottom - blockTop;
    return top <= y + 1 && bottom > y + 1 && table.tHead;
  });
}

async function renderRepeatedTableHeader(table, frame, html2canvas) {
  const width = table.getBoundingClientRect().width;
  const tableHeader = table.cloneNode(false);
  tableHeader.style.width = `${width}px`;
  tableHeader.style.margin = "0";

  Array.from(table.children).forEach((child) => {
    if (child.tagName === "COLGROUP" || child.tagName === "THEAD") {
      tableHeader.append(child.cloneNode(true));
    }
  });

  const host = frame.contentDocument.createElement("div");
  Object.assign(host.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: `${width}px`,
    background: "#fff",
  });
  host.append(tableHeader);
  frame.contentDocument.body.append(host);

  try {
    const height = tableHeader.getBoundingClientRect().height;
    return {
      canvas: await html2canvas(tableHeader, canvasOptions(frame, width, height)),
      height,
    };
  } finally {
    host.remove();
  }
}

export async function createOtReportPdf({ html, headerTemplate }) {
  if (typeof window === "undefined") throw new Error("PDF export requires a browser");
  if (typeof html !== "string" || typeof headerTemplate !== "string") {
    throw new Error("The OT report response is incomplete");
  }

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  const pageWidthPt = pdf.internal.pageSize.getWidth();
  const pageHeightPt = pdf.internal.pageSize.getHeight();
  const contentWidthPt = pageWidthPt - PAGE_MARGIN_LEFT_PT - PAGE_MARGIN_RIGHT_PT;
  const contentHeightPt = pageHeightPt - PAGE_MARGIN_TOP_PT - PAGE_MARGIN_BOTTOM_PT;
  const contentWidthCss = contentWidthPt * POINT_TO_CSS_PIXEL;
  const contentHeightCss = contentHeightPt * POINT_TO_CSS_PIXEL;
  const pageWidthCss = pageWidthPt * POINT_TO_CSS_PIXEL;
  const pageHeightCss = pageHeightPt * POINT_TO_CSS_PIXEL;
  const pageCanvas = document.createElement("canvas");
  pageCanvas.width = Math.ceil(contentWidthCss * CAPTURE_SCALE);
  pageCanvas.height = Math.ceil(contentHeightCss * CAPTURE_SCALE);

  const frame = document.createElement("iframe");
  frame.title = "OT report PDF rendering";
  frame.tabIndex = -1;
  Object.assign(frame.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${pageWidthCss}px`,
    height: `${pageHeightCss}px`,
    border: "0",
    pointerEvents: "none",
  });

  try {
    const frameReady = waitForFrame(frame);
    frame.srcdoc = html;
    document.body.append(frame);
    await frameReady;

    const frameDocument = frame.contentDocument;
    const frameWindow = frame.contentWindow;
    const main = frameDocument?.querySelector("main");
    if (!frameDocument || !frameWindow || !main) throw new Error("The OT report content could not be loaded");

    const layoutStyle = frameDocument.createElement("style");
    layoutStyle.textContent = `html,body{width:${contentWidthCss}px!important;margin:0!important;padding:0!important;background:#fff!important}main{width:${contentWidthCss}px!important}`;
    frameDocument.head.append(layoutStyle);
    await Promise.all([document.fonts.ready, frameDocument.fonts.ready]);
    if (!frameDocument.fonts.check("12pt THSarabunNew") || !frameDocument.fonts.check("700 12pt THSarabunNew")) {
      throw new Error("Thai report fonts could not be loaded");
    }

    const context = pageCanvas.getContext("2d");
    if (!context) throw new Error("The OT report page could not be prepared");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

    let pageCount = 0;
    let pageUsedCss = 0;
    let pageHasContent = false;

    const startNewPage = () => {
      if (pageHasContent) {
        if (pageCount > 0) pdf.addPage("a4", "portrait");
        pdf.addImage(pageCanvas.toDataURL("image/jpeg", 0.97), "JPEG", PAGE_MARGIN_LEFT_PT, PAGE_MARGIN_TOP_PT, contentWidthPt, contentHeightPt, undefined, "FAST");
        pageCount += 1;
      }
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = "#fff";
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      pageUsedCss = 0;
      pageHasContent = false;
    };

    const finishPages = () => {
      if (!pageHasContent) return;
      if (pageCount > 0) pdf.addPage("a4", "portrait");
      pdf.addImage(pageCanvas.toDataURL("image/jpeg", 0.97), "JPEG", PAGE_MARGIN_LEFT_PT, PAGE_MARGIN_TOP_PT, contentWidthPt, contentHeightPt, undefined, "FAST");
      pageCount += 1;
      pageHasContent = false;
    };

    const topLevelBlocks = Array.from(main.children);
    if (!topLevelBlocks.length) throw new Error("The OT report has no printable content");

    for (const block of topLevelBlocks) {
      const blockHeight = block.getBoundingClientRect().height;
      const blockWidth = block.getBoundingClientRect().width;
      if (blockHeight <= 0 || blockWidth <= 0) continue;

      if (block.classList.contains("page-start") && pageHasContent) startNewPage();

      const blockCanvas = await html2canvas(block, canvasOptions(frame, blockWidth, blockHeight));
      const blockScaleY = blockCanvas.height / blockHeight;

      if (blockHeight <= contentHeightCss) {
        if (pageUsedCss + blockHeight > contentHeightCss && pageHasContent) startNewPage();
        const destY = Math.round(pageUsedCss * CAPTURE_SCALE);
        const destHeight = Math.round(blockHeight * CAPTURE_SCALE);
        context.drawImage(blockCanvas, 0, 0, blockCanvas.width, blockCanvas.height, 0, destY, pageCanvas.width, destHeight);
        pageUsedCss += blockHeight;
        pageHasContent = true;
        blockCanvas.width = 0;
        blockCanvas.height = 0;
        continue;
      }

      if (pageHasContent) startNewPage();
      const rowBoundaries = getRowBoundaries(block);
      const tableHeaders = new WeakMap();
      let sourceY = 0;

      while (sourceY < blockHeight - 0.5) {
        let repeatedHeader;
        if (sourceY > 0.5) {
          const table = findTableAt(block, sourceY);
          if (table) {
            repeatedHeader = tableHeaders.get(table);
            if (!repeatedHeader) {
              repeatedHeader = await renderRepeatedTableHeader(table, frame, html2canvas);
              tableHeaders.set(table, repeatedHeader);
            }
          }
        }

        const headerHeight = repeatedHeader?.height || 0;
        const availableCss = Math.max(40, contentHeightCss - headerHeight);
        const targetEnd = Math.min(blockHeight, sourceY + availableCss);
        const rowEnd = rowBoundaries.filter((bottom) => bottom > sourceY + 0.5 && bottom <= targetEnd + 0.5).at(-1);
        const sourceEnd = rowEnd || targetEnd;
        const fragmentCssHeight = sourceEnd - sourceY;

        if (repeatedHeader) {
          const destHeaderHeight = Math.round(headerHeight * CAPTURE_SCALE);
          context.drawImage(repeatedHeader.canvas, 0, 0, repeatedHeader.canvas.width, repeatedHeader.canvas.height, 0, 0, pageCanvas.width, destHeaderHeight);
        }

        const sourceTop = Math.round(sourceY * blockScaleY);
        const sourceHeight = Math.max(1, Math.round(fragmentCssHeight * blockScaleY));
        const destTop = Math.round(headerHeight * CAPTURE_SCALE);
        const destHeight = Math.round(fragmentCssHeight * CAPTURE_SCALE);
        context.drawImage(blockCanvas, 0, sourceTop, blockCanvas.width, sourceHeight, 0, destTop, pageCanvas.width, destHeight);
        pageUsedCss = headerHeight + fragmentCssHeight;
        pageHasContent = true;
        sourceY = sourceEnd;

        if (sourceY < blockHeight - 0.5) startNewPage();
      }

      blockCanvas.width = 0;
      blockCanvas.height = 0;
    }

    finishPages();
    if (!pageCount) throw new Error("The OT report PDF contains no pages");

    const headerHost = frameDocument.createElement("div");
    Object.assign(headerHost.style, {
      position: "fixed",
      left: "0",
      top: "0",
      width: `${pageWidthCss}px`,
      height: `${PAGE_MARGIN_TOP_PT * POINT_TO_CSS_PIXEL}px`,
      overflow: "hidden",
      background: "#fff",
    });
    frameDocument.body.append(headerHost);
    headerHost.innerHTML = headerTemplate;
    const pageNumberElement = headerHost.querySelector(".pageNumber");
    const totalPagesElement = headerHost.querySelector(".totalPages");
    await frameDocument.fonts.ready;

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      if (pageNumberElement) pageNumberElement.textContent = String(pageNumber);
      if (totalPagesElement) totalPagesElement.textContent = String(pageCount);
      const headerCanvas = await html2canvas(headerHost, canvasOptions(frame, pageWidthCss, PAGE_MARGIN_TOP_PT * POINT_TO_CSS_PIXEL));
      pdf.setPage(pageNumber);
      pdf.addImage(headerCanvas.toDataURL("image/jpeg", 0.98), "JPEG", 0, 0, pageWidthPt, PAGE_MARGIN_TOP_PT, undefined, "FAST");
    }

    headerHost.remove();
    return pdf.output("blob");
  } finally {
    frame.remove();
  }
}
