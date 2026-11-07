import { workspaceAccess } from '../server/workspace-auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: 'Sign in first.' });
  const { OPENAI_API_KEY, OPENAI_MODEL } = process.env;
  if (!OPENAI_API_KEY || !OPENAI_MODEL) {
    return res.status(503).json({ error: 'AI guidance is not configured.' });
  }

  try {
    const status = await workspaceAccess(token);
    if (status !== 200) return res.status(status).json({ error: 'Workspace access required.' });
    const input = req.body;
    if (!input || !['available', 'planned', 'due', 'waiting'].every(key =>
      Number.isInteger(input[key]) && input[key] >= 0 && input[key] <= 100000)) {
      return res.status(400).json({ error: 'Invalid planning summary.' });
    }
    const { available, planned, due, waiting } = input;
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OPENAI_MODEL, store: false, max_output_tokens: 220,
        instructions: 'Give a calm, specific prioritisation suggestion in at most two sentences. Use only the supplied aggregate data. Avoid medical and financial advice. Never imply that anything has been changed.',
        input: JSON.stringify({ availableMinutes: available, plannedMinutes: planned, deadlinesDueSoon: due, waitingOnOthers: waiting }),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return res.status(502).json({ error: 'AI guidance is temporarily unavailable.' });
    const result = await response.json();
    const text = result.output?.flatMap(item => item.content || [])
      .filter(item => item.type === 'output_text').map(item => item.text).join(' ');
    if (!text) return res.status(502).json({ error: 'AI guidance did not return a suggestion.' });
    return res.status(200).json({ text });
  } catch {
    return res.status(502).json({ error: 'AI guidance is temporarily unavailable.' });
  }
}
