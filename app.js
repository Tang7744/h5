const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const screens = {
  entry: $("#entryScreen"),
  journey: $("#journeyScreen"),
  shootSheet: $("#shootSheet"),
  converter: $("#converterScreen"),
  result: $("#resultScreen"),
  bingo: $("#bingoScreen"),
  bingoSheet: $("#bingoSheet"),
  map: $("#mapScreen"),
  permission: $("#permissionDialog"),
};

const journeyImage = $("#journeyImage");
const journeyFrame = $(".journey-frame");
const shootButton = $("#shootButton");
const challengeButton = $("#challengeButton");
const photoInput = $("#photoInput");
const sourcePreview = $("#sourcePreview");
const postcardPreview = $("#postcardPreview");
const resultImage = $("#resultImage");
const canvas = $("#postcardCanvas");
const processingBadge = $("#processingBadge");
const bingoCompletions = $("#bingoCompletions");
const bingoClueText = $("#bingoClueText");
const toast = $("#toast");

const POSTCARD_WIDTH = 1132;
const POSTCARD_HEIGHT = 1512;

const state = {
  journeyMode: "scene",
  pickerMode: null,
  activeBingoIndex: 0,
  generatedDataUrl: "",
  sourceUrl: "",
  scrollY: 0,
  resultTimer: null,
  conversionRun: 0,
  toastTimer: null,
  bingoPhotos: new Map(),
};

const bingoMasks = [
  { x: 51, y: 390, w: 68, h: 47, clip: "polygon(10% 0, 79% 0, 100% 52%, 88% 68%, 88% 100%, 0 100%, 0 28%)", cx: 45, cy: 369 },
  { x: 159, y: 363, w: 50, h: 75, clip: "polygon(50% 0, 100% 24%, 100% 72%, 60% 100%, 0 80%, 20% 42%, 0 23%)", cx: 142, cy: 349 },
  { x: 266, y: 389, w: 87, h: 47, clip: "polygon(12% 0, 87% 0, 100% 54%, 80% 100%, 0 91%, 2% 23%)", cx: 261, cy: 368 },
  { x: 51, y: 484, w: 68, h: 61, clip: "polygon(46% 0, 100% 31%, 100% 76%, 62% 100%, 9% 83%, 0 39%)", cx: 43, cy: 466 },
  { x: 298, y: 517, w: 42, h: 35, clip: "polygon(10% 0, 70% 0, 100% 52%, 85% 100%, 10% 92%, 0 24%)", cx: 274, cy: 487 },
  { x: 53, y: 612, w: 69, h: 65, clip: "polygon(43% 0, 100% 12%, 72% 70%, 48% 100%, 0 85%, 0 49%)", cx: 44, cy: 592 },
  { x: 186, y: 663, w: 20, h: 23, clip: "polygon(31% 0, 76% 6%, 100% 92%, 0 100%, 5% 25%)", cx: 157, cy: 624 },
  { x: 298, y: 622, w: 32, h: 26, clip: "polygon(18% 0, 100% 17%, 89% 74%, 56% 100%, 0 69%)", cx: 276, cy: 597 },
];

// 每一项的线索文字都可以在这里单独修改。
const bingoClues = [
  { name: "i椅", before: "据说“i椅”隐藏在", emphasis: "北小湖", after: "的角落哦～" },
  { name: "i鸭", before: "听说“i鸭”常在", emphasis: "小河边", after: "悠闲散步哦～" },
  { name: "瓢虫卫生间", before: "前往", emphasis: "阶梯坡", after: "找找“瓢虫卫生间”吧～" },
  { name: "i树", before: "据说“i树”藏在", emphasis: "白桦林", after: "附近哦～" },
  { name: "小松鼠", before: "安静一点，“小松鼠”也许就在", emphasis: "林间小道", after: "等你～" },
  { name: "黄腰柳莺", before: "抬头看看，“黄腰柳莺”喜欢停在", emphasis: "河边柳道", after: "的树梢上～" },
  { name: "i派雕塑", before: "在", emphasis: "安静椅", after: "附近寻找醒目的“i派雕塑”吧～" },
  { name: "夜鹭", before: "傍晚前往", emphasis: "小河边", after: "，更容易遇见“夜鹭”哦～" },
];

function updateBingoClue(index) {
  const clue = bingoClues[index] || bingoClues[0];
  const emphasis = document.createElement("strong");
  emphasis.textContent = clue.emphasis;
  bingoClueText.replaceChildren(document.createTextNode(clue.before), emphasis, document.createTextNode(clue.after));
  $("#openBingoPicker").setAttribute("aria-label", `上传${clue.name}照片`);
}

function showPage(name) {
  screens.entry.classList.toggle("is-active", name === "entry");
  screens.journey.classList.toggle("is-active", name === "journey");
  syncInteractiveLayer();
}

const layerFocus = new Map();
const layerOrder = ["permission", "map", "bingoSheet", "shootSheet", "result", "converter", "bingo", "journey", "entry"];
function syncInteractiveLayer() {
  const top = layerOrder.find((name) => screens[name].classList.contains("is-active"));
  Object.entries(screens).forEach(([name, screen]) => {
    screen.inert = name !== top;
    screen.setAttribute("aria-hidden", String(name !== top));
  });
  return top;
}

function setLayer(name, isOpen) {
  const layer = screens[name];
  if (isOpen && !layer.classList.contains("is-active")) layerFocus.set(name, document.activeElement);
  if (!isOpen && layer.contains(document.activeElement)) document.activeElement.blur();
  layer.classList.toggle("is-active", isOpen);
  layer.setAttribute("aria-hidden", String(!isOpen));
  syncInteractiveLayer();
  if (isOpen) {
    layer.querySelector("button:not([hidden]), [tabindex='0']")?.focus({ preventScroll: true });
  } else {
    const previous = layerFocus.get(name);
    if (previous?.isConnected && !previous.closest("[inert]")) previous.focus({ preventScroll: true });
  }
}

function lockScroll() {
  if (document.body.classList.contains("is-locked")) return;
  state.scrollY = screens.journey.scrollTop;
  document.body.classList.add("is-locked");
}

function unlockScroll({ restore = true } = {}) {
  if (!document.body.classList.contains("is-locked")) return;
  document.body.classList.remove("is-locked");
  if (restore) screens.journey.scrollTop = state.scrollY;
}

function closeAllGameLayers() {
  state.conversionRun += 1;
  ["shootSheet", "converter", "result", "bingo", "bingoSheet", "map", "permission"].forEach((name) => setLayer(name, false));
  clearTimeout(state.resultTimer);
}

function setJourneyMode(mode) {
  state.journeyMode = mode;
  const isScene = mode === "scene";
  journeyFrame.classList.toggle("is-find", !isScene);
  journeyImage.src = isScene ? "./assets/figma-parts/journey-scene-bg-clean.png" : "./assets/figma-long-find-clean.png";
  journeyImage.alt = isScene ? "活动规则与 i 景日志玩法介绍" : "活动规则与找 i 物玩法介绍";
  shootButton.hidden = !isScene;
  challengeButton.hidden = isScene;
}

function openPermission(mode) {
  state.pickerMode = mode;
  setLayer("permission", true);
  $("#allowPermission").focus({ preventScroll: true });
}

function closePermission() {
  setLayer("permission", false);
}

function requestOnePhoto() {
  closePermission();
  photoInput.value = "";
  photoInput.click();
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  state.toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function wait(duration) {
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}

function waitForAnimation(element, timeout = 4800) {
  return new Promise((resolve) => {
    let timeoutId;
    const finish = () => {
      element.removeEventListener("animationend", finish);
      window.clearTimeout(timeoutId);
      resolve();
    };
    element.addEventListener("animationend", finish, { once: true });
    timeoutId = window.setTimeout(finish, timeout);
  });
}

function setConversionTravelMetrics() {
  const stage = sourcePreview.parentElement;
  const stageWidth = stage.clientWidth;
  const stageHeight = stage.clientHeight;
  const seamY = stageHeight * 0.3167;
  const availableHeight = stageHeight - seamY;
  const naturalWidth = Math.max(1, sourcePreview.naturalWidth);
  const naturalHeight = Math.max(1, sourcePreview.naturalHeight);
  const scale = Math.min(stageWidth / naturalWidth, availableHeight / naturalHeight);
  const cardWidth = naturalWidth * scale;
  const cardHeight = naturalHeight * scale;
  const cardLeft = (stageWidth - cardWidth) / 2;
  const travelStart = -cardHeight - 12;

  [sourcePreview, postcardPreview].forEach((image) => {
    image.style.setProperty("--card-left", `${cardLeft}px`);
    image.style.setProperty("--card-width", `${cardWidth}px`);
    image.style.setProperty("--card-height", `${cardHeight}px`);
    image.style.setProperty("--travel-start", `${travelStart}px`);
    image.style.setProperty("--travel-end", `${seamY}px`);
  });
}

function openGeneratedResult() {
  if (!state.generatedDataUrl) return;
  resultImage.src = state.generatedDataUrl;
  setLayer("result", true);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createSeededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function getImageSeed(file, image) {
  let seed = (file.size ^ file.lastModified ^ image.naturalWidth ^ (image.naturalHeight << 12)) >>> 0;
  for (const character of file.name) {
    seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  return seed;
}

function getDrawableSize(image) {
  return {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
}

function createCroppedPostcardSource(image) {
  const croppedCanvas = document.createElement("canvas");
  croppedCanvas.width = POSTCARD_WIDTH;
  croppedCanvas.height = POSTCARD_HEIGHT;
  const croppedContext = croppedCanvas.getContext("2d", { alpha: false });
  const scale = Math.max(
    POSTCARD_WIDTH / image.naturalWidth,
    POSTCARD_HEIGHT / image.naturalHeight,
  );
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const offsetX = (POSTCARD_WIDTH - drawWidth) / 2;
  const offsetY = (POSTCARD_HEIGHT - drawHeight) / 2;

  croppedContext.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  return croppedCanvas;
}

function drawStreakRegion(ctx, image, region, random) {
  const { width: imageWidth, height: imageHeight } = getDrawableSize(image);
  const baseBandHeight = Math.max(3, Math.round(imageHeight / 320));
  let y = Math.max(0, Math.floor(region.y));
  const bottom = Math.min(imageHeight, Math.ceil(region.y + region.height));

  ctx.save();
  ctx.beginPath();
  ctx.rect(region.x, region.y, region.width, region.height);
  ctx.clip();

  while (y < bottom) {
    const bandHeight = Math.min(
      bottom - y,
      Math.max(baseBandHeight, Math.round(baseBandHeight * (0.75 + random() * 4.8))),
    );
    const sampleWidth = Math.max(2, Math.round(imageWidth * (0.004 + random() * 0.024)));
    const sourceX = Math.floor(random() * Math.max(1, imageWidth - sampleWidth));
    const sourceY = clamp(y + Math.round((random() - 0.5) * bandHeight * 3), 0, imageHeight - bandHeight);

    ctx.globalAlpha = 0.9 + random() * 0.1;
    ctx.drawImage(
      image,
      sourceX,
      sourceY,
      sampleWidth,
      Math.max(1, bandHeight),
      region.x,
      y,
      region.width,
      bandHeight + 1,
    );
    y += bandHeight;
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawStreakComposition(ctx, image, width, height, random) {
  drawStreakRegion(ctx, image, { x: 0, y: 0, width, height }, random);

  const panelCount = 7;
  for (let index = 0; index < panelCount; index += 1) {
    const panelWidth = width * (0.14 + random() * 0.24);
    const panelHeight = height * (0.16 + random() * 0.33);
    const isEdgePanel = index < 4;
    const x = isEdgePanel
      ? (index % 2 === 0 ? random() * width * 0.18 : width - panelWidth - random() * width * 0.18)
      : random() * Math.max(1, width - panelWidth);
    const y = random() * Math.max(1, height - panelHeight);
    drawStreakRegion(ctx, image, { x, y, width: panelWidth, height: panelHeight }, random);
  }
}

function drawOriginalBlock(ctx, image, x, y, width, height) {
  const { width: imageWidth, height: imageHeight } = getDrawableSize(image);
  const sourceX = clamp(Math.round(x), 0, imageWidth - 1);
  const sourceY = clamp(Math.round(y), 0, imageHeight - 1);
  const blockWidth = clamp(Math.round(width), 1, imageWidth - sourceX);
  const blockHeight = clamp(Math.round(height), 1, imageHeight - sourceY);
  ctx.drawImage(image, sourceX, sourceY, blockWidth, blockHeight, sourceX, sourceY, blockWidth, blockHeight);
}

function drawCentralOriginalBlocks(ctx, image, width, height, random) {
  const centerX = width * (0.5 + (random() - 0.5) * 0.05);
  const centerY = height * (0.51 + (random() - 0.5) * 0.05);
  const coreWidth = width * (0.17 + random() * 0.035);
  const coreHeight = height * (0.36 + random() * 0.055);
  const blocks = [
    { x: centerX - coreWidth * 0.5, y: centerY - coreHeight * 0.5, width: coreWidth, height: coreHeight },
    { x: centerX - coreWidth * 1.05, y: centerY - coreHeight * 0.34, width: coreWidth * 1.15, height: coreHeight * 0.28 },
    { x: centerX - coreWidth * 0.04, y: centerY - coreHeight * 0.22, width: coreWidth * 1.13, height: coreHeight * 0.31 },
    { x: centerX - coreWidth * 0.78, y: centerY - coreHeight * 0.63, width: coreWidth * 1.42, height: coreHeight * 0.22 },
    { x: centerX - coreWidth * 0.9, y: centerY + coreHeight * 0.24, width: coreWidth * 1.3, height: coreHeight * 0.22 },
    { x: centerX + coreWidth * 0.18, y: centerY + coreHeight * 0.03, width: coreWidth * 0.78, height: coreHeight * 0.18 },
  ];

  blocks.forEach((block) => drawOriginalBlock(ctx, image, block.x, block.y, block.width, block.height));
  return blocks;
}

function captionPointOverlapsBlocks(point, blocks, margin) {
  return blocks.some((block) => (
    point.x >= block.x - margin &&
    point.x <= block.x + block.width + margin &&
    point.y >= block.y - margin &&
    point.y <= block.y + block.height + margin
  ));
}

function createCaptionLayout(letters, width, height, fontSize, random, excludedBlocks) {
  const edgeMargin = fontSize * 0.8;

  for (let attempt = 0; attempt < 36; attempt += 1) {
    const textWidth = width * (0.46 + random() * 0.16);
    const centerX = width * (0.33 + random() * 0.34);
    const useTopArea = random() > 0.5;
    const centerY = height * (useTopArea ? 0.15 + random() * 0.16 : 0.69 + random() * 0.16);
    const rotation = (random() - 0.5) * 0.9;
    const curveDirection = random() > 0.5 ? 1 : -1;
    const curveDepth = Math.min(width, height) * (0.115 + random() * 0.08) * curveDirection;
    const waveDepth = Math.min(width, height) * (0.02 + random() * 0.045);
    const waveCount = 1 + Math.floor(random() * 2);
    const wavePhase = random() * Math.PI * 2;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    const points = letters.map((letter, index) => {
      const progress = letters.length === 1 ? 0.5 : index / (letters.length - 1);
      const localX = (progress - 0.5) * textWidth;
      const normalizedX = localX / Math.max(1, textWidth / 2);
      const waveAngle = progress * waveCount * Math.PI * 2 + wavePhase;
      const localY = curveDepth * (normalizedX * normalizedX - 0.5) + Math.sin(waveAngle) * waveDepth;
      const tangent =
        (4 * curveDepth * normalizedX) / Math.max(1, textWidth) +
        (Math.cos(waveAngle) * waveDepth * waveCount * Math.PI * 2) / Math.max(1, textWidth);

      return {
        letter,
        x: centerX + localX * cos - localY * sin,
        y: centerY + localX * sin + localY * cos,
        angle: rotation + Math.atan(tangent) + (random() - 0.5) * 0.07,
      };
    });

    const isInsideCanvas = points.every((point) => (
      point.x >= edgeMargin &&
      point.x <= width - edgeMargin &&
      point.y >= edgeMargin &&
      point.y <= height - edgeMargin
    ));
    const avoidsOriginalBlocks = points.every((point) => (
      !captionPointOverlapsBlocks(point, excludedBlocks, fontSize * 0.72)
    ));

    if (isInsideCanvas && avoidsOriginalBlocks) return points;
  }

  // A guaranteed fallback above the preserved center blocks.
  return letters.map((letter, index) => {
    const progress = letters.length === 1 ? 0.5 : index / (letters.length - 1);
    const normalizedX = progress * 2 - 1;
    return {
      letter,
      x: width * (0.22 + progress * 0.56),
      y: height * 0.12 + Math.sin(progress * Math.PI) * Math.min(width, height) * 0.1,
      angle: Math.atan(Math.cos(progress * Math.PI) * 0.45) + normalizedX * 0.08,
    };
  });
}

function drawCurvedCaption(ctx, width, height, random, excludedBlocks) {
  const text = "i-things in sunpark";
  const letters = [...text];
  const fontSize = Math.max(24, Math.round(Math.min(width, height) * (0.052 + random() * 0.012)));
  ctx.save();
  ctx.fillStyle = "#fffdf7";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgb(22 29 24 / 24%)";
  ctx.shadowBlur = Math.max(2, fontSize * 0.08);
  ctx.font = `${fontSize}px IPath, cursive`;

  const layout = createCaptionLayout(letters, width, height, fontSize, random, excludedBlocks);
  layout.forEach(({ letter, x, y, angle }) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillText(letter, 0, 0);
    ctx.restore();
  });

  ctx.restore();
}

async function makePostcard(file) {
  await document.fonts.load("54px IPath").catch(() => undefined);
  const uploadedImage = await loadImage(file);
  const croppedSource = createCroppedPostcardSource(uploadedImage);
  canvas.width = POSTCARD_WIDTH;
  canvas.height = POSTCARD_HEIGHT;
  const ctx = canvas.getContext("2d", { alpha: false });
  const width = canvas.width;
  const height = canvas.height;
  const random = createSeededRandom(getImageSeed(file, uploadedImage) ^ (Date.now() & 0xffffffff));

  drawStreakComposition(ctx, croppedSource, width, height, random);
  const originalBlocks = drawCentralOriginalBlocks(ctx, croppedSource, width, height, random);
  drawCurvedCaption(ctx, width, height, random, originalBlocks);

  return {
    sourceDataUrl: croppedSource.toDataURL("image/png"),
    postcardDataUrl: canvas.toDataURL("image/png", 0.95),
  };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片读取失败"));
    };
    image.src = url;
  });
}

async function startConversion(file) {
  const runId = ++state.conversionRun;
  clearTimeout(state.resultTimer);
  setLayer("shootSheet", false);
  setLayer("result", false);
  setLayer("converter", true);
  processingBadge.textContent = "正在制作派记忆明信片…";
  processingBadge.classList.add("is-visible");

  if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
  state.sourceUrl = "";
  sourcePreview.removeAttribute("src");
  sourcePreview.classList.remove("is-hidden", "is-travelling");
  postcardPreview.hidden = true;
  postcardPreview.classList.remove("is-travelling", "is-ready");
  postcardPreview.removeAttribute("src");

  try {
    const { sourceDataUrl, postcardDataUrl } = await makePostcard(file);
    if (runId !== state.conversionRun) return;
    state.generatedDataUrl = postcardDataUrl;
    sourcePreview.src = sourceDataUrl;
    resultImage.src = postcardDataUrl;
    postcardPreview.src = postcardDataUrl;
    postcardPreview.hidden = false;

    await Promise.all([
      sourcePreview.decode().catch(() => undefined),
      postcardPreview.decode().catch(() => undefined),
    ]);
    if (runId !== state.conversionRun) return;

    setConversionTravelMetrics();
    sourcePreview.classList.remove("is-travelling");
    postcardPreview.classList.remove("is-travelling", "is-ready");
    void sourcePreview.offsetWidth;
    void postcardPreview.offsetWidth;
    requestAnimationFrame(() => {
      sourcePreview.classList.add("is-travelling");
      postcardPreview.classList.add("is-travelling");
    });

    await waitForAnimation(postcardPreview);
    if (runId !== state.conversionRun) return;

    sourcePreview.classList.add("is-hidden");
    postcardPreview.classList.add("is-ready");
    processingBadge.textContent = "生成完成";
    await wait(220);
    if (runId !== state.conversionRun) return;
    openGeneratedResult();
    processingBadge.classList.remove("is-visible");
  } catch (error) {
    if (runId !== state.conversionRun) return;
    processingBadge.classList.remove("is-visible");
    showToast(error.message || "这张照片暂时无法处理，请换一张试试");
  }
}

function addBingoCompletion(index, imageUrl) {
  const mask = bingoMasks[index];
  const card = $(`[data-bingo-index="${index}"]`);
  const viewport = card.closest(".bingo-board");
  const completion = document.createElement("div");
  completion.className = "bingo-completion";
  completion.style.left = `${((mask.x - 17) / 361) * 100}%`;
  completion.style.top = `${((mask.y - 266) / 468) * 100}%`;
  completion.style.width = `${(mask.w / 361) * 100}%`;
  completion.style.height = `${(mask.h / 468) * 100}%`;
  completion.style.clipPath = mask.clip;

  const image = document.createElement("img");
  image.src = imageUrl;
  image.alt = "已上传的 i 物照片";
  completion.appendChild(image);

  const stateOverlay = document.createElement("div");
  stateOverlay.className = "bingo-card-state";
  const cardRect = card.getBoundingClientRect();
  const boardRect = viewport.getBoundingClientRect();
  stateOverlay.style.left = `${((cardRect.left - boardRect.left) / boardRect.width) * 100}%`;
  stateOverlay.style.top = `${((cardRect.top - boardRect.top) / boardRect.height) * 100}%`;
  stateOverlay.style.width = `${(cardRect.width / boardRect.width) * 100}%`;
  stateOverlay.style.height = `${(cardRect.width / boardRect.height) * 100}%`;

  const maskImage = document.createElement("img");
  maskImage.className = "bingo-mask-overlay";
  maskImage.src = "./assets/figma-parts/bingo-overlay.png";
  maskImage.alt = "";
  stateOverlay.appendChild(maskImage);

  const checkImage = document.createElement("img");
  checkImage.className = "bingo-check-image";
  checkImage.src = "./assets/figma-parts/bingo-check.png";
  checkImage.alt = "已完成";
  stateOverlay.appendChild(checkImage);

  const oldCompletion = $(`[data-completion-index="${index}"]`, bingoCompletions);
  const oldState = $(`[data-state-index="${index}"]`, bingoCompletions);
  oldCompletion?.remove();
  oldState?.remove();
  completion.dataset.completionIndex = String(index);
  stateOverlay.dataset.stateIndex = String(index);
  card.classList.add("is-complete");
  card.setAttribute("aria-pressed", "true");
  bingoCompletions.append(completion, stateOverlay);
}

function completeBingo(file) {
  const imageUrl = URL.createObjectURL(file);
  const oldUrl = state.bingoPhotos.get(state.activeBingoIndex);
  if (oldUrl) URL.revokeObjectURL(oldUrl);
  state.bingoPhotos.set(state.activeBingoIndex, imageUrl);
  addBingoCompletion(state.activeBingoIndex, imageUrl);
  setLayer("bingoSheet", false);
  setLayer("bingo", true);
  showToast("找到一个 i 物，已放进 Bingo 拼图");
}

function downloadResult() {
  if (!state.generatedDataUrl) return;
  const link = document.createElement("a");
  link.href = state.generatedDataUrl;
  link.download = `i景日志-${new Date().toISOString().slice(0, 10)}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  showToast("图片已开始保存");
}

$("#enterButton").addEventListener("click", () => {
  showPage("journey");
  screens.journey.scrollTop = 0;
});

$("#sceneTab").addEventListener("click", () => setJourneyMode("scene"));
$("#findTab").addEventListener("click", () => setJourneyMode("find"));

shootButton.addEventListener("click", () => {
  lockScroll();
  setLayer("shootSheet", true);
});

challengeButton.addEventListener("click", () => {
  lockScroll();
  setLayer("bingo", true);
});

$$('[data-close-sheet]').forEach((button) => button.addEventListener("click", () => {
  setLayer("shootSheet", false);
  unlockScroll();
}));

$("#openScenePicker").addEventListener("click", () => openPermission("scene"));
$("#openBingoPicker").addEventListener("click", () => openPermission("bingo"));
$("#denyPermission").addEventListener("click", closePermission);
$("#permissionBackdrop").addEventListener("click", closePermission);
$("#allowPermission").addEventListener("click", requestOnePhoto);

photoInput.addEventListener("change", () => {
  const [file] = photoInput.files || [];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("请选择一张图片文件");
    return;
  }
  if (state.pickerMode === "scene") startConversion(file);
  if (state.pickerMode === "bingo") completeBingo(file);
});

$("#converterBack").addEventListener("click", () => {
  closeAllGameLayers();
  unlockScroll();
});

$("#converterShare").addEventListener("click", () => showToast("本地版本暂不提供分享功能"));
$("#reuploadButton").addEventListener("click", () => openPermission("scene"));
$("#saveButton").addEventListener("click", downloadResult);
$("#shareButton").addEventListener("click", () => showToast("本地版本暂不提供分享功能"));
$("#closeResultButton").addEventListener("click", () => {
  setLayer("result", false);
});

postcardPreview.addEventListener("click", openGeneratedResult);
postcardPreview.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  openGeneratedResult();
});

$$('[data-bingo-index]').forEach((button) => {
  button.addEventListener("click", () => {
    state.activeBingoIndex = Number(button.dataset.bingoIndex);
    updateBingoClue(state.activeBingoIndex);
    setLayer("bingoSheet", true);
  });
});

$$('[data-close-bingo-sheet]').forEach((button) => button.addEventListener("click", () => setLayer("bingoSheet", false)));

const mapViewport = $(".map-viewport");

$("#openMapButton").addEventListener("click", () => {
  mapViewport.classList.remove("is-fullscreen");
  setLayer("map", true);
});

$("#mapPreviewButton").addEventListener("click", () => {
  mapViewport.classList.add("is-fullscreen");
});

$("#closeMapButton").addEventListener("click", () => {
  mapViewport.classList.remove("is-fullscreen");
  setLayer("map", false);
  $("#openMapButton").focus({ preventScroll: true });
});

window.addEventListener("keydown", (event) => {
  const top = layerOrder.find((name) => screens[name].classList.contains("is-active"));
  if (event.key === "Tab" && screens[top]?.getAttribute("role") === "dialog") {
    const buttons = $$('button:not([disabled]), [tabindex="0"]', screens[top]);
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  if (event.key !== "Escape") return;
  const close = { permission: "#denyPermission", map: "#closeMapButton", bingoSheet: "[data-close-bingo-sheet]", shootSheet: "[data-close-sheet]", result: "#closeResultButton" }[top];
  if (close) { event.preventDefault(); $(close).click(); }
});

$("#bingoBack").addEventListener("click", () => {
  setLayer("bingoSheet", false);
  setLayer("bingo", false);
  unlockScroll();
});

$("#bingoShare").addEventListener("click", () => showToast("本地版本暂不提供分享功能"));

window.addEventListener("beforeunload", () => {
  if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
  state.bingoPhotos.forEach((url) => URL.revokeObjectURL(url));
});

updateBingoClue(0);
setJourneyMode("scene");

// CSS dynamic viewport units own the canvas height. JS only measures artwork and
// the desktop shell, never feeds a stale VisualViewport height back into layout.
const app = $("#app");
const desktopQuery = matchMedia("(hover: hover) and (pointer: fine)");
// A narrow desktop window is still a desktop. Do not mistake it for a phone.
// The explicit mobile preview is for responsive QA without spoofing the browser.
const previewMode = new URLSearchParams(window.location.search).get("preview");
function shouldShowDeviceFrame(userAgent, platform, touchPoints, finePointer, preview) {
  if (preview === "mobile") return false;
  const mobilePlatform = /Android|iPhone|iPad|iPod|Mobi/i.test(userAgent);
  const desktopModeIPad = platform === "MacIntel" && touchPoints > 1;
  return !mobilePlatform && !desktopModeIPad && finePointer;
}
let layoutFrame = 0;
function updateViewport() {
  cancelAnimationFrame(layoutFrame);
  layoutFrame = requestAnimationFrame(() => {
    const desktop = shouldShowDeviceFrame(navigator.userAgent, navigator.platform, navigator.maxTouchPoints || 0, desktopQuery.matches, previewMode);
    document.documentElement.classList.toggle("is-desktop", desktop);
    const visibleHeight = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty("--device-scale", String(Math.min(1, (visibleHeight - 64) / 876, (innerWidth - 80) / 417)));
    const width = app.clientWidth;
    const height = app.clientHeight;
    const safeBottom = parseFloat(getComputedStyle(app).getPropertyValue("--safe-bottom")) || 0;
    app.style.setProperty("--u", `${width / 393}px`);
    app.style.setProperty("--nav-unit", `${Math.min(1, height / 852)}px`);
    app.style.setProperty("--entry-unit", `${Math.min(width / 393, height / 852)}px`);
    app.classList.toggle("entry-is-compact", height / width < 852 / 393 - .001);
    app.style.setProperty("--board-unit", `${Math.min(width / 393, (height - safeBottom) / 680)}px`);
    if (screens.converter.classList.contains("is-active") && sourcePreview.naturalWidth) setConversionTravelMetrics();
    app.dataset.viewport = `${width}x${height}`;
  });
}
window.addEventListener("resize", updateViewport);
window.visualViewport?.addEventListener("resize", updateViewport);
if (desktopQuery.addEventListener) desktopQuery.addEventListener("change", updateViewport);
else desktopQuery.addListener(updateViewport);
if (window.ResizeObserver) new ResizeObserver(updateViewport).observe(app);
updateViewport();
syncInteractiveLayer();
