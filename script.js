document.addEventListener('DOMContentLoaded', () => {
    const textInput = document.getElementById('textInput');
    const fontFamily = document.getElementById('fontFamily');
    const fontSize = document.getElementById('fontSize');
    const textColor = document.getElementById('textColor');
    const bgColor = document.getElementById('bgColor');
    const transparentBg = document.getElementById('transparentBg');
    const downloadBtn = document.getElementById('downloadBtn');
    const canvas = document.getElementById('textCanvas');
    const ctx = canvas.getContext('2d');
    const statusSpan = document.getElementById('dimensions');

    // Modal elements
    const modal = document.getElementById('fontModal');
    const closeModal = document.querySelector('.close-modal');

    let isFontLoaded = false;

    // Separate variable for canvas display text (transliterated text goes here)
    let canvasText = '';

    // Fixed canvas dimensions
    const FIXED_WIDTH = 240;
    const FIXED_HEIGHT = 60;

    // Default canvas setup
    function draw() {
        const text = canvasText || textInput.value || 'Type something...';
        const font = fontFamily.value;
        const color = textColor.value;
        const bg = bgColor.value;
        const isTransparent = transparentBg.checked;

        const lines = text.split('\n');
        const WIDTH_PADDING = 20;
        const MIN_FONT_SIZE = 10;

        // Start with the user-selected font size, but cap at what fits the height
        let size = Math.min(parseInt(fontSize.value, 10) || 40, 48);

        // Auto-fit: reduce font size until text fits within 240x60
        while (size > MIN_FONT_SIZE) {
            ctx.font = `${size}px ${font}`;

            let maxWidth = 0;
            lines.forEach(line => {
                const metrics = ctx.measureText(line);
                const w = metrics.actualBoundingBoxLeft !== undefined
                    ? metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight
                    : metrics.width;
                if (w > maxWidth) maxWidth = w;
            });

            const totalHeight = lines.length * (size * 1.2);

            if (maxWidth <= (FIXED_WIDTH - WIDTH_PADDING) && totalHeight <= (FIXED_HEIGHT - 5)) {
                break;
            }

            size -= 2;
        }

        const lineHeight = size * 1.2;

        // Set fixed canvas size
        canvas.width = FIXED_WIDTH;
        canvas.height = FIXED_HEIGHT;

        // Re-apply context settings after resize
        ctx.font = `${size}px ${font}`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';

        // Draw Background
        if (!isTransparent) {
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, FIXED_WIDTH, FIXED_HEIGHT);
        } else {
            ctx.clearRect(0, 0, FIXED_WIDTH, FIXED_HEIGHT);
        }

        // Draw Centered Text
        ctx.fillStyle = color;
        const totalTextHeight = lines.length * lineHeight;
        const startY = (FIXED_HEIGHT - totalTextHeight) / 2 + (lineHeight / 2);

        lines.forEach((line, index) => {
            ctx.fillText(line, FIXED_WIDTH / 2, startY + (index * lineHeight) - (lineHeight * 0.1));
        });

        // Update status
        statusSpan.textContent = `${FIXED_WIDTH} × ${FIXED_HEIGHT} px`;
    }

    // Event Listeners
    [textInput, fontFamily, fontSize, textColor, bgColor, transparentBg].forEach(el => {
        el.addEventListener('input', () => {
            // When user types, clear any transliterated text so canvas shows what they type
            if (el === textInput) canvasText = '';
            draw();
        });
        el.addEventListener('change', () => {
            if (el === textInput) canvasText = '';
            draw();
        });
    });

    // Check for Samsung Font usage
    fontFamily.addEventListener('change', (e) => {
        if (e.target.value.includes('Samsung Sharp Sans')) {
            // Simple check using document.fonts
            if (document.fonts) {
                const fontString = '16px "Samsung Sharp Sans"';
                if (!document.fonts.check(fontString)) {
                    modal.style.display = 'block';
                }
            }
        }
    });

    closeModal.onclick = () => {
        modal.style.display = "none";
    }

    window.onclick = (event) => {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    }

    // Transliteration Logic (convert names into different scripts)
    const translateBtn = document.getElementById('translateBtn');
    const targetLanguage = document.getElementById('targetLanguage');

    translateBtn.addEventListener('click', async () => {
        const text = textInput.value.trim();
        const targetLang = targetLanguage.value;

        if (!text) {
            alert('Please enter a name to transliterate.');
            return;
        }

        const originalText = translateBtn.textContent;
        translateBtn.textContent = 'Converting...';
        translateBtn.disabled = true;

        try {
            // Use Google Translate free endpoint - it transliterates names into target script
            console.log(`Transliterating "${text}" to ${targetLang}...`);
            let result = await transliterateGoogle(text, targetLang);

            // Fallback to MyMemory
            if (!result || result.toLowerCase() === text.toLowerCase()) {
                console.log('Google failed or returned same text, trying MyMemory...');
                translateBtn.textContent = 'Trying fallback...';
                result = await transliterateMyMemory(text, targetLang);
            }

            if (result && result.toLowerCase() !== text.toLowerCase()) {
                canvasText = result;
                draw();
            } else {
                // If APIs return the same text, it means the name wasn't transliterated
                // Try wrapping in a sentence to force transliteration
                console.log('Direct transliteration failed, trying sentence method...');
                translateBtn.textContent = 'Trying alternative...';
                result = await transliterateSentence(text, targetLang);

                if (result) {
                    canvasText = result;
                    draw();
                } else {
                    alert(`Could not transliterate "${text}" to the selected language. The name may already be in its native form.`);
                }
            }
        } catch (error) {
            console.error('Transliteration failed:', error);
            alert('Transliteration failed. Please check your internet connection.');
        } finally {
            translateBtn.textContent = originalText;
            translateBtn.disabled = false;
        }
    });

    // Google Translate free endpoint - works great for transliteration
    async function transliterateGoogle(text, lang) {
        try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data && data[0] && data[0][0] && data[0][0][0]) {
                return data[0][0][0];
            }
            return null;
        } catch (e) {
            console.warn('Google transliteration failed:', e);
            return null;
        }
    }

    // MyMemory as fallback
    async function transliterateMyMemory(text, lang) {
        try {
            const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${lang}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.responseStatus === 200 && data.responseData.translatedText) {
                return data.responseData.translatedText;
            }
            return null;
        } catch (e) {
            console.warn('MyMemory transliteration failed:', e);
            return null;
        }
    }

    // Sentence-based transliteration (wraps the name in a sentence to force script conversion)
    async function transliterateSentence(text, lang) {
        try {
            const sentence = `My name is ${text}`;
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${lang}&dt=t&q=${encodeURIComponent(sentence)}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data && data[0] && data[0][0] && data[0][0][0]) {
                const fullTranslation = data[0][0][0];
                // Extract the name portion from the translated sentence
                // The name is usually the last word or kept intact
                const words = fullTranslation.split(/\s+/);
                // Return the last word(s) which should be the transliterated name
                // Heuristic: take words after common "is/am" equivalent
                return words[words.length - 1];
            }
            return null;
        } catch (e) {
            console.warn('Sentence transliteration failed:', e);
            return null;
        }
    }

    // Download Logic
    downloadBtn.addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = 'text-image.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    });

    // Initial Draw
    // Wait for fonts to load if possible, or just draw
    document.fonts.ready.then(() => {
        draw();
    });

    // Fallback initial draw
    setTimeout(draw, 100);
});
