const express = require('express');
const cors = require('cors');
const axios = require('axios');
const youtubedl = require('youtube-dl-exec');

const app = express();

app.use(cors());

// =========================================================
// 1. EXTRACTOR API: yt-dlp ka use karke direct link nikalna
// =========================================================
app.get('/extract', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: "URL is required" });

    try {
        console.log("Extracting URL via yt-dlp:", targetUrl);
        // yt-dlp execute kar rahe hain raw url nikalne ke liye
        const output = await youtubedl(targetUrl, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true
        });

        // yt-dlp formats mein se best direct url dhoondhna
        const directUrl = output.url || 
                         (output.entries && output.entries[0]?.url) || 
                         (output.requested_formats && output.requested_formats[0]?.url);

        if (directUrl) {
            res.json({ success: true, rawVideoUrl: directUrl });
        } else {
            res.status(404).json({ error: "Video link not found by yt-dlp" });
        }
    } catch (error) {
        console.error("Extractor error:", error.message);
        res.status(500).json({ error: "Failed to fetch from target URL using yt-dlp" });
    }
});

// =========================================================
// 2. PROXY STREAMING API: IP block bypass karne ke liye
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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.pornhub.com/' 
            }
        };
        
        if (req.headers.range) {
            options.headers.Range = req.headers.range;
        }

        const response = await axios(options);

        // Security headers hatana taaki browser block na kare
        Object.keys(response.headers).forEach(key => {
            const lowerKey = key.toLowerCase();
            if (!lowerKey.startsWith('access-control-') && lowerKey !== 'transfer-encoding') {
                res.setHeader(key, response.headers[key]);
            }
        });

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(response.status);

        response.data.pipe(res);

    } catch (error) {
        console.error("Stream error:", error.message);
        if (!res.headersSent) {
            res.status(500).send("Error streaming video");
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Aurora Backend running on port ${PORT}`);
});
