// SafeScroll Content Script

let isEnabled = true;
const scannedImages = new Set();
let stats = {
    scanned: 0,
    blocked: 0
};

// Initialize
chrome.storage.local.get(['safeScrollEnabled'], function (result) {
    isEnabled = result.safeScrollEnabled !== false;
    if (isEnabled) {
        startObserving();
    }
});

// Listen for toggle messages
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.action === "toggleState") {
        isEnabled = request.enabled;
        if (isEnabled) {
            startObserving();
            // Re-scan existing images
            scanAllImages();
        } else {
            stopObserving();
            // Unblur all images
            unblurAll();
        }
    }
});

function startObserving() {
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    scanAllImages();
}

function stopObserving() {
    observer.disconnect();
}

function scanAllImages() {
    const images = document.querySelectorAll('img');
    images.forEach(processImage);
}

function unblurAll() {
    const images = document.querySelectorAll('img[data-nsfw="true"]');
    images.forEach(img => {
        img.style.filter = "none";
        img.style.opacity = "1";
    });
}

function processImage(img) {
    if (!isEnabled) return;
    if (scannedImages.has(img.src)) return; // Avoid re-scanning same URL
    if (img.width < 50 || img.height < 50) return; // Skip tiny icons
    if (img.src.startsWith('data:')) return; // Skip data URIs for now (can optimize later)

    scannedImages.add(img.src);
    stats.scanned++;
    updateStats();

    // Optimistically check/blur? No, wait for result to avoid flickering safe images.
    // Or blur first then unblur if safe? (Better for safety, worse for UX).
    // Let's stick to "check then blur" for now, or maybe a loading state?
    // User requested: "if sfw ignore, else add a blocker"

    classifyImage(img.src)
        .then(isNSFW => {
            if (isNSFW) {
                blockImage(img);
                stats.blocked++;
                updateStats();
            }
        })
        .catch(err => console.error("SafeScroll Error:", err));
}

async function classifyImage(url) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            action: "classifyImage",
            url: url
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Runtime error:", chrome.runtime.lastError);
                resolve(false);
            } else if (response && response.error) {
                console.error("API error:", response.error);
                resolve(false);
            } else {
                resolve(response.is_nsfw);
            }
        });
    });
}

function blockImage(img) {
    // Avoid double-blocking
    if (img.getAttribute('data-nsfw') === 'true') return;

    img.setAttribute('data-nsfw', 'true');
    img.style.filter = "blur(20px)";

    // Create wrapper to hold image and overlay
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-block'; // Or match img display?
    wrapper.style.width = img.width + 'px';
    wrapper.style.height = img.height + 'px';
    wrapper.className = 'safescroll-wrapper';

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'safescroll-overlay';
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.backgroundColor = 'black';
    overlay.style.zIndex = '10';
    overlay.style.borderRadius = '4px'; // Soft corners

    // Warning Text
    const text = document.createElement('div');
    text.textContent = '⚠️ NSFW Content';
    text.style.color = 'white';
    text.style.fontWeight = 'bold';
    text.style.marginBottom = '8px';
    text.style.fontSize = '12px';
    text.style.fontFamily = 'sans-serif';
    text.style.textShadow = '0 1px 2px rgba(0,0,0,0.8)';

    // Unblock Button
    const button = document.createElement('button');
    button.textContent = 'Show Anyway';
    button.style.border = 'none';
    button.style.backgroundColor = '#ef4444';
    button.style.color = 'white';
    button.style.padding = '4px 8px';
    button.style.borderRadius = '4px';
    button.style.cursor = 'pointer';
    button.style.fontSize = '11px';
    button.style.fontWeight = '500';

    button.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Remove overlay
        overlay.remove();
        // Unblur image
        img.style.filter = 'none';
        // Mark as manually revealed?
        img.setAttribute('data-revealed', 'true');
        // Unwrap? Optional. Leaving wrapper is safer for layout stability.
    };

    overlay.appendChild(text);
    overlay.appendChild(button);

    // Insert wrapper
    if (img.parentNode) {
        img.parentNode.insertBefore(wrapper, img);
        wrapper.appendChild(img);
        wrapper.appendChild(overlay);
    }
}

function updateStats() {
    // Save to storage so popup can read it even if popup is closed
    chrome.storage.local.set({ stats: stats });

    // Send to popup if open (optional, but good for realtime)
    chrome.runtime.sendMessage({ action: "updateStats", stats: stats }).catch(() => {
        // Popeup might be closed, ignore error
    });
}

// MutationObserver to catch new images as you scroll
const observer = new MutationObserver((mutations) => {
    if (!isEnabled) return;

    mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) { // Element
                if (node.tagName === 'IMG') {
                    processImage(node);
                }
                // Check children
                node.querySelectorAll && node.querySelectorAll('img').forEach(processImage);
            }
        });
    });
});
