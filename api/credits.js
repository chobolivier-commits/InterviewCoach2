import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    try {
      const credits = await redis.get(`credits:${userId}`);
      return res.status(200).json({ credits: credits ?? 0 });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    const { userId, action, amount } = req.body;

    if (!userId || !action || !amount) {
      return res.status(400).json({ error: 'userId, action and amount are required' });
    }

    if (action !== 'add' && action !== 'consume') {
      return res.status(400).json({ error: 'action must be "add" or "consume"' });
    }

    try {
      const current = (await redis.get(`credits:${userId}`)) ?? 0;

      if (action === 'consume') {
        if (current < amount) {
          return res.status(403).json({ error: 'Insufficient credits', credits: current });
        }
        const newBalance = current - amount;
        await redis.set(`credits:${userId}`, newBalance);
        return res.status(200).json({ credits: newBalance });
      }

      if (action === 'add') {
        const newBalance = current + amount;
        await redis.set(`credits:${userId}`, newBalance);
        return res.status(200).json({ credits: newBalance });
      }
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}