const express = require('express');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for Unity requests
app.use(cors());
app.use(express.json());

// Register Fonts
const fonts = {
    'Samsung Sharp Sans': 'samsungsharpsans-medium.otf',
    'Global Font': 'global.ttf', // Single fallback font file for all other languages
    'Fredoka One': 'fredoka-one.one-regular.ttf'
};

Object.entries(fonts).forEach(([family, file]) => {
    const fontPath = path.join(__dirname, 'fonts', file);
    if (fs.existsSync(fontPath)) {
        GlobalFonts.registerFromPath(fontPath, family);
        console.log(`✅ Loaded font: ${family}`);
    } else {
        console.warn(`⚠️  Font missing: ${file} (${family})`);
    }
});

// Serve static files (the website)
app.use(express.static(__dirname));

// ==========================================
// TRANSLITERATION FUNCTION
// ==========================================
async function transliterate(text, targetLang) {
    // If target is English, return as-is
    if (targetLang === 'en') return text;

    try {
        // Strategy 1: Google Translate free endpoint (great for transliteration)
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data && data[0] && data[0][0] && data[0][0][0]) {
            const result = data[0][0][0];
            // Check if it actually changed (transliterated)
            if (result.toLowerCase() !== text.toLowerCase()) {
                return result;
            }
        }
    } catch (e) {
        console.warn('Google transliteration failed:', e.message);
    }

    try {
        // Strategy 2: Sentence-based transliteration
        const sentence = `My name is ${text}`;
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(sentence)}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data && data[0] && data[0][0] && data[0][0][0]) {
            const fullTranslation = data[0][0][0];
            const words = fullTranslation.split(/\s+/);
            return words[words.length - 1];
        }
    } catch (e) {
        console.warn('Sentence transliteration failed:', e.message);
    }

    try {
        // Strategy 3: MyMemory fallback
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${targetLang}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.responseStatus === 200 && data.responseData.translatedText) {
            return data.responseData.translatedText;
        }
    } catch (e) {
        console.warn('MyMemory transliteration failed:', e.message);
    }

    // If all strategies fail, return original text
    return text;
}

// ==========================================
// API ENDPOINT: GET /api/text-to-png
// ==========================================
// 
// Query Parameters:
//   text     (required) - The name in English (e.g., "avinash")
//   lang     (optional) - Target language code: en, ko, hi, mr, gu, ar (default: "en")
//   fontSize (optional) - Font size in pixels (default: 64)
//   color    (optional) - Text color hex without # (default: "ffffff")
//   bg       (optional) - Background color hex without # (default: "000000")
//   transparent (optional) - "true" for transparent background (default: "false")
//
// Returns: PNG image
//
// Example:
//   http://localhost:3000/api/text-to-png?text=avinash&lang=hi&fontSize=80
//   http://localhost:3000/api/text-to-png?text=avinash&lang=ko&transparent=true
//
app.get('/api/text-to-png', async (req, res) => {
    try {
        const {
            text,
            lang = 'en',
            fontSize: fontSizeParam = '64',
            color = 'ffffff',
            bg = '000000',
            transparent = 'false'
        } = req.query;

        // Validate required params
        if (!text) {
            return res.status(400).json({ error: 'Missing required parameter: text' });
        }

        // Validate language
        const validLangs = ['en', 'ko', 'hi', 'mr', 'gu', 'ar'];
        if (!validLangs.includes(lang)) {
            return res.status(400).json({
                error: `Invalid language: ${lang}. Valid options: ${validLangs.join(', ')}`
            });
        }

        const size = parseInt(fontSizeParam, 10) || 64;
        const isTransparent = transparent === 'true';

        console.log(`📝 Request: text="${text}", lang="${lang}", size=${size}`);

        // Step 1: Transliterate the text
        const transliteratedText = await transliterate(text, lang);
        console.log(`🔤 Transliterated: "${text}" → "${transliteratedText}" (${lang})`);

        // Step 2: Render text to canvas
        let fontFamily = 'Samsung Sharp Sans';

        // Select font based on language
        if (['hi', 'mr'].includes(lang)) fontFamily = 'Noto Sans Devanagari';
        else if (lang === 'gu') fontFamily = 'Noto Sans Gujarati';
        else if (lang === 'ar') fontFamily = 'Noto Sans Arabic';
        else if (lang === 'ko') fontFamily = 'Noto Sans KR';

        // Render to canvas
        const FIXED_WIDTH = 240;
        const FIXED_HEIGHT = 60;
        const WIDTH_PADDING = 20;

        // Auto-fit logic: Start with a logical max size and reduce
        let fontSize = Math.min(parseInt(fontSizeParam, 10) || 40, FIXED_HEIGHT * 0.8);
        const MIN_FONT_SIZE = 10;

        const measureCanvas = createCanvas(1, 1);
        const measureCtx = measureCanvas.getContext('2d');
        const lines = transliteratedText.split('\n');

        // Loop to find largest font size
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
            if (maxWidth <= (FIXED_WIDTH - WIDTH_PADDING) && totalHeight <= (FIXED_HEIGHT - 5)) {
                break;
            }
            fontSize -= 2;
        }

        const lineHeight = fontSize * 1.2;

        // Create Fixed Canvas
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

        const totalTextHeight = lines.length * lineHeight;
        const startY = (FIXED_HEIGHT - totalTextHeight) / 2 + (lineHeight / 2);

        lines.forEach((line, index) => {
            ctx.fillText(line, FIXED_WIDTH / 2, startY + (index * lineHeight) - (lineHeight * 0.1));
        });

        // Step 3: Return PNG
        res.set('Content-Type', 'image/png');
        res.set('Content-Disposition', `inline; filename="${text}-${lang}.png"`);
        res.set('X-Original-Text', text);
        res.set('X-Transliterated-Text', encodeURIComponent(transliteratedText));
        res.set('X-Language', lang);

        const buffer = canvas.toBuffer('image/png');
        console.log(`✅ Generated PNG: ${canvasWidth}x${canvasHeight}px (${buffer.length} bytes)`);
        res.send(buffer);

    } catch (error) {
        console.error('❌ Error generating PNG:', error);
        res.status(500).json({ error: 'Failed to generate image', details: error.message });
    }
});

// ==========================================
// API ENDPOINT: GET /api/transliterate
// ==========================================
app.get('/api/transliterate', async (req, res) => {
    try {
        const { text, lang = 'en' } = req.query;

        if (!text) {
            return res.status(400).json({ error: 'Missing required parameter: text' });
        }

        const validLangs = ['en', 'ko', 'hi', 'mr', 'gu', 'ar'];
        if (!validLangs.includes(lang)) {
            return res.status(400).json({
                error: `Invalid language: ${lang}. Valid options: ${validLangs.join(', ')}`
            });
        }

        const transliterated = await transliterate(text, lang);

        res.json({
            original: text,
            transliterated: transliterated,
            language: lang
        });

    } catch (error) {
        console.error('❌ Error transliterating:', error);
        res.status(500).json({ error: 'Failed to transliterate', details: error.message });
    }
});

// ==========================================
// API DOCS ENDPOINT
// ==========================================
app.get('/api', (req, res) => {
    res.json({
        name: 'Text to PNG API',
        version: '1.0.0',
        endpoints: {
            'GET /api/text-to-png': {
                description: 'Convert name to PNG image with transliteration',
                parameters: {
                    text: '(required) Name in English, e.g. "avinash"',
                    lang: '(optional) Target language: en, ko, hi, mr, gu, ar (default: en)',
                    fontSize: '(optional) Font size in pixels (default: 64)',
                    color: '(optional) Text color hex without # (default: ffffff)',
                    bg: '(optional) Background color hex without # (default: "000000")',
                    transparent: '(optional) "true" for transparent bg (default: false)'
                },
                returns: 'PNG image',
                example: '/api/text-to-png?text=avinash&lang=hi&fontSize=80'
            },
            'GET /api/transliterate': {
                description: 'Get transliterated text as JSON',
                parameters: {
                    text: '(required) Name in English',
                    lang: '(optional) Target language code (default: en)'
                },
                returns: 'JSON { original, transliterated, language }',
                example: '/api/transliterate?text=avinash&lang=ko'
            }
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 Text to PNG API running at http://localhost:${PORT}`);
    console.log(`\n📖 API Docs:      http://localhost:${PORT}/api`);
    console.log(`🖼️  Example PNG:   http://localhost:${PORT}/api/text-to-png?text=avinash&lang=hi`);
    console.log(`🔤 Example JSON:  http://localhost:${PORT}/api/transliterate?text=avinash&lang=ko`);
    console.log(`🌐 Web UI:        http://localhost:${PORT}/index.html\n`);
});
