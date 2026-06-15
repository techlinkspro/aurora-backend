const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors()); 

app.get('/extract', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).json({ error: "URL is required" });
    }

    try {
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            }
        });

        const html = response.data;

        // Regex to find raw .mp4 or .m3u8 links in the iframe's source code
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

// Render automatically assigns a PORT environment variable
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Aurora Backend running on port ${PORT}`));
