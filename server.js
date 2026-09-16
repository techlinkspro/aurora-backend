const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ==========================================
// 1. TERABOX LINK FETCHER (XAPIverse)
// ==========================================
const XAPIVERSE_KEY = "xapi_ce405c2e899429fc98a56690fc80061a";

app.get('/api/fetch', async (req, res) => {
    let { url } = req.query;
    if (!url) return res.status(400).json({ success: false, error: "URL is required" });

    // Format URL correctly
    url = url.replace('1024terabox.com', 'teraboxapp.com');

    try {
        console.log(`\n[FETCH] Requesting Direct Link for: ${url}`);
        
        const response = await axios.post("https://xapiverse.com/api/terabox", 
            { url: url }, 
            {
                headers: {
                    'Content-Type': 'application/json',
                    'xAPIverse-Key': XAPIVERSE_KEY
                }
            }
        );

        const data = response.data;
        let directUrl = null;
        let thumb = null;

        // XAPIverse format se direct link extract karna
        if (data && data.status === "success" && data.list && data.list.length > 0) {
            const fileData = data.list[0];
            directUrl = fileData.normal_dlink || fileData.hd_dlink || fileData.fast_dlink;
            thumb = fileData.thumb || data.thumb || "";
        }

        if (directUrl) {
            console.log("[FETCH] Success! Direct link generated.");
            res.json({ success: true, url: directUrl, thumb: thumb });
        } else {
            console.log("[FETCH] Failed: API response format missing links.");
            res.status(404).json({ success: false, error: "Video direct link not found." });
        }
    } catch (error) {
        console.error("[FETCH ERROR]", error.message);
        res.status(500).json({ success: false, error: "Failed to connect to Terabox extractor API." });
    }
});

// ==========================================
// 2. VIDEO STREAM PROXY (Bypass IP/CORS)
// ==========================================
app.get('/stream', async (req, res) => {
    const { videoUrl } = req.query;
    if (!videoUrl) return res.status(400).send("No video URL provided");

    try {
        // Terabox Bypass Headers
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': 'https://www.terabox.com/',
            'Cookie': 'ndus=Yu20_XVpeHui6RHQNyZc9CiWB0d01tczCEujUdkX;' // Aapki Cookie
        };

        // Handle Video Seeking (Range Requests)
        if (req.headers.range) {
            headers['Range'] = req.headers.range;
        }

        let currentUrl = videoUrl;
        let response;
        
        // Follow redirects manually to avoid streaming issues
        for (let i = 0; i < 5; i++) { 
            response = await axios({
                method: 'GET',
                url: currentUrl,
                responseType: 'stream',
                headers: headers,
                maxRedirects: 0,
                validateStatus: (status) => status >= 200 && status < 400
            });

            if (response.status >= 300 && response.status < 400 && response.headers.location) {
                currentUrl = response.headers.location;
            } else {
                break; 
            }
        }

        // Pass headers back to the browser for smooth playback
        res.status(response.status);
        ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach(header => {
            if (response.headers[header]) {
                res.setHeader(header, response.headers[header]);
            }
        });

        // Pipe the video stream
        response.data.pipe(res);

        // Clean up connection when user stops video
        req.on('close', () => {
            if (response.data && typeof response.data.destroy === 'function') {
                response.data.destroy();
            }
        });

    } catch (error) {
        console.error("\n[STREAM ERROR] Failed to proxy video:", error.message);
        res.status(500).send("Error streaming video from Terabox.");
    }
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`======================================`);
    console.log(`🚀 Terabox Proxy Server is LIVE on port ${PORT}`);
    console.log(`======================================`);
});
