 let translationCache = new Map();

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
            // Add delay to prevent rate limiting (500ms between requests)
            await new Promise(resolve => setTimeout(resolve, 500));
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
