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
        await clearIndexedDB();
        await initIndexedDB();
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
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
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

async function readFileAsDataURL(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
    });
}

async function readFileAsArrayBuffer(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(new Uint8Array(event.target.result));
        reader.readAsArrayBuffer(file);
    });
}