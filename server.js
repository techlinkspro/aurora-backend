const express = require('express');
const cors = require('cors');
const axios = require('axios');
const youtubedl = require('youtube-dl-exec');

const app = express();

// Har jagah se request allow karne ke liye (CORS bypass)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Range', 'Authorization']
}));

// =========================================================
// 1. ADVANCED EXTRACTOR: yt-dlp with Spoofing Headers
// =========================================================
app.get('/extract', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: "URL is required" });

    try {
        console.log("Extracting URL via Ninja Proxy:", targetUrl);
        
        // yt-dlp ko browser ki tarah bhejna (Anti-bot bypass tricks)
        const output = await youtubedl(targetUrl, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: [
                'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
                'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language: en-US,en;q=0.5'
            ]
        });

        const directUrl = output.url || 
                         (output.entries && output.entries[0]?.url) || 
                         (output.requested_formats && output.requested_formats[0]?.url);

        if (directUrl) {
            res.json({ success: true, rawVideoUrl: directUrl, isHls: directUrl.includes('.m3u8') });
        } else {
            res.status(404).json({ error: "Video link not found by yt-dlp" });
        }
    } catch (error) {
        console.error("Extractor error:", error.message);
        res.status(500).json({ error: "Failed to bypass security using yt-dlp" });
    }
});

// =========================================================
// 2. ULTIMATE STREAMING PROXY: IP & Header Spoofing
// =========================================================
app.get('/play', async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).send("No video URL provided");

    try {
        // Ninja Headers - Asli insaan ban kar server ke paas jana
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Connection': 'keep-alive'
        };

        // Agar user player mein video aage badhata hai (Seeking), toh Range pass karna zaroori hai
        if (req.headers.range) {
            headers['Range'] = req.headers.range;
        }

        const options = {
            method: 'GET',
            url: videoUrl,
            responseType: 'stream',
            headers: headers,
            maxRedirects: 5,
            validateStatus: status => status >= 200 && status < 400 // Handle redirects properly
        };

        const response = await axios(options);

        // Security headers ko filter karna (Target site ki deewar todna)
        Object.keys(response.headers).forEach(key => {
            const lowerKey = key.toLowerCase();
            const badHeaders = ['access-control', 'x-frame-options', 'content-security-policy', 'strict-transport-security'];
            
            // In strict headers ko chhod kar baaki sab bhej do
            if (!badHeaders.some(bad => lowerKey.startsWith(bad)) && lowerKey !== 'transfer-encoding') {
                res.setHeader(key, response.headers[key]);
            }
        });

        // Apna open CORS lagana taaki browser block na kare
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.status(response.status);

        // Stream ko pipe kar dena browser mein
        response.data.pipe(res);

    } catch (error) {
        console.error("Stream Proxy Error:", error.message);
        if (!res.headersSent) {
            res.status(500).send("Error proxying video stream");
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Aurora Advanced Ninja Proxy running on port ${PORT}`);
});
