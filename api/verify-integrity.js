import { Redis } from '@upstash/redis';
import { google } from 'googleapis';

const redis = Redis.fromEnv();

async function verifyIntegrityToken(token) {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/playintegrity'],
  });
  const authClient = await auth.getClient();
  const playintegrity = google.playintegrity({ version: 'v1', auth: authClient });

  const packageName = 'com.choberto.interviewcoach';
  const result = await playintegrity.v1.decodeIntegrityToken({
    packageName,
    requestBody: { integrityToken: token },
  });

  return result.data.tokenPayloadExternal;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { deviceId, integrityToken } = req.body;
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket.remoteAddress;

  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId manquant' });
  }
  if (!integrityToken) {
    return res.status(400).json({ error: 'integrityToken manquant' });
  }

  try {
    // 0. Vérifier le token Play Integrity auprès de Google
    let payload;
    try {
      payload = await verifyIntegrityToken(integrityToken);
    } catch (err) {
      console.error('Erreur décodage token Play Integrity:', err);
      return res.status(200).json({
        eligible: false,
        reason: 'invalid_integrity_token',
      });
    }

    const appIntegrity = payload?.appIntegrity?.appRecognitionVerdict;
    const deviceIntegrity = payload?.deviceIntegrity?.deviceRecognitionVerdict || [];
    const appLicensing = payload?.accountDetails?.appLicensingVerdict;

    const isAppValid = appIntegrity === 'PLAY_RECOGNIZED';
    const isDeviceValid = deviceIntegrity.includes('MEETS_DEVICE_INTEGRITY');

    if (!isAppValid || !isDeviceValid) {
      return res.status(200).json({
        eligible: false,
        reason: 'failed_integrity_check',
        details: { appIntegrity, deviceIntegrity, appLicensing },
      });
    }

    // 1. Vérifier si ce device a déjà consommé son essai gratuit (à vie)
    const deviceKey = `trial:device:${deviceId}`;
    const deviceAlreadyUsed = await redis.get(deviceKey);

    if (deviceAlreadyUsed) {
      return res.status(200).json({
        eligible: false,
        reason: 'device_already_used',
      });
    }

    // 2. Éligible ; on marque le device (permanent)
    await redis.set(deviceKey, true); // pas de TTL = permanent

    return res.status(200).json({
      eligible: true,
    });
  } catch (error) {
    console.error('Erreur verify-integrity:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
