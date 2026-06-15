const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// Enable basic CORS for all routes
app.use(cors());

// =========================================================
// 1. EXTRACTOR API: Webpage se direct mp4/m3u8 link nikalna
// =========================================================
app.get('/extract', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: "URL is required" });

    try {
        const response = await axios.get(targetUrl, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36' 
            }
        });

        const html = response.data;
        // Regex to find raw .mp4 or .m3u8 links hidden in the HTML
        const videoMatch = html.match(/(https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8)[^\s"'<>]*)/i);

        if (videoMatch && videoMatch[1]) {
            res.json({ success: true, rawVideoUrl: videoMatch[1] });
        } else {
            res.status(404).json({ error: "Video link not found in source code" });
        }
    } catch (error) {
        console.error("Extractor error:", error.message);
        res.status(500).json({ error: "Failed to fetch from target URL" });
    }
});

// =========================================================
// 2. PROXY STREAMING API: Asli video ko server ke through pass karna
// =========================================================
app.get('/play', async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).send("No video URL provided");

    try {
        const options = {
            method: 'GET',
            url: videoUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
                // Is website ke strict defense ko todne ke liye dummy referer:
                'Referer': 'https://www.pornhub.com/' 
            }
        };
        
        // Agar player video aage badhata hai (seek karta hai), toh range header pass karo
        if (req.headers.range) {
            options.headers.Range = req.headers.range;
        }

        const response = await axios(options);

        // MAGIC FIX: Sirf zaruri media headers pass karo, unke strict security wale nahi!
        Object.keys(response.headers).forEach(key => {
            const lowerKey = key.toLowerCase();
            // In headers ko block karo taaki browser unki CORS policy na padh le
            if (!lowerKey.startsWith('access-control-') && lowerKey !== 'transfer-encoding') {
                res.setHeader(key, response.headers[key]);
            }
        });

        // Hamara apna open CORS header wapas lagao
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(response.status);

        // Video stream ko directly user ke phone par pipe (stream) kar do
        response.data.pipe(res);

    } catch (error) {
        console.error("Stream error:", error.message);
        if (!res.headersSent) {
            res.status(500).send("Error streaming video");
        }
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Aurora Backend running on port ${PORT}`);
});
