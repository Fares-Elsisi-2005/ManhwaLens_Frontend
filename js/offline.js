 let processedPagesDataForOffline = [];

async function generateAndDownloadOfflineHTML(dataToSave) {
    elements.loading.style.display = "block";
    elements.output.textContent = "جاري إنشاء ملفات الـ offline، الرجاء الانتظار...\n";
    try {
        // Clean and validate data
        const cleanedData = [];
        for (const page of dataToSave) {
            if (!page.imgData || !isValidBase64Image(page.imgData)) {
                console.error(`Invalid image data for page ${page.pageNum}`);
                elements.output.textContent += `خطأ: تخطي الصفحة ${page.pageNum} بسبب بيانات صورة غير صالحة\n`;
                continue;
            }
            if (!page.wordsData || !Array.isArray(page.wordsData)) {
                console.warn(`No valid words data for page ${page.pageNum}`);
                page.wordsData = [];
            }
            const cleanedImgData = page.imgData.replace(/[\0-\x1F\x7F-\x9F]/g, '');
            if (!isValidBase64Image(cleanedImgData)) {
                console.error(`Invalid image data after cleaning for page ${page.pageNum}`);
                elements.output.textContent += `خطأ: تخطي الصفحة ${page.pageNum} بسبب فشل تنظيف الصورة\n`;
                continue;
            }
            cleanedData.push({
                imgData: cleanedImgData,
                wordsData: page.wordsData,
                pageNum: page.pageNum
            });
            console.log(`Offline file for page ${page.pageNum}, image data length: ${cleanedImgData.length}`);
        }
        if (cleanedData.length === 0) {
            throw new Error("لا توجد بيانات صفحات صالحة للحفظ");
        }

        // Split data into smaller chunks for JSON (one file per page)
        const timestamp = Date.now();
        const jsonFiles = [];
        for (const page of cleanedData) {
            try {
                const pageJson = JSON.stringify(page);
                JSON.parse(pageJson); // Validate JSON
                const jsonBlob = new Blob([pageJson], { type: "application/json" });
                const jsonLink = document.createElement("a");
                jsonLink.href = URL.createObjectURL(jsonBlob);
                jsonLink.download = `manhwa_data_${timestamp}_page_${page.pageNum}.json`;
                document.body.appendChild(jsonLink);
                jsonLink.click();
                document.body.removeChild(jsonLink);
                URL.revokeObjectURL(jsonLink.href);
                jsonFiles.push(`manhwa_data_${timestamp}_page_${page.pageNum}.json`);
                console.log(`Generated JSON for page ${page.pageNum}`);
            } catch (error) {
                console.error(`Failed to generate JSON for page ${page.pageNum}:`, error);
                elements.output.textContent += `خطأ: فشل تحويل بيانات الصفحة ${page.pageNum} إلى JSON: ${error.message}\n`;
            }
        }

        // Generate HTML with support for multiple JSON files
        const htmlContent = `
<!DOCTYPE html>
<html lang="ar">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>مانهوا (أوفلاين) - ${new Date().toLocaleDateString()}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            text-align: center;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
        }
        #container_offline {
            display: flex;
            flex-direction: column;
            align-items: center;
            margin: 20px auto;
            max-width: 100%;
        }
        .page-container {
            position: relative;
            margin-bottom: 20px;
            width: 100%;
            max-width: 100%;
            display: flex;
            justify-content: center;
            box-sizing: border-box;
        }
        .page-image {
            max-width: 90vw;
            height: auto;
            display: block;
            position: relative;
            z-index: 1;
            visibility: visible;
            box-sizing: border-box;
        }
        .word {
            position: absolute;
            border: 2px solid rgb(0 0 255 / 1%);
            background: rgb(0 0 255 / 1%);
            cursor: pointer;
            z-index: 10;
            pointer-events: auto;
        }
        .tooltip {
            position: fixed;
            background: #333;
            color: #fff;
            padding: 10px;
            border-radius: 5px;
            z-index: 1000;
            max-width: 200px;
            text-align: left;
            display: none;
        }
        .tooltip button {
            margin-top: 5px;
            padding: 5px 10px;
            font-size: 12px;
            background: #007bff;
            color: #fff;
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }
        .image-error {
            display: block;
            color: red;
            font-size: 16px;
            margin: 10px;
        }
        #json-upload {
            margin: 20px;
        }
        #error-log {
            margin: 20px;
            padding: 10px;
            border: 1px solid #ccc;
            background: #fff;
            max-height: 200px;
            overflow-y: auto;
            display: none;
            direction: rtl;
        }
    </style>
</head>
<body>
    <h1>مانهوا للقراءة أوفلاين</h1>
    <p>تم إنشاؤه في: ${new Date().toLocaleString()}</p>
    <div id="json-upload">
        <p>يرجى رفع ملفات البيانات (manhwa_data_${timestamp}_page_X.json).</p>
        <input type="file" id="json-file-input" accept=".json" multiple>
        <button onclick="loadJsonManually()">تحميل البيانات</button>
    </div>
    <div id="error-log"></div>
    <div id="container_offline"></div>
    <script>
        const offlineContainer = document.getElementById("container_offline");
        const jsonUploadSection = document.getElementById("json-upload");
        const errorLog = document.getElementById("error-log");
        let offlinePagesData = [];
        
        function logError(message) {
            errorLog.style.display = "block";
            errorLog.textContent += message + "\\n";
        }

        async function loadOfflineData() {
            try {
                const jsonFiles = [${jsonFiles.map(file => `'${file}'`).join(",")}];
                for (const file of jsonFiles) {
                    try {
                        const response = await fetch(file);
                        if (!response.ok) throw new Error(\`فشل تحميل ملف \${file}\`);
                        const pageData = await response.json();
                        if (!pageData || !pageData.pageNum) {
                            throw new Error(\`بيانات غير صالحة في ملف \${file}\`);
                        }
                        offlinePagesData.push(pageData);
                        console.log(\`Loaded data for page \${pageData.pageNum}\`);
                    } catch (e) {
                        console.error(\`Error loading \${file}: \${e.message}\`);
                        logError(\`خطأ في تحميل \${file}: \${e.message}\`);
                    }
                }
                if (offlinePagesData.length > 0) {
                    jsonUploadSection.style.display = "none";
                    renderOfflinePages(offlinePagesData);
                } else {
                    throw new Error("لم يتم تحميل أي بيانات صفحات");
                }
            } catch (e) {
                console.error("فشل تحميل بيانات الـ offline:", e);
                logError("خطأ عام: " + e.message);
                jsonUploadSection.style.display = "block";
                offlineContainer.innerHTML = "<p>يرجى رفع ملفات البيانات يدويًا.</p>";
            }
        }

        window.loadJsonManually = async function () {
            const input = document.getElementById("json-file-input");
            const files = input.files;
            if (!files || files.length === 0) {
                alert("يرجى اختيار ملفات JSON.");
                return;
            }
            offlinePagesData = [];
            for (const file of files) {
                try {
                    const reader = new FileReader();
                    const pageData = await new Promise((resolve, reject) => {
                        reader.onload = (e) => {
                            try {
                                const data = JSON.parse(e.target.result);
                                if (!data.pageNum) throw new Error("بيانات غير صالحة");
                                resolve(data);
                            } catch (err) {
                                reject(err);
                            }
                        };
                        reader.onerror = () => reject(new Error("فشل قراءة الملف"));
                        reader.readAsText(file);
                    });
                    offlinePagesData.push(pageData);
                    console.log(\`Loaded manual JSON for page \${pageData.pageNum}\`);
                } catch (error) {
                     console.log(error)
                }
            }
            if (offlinePagesData.length > 0) {
                jsonUploadSection.style.display = "none";
                renderOfflinePages(offlinePagesData);
            } else {
                offlineContainer.innerHTML = "<p>خطأ: لا توجد بيانات صالحة في الملفات المرفوعة.</p>";
            }
        };

        function isValidBase64Image(base64Str) {
            if (!base64Str || typeof base64Str !== 'string') return false;
            const base64Regex = /^data:image\\/(jpeg|png);base64,[A-Za-z0-9+\\/=]+$/;
            return base64Regex.test(base64Str) && base64Str.length > 100;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const pageContainer = entry.target;
                    const img = pageContainer.querySelector(".page-image");
                    const pageNum = pageContainer.dataset.pageNum;
                    const pageData = offlinePagesData.find(p => p.pageNum == pageNum);
                    if (pageData && img) {
                        if (pageData.wordsData?.length > 0) {
                            drawWordBoxesOffline(pageData.wordsData, img, pageContainer);
                            console.log(\`Word boxes drawn for offline page \${pageNum} via observer\`);
                        } else {
                            console.log(\`No words to draw for offline page \${pageNum}\`);
                            logError(\`تحذير: لا توجد كلمات للصفحة \${pageNum}\`);
                        }
                    }
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        function drawWordBoxesOffline(words, imgElement, pageContainerElement) {
            const existingWords = pageContainerElement.querySelectorAll(".word");
            existingWords.forEach(wordDiv => wordDiv.remove());
            const scaleX = imgElement.clientWidth / imgElement.naturalWidth;
            const scaleY = imgElement.clientHeight / imgElement.naturalHeight;
            const imgRect = imgElement.getBoundingClientRect();
            const containerRect = pageContainerElement.getBoundingClientRect();
            const offsetX = imgRect.left - containerRect.left;
            const offsetY = imgRect.top - containerRect.top;
            console.log(\`Drawing \${words.length} word boxes for offline page\`);
            for (const word of words) {
                const box = word.bbox;
                if (!box) continue;
                const wordDiv = document.createElement("div");
                wordDiv.className = "word";
                wordDiv.style.left = \`\${(box.x0 * scaleX) + offsetX}px\`;
                wordDiv.style.top = \`\${(box.y0 * scaleY) + offsetY}px\`;
                wordDiv.style.width = \`\${(box.x1 - box.x0) * scaleX}px\`;
                wordDiv.style.height = \`\${(box.y1 - box.y0) * scaleY}px\`;
                pageContainerElement.appendChild(wordDiv);
                wordDiv.addEventListener("click", (e) => {
                    e.stopPropagation();
                    showTooltipOffline(wordDiv, word.text, word.translation, e.clientX, e.clientY);
                });
            }
        }

        function showTooltipOffline(wordDiv, originalWord, translation, x, y) {
            const existingTooltip = document.querySelector(".tooltip");
            if (existingTooltip) existingTooltip.remove();
            const tooltip = document.createElement("div");
            tooltip.className = "tooltip";
            tooltip.innerHTML = \`<div><strong>الكلمة:</strong> \${originalWord}<br><strong>الترجمة:</strong> \${translation}<br><button onclick="pronounceWordOffline('\${originalWord.replace(/[^a-zA-Z0-9\\\\s]/g, '')}')">نطق الكلمة</button></div>\`;
            document.body.appendChild(tooltip);
            const rect = tooltip.getBoundingClientRect();
            let left = x + 15, top = y + 15;
            if (left + rect.width > window.innerWidth) left = x - rect.width - 15;
            if (top + rect.height > window.innerHeight) top = y - rect.height - 15;
            if (left < 0) left = 5;
            if (top < 0) top = 5;
            tooltip.style.left = \`\${left}px\`;
            tooltip.style.top = \`\${top}px\`;
            tooltip.style.display = "block";
            document.addEventListener("click", function closeTT(event) {
                if (!tooltip.contains(event.target) && event.target !== wordDiv) {
                    tooltip.remove();
                    document.removeEventListener("click", closeTT, true);
                }
            }, true);
        }

        window.pronounceWordOffline = function (wordToPronounce) {
            if (!window.speechSynthesis) {
                alert("ميزة النطق غير مدعومة.");
                return;
            }
            const utterance = new SpeechSynthesisUtterance(wordToPronounce);
            utterance.lang = "en-US";
            speechSynthesis.speak(utterance);
        };

        function redrawWordBoxesOnResizeOffline() {
            if (!offlinePagesData || offlinePagesData.length === 0) return;
            for (const pageData of offlinePagesData) {
                const pageC = offlineContainer.querySelector(\`.page-container[data-page-num="\${pageData.pageNum}"]\`);
                const imgEl = pageC?.querySelector(".page-image");
                if (imgEl && pageC && pageData.wordsData?.length > 0) {
                    requestAnimationFrame(() => {
                        drawWordBoxesOffline(pageData.wordsData, imgEl, pageC);
                        console.log(\`Redrawn boxes for offline page \${pageData.pageNum}\`);
                    });
                }
            }
        }

        window.addEventListener("resize", redrawWordBoxesOnResizeOffline);
        document.addEventListener("DOMContentLoaded", () => {
            loadOfflineData();
        });

        function renderOfflinePages(pagesToRender) {
            offlineContainer.innerHTML = "";
            for (const pageData of pagesToRender) {
                if (!pageData.imgData || !isValidBase64Image(pageData.imgData)) {
                    console.error(\`Invalid image data for page \${pageData.pageNum}\`);
                    logError(\`خطأ: بيانات صورة غير صالحة للصفحة \${pageData.pageNum}\`);
                    offlineContainer.innerHTML += \`<p class="image-error">Error: Invalid image data for page \${pageData.pageNum}</p>\`;
                    continue;
                }
                if (!pageData.wordsData || !Array.isArray(pageData.wordsData)) {
                    console.warn(\`No valid words data for page \${pageData.pageNum}\`);
                    logError(\`تحذير: لا توجد بيانات كلمات صالحة للصفحة \${pageData.pageNum}\`);
                    pageData.wordsData = [];
                }
                const pageContainer = document.createElement("div");
                pageContainer.className = "page-container";
                pageContainer.dataset.pageNum = pageData.pageNum;
                const img = document.createElement("img");
                img.className = "page-image";
                img.src = pageData.imgData;
                img.alt = \`صفحة مانهوا \${pageData.pageNum}\`;
                const testImg = new Image();
                testImg.src = pageData.imgData;
                testImg.onload = () => {
                    pageContainer.appendChild(img);
                    offlineContainer.appendChild(pageContainer);
                    requestAnimationFrame(() => {
                        if (pageData.wordsData.length > 0) {
                            drawWordBoxesOffline(pageData.wordsData, img, pageContainer);
                            console.log(\`Word boxes drawn initially for offline page \${pageData.pageNum}\`);
                        } else {
                            console.log(\`No words to draw for offline page \${pageData.pageNum}\`);
                            logError(\`تحذير: لا توجد كلمات للصفحة \${pageData.pageNum}\`);
                        }
                        observer.observe(pageContainer);
                        console.log(\`Offline page \${pageData.pageNum} set for observer\`);
                    });
                    console.log(\`Offline page \${pageData.pageNum} image loaded\`);
                };
                testImg.onerror = () => {
                    console.error(\`Invalid image data for offline page \${pageData.pageNum}\`);
                    logError(\`خطأ: بيانات صورة غير صالحة للصفحة \${pageData.pageNum}\`);
                    offlineContainer.innerHTML += \`<p class="image-error">Error: Invalid image data for page \${pageData.pageNum}</p>\`;
                };
                img.onerror = () => {
                    console.error(\`Failed to render image for offline page \${pageData.pageNum}\`);
                    logError(\`خطأ: فشل عرض الصورة للصفحة \${pageData.pageNum}\`);
                };
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
        console.log("تم إنشاء ملفات HTML و JSON للـ offline");
        elements.output.textContent += "\nتم إنشاء ملف HTML وملفات JSON للقراءة أوفلاين. يرجى حفظ جميع الملفات في نفس المجلد.";
    } catch (error) {
        console.error("فشل إنشاء ملفات الـ offline:", error);
        elements.output.textContent += `خطأ: فشل إنشاء ملفات الـ offline: ${error.message}\n`;
    } finally {
        elements.loading.style.display = "none";
    }
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