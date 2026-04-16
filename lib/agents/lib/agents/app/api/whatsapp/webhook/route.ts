import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { Redis } from '@upstash/redis';
import twilio from 'twilio';
import { KNOWLEDGE_BASE } from '@/lib/agents/knowledge';

const anthropic = new Anthropic({ apiKey: process.env.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 });
const redis = new Redis({
  url: process.env.https://immune-python-78951.upstash.io!,
  token: process.env.gQAAAAAAATRnAAIncDFjOTgzMTQ4ZTEyYTU0ZTYwYTZjZmVlYTgzZjc5MWViMnAxNzg5NTE!,
});
const twilioClient = twilio(
  process.env.ACd4c7a69841456b86343ed9932fb0d6b6,
  process.env.11983fad1429a9c414ac9af827b6dccd
);

const MY_NUMBER = process.env.+972526373208;
const BOT_NUMBER = process.env.+14155238886;

function detectAgent(msg: string) {
  const m = msg.toLowerCase().trim();
  if (m.startsWith('/task') || m.startsWith('/t ')) return 'task';
  if (m.startsWith('/write') || m.startsWith('/w ')) return 'write';
  if (m.startsWith('/pipeline') || m.startsWith('/p ')) return 'pipeline';
  if (m.startsWith('/finance') || m.startsWith('/f ')) return 'finance';
  if (m.startsWith('/kb')) return 'kb';
  return 'advise';
}

function stripPrefix(msg: string) {
  return msg.replace(/^\/(task|write|pipeline|finance|kb|t|w|p|f)\s*/i, '').trim();
}

const AGENTS: Record<string, string> = {
  task: `אתה סוכן משימות של מייסד BookFlow AI. דבר עברית בלבד. קצר וישיר.
כשמוסיפים משימה → [ACTION:{"type":"add_task","text":"..."}]
כשמסמנים בוצע → [ACTION:{"type":"done","index":N}]
כשמוחקים → [ACTION:{"type":"delete","index":N}]
כשמנקים → [ACTION:{"type":"clear"}]
תאשר בקצרה. הצג רשימה עם מספרים.`,

  write: `אתה סוכן שיווקי של מייסד BookFlow AI. דבר עברית, כתוב תוכן באנגלית מושלמת.
${KNOWLEDGE_BASE}
כתוב תמיד 2 גרסאות — ישירה ורכה. הסבר ההבדל בעברית.
סוגים: LinkedIn DM, LinkedIn Post, Follow-up DM, Objection response, Facebook post, Video script.
בסוף כל תוכן שאל: "רוצה לשנות משהו?"`,

  pipeline: `אתה מנהל pipeline של מייסד BookFlow AI. דבר עברית בלבד.
כשמוסיפים ליד → [ACTION:{"type":"add_lead","name":"...","status":"contacted","notes":"..."}]
כשמעדכנים → [ACTION:{"type":"update_lead","name":"...","status":"..."}]
כשמוחקים → [ACTION:{"type":"delete_lead","name":"..."}]
סטטוסים: contacted | replied | demo_scheduled | trial | paying | lost
תמיד אמור כמה לידים פעילים יש.`,

  finance: `אתה CFO אישי של מייסד BookFlow AI. דבר עברית בלבד.
${KNOWLEDGE_BASE}
כשמוסיפים הוצאה → [ACTION:{"type":"add_expense","category":"...","amount":X,"description":"..."}]
קטגוריות: infrastructure | marketing | tools | telephony | ai_costs | other
תן מספרים ברורים. לא יועמשי.`,

  advise: `אתה יועץ עסקי אישי של מייסד BookFlow AI. דבר עברית בלבד.
${KNOWLEDGE_BASE}
תן תשובות קצרות עם מספרים קונקרטיים.
אם שואלים "מה אני עושה היום" — תן 3 פעולות ספציפיות.
דבר כמו שותף עסקי, לא כמו עוזר.`,

  kb: `אתה מנהל ה-Knowledge Base של BookFlow AI. דבר עברית בלבד.
${KNOWLEDGE_BASE}
כשמעדכנים → [ACTION:{"type":"update_kb","section":"...","content":"..."}]
הצג חלקים לפי בקשה.`,
};

async function processActions(response: string, state: any) {
  const matches = [...response.matchAll(/\[ACTION:(.*?)\]/gs)];
  for (const match of matches) {
    try {
      const action = JSON.parse(match[1].trim());
      const { tasks, pipeline, financials } = state;

      switch (action.type) {
        case 'add_task':
          tasks.push({ text: action.text, done: false, created: Date.now() });
          await redis.set('tasks', tasks);
          break;
        case 'done':
          if (tasks[action.index]) {
            tasks[action.index].done = true;
            await redis.set('tasks', tasks);
          }
          break;
        case 'delete':
          tasks.splice(action.index, 1);
          await redis.set('tasks', tasks);
          break;
        case 'clear':
          await redis.set('tasks', []);
          break;
        case 'add_lead':
          pipeline.push({
            name: action.name,
            status: action.status || 'contacted',
            notes: action.notes || '',
            updated: Date.now(),
          });
          await redis.set('pipeline', pipeline);
          break;
        case 'update_lead': {
          const l = pipeline.find((x: any) =>
            x.name.toLowerCase().includes(action.name.toLowerCase())
          );
          if (l) {
            l.status = action.status;
            l.updated = Date.now();
            if (action.notes) l.notes = action.notes;
            await redis.set('pipeline', pipeline);
          }
          break;
        }
        case 'delete_lead': {
          const i = pipeline.findIndex((x: any) =>
            x.name.toLowerCase().includes(action.name.toLowerCase())
          );
          if (i > -1) {
            pipeline.splice(i, 1);
            await redis.set('pipeline', pipeline);
          }
          break;
        }
        case 'add_expense':
          if (!financials.expenses) financials.expenses = [];
          financials.expenses.push({
            category: action.category,
            amount: action.amount,
            description: action.description || '',
            date: new Date().toISOString(),
          });
          await redis.set('financials', financials);
          break;
      }
    } catch (e) {
      console.error('Action error:', e);
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const from = formData.get('From') as string;
    const body = formData.get('Body') as string;

    if (from !== MY_NUMBER) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    if (!body?.trim()) return new NextResponse('OK', { status: 200 });

    const agentType = detectAgent(body);
    const message = stripPrefix(body);

    const tasks: any[] = (await redis.get('tasks')) || [];
    const pipeline: any[] = (await redis.get('pipeline')) || [];
    const financials: any = (await redis.get('financials')) || {
      subscriptions: [],
      expenses: [],
      mrr: 0,
    };
    const history: any[] = (await redis.get('chat_history')) || [];
    const state = { tasks, pipeline, financials };

    const contexts: Record<string, string> = {
      task: `\nמשימות נוכחיות:\n${
        tasks.map((t: any, i: number) => `${i + 1}. ${t.done ? '✅' : '⬜'} ${t.text}`).join('\n') || 'אין משימות'
      }`,
      pipeline: `\nPipeline נוכחי:\n${
        pipeline.map((l: any) => `• ${l.name} — ${l.status}${l.notes ? ` (${l.notes})` : ''}`).join('\n') || 'ריק'
      }`,
      finance: `\nנתונים פיננסיים:\nMRR: $${financials.mrr || 0}\nלקוחות פעילים: ${
        (financials.subscriptions || []).filter((s: any) => s.status === 'active').length
      }`,
      write: '',
      advise: '',
      kb: '',
    };

    const recentHistory = history.slice(-6);

    const response = await anthropic.messages.create({
      model: ['task', 'pipeline'].includes(agentType)
        ? 'claude-haiku-4-5-20251001'
        : 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: AGENTS[agentType],
      messages: [
        ...recentHistory,
        { role: 'user', content: message + (contexts[agentType] || '') },
      ],
    });

    let reply = response.content[0].text;
    await processActions(reply, state);
    reply = reply.replace(/\[ACTION:.*?\]/gs, '').trim();

    const newHistory = [
      ...recentHistory,
      { role: 'user', content: message },
      { role: 'assistant', content: reply },
    ].slice(-10);
    await redis.set('chat_history', newHistory);

    const emoji: Record<string, string> = {
      task: '📋',
      write: '✍️',
      advise: '💡',
      pipeline: '🎯',
      finance: '💰',
      kb: '🧠',
    };

    const finalReply = `${emoji[agentType]} ${reply}`;

    if (finalReply.length <= 1500) {
      await twilioClient.messages.create({
        from: BOT_NUMBER!,
        to: MY_NUMBER!,
        body: finalReply,
      });
    } else {
      const split = finalReply.lastIndexOf('\n', 1400);
      await twilioClient.messages.create({
        from: BOT_NUMBER!,
        to: MY_NUMBER!,
        body: finalReply.slice(0, split),
      });
      await new Promise((r) => setTimeout(r, 500));
      await twilioClient.messages.create({
        from: BOT_NUMBER!,
        to: MY_NUMBER!,
        body: finalReply.slice(split).trim(),
      });
    }

    return new NextResponse('<Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new NextResponse('Error', { status: 500 });
  }
}
