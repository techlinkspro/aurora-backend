const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());

// 1. EXTRACTOR API (Purana wala)
app.get('/extract', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: "URL is required" });

    try {
        const response = await axios.get(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36' }
        });

        const html = response.data;
        // Regex to find raw .mp4 or .m3u8 links
        const videoMatch = html.match(/(https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8)[^\s"'<>]*)/i);

        if (videoMatch && videoMatch[1]) {
            res.json({ success: true, rawVideoUrl: videoMatch[1] });
        } else {
            res.status(404).json({ error: "Video link not found in source code" });
        }
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch from target URL" });
    }
});

// 2. 🔥 PROXY STREAMING API (Naya Brahmastra) 🔥
app.get('/play', async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).send("No video URL provided");

    try {
        // Forward Range header taaki video ko aage-peeche (seek) kiya ja sake
        const options = {
            method: 'GET',
            url: videoUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            }
        };
        if (req.headers.range) options.headers.Range = req.headers.range;

        const response = await axios(options);

        // Target server ke saare headers apne player ko pass karo
        Object.keys(response.headers).forEach(key => {
            res.setHeader(key, response.headers[key]);
        });
        res.status(response.status);

        // Video stream ko directly user ke phone par pipe kar do
        response.data.pipe(res);
    } catch (error) {
        console.error("Stream error:", error.message);
        res.status(500).send("Error streaming video");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Aurora Backend running on port ${PORT}`));
