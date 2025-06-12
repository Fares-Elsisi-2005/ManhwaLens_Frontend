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