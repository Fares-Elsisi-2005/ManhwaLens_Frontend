 
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';
}

document.addEventListener("DOMContentLoaded", () => {
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

    elements.container.addEventListener("dragstart", (e) => {
        if (e.target.classList.contains("page-image")) e.preventDefault();
    });

    window.addEventListener("resize", () => {
        console.log("Window resized, debouncing redraw...");
        debouncedRedraw();
    });

    elements.saveOfflineButton.addEventListener("click", () => {
        if (processedPagesDataForOffline.length > 0) {
            generateAndDownloadOfflineHTML(processedPagesDataForOffline);
        } else {
            alert("لا توجد بيانات لمعالجتها وحفظها.");
        }
    });
});