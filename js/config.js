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