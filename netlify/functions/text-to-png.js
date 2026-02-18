const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

// Register Fonts
const fonts = {
    'Samsung Sharp Sans': 'samsungsharpsans-medium.otf',
    'Global Font': 'global.ttf',
    'Fredoka One': 'fredoka-one.one-regular.ttf'
};

// Tracking font loading status for debug
const fontDebug = {
    attempts: [],
    loaded: []
};

Object.entries(fonts).forEach(([family, file]) => {
    // Possible paths where Netlify/AWS Lambda might put files
    const pathsToCheck = [
        path.join(__dirname, 'fonts', file),                     // Bundled relative
        path.join(process.cwd(), 'fonts', file),                 // Root based
        path.join(__dirname, '..', '..', 'fonts', file),         // Local dev
        path.resolve(file)                                       // Root fallback
    ];

    for (const p of pathsToCheck) {
        if (fs.existsSync(p)) {
            try {
                GlobalFonts.registerFromPath(p, family);
                fontDebug.loaded.push(`${family} from ${p}`);
                break; // Stop once registered
            } catch (e) {
                fontDebug.attempts.push(`Failed ${p}: ${e.message}`);
            }
        } else {
            fontDebug.attempts.push(`Missing ${p}`);
        }
    }
});

// Transliterate function
async function transliterate(text, targetLang) {
    if (targetLang === 'en') return text;

    // Strategy 1: Google Translate
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data && data[0] && data[0][0]) {
            const result = data[0][0][0];
            if (result.toLowerCase() !== text.toLowerCase()) return result;
        }
    } catch (e) { }

    // Strategy 2: Sentence method
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(`My name is ${text}`)}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data && data[0] && data[0][0]) return data[0][0][0].split(/\s+/).pop();
    } catch (e) { }

    // Strategy 3: MyMemory
    try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${targetLang}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.responseStatus === 200 && data.responseData.translatedText) {
            return data.responseData.translatedText;
        }
    } catch (e) { }

    return text;
}

exports.handler = async (event) => {
    const params = event.queryStringParameters || {};
    const {
        text,
        lang = 'en',
        fontSize: fontSizeParam = '64',
        color = 'ffffff',
        bg = '000000',
        transparent = 'false'
    } = params;

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (!text) {
        return {
            statusCode: 400,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Missing required parameter: text' })
        };
    }

    try {
        const isTransparent = transparent === 'true';

        // Transliterate
        const transliteratedText = await transliterate(text, lang);

        // Select Font
        let fontFamily = 'Samsung Sharp Sans';
        if (lang !== 'en') {
            fontFamily = 'Global Font';
        }

        // Fixed Canvas Dimensions
        const FIXED_WIDTH = 240;
        const FIXED_HEIGHT = 60;
        const WIDTH_PADDING = 20;

        // Auto-fit logic
        // Parse requested size, but cap it at 48px to fit height
        let fontSize = Math.min(parseInt(fontSizeParam, 10) || 40, 48);
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

            // Height check (approximate)
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

        const buffer = canvas.toBuffer('image/png');

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'image/png',
                'Content-Disposition': `inline; filename="${text}-${lang}.png"`,
                'X-Original-Text': text,
                'X-Transliterated-Text': encodeURIComponent(transliteratedText),
                'X-Language': lang,
                'X-Font-Used': fontFamily,
                'X-Debug-Fonts': JSON.stringify(fontDebug.loaded)
            },
            body: buffer.toString('base64'),
            isBase64Encoded: true
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Failed to generate image', details: error.message })
        };
    }
};
