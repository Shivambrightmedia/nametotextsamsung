const fetch = require('node-fetch');

async function transliterate(text, targetLang) {
    if (targetLang === 'en') return text;

    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data && data[0] && data[0][0] && data[0][0][0]) {
            const result = data[0][0][0];
            if (result.toLowerCase() !== text.toLowerCase()) return result;
        }
    } catch (e) {
        console.warn('Google failed:', e.message);
    }

    try {
        const sentence = `My name is ${text}`;
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(sentence)}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data && data[0] && data[0][0] && data[0][0][0]) {
            const words = data[0][0][0].split(/\s+/);
            return words[words.length - 1];
        }
    } catch (e) {
        console.warn('Sentence method failed:', e.message);
    }

    return text;
}

exports.handler = async (event) => {
    const params = event.queryStringParameters || {};
    const { text, lang = 'en' } = params;

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    };

    if (!text) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Missing required parameter: text' })
        };
    }

    const validLangs = ['en', 'ko', 'hi', 'mr', 'gu', 'ar'];
    if (!validLangs.includes(lang)) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: `Invalid language: ${lang}. Valid: ${validLangs.join(', ')}` })
        };
    }

    try {
        const transliterated = await transliterate(text, lang);
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ original: text, transliterated, language: lang })
        };
    } catch (error) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Transliteration failed', details: error.message })
        };
    }
};
