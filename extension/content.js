// SafeScroll Content Script - Optimized

let isEnabled = true;
const imageStatus = new Map(); // url -> 'safe' | 'nsfw' | 'pending' | 'error'
let stats = {
    scanned: 0,
    blocked: 0
};

// Initialize
chrome.storage.local.get(['safeScrollEnabled', 'stats'], function (result) {
    isEnabled = result.safeScrollEnabled !== false;
    if (result.stats) {
        stats = result.stats;
    }
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
    const images = document.querySelectorAll('img');
    images.forEach(img => {
        // Remove blur filter
        img.style.filter = "none";
        // Remove overlay if present (but keep wrapper?)
        // Better to hide overlay
        if (img.parentElement && img.parentElement.classList.contains('safescroll-wrapper')) {
            const overlay = img.parentElement.querySelector('.safescroll-overlay');
            if (overlay) overlay.style.display = 'none';
        }
    });
}

function processImage(img) {
    if (!isEnabled) return;
    if (!img.src) return;

    // Skip tiny icons or data URIs
    if (img.width < 50 || img.height < 50) return;
    if (img.src.startsWith('data:')) return;

    const src = img.src;
    const status = imageStatus.get(src);

    // 1. Cache Hit: NSFW (Instant Block)
    if (status === 'nsfw') {
        blockImage(img);
        return;
    }

    // 2. Cache Hit: Safe (Ensure Unblurred)
    if (status === 'safe') {
        revealImage(img);
        return;
    }

    // 3. Cache Hit: Pending (Maintain Blur)
    if (status === 'pending') {
        applyOptimisticBlur(img);
        return;
    }

    // 4. Cache Miss: New Image (Optimistic Blur + Check)
    imageStatus.set(src, 'pending');
    stats.scanned++;
    updateStats();

    applyOptimisticBlur(img);

    classifyImage(src)
        .then(isNSFW => {
            if (isNSFW) {
                imageStatus.set(src, 'nsfw');
                stats.blocked++;
                updateStats();
                blockImage(img);
            } else {
                imageStatus.set(src, 'safe');
                revealImage(img);
            }
        })
        .catch(err => {
            console.error("SafeScroll Error:", err);
            // On error, default to safe to avoid permanent blur? 
            // Or keep blurred? User asked to be fast
            // Let's assume failures are rare and default to safe/unblur
            imageStatus.set(src, 'error');
            revealImage(img);
        });
}

function applyOptimisticBlur(img) {
    // If NOT already blocked with overlay
    if (img.getAttribute('data-nsfw') === 'true') return;

    // Apply black out immediately (optimistic)
    img.style.filter = "brightness(0)";
    img.style.transition = "filter 0.3s ease-out"; // smooth transition
}

function revealImage(img) {
    if (img.getAttribute('data-nsfw') === 'true') return; // Don't unblock if officially blocked

    img.style.filter = "none";
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
                resolve(response && response.is_nsfw);
            }
        });
    });
}

function blockImage(img) {
    // Avoid double-blocking
    if (img.getAttribute('data-nsfw') === 'true') {
        // Ensure wrapper/overlay exists in case of DOM manipulation
        if (!img.parentElement.classList.contains('safescroll-wrapper')) {
            // Re-wrap if wrapper lost
            wrapImage(img);
        }
        return;
    }

    img.setAttribute('data-nsfw', 'true');
    img.style.filter = "brightness(0)";

    wrapImage(img);
}

function wrapImage(img) {
    // Create wrapper to hold image and overlay
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-block'; // Or match img display?
    wrapper.style.width = img.width + 'px'; // Fix width to prevent layout shift
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
    overlay.style.backgroundColor = 'rgba(0,0,0,1)'; // Solid black overlay just in case
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
        // Retrieve wrapper if needed? 
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

function isContextInvalid() {
    return !chrome.runtime || !chrome.runtime.id;
}

function updateStats() {
    if (isContextInvalid()) {
        stopObserving(); // Stop trying to do work if we are disconnected
        return;
    }

    // Save to storage so popup can read it even if popup is closed
    try {
        chrome.storage.local.set({ stats: stats });
    } catch (e) {
        console.warn("SafeScroll: Storage update failed (context likely invalidated)", e);
        stopObserving();
        return;
    }

    // Send to popup if open (optional, but good for realtime)
    try {
        chrome.runtime.sendMessage({ action: "updateStats", stats: stats }).catch(() => {
            // Popeup might be closed, ignore error
        });
    } catch (e) {
        // Ignore synchronous errors too
    }
}

// MutationObserver to catch new images as you scroll
const observer = new MutationObserver((mutations) => {
    if (isContextInvalid()) {
        stopObserving();
        return;
    }
    if (!isEnabled) return;

    mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) { // Element
                if (node.tagName === 'IMG') {
                    processImage(node);
                }
                // Check children
                if (node.querySelectorAll) {
                    node.querySelectorAll('img').forEach(processImage);
                }
            }
        });
    });
});

