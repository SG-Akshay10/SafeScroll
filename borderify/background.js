// Background Script (Firefox compatible)
if (typeof browser === "undefined") {
    var browser = chrome;
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "classifyImage") {

        // Perform the fetch here (background context can request HTTP from HTTPS context)
        classifyImage(request.url)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ error: err.message }));

        return true; // Will respond asynchronously
    }
});

async function classifyImage(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    console.log(`Sending request to https://akshay-sg-safescroll.hf.space/classify... for ${url}`);

    try {
        const response = await fetch('https://akshay-sg-safescroll.hf.space/classify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: url }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        console.log(`Status Code: ${response.status}`);

        if (response.ok) {
            const data = await response.json();
            console.log("Classification Result:", JSON.stringify(data, null, 2));

            if (data.is_nsfw) {
                console.log("⚠️  NSFW Detected!");
            } else {
                console.log("✅  Image is Safe.");
            }

            return data;
        } else {
            const errorText = await response.text();
            console.error(`Error: ${errorText}`);
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error("Classification timed out after 30 seconds.");
            return { is_nsfw: false, error: "Request timed out" };
        }
        console.error("Classification failed in background:", error);
        return { is_nsfw: false, error: error.toString() };
    } finally {
        clearTimeout(timeoutId);
    }
}
