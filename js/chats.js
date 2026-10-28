/* Чаты: у каждого проекта свой чат с чистой историей (беседа из projects.conversation_id).
   Общий чат без проекта отдельный: в него не попадают беседы проектов. Функции принимают клиент Supabase,
   поэтому их можно проверять без браузера (tests/chats.test.mjs). */

/** Чат конкретного проекта. Возвращает { conv, title } или { error }. */
export async function chatForProject(sb, projectId) {
  const { data: p, error } = await sb.from('projects').select('id,title,conversation_id').eq('id', projectId).maybeSingle();
  if (error) return { error };
  if (!p) return { error: { message: 'Проект не найден' } };
  const { data: c, error: e2 } = await sb.from('conversations').select('id,status').eq('id', p.conversation_id).maybeSingle();
  if (e2) return { error: e2 };
  if (!c) return { error: { message: 'Чат проекта не найден' } };
  return { conv: { id: c.id, status: c.status }, title: p.title };
}

/** Общий чат клиента (не привязан к проекту): берёт свободную беседу или создаёт новую. */
export async function generalChat(sb, clientId) {
  const [a, b] = await Promise.all([
    sb.from('conversations').select('id,status,created_at').eq('client_id', clientId).neq('status', 'closed').order('created_at', { ascending: false }),
    sb.from('projects').select('conversation_id').eq('client_id', clientId)
  ]);
  if (a.error || b.error) return { error: a.error || b.error };
  const used = new Set((b.data || []).map(p => p.conversation_id));
  const free = (a.data || []).find(c => !used.has(c.id));
  if (free) return { conv: { id: free.id, status: free.status }, title: null };
  const r = await sb.from('conversations').insert({ client_id: clientId }).select('id,status').single();
  return r.error ? { error: r.error } : { conv: r.data, title: null };
}
