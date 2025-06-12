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

const debouncedRedraw = debounce(redrawWordBoxesOnResize, config.debounceDelay);

function redrawWordBoxesOnResize() {
    const dataToRedraw = window.offlinePagesData?.length > 0 ? window.offlinePagesData : (document.getElementById('offlineData').textContent ? JSON.parse(document.getElementById('offlineData').textContent) : []);
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
