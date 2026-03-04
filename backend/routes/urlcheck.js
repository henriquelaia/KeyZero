const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');

const SAFE_BROWSING_URL = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';

/**
 * POST /api/check-url
 * Body: { url: string }
 * Verifica se um URL é phishing/malware usando Google Safe Browsing API.
 */
router.post('/', auth, async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL inválido.' });
  }

  const apiKey = process.env.GOOGLE_SAFE_BROWSING_KEY;
  if (!apiKey) {
    // Se a chave não estiver configurada, retornar safe=true (não bloquear funcionalidade)
    return res.json({ safe: true, threats: [], configured: false });
  }

  try {
    const payload = {
      client:    { clientId: 'keyzero', clientVersion: '1.0.0' },
      threatInfo: {
        threatTypes:      ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
        platformTypes:    ['ANY_PLATFORM'],
        threatEntryTypes: ['URL'],
        threatEntries:    [{ url }],
      },
    };

    const response = await fetch(`${SAFE_BROWSING_URL}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error('Google Safe Browsing API error:', response.status);
      return res.json({ safe: true, threats: [], configured: true });
    }

    const data = await response.json();

    if (data.matches && data.matches.length > 0) {
      const threats = data.matches.map(m => m.threatType);
      return res.json({ safe: false, threats, configured: true });
    }

    return res.json({ safe: true, threats: [], configured: true });
  } catch (err) {
    console.error('Erro ao verificar URL:', err.message);
    // Em caso de erro de rede, não bloquear o utilizador
    return res.json({ safe: true, threats: [], configured: true });
  }
});

module.exports = router;
