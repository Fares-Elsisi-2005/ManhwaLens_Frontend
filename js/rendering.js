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