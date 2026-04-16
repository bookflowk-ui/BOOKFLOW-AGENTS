import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import twilio from 'twilio';

const redis = new Redis({
  url: process.env.https://immune-python-78951.upstash.io!,
  token: process.env.gQAAAAAAATRnAAIncDFjOTgzMTQ4ZTEyYTU0ZTYwYTZjZmVlYTgzZjc5MWViMnAxNzg5NTE!,
});
const twilioClient = twilio(
  process.env.ACd4c7a69841456b86343ed9932fb0d6b6,
  process.env.11983fad1429a9c414ac9af827b6dccd
);

export async function GET(req: NextRequest) {
  if (
    req.headers.get('authorization') !==
    `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const tasks: any[] = (await redis.get('tasks')) || [];
  const pipeline: any[] = (await redis.get('pipeline')) || [];
  const financials: any = (await redis.get('financials')) || {
    mrr: 0,
    subscriptions: [],
  };

  const openTasks = tasks.filter((t) => !t.done);
  const hotLeads = pipeline.filter((l) =>
    ['replied', 'demo_scheduled', 'trial'].includes(l.status)
  );
  const stale = pipeline.filter(
    (l) =>
      l.status === 'contacted' &&
      Date.now() - l.updated > 3 * 24 * 60 * 60 * 1000
  );

  let msg = `☀️ *בוקר טוב!*\n\n`;
  msg += `💰 MRR: *$${financials.mrr || 0}* | לקוחות: ${
    (financials.subscriptions || []).filter((s: any) => s.status === 'active').length
  }\n\n`;

  if (openTasks.length) {
    msg += `📋 *משימות (${openTasks.length}):*\n`;
    openTasks.forEach((t, i) => {
      msg += `${i + 1}. ${t.text}\n`;
    });
    msg += '\n';
  }

  if (hotLeads.length) {
    msg += `🔥 *לידים חמים:* ${hotLeads.map((l) => l.name).join(', ')}\n`;
  }

  if (stale.length) {
    msg += `⏰ *פולו-אפ נדרש:* ${stale.map((l) => l.name).join(', ')}\n`;
  }

  msg += `\n_/task /write /advise /pipeline /finance /kb_`;

  await twilioClient.messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER!,
    to: process.env.MY_WHATSAPP_NUMBER!,
    body: msg,
  });

  return NextResponse.json({ ok: true });
}
