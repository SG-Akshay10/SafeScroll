document.addEventListener('DOMContentLoaded', function () {
    const toggleSwitch = document.getElementById('toggleSwitch');
    const statusText = document.getElementById('statusText');
    const statusIndicator = document.getElementById('statusIndicator');
    const scannedCount = document.getElementById('scannedCount');
    const blockedCount = document.getElementById('blockedCount');

    // Load initial state
    chrome.storage.local.get(['safeScrollEnabled', 'stats'], function (result) {
        const isEnabled = result.safeScrollEnabled !== false; // Default true
        updateUIState(isEnabled);

        if (result.stats) {
            updateStatsUI(result.stats);
        }
    });

    // Listen for toggle changes
    toggleSwitch.addEventListener('change', function () {
        const isEnabled = toggleSwitch.checked;
        updateUIState(isEnabled);

        // Save state
        chrome.storage.local.set({ safeScrollEnabled: isEnabled });

        // Notify content scripts
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: "toggleState",
                    enabled: isEnabled
                });
            }
        });
    });

    // Listen for updates from background/content
    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
        if (request.action === "updateStats") {
            updateStatsUI(request.stats);
        }
    });

    function updateUIState(isEnabled) {
        toggleSwitch.checked = isEnabled;
        statusText.textContent = isEnabled ? "Active" : "Inactive";
        if (isEnabled) {
            statusIndicator.classList.remove('inactive');
        } else {
            statusIndicator.classList.add('inactive');
        }
    }

    function updateStatsUI(stats) {
        scannedCount.textContent = stats.scanned || 0;
        blockedCount.textContent = stats.blocked || 0;
    }

    // Refresh stats periodically or on open
    chrome.storage.local.get(['stats'], function (result) {
        if (result.stats) {
            updateStatsUI(result.stats);
        }
    });
});
