const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const stream = require('stream');
const { promisify } = require('util');
const pipeline = promisify(stream.pipeline);

// Font Configuration (CDN URLs)
const FONT_MAP = {
    'hi': { family: 'Noto Sans Devanagari', url: 'https://github.com/google/fonts/raw/main/ofl/notosansdevanagari/NotoSansDevanagari-Bold.ttf' },
    'mr': { family: 'Noto Sans Devanagari', url: 'https://github.com/google/fonts/raw/main/ofl/notosansdevanagari/NotoSansDevanagari-Bold.ttf' },
    'gu': { family: 'Noto Sans Gujarati', url: 'https://github.com/google/fonts/raw/main/ofl/notosansgujarati/NotoSansGujarati-Bold.ttf' },
    'ar': { family: 'Noto Sans Arabic', url: 'https://github.com/google/fonts/raw/main/ofl/notosansarabic/NotoSansArabic-Bold.ttf' },
    'ko': { family: 'Noto Sans KR', url: 'https://github.com/google/fonts/raw/main/ofl/notosanskr/NotoSansKR-Bold.ttf' },
    'en': { family: 'Samsung Sharp Sans', url: null } // English uses local or fallback
};

// Helper: Download file if not exists
async function downloadFont(url, filename) {
    const tmpPath = path.join('/tmp', filename);

    if (fs.existsSync(tmpPath)) {
        return tmpPath; // Already downloaded (warm cache)
    }

    console.log(`Downloading font from ${url}...`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch font: ${response.statusText}`);

    await pipeline(response.body, fs.createWriteStream(tmpPath));
    console.log(`Font saved to ${tmpPath}`);
    return tmpPath;
}

// Helper: Transliterate
async function transliterate(text, targetLang) {
    if (targetLang === 'en') return text;

    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data && data[0] && data[0][0]) {
            const result = data[0][0][0];
            if (result.toLowerCase() !== text.toLowerCase()) return result;
        }
    } catch (e) { }

    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(`My name is ${text}`)}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data && data[0] && data[0][0]) return data[0][0][0].split(/\s+/).pop();
    } catch (e) { }

    return text;
}

exports.handler = async (event) => {
    const params = event.queryStringParameters || {};
    const { text, lang = 'en', fontSize = '64', color = 'ffffff', bg = '000000', transparent = 'false' } = params;

    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };

    if (!text) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing text' }) };

    try {
        const size = parseInt(fontSize, 10) || 64;
        const isTransparent = transparent === 'true';

        // 1. Transliterate
        const transliteratedText = await transliterate(text, lang);

        // 2. Determine Font
        let fontFamily = 'Samsung Sharp Sans';
        let fontFile = 'samsungsharpsans-medium.otf';

        // Check if we need to download a specific font
        if (FONT_MAP[lang]) {
            const config = FONT_MAP[lang];
            if (config.url) {
                // Download and register matching font
                const filename = path.basename(config.url);
                try {
                    const fontPath = await downloadFont(config.url, filename);
                    GlobalFonts.registerFromPath(fontPath, config.family);
                    fontFamily = config.family;
                } catch (err) {
                    console.error('Font download failed:', err);
                    // Fallback to Samsung, likely resulting in boxes, but better than crash
                }
            }
        }

        // Register default Samsung font (try bundling path, then tmp if we ever downloaded it)
        try {
            // Try standard paths for bundled font
            const localPath = path.join(__dirname, 'fonts', 'samsungsharpsans-medium.otf');
            if (fs.existsSync(localPath)) GlobalFonts.registerFromPath(localPath, 'Samsung Sharp Sans');
        } catch (e) { }

        // 3. Setup Canvas
        // Fixed Canvas Dimensions
        const FIXED_WIDTH = 240;
        const FIXED_HEIGHT = 60;
        const WIDTH_PADDING = 20;

        // Auto-fit logic: Start with a logical max size and reduce until it fits
        let fontSize = Math.min(parseInt(fontSizeParam, 10) || 40, FIXED_HEIGHT * 0.8);
        const MIN_FONT_SIZE = 10;

        const measureCanvas = createCanvas(1, 1);
        const measureCtx = measureCanvas.getContext('2d');
        const lines = transliteratedText.split('\n');

        // Loop to find the largest font size that fits
        while (fontSize > MIN_FONT_SIZE) {
            measureCtx.font = `${fontSize}px "${fontFamily}"`;

            let maxWidth = 0;
            lines.forEach(line => {
                const metrics = measureCtx.measureText(line);
                const w = metrics.actualBoundingBoxLeft !== undefined
                    ? metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight
                    : metrics.width;
                if (w > maxWidth) maxWidth = w;
            });

            const totalHeight = lines.length * (fontSize * 1.2);

            // Check if it fits within safe area
            if (maxWidth <= (FIXED_WIDTH - WIDTH_PADDING) && totalHeight <= (FIXED_HEIGHT - 5)) {
                break;
            }

            fontSize -= 2; // Decrease font size
        }

        const lineHeight = fontSize * 1.2;

        // Create Fixed Size Canvas
        const canvas = createCanvas(FIXED_WIDTH, FIXED_HEIGHT);
        const ctx = canvas.getContext('2d');

        if (!isTransparent) {
            ctx.fillStyle = `#${bg}`;
            ctx.fillRect(0, 0, FIXED_WIDTH, FIXED_HEIGHT);
        }

        ctx.font = `${fontSize}px "${fontFamily}"`;
        ctx.fillStyle = `#${color}`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';

        // Draw Centered Text
        const totalTextHeight = lines.length * lineHeight;
        const startY = (FIXED_HEIGHT - totalTextHeight) / 2 + (lineHeight / 2);

        lines.forEach((line, index) => {
            ctx.fillText(line, FIXED_WIDTH / 2, startY + (index * lineHeight) - (lineHeight * 0.1));
        });

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'image/png',
                'X-Original-Text': text,
                'X-Transliterated-Text': encodeURIComponent(transliteratedText),
                'X-Font-Used': fontFamily
            },
            body: canvas.toBuffer('image/png').toString('base64'),
            isBase64Encoded: true
        };

    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
