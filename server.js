const express = require('express');
const axios = require('axios');
const youtubedl = require('youtube-dl-exec');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────────
// 1. SPOOF BROWSER HEADERS
// ─────────────────────────────────────────────────
const BROWSER_HEADERS = {
  'User-Agent': [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  ],
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'identity',  // No compression -> easy pipe
  'Cache-Control': 'no-cache',
  'DNT': '1',
};

function getRandomUserAgent() {
  const list = BROWSER_HEADERS['User-Agent'];
  return list[Math.floor(Math.random() * list.length)];
}

// ─────────────────────────────────────────────────
// 2. OPEN CORS HANDLING
// ─────────────────────────────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Range, Content-Type, Content-Length, Accept-Encoding');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─────────────────────────────────────────────────
// 3. HEADER SANITIZER (Removes strict security headers)
// ─────────────────────────────────────────────────
const STRIP_HEADERS = new Set([
  'access-control-allow-origin',
  'access-control-allow-methods',
  'x-frame-options',
  'content-security-policy',
  'strict-transport-security',
  'set-cookie'
]);

function setSafeHeaders(upstreamHeaders, res) {
  Object.entries(upstreamHeaders).forEach(([key, value]) => {
    if (!STRIP_HEADERS.has(key.toLowerCase())) {
      res.set(key, value);
    }
  });
}

// ─────────────────────────────────────────────────
// 4. HLS MANIFEST REWRITER (.m3u8 Bypass)
// ─────────────────────────────────────────────────
function resolveAbsoluteUrl(uri, baseUrl) {
  if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;
  return new URL(uri, baseUrl).href;
}

function rewriteManifest(body, finalTargetUrl, proxyBasePath) {
  const lines = body.split('\n');
  const rewritten = lines.map(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const absolute = resolveAbsoluteUrl(trimmed, finalTargetUrl);
      return proxyBasePath + encodeURIComponent(absolute);
    }
    if (trimmed.startsWith('#EXT-X-KEY') || trimmed.startsWith('#EXT-X-MAP')) {
      return trimmed.replace(/URI="([^"]*)"/g, (_, uri) => {
        const abs = resolveAbsoluteUrl(uri, finalTargetUrl);
        return `URI="${proxyBasePath}${encodeURIComponent(abs)}"`;
      });
    }
    return trimmed;
  });
  return rewritten.join('\n');
}

// ─────────────────────────────────────────────────
// 5. EXTRACTOR ROUTE (Gets raw video link using yt-dlp)
// ─────────────────────────────────────────────────
app.get('/extract', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: "URL is required" });

    try {
        console.log("Extracting URL via yt-dlp:", targetUrl);
        const output = await youtubedl(targetUrl, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: [`User-Agent:${getRandomUserAgent()}`]
        });

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
        res.status(500).json({ error: "Failed to extract from target URL" });
    }
});

// ─────────────────────────────────────────────────
// 6. MAIN PROXY ENDPOINT (Streams the raw link)
// ─────────────────────────────────────────────────
app.get('/play', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ error: 'Missing ?url=' });

  let parsed;
  try { parsed = new URL(targetUrl); } 
  catch { return res.status(400).json({ error: 'Invalid URL' }); }

  const headers = {
    ...BROWSER_HEADERS,
    'User-Agent': getRandomUserAgent(),
    'Referer': `${parsed.protocol}//${parsed.hostname}/`,
    'Origin': `${parsed.protocol}//${parsed.hostname}`,
  };

  if (req.headers.range) headers['Range'] = req.headers.range;

  try {
    const response = await axios({
      method: 'GET',
      url: targetUrl,
      headers,
      responseType: 'stream',
      maxRedirects: 5,
      validateStatus: status => status < 500,
    });

    const finalUrl = response.request?.res?.responseUrl || targetUrl;
    const contentType = (response.headers['content-type'] || '').toLowerCase();
    const isHls = contentType.includes('mpegurl') || targetUrl.includes('.m3u8');

    // M3U8 Rewrite Logic
    if (isHls) {
      let body = '';
      response.data.on('data', chunk => (body += chunk.toString()));
      response.data.on('end', () => {
        const rewritten = rewriteManifest(body, finalUrl, '/play?url=');
        setSafeHeaders(response.headers, res);
        res.status(response.status);
        res.set('Content-Type', 'application/vnd.apple.mpegurl');
        res.send(rewritten);
      });
      return;
    }

    // Direct MP4 Pipe
    setSafeHeaders(response.headers, res);
    res.status(response.status);
    response.data.pipe(res);

  } catch (error) {
    console.error('Proxy request failed:', error.message);
    if (!res.headersSent) res.status(502).json({ error: 'Upstream stream error' });
  }
});
// ─────────────────────────────────────────────────
// NEW: SHORTLINK DATABASE ROUTE (5-Character IDs)
// ─────────────────────────────────────────────────
// Ye aapka chhota sa in-memory database hai.
// Yahan aap apne 5-character IDs ke aage unka asli link dalenge.
const shortlinkDB = {
    "1xkLw": "https://www.w3schools.com/html/mov_bbb.mp4",
    "abcde": "https://sample-videos.com/video123.mp4"
};

app.get('/api/video/:id', (req, res) => {
    const videoId = req.params.id;
    const originalLink = shortlinkDB[videoId];

    if (originalLink) {
        // Agar link mil gaya, toh directly send kar do
        // (Aap chahein toh isko apne /play proxy ke through bhi bhej sakte hain)
        res.json({ success: true, url: originalLink });
    } else {
        res.status(404).json({ success: false, error: "Video not found in database!" });
    }
});

// ─────────────────────────────────────────────────
// 7. START SERVER
// ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Aurora Advanced Proxy running on port ${PORT}`);
});
