import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { deviceId } = req.body;
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
                    || req.socket.remoteAddress;

  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId manquant' });
  }

  try {
    // 1. Vérifier si ce device a déjà consommé son essai gratuit (à vie)
    const deviceKey = `trial:device:${deviceId}`;
    const deviceAlreadyUsed = await redis.get(deviceKey);

    if (deviceAlreadyUsed) {
      return res.status(200).json({
        eligible: false,
        reason: 'device_already_used'
      });
    }

    // 2. Vérifier le quota IP (max 1 nouvel essai / 7 jours)
    const ipKey = `trial:ip:${clientIp}`;
    const ipRecentTrial = await redis.get(ipKey);

    if (ipRecentTrial) {
      return res.status(200).json({
        eligible: false,
        reason: 'ip_quota_exceeded'
      });
    }

    // 3. Éligible : on marque device (permanent) + IP (TTL 7 jours)
    await redis.set(deviceKey, true); // pas de TTL = permanent
    await redis.set(ipKey, true, { ex: 7 * 24 * 60 * 60 }); // 7 jours en secondes

    return res.status(200).json({
      eligible: true
    });

  } catch (error) {
    console.error('Erreur verify-integrity:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
