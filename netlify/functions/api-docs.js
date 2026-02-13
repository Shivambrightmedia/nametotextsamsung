exports.handler = async () => {
    return {
        statusCode: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
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
                        bg: '(optional) Background color hex without # (default: 000000)',
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
        })
    };
};
