     const config = {
    pdfScale: 1.5,
    imageQuality: 0.7,
    debounceDelay: 100,
    tesseractLang: 'eng',
    minWordConfidence: 30,
    minWordLength: 2,
    apiUrl: 'https://api.mymemory.translated.net/get',
    stopWords: ["the", "a", "an", "is", "are", "was", "were", "has", "have", "had", "if", "and", "or", "but", "in", "on", "at", "to"],
    fallbackTranslations: {
        "this": "هذا", "episode": "حلقة", "contains": "يحتوي", "depictions": "تصويرات", "violence": "عنف",
        "that": "ذلك", "may": "قد", "upsetting": "مزعج", "for": "لـ", "some": "بعض", "readers": "قراء",
        "its": "إنه", "dokkaebi": "دوكايبي", "someone": "شخص ما", "exclaimed": "صرخ", "creature": "مخلوق",
        "sprung": "قفز", "into": "إلى", "view": "منظر", "amythical": "أسطوري", "korean": "كوري",
        "culture": "ثقافة", "similar": "مشابه", "goblin": "عفريت", "entire": "كامل"
    }
};

const elements = {
    fileInput: document.getElementById("fileInput"),
    startProcessing: document.getElementById("startProcessing"),
    container: document.getElementById("container"),
    output: document.getElementById("output"),
    loading: document.getElementById("loading"),
    saveOfflineButton: document.getElementById("saveOfflineButton")
};

let db, translationCache = new Map(), processedPagesDataForOffline = [];
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';
} 

async function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ManhwaDB', 1);
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            db.createObjectStore('translations', { keyPath: 'word' });
            db.createObjectStore('pages', { keyPath: 'pageNum' });
        };
        request.onsuccess = () => { db = request.result; resolve(); };
        request.onerror = () => reject('Failed to initialize IndexedDB');
    });
}

async function clearIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase('ManhwaDB');
        request.onsuccess = () => {
            console.log('IndexedDB cleared');
            resolve();
        };
        request.onerror = () => reject('Failed to clear IndexedDB');
    });
}

async function cacheTranslation(word, translation) {
    return new Promise((resolve) => {
        const transaction = db.transaction(['translations'], 'readwrite');
        const store = transaction.objectStore('translations');
        store.put({ word, translation });
        transaction.oncomplete = () => resolve();
    });
}

async function getCachedTranslation(word) {
    return new Promise((resolve) => {
        const transaction = db.transaction(['translations'], 'readonly');
        const store = transaction.objectStore('translations');
        const request = store.get(word);
        request.onsuccess = () => resolve(request.result?.translation);
    });
}

async function cachePageData(pageData) {
    return new Promise((resolve) => {
        const transaction = db.transaction(['pages'], 'readwrite');
        const store = transaction.objectStore('pages');
        store.put(pageData);
        transaction.oncomplete = () => resolve();
    });
}

async function getCachedPage(pageNum) {
    return new Promise((resolve) => {
        const transaction = db.transaction(['pages'], 'readonly');
        const store = transaction.objectStore('pages');
        const request = store.get(pageNum);
        request.onsuccess = () => resolve(request.result);
    });
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function isValidBase64Image(base64Str) {
    if (!base64Str || typeof base64Str !== 'string') return false;
    const base64Regex = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/;
    return base64Regex.test(base64Str) && base64Str.length > 100;
}

const debouncedRedraw = debounce(redrawWordBoxesOnResize, config.debounceDelay);

elements.fileInput.addEventListener("change", (e) => {
    console.log("File selected");
    const file = e.target.files[0];
    if (file) {
        elements.startProcessing.style.display = 'block';
        elements.startProcessing.onclick = () => {
            console.log("Start processing clicked");
            if (file.type === "text/html") {
                console.log("Loading offline HTML file");
                loadOfflineHTML(file);
            } else {
                processFileOnline(file);
            }
        };
    } else {
        elements.startProcessing.style.display = 'none';
    }
});

async function processFileOnline(file) {
    if (!file) {
        elements.output.textContent = "الرجاء اختيار ملف.";
        console.log("No file selected");
        return;
    }
    console.log("Cleaning previous elements...");
    elements.container.innerHTML = "";
    elements.output.textContent = "";
    processedPagesDataForOffline = [];
    elements.saveOfflineButton.style.display = "none";
    elements.loading.style.display = "block";
    try {
        console.log("in try");
        await clearIndexedDB();
        console.log("done1");
        await initIndexedDB();
        console.log("done2");

        let pagesData;
        if (file.type === "application/pdf") {
            console.log("Processing PDF via backend...");
            const backendPages = await sendPDFToBackend(file);
            console.log("Backend pages received:", backendPages);
            pagesData = backendPages.map((page, index) => ({
                imgData: page.image,
                wordsData: { words: page.words },
                pageNum: index + 1
            }));
        } else if (file.type.startsWith("image/")) {
            const imgData = await readFileAsDataURL(file);
            const wordsData = await extractTextFromImage(imgData);
            pagesData = [{ imgData, wordsData, pageNum: 1 }];
        } else {
            elements.output.textContent = "نوع الملف غير مدعوم.";
            console.log("Unsupported file type");
            return;
        }
        processedPagesDataForOffline = await processExtractedWordsWithTranslation(pagesData);
        await renderPages(processedPagesDataForOffline);
        elements.saveOfflineButton.style.display = "block";
    } catch (error) {
        elements.output.textContent = `خطأ: ${error.message}`;
        console.error("Error processing file:", error);
    } finally {
        elements.loading.style.display = "none";
    }
}

async function sendPDFToBackend(file, retries = 3) {
    /* http://localhost:3000/process-pdf */
    /* https://manhwatranslator-backend.fly.dev/process-pdf */
  const pdfBase64 = await readFileAsDataURL(file);
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.post('http://localhost:3000/process-pdf', {
        pdf: pdfBase64.split(',')[1] 
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 240000
      });
      if (response.data.error) throw new Error(response.data.error);
      return response.data.pages;
    } catch (error) {
      if (i === retries - 1) throw new Error(`Backend error: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying
    }
  }
}


 

async function readFileAsDataURL(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
    });
}

async function processPDF(file) {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    console.log("Loading PDF...");
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    const numPages = pdf.numPages;
    console.log(`Number of pages: ${numPages}`);
    const pagesData = [];
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        console.log(`Processing page ${pageNum}...`);
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: config.pdfScale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        console.log(`Canvas dimensions for page ${pageNum}: ${canvas.width}x${canvas.height}`);
        const context = canvas.getContext("2d");
        await page.render({ canvasContext: context, viewport }).promise;
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const isCanvasEmpty = imageData.data.every(pixel => pixel === 0);
        if (isCanvasEmpty) {
            console.warn(`Canvas for page ${pageNum} is empty`);
            elements.output.textContent += `Warning: Canvas for page ${pageNum} is empty\n`;
        }
        let imgData;
        try {
            imgData = canvas.toDataURL("image/jpeg", config.imageQuality);
            if (!isValidBase64Image(imgData)) {
                throw new Error("Invalid base64 data generated");
            }
            console.log(`Generated base64 for page ${pageNum}, length: ${imgData.length}`);
        } catch (error) {
            console.error(`Failed to generate base64 for page ${pageNum}:`, error);
            elements.output.textContent += `Error: Failed to generate image for page ${pageNum}\n`;
            imgData = '';
        }
        console.log(`Extracting text from page ${pageNum}...`);
        const wordsData = await extractTextFromImage(imgData);
        console.log(`Extracted ${wordsData.words?.length || 0} words for page ${pageNum}`);
        const pageData = { imgData, wordsData, pageNum };
        await cachePageData(pageData);
        pagesData.push(pageData);
    }
    return pagesData;
}

async function extractTextFromImage(imgData) {
    if (!imgData || !isValidBase64Image(imgData)) {
        console.error("Invalid image data provided to Tesseract");
        elements.output.textContent += `Error: Invalid image data for text extraction\n`;
        return { words: [] };
    }
    if (typeof Tesseract === 'undefined') throw new Error("Tesseract.js not loaded");
    elements.output.textContent += "Extracting text...\n";
    console.log("Starting Tesseract in Web Worker");
    try {
        const worker = new Worker(URL.createObjectURL(new Blob([`
            importScripts('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js');
            self.onmessage = async (e) => {
                const { imgData } = e.data;
                try {
                    const worker = await Tesseract.createWorker('eng', 1);
                    const { data } = await worker.recognize(imgData);
                    await worker.terminate();
                    self.postMessage({ data });
                } catch (error) {
                    self.postMessage({ error: error.message });
                }
            };
        `], { type: 'text/javascript' })));
        return new Promise((resolve, reject) => {
            worker.onmessage = (e) => {
                if (e.data.error) {
                    console.error("Tesseract error:", e.data.error);
                    resolve({ words: [] });
                } else {
                    console.log("Tesseract result:", e.data.data.text?.substring(0, 100) || "No text found");
                    elements.output.style.display = "block";
                    elements.output.textContent += `Extracted text: ${e.data.data.text?.substring(0, 100)}...\n`;
                    resolve(e.data.data);
                }
                worker.terminate();
            };
            worker.postMessage({ imgData });
        });
    } catch (error) {
        console.error("Tesseract error:", error);
        elements.output.textContent += `Error extracting text: ${error.message}\n`;
        return { words: [] };
    }
}

async function translateWord(word) {
    const lowerWord = word.toLowerCase().replace(/[^a-z]/gi, '');
    if (!lowerWord) return "غير مترجم";
    if (translationCache.has(lowerWord)) {
        console.log(`Using memory cache for ${lowerWord}`);
        return translationCache.get(lowerWord);
    }
    const cachedTranslation = await getCachedTranslation(lowerWord);
    if (cachedTranslation) {
        console.log(`Using IndexedDB cache for ${lowerWord}`);
        translationCache.set(lowerWord, cachedTranslation);
        return cachedTranslation;
    }
    if (config.fallbackTranslations[lowerWord]) {
        translationCache.set(lowerWord, config.fallbackTranslations[lowerWord]);
        await cacheTranslation(lowerWord, config.fallbackTranslations[lowerWord]);
        return config.fallbackTranslations[lowerWord];
    }
    if (navigator.onLine) {
        try {
            console.log(`Requesting translation for ${lowerWord}`);
            const response = await fetch(`${config.apiUrl}?q=${encodeURIComponent(lowerWord)}&langpair=en|ar`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            let translation = data.responseData.translatedText || "غير مترجم";
            if (translation.includes(",")) translation = translation.split(",")[0].trim();
            translationCache.set(lowerWord, translation);
            await cacheTranslation(lowerWord, translation);
            console.log(`Translated ${lowerWord}: ${translation}`);
            return translation;
        } catch (error) {
            console.error(`Translation error for ${lowerWord}:`, error);
            translationCache.set(lowerWord, "غير مترجم");
            await cacheTranslation(lowerWord, "غير مترجم");
            return "غير مترجم";
        }
    } else {
        console.log(`Offline, cannot translate ${lowerWord}`);
        translationCache.set(lowerWord, "غير مترجم (أوفلاين)");
        await cacheTranslation(lowerWord, "غير مترجم (أوفلاين)");
        return "غير مترجم (أوفلاين)";
    }
}

async function compressImage(imgData, quality = config.imageQuality, format = "image/jpeg") {
    if (!imgData || !isValidBase64Image(imgData)) {
        console.error("Invalid image data for compression");
        return imgData;
    }
    return new Promise((resolve) => {
        const img = new Image();
        img.src = imgData;
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            let compressedData;
            try {
                compressedData = canvas.toDataURL(format, quality);
                if (!isValidBase64Image(compressedData)) {
                    throw new Error("Invalid compressed base64 data");
                }
                console.log(`Image compressed, base64 length: ${compressedData.length}`);
            } catch (error) {
                console.error("Image compression failed:", error);
                compressedData = imgData;
            }
            resolve(compressedData);
        };
        img.onerror = () => {
            console.error("Failed to load image for compression");
            resolve(imgData);
        };
    });
}

async function processExtractedWordsWithTranslation(pagesData) {
    const allPagesProcessedData = [];
    for (const page of pagesData) {
        const filteredWordsData = [];
        if (page.wordsData?.words) {
            for (const wordDetails of page.wordsData.words) {
                const text = wordDetails.text?.toLowerCase().replace(/[^a-z]/gi, '');
                if (text && wordDetails.confidence >= config.minWordConfidence && text.length > config.minWordLength && !config.stopWords.includes(text)) {
                    const translation = await translateWord(text);
                    filteredWordsData.push({
                        text: wordDetails.text,
                        bbox: wordDetails.bbox,
                        translation
                    });
                }
            }
        }
        console.log(`Page ${page.pageNum}: ${page.wordsData?.words?.length || 0} raw words, ${filteredWordsData.length} words after filtering`);
        if (filteredWordsData.length === 0) {
            elements.output.textContent += `Warning: No valid words extracted for page ${page.pageNum}\n`;
        }
        const compressedImgData = await compressImage(page.imgData);
        const pageData = { imgData: compressedImgData, wordsData: filteredWordsData, pageNum: page.pageNum };
        await cachePageData(pageData);
        allPagesProcessedData.push(pageData);
    }
    return allPagesProcessedData;
}

async function renderPages(pagesToRender) {
    elements.container.innerHTML = "";
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const pageContainer = entry.target;
                const img = pageContainer.querySelector(".page-image");
                const pageNum = pageContainer.dataset.pageNum;
                const pageData = pagesToRender.find(p => p.pageNum == pageNum);
                if (pageData && img) {
                    if (pageData.wordsData?.length > 0) {
                        drawWordBoxes(pageData.wordsData, img, pageContainer);
                        console.log(`Word boxes drawn for page ${pageNum} via observer`);
                    } else {
                        console.log(`No words to draw for page ${pageNum}`);
                        elements.output.textContent += `Warning: No word boxes drawn for page ${pageNum} (empty wordsData)\n`;
                    }
                }
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    for (const pageData of pagesToRender) {
        if (!pageData.imgData || !isValidBase64Image(pageData.imgData)) {
            console.error(`Invalid image data for page ${pageData.pageNum}`);
            elements.output.textContent += `Error: Invalid image data for page ${pageData.pageNum}\n`;
            const errorDiv = document.createElement("div");
            errorDiv.className = "image-error";
            errorDiv.textContent = `Failed to load image for page ${pageData.pageNum}`;
            elements.container.appendChild(errorDiv);
            continue;
        }
        const pageContainer = document.createElement("div");
        pageContainer.className = "page-container";
        pageContainer.dataset.pageNum = pageData.pageNum;
        const img = document.createElement("img");
        img.className = "page-image";
        img.src = pageData.imgData;
        img.alt = `صفحة مانهوا ${pageData.pageNum}`;
        const testImg = new Image();
        testImg.src = pageData.imgData;
        testImg.onload = () => {
            pageContainer.appendChild(img);
            elements.container.appendChild(pageContainer);
            requestAnimationFrame(() => {
                if (pageData.wordsData?.length > 0) {
                    drawWordBoxes(pageData.wordsData, img, pageContainer);
                    console.log(`Word boxes drawn initially for page ${pageData.pageNum}`);
                } else {
                    console.log(`No words to draw for page ${pageNum}`);
                    elements.output.textContent += `Warning: No word boxes drawn for page ${pageNum} (empty wordsData)\n`;
                }
                observer.observe(pageContainer);
                console.log(`Page ${pageData.pageNum} set for observer`);
                pageContainer.offsetHeight;
            });
            console.log(`Page ${pageData.pageNum} image loaded successfully`);
        };
        testImg.onerror = () => {
            console.error(`Image data invalid for page ${pageData.pageNum}`);
            elements.output.textContent += `Error: Image data invalid for page ${pageData.pageNum}\n`;
            const errorDiv = document.createElement("div");
            errorDiv.className = "image-error";
            errorDiv.textContent = `Failed to load image for page ${pageData.pageNum}`;
            pageContainer.appendChild(errorDiv);
            elements.container.appendChild(pageContainer);
        };
        img.onerror = () => {
            console.error(`Failed to render image for page ${pageData.pageNum}`);
            elements.output.textContent += `Error: Failed to render image for page ${pageData.pageNum}\n`;
        };
    }
    setTimeout(() => {
        if (elements.output.textContent.length > 2000) elements.output.style.display = "none";
    }, 5000);
}

function drawWordBoxes(words, imgElement, pageContainerElement) {
    const existingWords = pageContainerElement.querySelectorAll(".word");
    existingWords.forEach(wordDiv => wordDiv.remove());
    const scaleX = imgElement.clientWidth / imgElement.naturalWidth;
    const scaleY = imgElement.clientHeight / imgElement.naturalHeight;
    console.log(`Drawing ${words.length} word boxes for page`);
    for (const word of words) {
        const box = word.bbox;
        if (!box) continue;
        const wordDiv = document.createElement("div");
        wordDiv.className = "word";
        wordDiv.style.left = `${box.x0 * scaleX}px`;
        wordDiv.style.top = `${box.y0 * scaleY}px`;
        wordDiv.style.width = `${(box.x1 - box.x0) * scaleX}px`;
        wordDiv.style.height = `${(box.y1 - box.y0) * scaleY}px`;
        pageContainerElement.appendChild(wordDiv);
        wordDiv.addEventListener("click", (e) => {
            e.stopPropagation();
            console.log(`Clicked word: ${word.text}`);
            showTooltip(wordDiv, word.text, word.translation, e.clientX, e.clientY);
        });
    }
}

function showTooltip(wordDiv, originalWord, translation, x, y) {
    const existingTooltip = document.querySelector(".tooltip");
    if (existingTooltip) existingTooltip.remove();
    const tooltip = document.createElement("div");
    tooltip.className = "tooltip";
    tooltip.innerHTML = `
        <div>
            <strong>الكلمة:</strong> ${originalWord}<br>
            <strong>الترجمة:</strong> ${translation}<br>
            <button onclick="pronounceWord('${originalWord.replace(/[^a-zA-Z0-9\s]/g, '')}')">نطق الكلمة</button>
        </div>`;
    document.body.appendChild(tooltip);
    const rect = tooltip.getBoundingClientRect();
    let left = x + 15, top = y + 15;
    if (left + rect.width > window.innerWidth) left = x - rect.width - 15;
    if (top + rect.height > window.innerHeight) top = y - rect.height - 15;
    if (left < 0) left = 5;
    if (top < 0) top = 5;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.display = "block";
    document.addEventListener("click", function closeTooltip(event) {
        if (!tooltip.contains(event.target) && event.target !== wordDiv) {
            tooltip.remove();
            document.removeEventListener("click", closeTooltip, true);
        }
    }, true);
}

window.pronounceWord = function (wordToPronounce) {
    if (!window.speechSynthesis) {
        alert("ميزة النطق غير مدعومة في متصفحك.");
        return;
    }
    const utterance = new SpeechSynthesisUtterance(wordToPronounce);
    utterance.lang = "en-US";
    speechSynthesis.speak(utterance);
    console.log(`Pronouncing: ${wordToPronounce}`);
};

elements.container.addEventListener("dragstart", (e) => {
    if (e.target.classList.contains("page-image")) e.preventDefault();
});

window.addEventListener("resize", () => {
    console.log("Window resized, debouncing redraw...");
    debouncedRedraw();
});

function redrawWordBoxesOnResize() {
    const dataToRedraw = processedPagesDataForOffline.length > 0 ? processedPagesDataForOffline : (document.getElementById('offlineData').textContent ? JSON.parse(document.getElementById('offlineData').textContent) : []);
    if (!dataToRedraw || dataToRedraw.length === 0) return;
    for (const pageData of dataToRedraw) {
        const pageContainer = elements.container.querySelector(`.page-container[data-page-num="${pageData.pageNum}"]`);
        const img = pageContainer?.querySelector(".page-image");
        if (img && pageContainer && pageData.wordsData?.length > 0) {
            requestAnimationFrame(() => {
                drawWordBoxes(pageData.wordsData, img, pageContainer);
                console.log(`Redrawn boxes for page ${pageData.pageNum}`);
            });
        }
    }
}

elements.saveOfflineButton.addEventListener("click", () => {
    if (processedPagesDataForOffline.length > 0) {
        generateAndDownloadOfflineHTML(processedPagesDataForOffline);
    } else {
        alert("لا توجد بيانات لمعالجتها وحفظها.");
    }
});
 

   // This function generates and downloads both the offline HTML and JSON data files for the processed manhwa pages
   async function generateAndDownloadOfflineHTML(dataToSave) {
    elements.loading.style.display = "block";
    elements.output.textContent = "جاري إنشاء ملفات الـ offline، الرجاء الانتظار...\n";
    try {
        const cleanedData = [];
        for (const page of dataToSave) {
            if (!page.imgData || !isValidBase64Image(page.imgData)) {
                console.error(`Invalid image data for page ${page.pageNum}, imgData length: ${page.imgData?.length || 0}, starts with: ${page.imgData?.substring(0, 50) || 'undefined'}`);
                elements.output.textContent += `خطأ: تخطي الصفحة ${page.pageNum} بسبب بيانات صورة غير صالحة\n`;
                continue;
            }
            if (!page.wordsData || !Array.isArray(page.wordsData)) {
                console.warn(`No words data for page ${page.pageNum}`);
                page.wordsData = [];
            }
            cleanedData.push({
                imgData: page.imgData,
                wordsData: page.wordsData,
                pageNum: page.pageNum
            });
            console.log(`Page ${page.pageNum} added to cleanedData, imgData length: ${page.imgData.length}`);
        }
        if (cleanedData.length === 0) {
            throw new Error("لا توجد بيانات صفحات صالحة للحفظ");
        }
        console.log(`Total pages in cleanedData: ${cleanedData.length}`);
        const timestamp = Date.now();
        let jsonData;
        try {
            const tempData = [];
            for (const page of cleanedData) {
                const pageJson = JSON.stringify(page);
                JSON.parse(pageJson);
                tempData.push(pageJson);
            }
            jsonData = `[${tempData.join(",")}]`;
            JSON.parse(jsonData);
        } catch (error) {
            console.error("Failed to convert data to JSON:", error);
            throw new Error("فشل تحويل البيانات إلى JSON: " + error.message);
        }
        const jsonBlob = new Blob([jsonData], { type: "application/json" });
        const jsonLink = document.createElement("a");
        jsonLink.href = URL.createObjectURL(jsonBlob);
        jsonLink.download = `manhwa_data_${timestamp}.json`;
        document.body.appendChild(jsonLink);
        jsonLink.click();
        document.body.removeChild(jsonLink);
        URL.revokeObjectURL(jsonLink.href);
        const htmlContent = `\
<!DOCTYPE html>
<html lang="ar">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>مانهوا (أوفلاين) - ${new Date().toLocaleDateString()}</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; background-color: #f4f4f4; margin: 0; padding: 0; }
        #container_offline { display: flex; flex-direction: column; align-items: center; margin: 20px auto; max-width: 100%; }
        .page-container { position: relative; margin-bottom: 20px; width: 100%; max-width: 100%; display: flex; justify-content: center; box-sizing: border-box; min-height: 200px; }
        .page-image { max-width: 90vw; width: 100%; height: auto; display: block; position: relative; z-index: 1; visibility: visible; box-sizing: border-box; }
        .word-boxes-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10; }
        .word { position: absolute; border: 2px solid rgb(0 0 255 / 1%); background: rgb(0 0 255 / 1%); cursor: pointer; z-index: 10; pointer-events: auto; }
        .tooltip { position: fixed; background: #333; color: #fff; padding: 10px; border-radius: 5px; z-index: 1000; max-width: 200px; text-align: left; display: none; }
        .tooltip button { margin-top: 5px; padding: 5px 10px; font-size: 12px; background: #007bff; color: #fff; border: none; border-radius: 3px; cursor: pointer; }
        .image-error { display: block; color: red; font-size: 16px; margin: 10px; }
        #json-upload { margin: 20px; }
    </style>
</head>
<body>
    <h1>مانهوا للقراءة أوفلاين</h1>
    <p>تم إنشاؤه في: ${new Date().toLocaleString()}</p>
    <div id="json-upload">
        <p>يرجى رفع ملف البيانات (manhwa_data_${timestamp}.json).</p>
        <input type="file" id="json-file-input" accept=".json">
        <button onclick="loadJsonManually()">تحميل البيانات</button>
    </div>
    <div id="container_offline"></div>
    <script>
        window.loadJsonManually = function() {
            const input = document.getElementById("json-file-input");
            const file = input.files[0];
            if (!file) {
                alert("يرجى اختيار ملف JSON.");
                return;
            }
            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    offlinePagesData = JSON.parse(e.target.result);
                    if (!Array.isArray(offlinePagesData) || offlinePagesData.length === 0) {
                        throw new Error("بيانات غير صالحة في ملف JSON");
                    }
                    console.log("Loaded JSON with " + offlinePagesData.length + " pages");
                    jsonUploadSection.style.display = "none";
                    renderOfflinePages(offlinePagesData);
                } catch (error) {
                    alert("خطأ: ملف JSON غير صالح.");
                    console.error("JSON parsing error:", error);
                    offlineContainer.innerHTML = "<p>خطأ: ملف JSON غير صالح.</p>";
                }
            };
            reader.onerror = function () {
                alert("خطأ: فشل قراءة ملف JSON.");
                console.error("File reading error");
                offlineContainer.innerHTML = "<p>خطأ: فشل قراءة ملف JSON.</p>";
            };
            reader.readAsText(file);
        }
        const offlineContainer = document.getElementById("container_offline");
        const jsonUploadSection = document.getElementById("json-upload");
        let offlinePagesData = [];

        function isValidBase64Image(base64Str) {
            if (!base64Str || typeof base64Str !== 'string') return false;
            const base64Regex = new RegExp('^data:image/(jpeg|png);base64,[A-Za-z0-9+/=]+$');
            return base64Regex.test(base64Str) && base64Str.length > 100;
        }

        function drawWordBoxesOffline(words, imgElement, pageContainerElement) {
            let boxesContainer = pageContainerElement.querySelector('.word-boxes-container');
            if (boxesContainer) boxesContainer.remove();
            boxesContainer = document.createElement('div');
            boxesContainer.className = 'word-boxes-container';
            boxesContainer.style.position = 'absolute';
            boxesContainer.style.top = '0';
            boxesContainer.style.left = '0';
            boxesContainer.style.width = '100%';
            boxesContainer.style.height = '100%';
            boxesContainer.style.pointerEvents = 'none';
            boxesContainer.style.zIndex = '10';
            pageContainerElement.appendChild(boxesContainer);
            const naturalWidth = imgElement.naturalWidth;
            const naturalHeight = imgElement.naturalHeight;
            if (!naturalWidth || !naturalHeight) {
                console.error("Invalid image dimensions for page");
                return;
            }
            for (var i = 0; i < words.length; i++) {
                var word = words[i];
                var box = word.bbox;
                if (!box) continue;
                var wordDiv = document.createElement('div');
                wordDiv.className = 'word';
                wordDiv.style.position = 'absolute';
                wordDiv.style.left = ((box.x0 / naturalWidth) * 100) + '%';
                wordDiv.style.top = ((box.y0 / naturalHeight) * 100) + '%';
                wordDiv.style.width = (((box.x1 - box.x0) / naturalWidth) * 100) + '%';
                wordDiv.style.height = (((box.y1 - box.y0) / naturalHeight) * 100) + '%';
                wordDiv.style.pointerEvents = 'auto';
                wordDiv.addEventListener('click', (function(word) {
                    return function(e) {
                        e.stopPropagation();
                        showTooltipOffline(wordDiv, word.text, word.translation, e.clientX, e.clientY);
                    };
                })(word));
                boxesContainer.appendChild(wordDiv);
            }
        }

        function ensureDrawWordBoxes(words, imgElement, pageContainerElement) {
            if (imgElement.complete && imgElement.naturalWidth && imgElement.naturalHeight) {
                drawWordBoxesOffline(words, imgElement, pageContainerElement);
            } else {
                imgElement.onload = function() {
                    console.log("Image loaded for page " + pageContainerElement.dataset.pageNum);
                    drawWordBoxesOffline(words, imgElement, pageContainerElement);
                };
                imgElement.onerror = function() {
                    console.error("Failed to load image for page " + pageContainerElement.dataset.pageNum);
                    pageContainerElement.innerHTML += "<p class='image-error'>Error: Failed to load image for page " + pageContainerElement.dataset.pageNum + "</p>";
                };
            }
        }

        function showTooltipOffline(wordDiv, originalWord, translation, x, y) {
            var existingTooltip = document.querySelector('.tooltip');
            if (existingTooltip) existingTooltip.remove();
            var tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            var contentDiv = document.createElement('div');
            var wordStrong = document.createElement('strong');
            wordStrong.textContent = 'الكلمة: ';
            contentDiv.appendChild(wordStrong);
            contentDiv.appendChild(document.createTextNode(originalWord));
            contentDiv.appendChild(document.createElement('br'));
            var transStrong = document.createElement('strong');
            transStrong.textContent = 'الترجمة: ';
            contentDiv.appendChild(transStrong);
            contentDiv.appendChild(document.createTextNode(translation));
            contentDiv.appendChild(document.createElement('br'));
            var button = document.createElement('button');
            button.textContent = 'نطق الكلمة';
            button.addEventListener('click', function() {
                pronounceWordOffline(originalWord);
            });
            contentDiv.appendChild(button);
            tooltip.appendChild(contentDiv);
            document.body.appendChild(tooltip);
            var rect = tooltip.getBoundingClientRect();
            var left = x + 15, top = y + 15;
            if (left + rect.width > window.innerWidth) left = x - rect.width - 15;
            if (top + rect.height > window.innerHeight) top = y - rect.height - 15;
            if (left < 0) left = 5;
            if (top < 0) top = 5;
            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
            tooltip.style.display = 'block';
            document.addEventListener('click', function closeTT(event) {
                if (!tooltip.contains(event.target) && event.target !== wordDiv) {
                    tooltip.remove();
                    document.removeEventListener('click', closeTT, true);
                }
            }, true);
        }

        window.pronounceWordOffline = function (wordToPronounce) {
            if (!window.speechSynthesis) {
                alert('ميزة النطق غير مدعومة.');
                return;
            }
            try {
                var utterance = new SpeechSynthesisUtterance(wordToPronounce);
                utterance.lang = 'en-US';
                speechSynthesis.speak(utterance);
            } catch(e) {
                console.error('Pronunciation error:', e);
            }
        };

        function redrawWordBoxesOnResizeOffline() {
            if (!offlinePagesData || offlinePagesData.length === 0) return;
            for (var i = 0; i < offlinePagesData.length; i++) {
                (function(pageData, pageC, imgEl) {
                    if (imgEl && pageC && pageData.wordsData && pageData.wordsData.length > 0) {
                        requestAnimationFrame(function() {
                            ensureDrawWordBoxes(pageData.wordsData, imgEl, pageC);
                        });
                    }
                })(
                    offlinePagesData[i],
                    offlineContainer.querySelector('.page-container[data-page-num="' + offlinePagesData[i].pageNum + '"]'),
                    offlineContainer.querySelector('.page-container[data-page-num="' + offlinePagesData[i].pageNum + '"]')?.querySelector('.page-image')
                );
            }
        }
        window.addEventListener('resize', redrawWordBoxesOnResizeOffline);

        function renderOfflinePages(pagesToRender) {
            offlineContainer.innerHTML = '';
            console.log("Rendering " + pagesToRender.length + " pages");
            for (var i = 0; i < pagesToRender.length; i++) {
                var pageData = pagesToRender[i];
                console.log("Processing page " + pageData.pageNum + ", imgData length: " + (pageData.imgData?.length || 0) + ", valid: " + isValidBase64Image(pageData.imgData));
                if (!pageData.imgData || !isValidBase64Image(pageData.imgData)) {
                    console.error("Invalid image data for page " + pageData.pageNum + ", imgData starts with: " + (pageData.imgData?.substring(0, 50) || 'undefined'));
                    offlineContainer.innerHTML += '<p class="image-error">Error: Invalid image data for page ' + pageData.pageNum + '</p>';
                    continue;
                }
                if (!pageData.wordsData || !Array.isArray(pageData.wordsData)) {
                    console.warn("No valid words data for page " + pageData.pageNum);
                    pageData.wordsData = [];
                }
                var pageContainer = document.createElement('div');
                pageContainer.className = 'page-container';
                pageContainer.dataset.pageNum = pageData.pageNum;
                var img = document.createElement('img');
                img.className = 'page-image';
                img.alt = 'صفحة مانهوا ' + pageData.pageNum;
                img.style.width = '100%';
                img.style.height = 'auto';
                // Set src directly to avoid lazy-loading issues
                img.src = pageData.imgData;
                pageContainer.appendChild(img);
                offlineContainer.appendChild(pageContainer);
                // Draw word boxes immediately if image is loaded
                ensureDrawWordBoxes(pageData.wordsData, img, pageContainer);
            }
        }
    </script>
</body>
</html>`;
        const htmlBlob = new Blob([htmlContent], { type: "text/html" });
        const htmlLink = document.createElement("a");
        htmlLink.href = URL.createObjectURL(htmlBlob);
        htmlLink.download = `manhwa_offline_${timestamp}.html`;
        document.body.appendChild(htmlLink);
        htmlLink.click();
        document.body.removeChild(htmlLink);
        URL.revokeObjectURL(htmlLink.href);
        console.log("Offline HTML and JSON files generated successfully");
        elements.output.textContent += "\nتم إنشاء ملفات HTML و JSON للقراءة أوفلاين. يرجى حفظ الملفين في نفس المجلد.";
    } catch (error) {
        console.error("Failed to generate offline files:", error);
        elements.output.textContent += `خطأ: فشل إنشاء ملفات الـ offline: ${error.message}\n`;
    } finally {
        elements.loading.style.display = "none";
    }
}

async function readFileAsArrayBuffer(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(new Uint8Array(event.target.result));
        reader.readAsArrayBuffer(file);
    });
}
 
        function loadJsonManually() {
            const input = document.getElementById("json-file-input");
            const file = input.files[0];
            if (!file) {
                alert("يرجى اختيار ملف JSON.");
                return;
            }
            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const offlinePagesData = JSON.parse(e.target.result);
                    if (!Array.isArray(offlinePagesData) || offlinePagesData.length === 0) {
                        throw new Error("بيانات غير صالحة في ملف JSON");
                    }
                    document.getElementById("json-upload").style.display = "none";
                    renderOfflinePages(offlinePagesData);
                } catch (error) {
                    alert("خطأ: ملف JSON غير صالح.");
                    document.getElementById("container_offline").innerHTML = "<p>خطأ: ملف JSON غير صالح.</p>";
                }
            };
            reader.onerror = function () {
                alert("خطأ: فشل قراءة ملف JSON.");
                document.getElementById("container_offline").innerHTML = "<p>خطأ: فشل قراءة ملف JSON.</p>";
            };
            reader.readAsText(file);
        }

        function loadOfflineHTML(htmlFile) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const htmlString = e.target.result;
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, "text/html");
        const dataScript = doc.getElementById("offlineDataStorage");
        if (dataScript && dataScript.textContent) {
            try {
                const loadedOfflineData = JSON.parse(dataScript.textContent);
                if (Array.isArray(loadedOfflineData) && loadedOfflineData.length > 0) {
                    processedPagesDataForOffline = loadedOfflineData;
                    elements.container.innerHTML = "<h2>تم تحميل بيانات الأوفلاين.</h2><p>أعد تحميل الصفحة أو قم بتشغيل العرض يدويًا إذا لزم الأمر.</p>";
                    renderPages(loadedOfflineData);
                    elements.output.textContent = "تم تحميل بيانات المانهوا من ملف HTML.";
                    elements.saveOfflineButton.style.display = "none";
                    console.log("تم تحميل بيانات HTML أوفلاين (embedded data)");
                } else {
                    elements.output.textContent = "ملف HTML المحمل لا يحتوي على بيانات مانهوا صالحة.";
                }
            } catch (err) {
                console.error("فشل قراءة بيانات HTML أوفلاين:", err);
                elements.output.textContent = "فشل في قراءة البيانات من ملف HTML.";
            }
        } else {
            elements.output.textContent = "ملف HTML المحمل لا يحتوي على بيانات مانهوا متوقعة.";
        }
    };
    reader.onerror = () => {
        console.error("فشل قراءة ملف HTML");
        elements.output.textContent = "خطأ: فشل قراءة ملف HTML.";
    };
    reader.readAsText(htmlFile);
}
