// SafeScroll Content Script (Firefox compatible)
if (typeof browser === "undefined") {
    var browser = chrome;
}

let isEnabled = true;
const imageStatus = new Map(); // url -> 'safe' | 'nsfw' | 'pending' | 'error'
let stats = {
    scanned: 0,
    blocked: 0
};

// Initialize
browser.storage.local.get(['safeScrollEnabled', 'stats'], function (result) {
    isEnabled = result.safeScrollEnabled !== false;
    if (result.stats) {
        stats = result.stats;
    }
    if (isEnabled) {
        startObserving();
    }
});

// Listen for toggle messages
browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.action === "toggleState") {
        isEnabled = request.enabled;
        if (isEnabled) {
            startObserving();
            scanAllImages();
        } else {
            stopObserving();
            unblurAll();
        }
    }
});

function startObserving() {
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src']
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
        img.style.filter = "none";
        const wrapper = img.closest('.safescroll-wrapper');
        if (wrapper) {
            const overlay = wrapper.querySelector('.safescroll-overlay');
            if (overlay) overlay.remove();
        }
    });
}

function processImage(img) {
    if (!isEnabled) return;
    if (!img.src) return;

    if (img.naturalWidth === 0 && img.naturalHeight === 0) {
        img.addEventListener('load', () => processImage(img), { once: true });
    }

    const src = img.src;
    if (src.startsWith('data:')) return;
    if (src.startsWith('blob:')) return;
    if (src.toLowerCase().endsWith('.svg') || src.toLowerCase().includes('.svg?')) return;
    if (img.width > 0 && img.width < 50) return;

    const status = imageStatus.get(src);

    if (status === 'nsfw') {
        blockImage(img, 'nsfw');
        return;
    }
    if (status === 'safe') {
        revealImage(img);
        return;
    }
    if (status === 'pending') {
        blockImage(img, 'scanning');
        return;
    }

    imageStatus.set(src, 'pending');
    stats.scanned++;
    updateStats();

    blockImage(img, 'scanning');

    classifyImage(src)
        .then(isNSFW => {
            if (isNSFW) {
                imageStatus.set(src, 'nsfw');
                stats.blocked++;
                updateStats();
                blockImage(img, 'nsfw');
            } else {
                imageStatus.set(src, 'safe');
                revealImage(img);
            }
        })
        .catch(err => {
            console.error("SafeScroll Error:", err);
            imageStatus.set(src, 'error');
            revealImage(img);
        });
}

function revealImage(img) {
    if (img.getAttribute('data-nsfw') === 'true') return;

    img.style.filter = "none";
    const overlay = img.parentElement?.querySelector('.safescroll-overlay');
    if (overlay) overlay.remove();
}

async function classifyImage(url) {
    if (isContextInvalid()) return false;
    return new Promise((resolve) => {
        try {
            browser.runtime.sendMessage({ action: "classifyImage", url: url }, (response) => {
                if (browser.runtime.lastError) {
                    console.log("SafeScroll: Runtime error:", browser.runtime.lastError.message);
                    resolve(false);
                } else {
                    resolve(response && response.is_nsfw);
                }
            });
        } catch (e) {
            stopObserving();
            resolve(false);
        }
    });
}

function blockImage(img, type) {
    img.setAttribute('data-nsfw', type === 'nsfw' ? 'true' : 'scanning');
    img.style.filter = "brightness(0)";

    let wrapper = img.parentElement;
    if (!wrapper || !wrapper.classList.contains('safescroll-wrapper')) {
        wrapper = wrapImage(img);
    }

    updateOverlay(wrapper, type);
}

function wrapImage(img) {
    const wrapper = document.createElement('div');
    wrapper.className = 'safescroll-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.display = img.style.display || 'inline-block';
    wrapper.style.width = (img.width || img.naturalWidth || 100) + 'px';
    wrapper.style.height = (img.height || img.naturalHeight || 100) + 'px';
    wrapper.style.overflow = 'hidden';

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
    overlay.style.backgroundColor = 'rgba(0,0,0,1)';
    overlay.style.zIndex = '10000';
    overlay.style.color = 'white';
    overlay.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    overlay.style.textAlign = 'center';

    const parent = img.parentNode;
    if (parent) {
        parent.insertBefore(wrapper, img);
        wrapper.appendChild(img);
        wrapper.appendChild(overlay);
    }

    return wrapper;
}

function updateOverlay(wrapper, type) {
    const overlay = wrapper.querySelector('.safescroll-overlay');
    if (!overlay) return;

    overlay.innerHTML = '';

    if (type === 'scanning') {
        const text = document.createElement('div');
        text.textContent = '🔍 AI Scanning...';
        text.style.fontSize = '14px';
        text.style.opacity = '0.7';
        overlay.appendChild(text);
    } else if (type === 'nsfw') {
        const warning = document.createElement('div');
        warning.textContent = '⚠️ NSFW Content';
        warning.style.fontWeight = 'bold';
        warning.style.marginBottom = '10px';
        warning.style.fontSize = '14px';

        const button = document.createElement('button');
        button.textContent = 'Show Anyway';
        button.style.backgroundColor = '#ef4444';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.padding = '6px 12px';
        button.style.borderRadius = '20px';
        button.style.cursor = 'pointer';
        button.style.fontWeight = '600';
        button.style.fontSize = '12px';

        button.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            overlay.remove();
            const img = wrapper.querySelector('img');
            if (img) {
                img.style.filter = "none";
                img.setAttribute('data-nsfw', 'revealed');
            }
        };

        overlay.appendChild(warning);
        overlay.appendChild(button);
    }
}

function isContextInvalid() {
    try {
        return !browser.runtime || !browser.runtime.id;
    } catch (e) {
        return true;
    }
}

function updateStats() {
    if (isContextInvalid()) {
        stopObserving();
        return;
    }
    try {
        browser.storage.local.set({ stats: stats });
        browser.runtime.sendMessage({ action: "updateStats", stats: stats }).catch(() => { });
    } catch (e) { }
}

const observer = new MutationObserver((mutations) => {
    if (isContextInvalid()) {
        stopObserving();
        return;
    }
    if (!isEnabled) return;

    mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    if (node.tagName === 'IMG') processImage(node);
                    node.querySelectorAll && node.querySelectorAll('img').forEach(processImage);
                }
            });
        } else if (mutation.type === 'attributes' && mutation.target.tagName === 'IMG') {
            processImage(mutation.target);
        }
    });
});
