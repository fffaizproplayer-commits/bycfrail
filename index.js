const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-zygote',
    '--disable-gpu'
];

let _browser = null;

async function getBrowser() {
    if (!_browser || !_browser.isConnected()) {
        _browser = await puppeteer.launch({ headless: 'new', args: ARGS });
    }
    return _browser;
}

app.post('/api/bypass', async (req, res) => {
    const { url, sitekey } = req.body;
    if (!url || !sitekey) return res.status(400).json({ success: false, error: 'url and sitekey are required' });

    let page = null;
    try {
        const browser = await getBrowser();
        page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

        const html = `<!DOCTYPE html>
<html><head>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</head><body>
<div class="cf-turnstile" data-sitekey="${sitekey}" data-callback="onDone"></div>
<script>function onDone(t) { window._cfToken = t; }</script>
</body></html>`;

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 });

        const handle = await page.waitForFunction(
            () => window._cfToken || (document.querySelector('input[name="cf-turnstile-response"]') || {}).value || null,
            { timeout: 30000, polling: 300 }
        );
        const token = await handle.jsonValue();

        if (!token) throw new Error('Token not received from Turnstile');

        res.json({ success: true, token });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (page) await page.close();
    }
});

app.post('/api/waf', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'url is required' });

    let page = null;
    try {
        const browser = await getBrowser();
        page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });

        const cookies = await page.cookies();
        const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

        res.json({ success: true, cookies: cookieStr, raw: cookies });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (page) await page.close();
    }
});

app.get('/api/stats', (req, res) => {
    res.json({ success: true, status: 'online', solver: 'puppeteer', version: '2.0.0' });
});

app.listen(PORT, () => console.log(`Running on port ${PORT}`));
