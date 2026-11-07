import { workspaceAccess } from '../server/workspace-auth.js';

function planningTip({ available, planned, due, waiting }) {
  if (planned > available) {
    const difference = planned - available;
    const action = due ? 'Keep the earliest deadline and move lower-priority work.' : 'Move lower-priority work to free up that time.';
    return 'You have ' + difference + ' minutes more planned than available. ' + action;
  }
  if (due) return 'Start with the earliest deadline. Set aside time for the next due item before adding new work.';
  if (waiting) return 'Check which waiting item is blocking progress and send that follow-up before taking on more work.';
  if (!available) return 'Your calendar leaves no available time today. Keep new work in your inbox and plan it for a day with room.';
  return 'Your plan fits the time available. Pick one priority to finish before adding more work.';
}

async function aiTip(input, key, model) {
  if (!key || !model) return '';
  const { available, planned, due, waiting } = input;
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, store: false, max_output_tokens: 220,
        instructions: 'Give a calm, specific prioritisation suggestion in at most two sentences. Use only the supplied aggregate data. Avoid medical and financial advice. Never imply that anything has been changed.',
        input: JSON.stringify({ availableMinutes: available, plannedMinutes: planned, deadlinesDueSoon: due, waitingOnOthers: waiting }),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return '';
    const result = await response.json();
    return result.output?.flatMap(item => item.content || [])
      .filter(item => item.type === 'output_text').map(item => item.text).join(' ').trim() || '';
  } catch {
    return '';
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: 'Sign in first.' });
  try {
    const status = await workspaceAccess(token);
    if (status !== 200) return res.status(status).json({ error: 'Workspace access required.' });
    const input = req.body;
    if (!input || !['available', 'planned', 'due', 'waiting'].every(key =>
      Number.isInteger(input[key]) && input[key] >= 0 && input[key] <= 100000)) {
      return res.status(400).json({ error: 'Invalid planning summary.' });
    }
    const { OPENAI_API_KEY, OPENAI_MODEL } = process.env;
    const text = await aiTip(input, OPENAI_API_KEY, OPENAI_MODEL) || planningTip(input);
    return res.status(200).json({ text });
  } catch {
    return res.status(502).json({ error: 'Planning guidance is temporarily unavailable.' });
  }
}
