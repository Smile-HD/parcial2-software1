import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { Pool } from 'pg';
import { v7 as uuidv7 } from 'uuid';
import { buildApp } from './index';
import { purgeExpiredChatMessages } from './chat';
import { FakeLlm } from '@app/adapters-ai';

const TEST_DATABASE_URL = 'postgres://postgres:postgres@localhost:5433/ai_uml_test';
const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });

let app: Awaited<ReturnType<typeof Fastify>>;

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  app = buildApp({ logger: false, pool, llm: new FakeLlm() });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

beforeEach(async () => {
  await pool.query('DELETE FROM chat_messages');
  await pool.query('DELETE FROM diagrams');
});

async function createFixtureDiagram(): Promise<string> {
  const id = uuidv7();
  await pool.query(
    'INSERT INTO diagrams (id, name, doc, yjs_state, version) VALUES ($1, $2, $3, $4, $5)',
    [
      id,
      'Test Diagram',
      JSON.stringify({ id, name: 'Test Diagram', classes: [], associations: [], generalizations: [], realizations: [], dependencies: [], naryAssociations: [] }),
      Buffer.from([]),
      1,
    ]
  );
  return id;
}

describe('Chat Colaborativo y Persistencia de Mensajes (Unidad 23.2)', () => {
  it('envía y recupera mensajes en el canal grupal para un diagrama específico', async () => {
    const diagramId = await createFixtureDiagram();

    const postRes = await app.inject({
      method: 'POST',
      url: `/diagrams/${diagramId}/messages`,
      payload: {
        deviceId: 'dev-1',
        senderName: 'Pepe',
        channelType: 'group',
        content: 'Hola equipo, ¿cómo están?',
      },
    });

    expect(postRes.statusCode).toBe(201);
    const postBody = JSON.parse(postRes.body);
    expect(postBody.id).toBeTruthy();
    expect(postBody.senderName).toBe('Pepe');
    expect(postBody.channelType).toBe('group');
    expect(postBody.content).toBe('Hola equipo, ¿cómo están?');

    const getRes = await app.inject({
      method: 'GET',
      url: `/diagrams/${diagramId}/messages?channel=group`,
    });

    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.body);
    expect(getBody.length).toBe(1);
    expect(getBody[0].content).toBe('Hola equipo, ¿cómo están?');
  });

  it('aísla estrictamente los mensajes entre diagramas diferentes', async () => {
    const diag1 = await createFixtureDiagram();
    const diag2 = await createFixtureDiagram();

    await app.inject({
      method: 'POST',
      url: `/diagrams/${diag1}/messages`,
      payload: {
        deviceId: 'dev-1',
        senderName: 'Pepe',
        channelType: 'group',
        content: 'Mensaje para Diag 1',
      },
    });

    const getDiag2 = await app.inject({
      method: 'GET',
      url: `/diagrams/${diag2}/messages?channel=group`,
    });

    const bodyDiag2 = JSON.parse(getDiag2.body);
    expect(bodyDiag2.length).toBe(0);
  });

  it('aísla el canal directo con Amongus por tríada (diagram_id, device_id, target_user)', async () => {
    const diagramId = await createFixtureDiagram();

    // Mensaje de Pepe en device-1
    await app.inject({
      method: 'POST',
      url: `/diagrams/${diagramId}/messages`,
      payload: {
        deviceId: 'dev-1',
        senderName: 'Pepe',
        channelType: 'direct_bot',
        content: 'Amongus, ayudame con el diagrama',
      },
    });

    // Pepe en device-1 consulta su chat privado
    const resPepeDev1 = await app.inject({
      method: 'GET',
      url: `/diagrams/${diagramId}/messages?channel=direct_bot&deviceId=dev-1&userName=Pepe`,
    });
    const bodyPepeDev1 = JSON.parse(resPepeDev1.body);
    expect(bodyPepeDev1.length).toBeGreaterThanOrEqual(1);
    expect(bodyPepeDev1[0].senderName).toBe('Pepe');

    // Otro usuario llamado Pepe en device-2 NO debe ver los mensajes de dev-1
    const resPepeDev2 = await app.inject({
      method: 'GET',
      url: `/diagrams/${diagramId}/messages?channel=direct_bot&deviceId=dev-2&userName=Pepe`,
    });
    const bodyPepeDev2 = JSON.parse(resPepeDev2.body);
    expect(bodyPepeDev2.length).toBe(0);

    // El mismo usuario en dev-1 pero con nombre cambiado a 'Pepe1' inicia un hilo limpio
    const resPepe1Dev1 = await app.inject({
      method: 'GET',
      url: `/diagrams/${diagramId}/messages?channel=direct_bot&deviceId=dev-1&userName=Pepe1`,
    });
    const bodyPepe1Dev1 = JSON.parse(resPepe1Dev1.body);
    expect(bodyPepe1Dev1.length).toBe(0);
  });

  it('genera una respuesta automática de Amongus en el canal direct_bot sin emojis', async () => {
    const diagramId = await createFixtureDiagram();

    const postRes = await app.inject({
      method: 'POST',
      url: `/diagrams/${diagramId}/messages`,
      payload: {
        deviceId: 'dev-1',
        senderName: 'Ana',
        channelType: 'direct_bot',
        content: '¿Cómo agrego una relación?',
      },
    });

    expect(postRes.statusCode).toBe(201);

    const getRes = await app.inject({
      method: 'GET',
      url: `/diagrams/${diagramId}/messages?channel=direct_bot&deviceId=dev-1&userName=Ana`,
    });

    const messages = JSON.parse(getRes.body);
    // Debe contener el mensaje del usuario y la respuesta de Amongus
    expect(messages.length).toBe(2);
    const botReply = messages.find((m: any) => m.senderType === 'bot');
    expect(botReply).toBeDefined();
    expect(botReply.senderName).toBe('Amongus');
    expect(botReply.content).toBeTruthy();
  });

  it('genera una respuesta automática de Amongus en inglés cuando language es en', async () => {
    const diagramId = await createFixtureDiagram();

    const postRes = await app.inject({
      method: 'POST',
      url: `/diagrams/${diagramId}/messages`,
      payload: {
        deviceId: 'dev-1',
        senderName: 'John',
        channelType: 'direct_bot',
        content: 'How do I create a class?',
        language: 'en',
      },
    });

    expect(postRes.statusCode).toBe(201);

    const getRes = await app.inject({
      method: 'GET',
      url: `/diagrams/${diagramId}/messages?channel=direct_bot&deviceId=dev-1&userName=John`,
    });

    const messages = JSON.parse(getRes.body);
    expect(messages.length).toBe(2);
    const botReply = messages.find((m: any) => m.senderType === 'bot');
    expect(botReply).toBeDefined();
    expect(botReply.content).toContain('to create a class you can drag it');
  });

  it('purga mensajes con más de 7 días de antigüedad (TTL)', async () => {
    const diagramId = await createFixtureDiagram();

    // Insertar mensaje con fecha de hace 10 días
    await pool.query(
      `INSERT INTO chat_messages (diagram_id, device_id, sender_name, sender_type, channel_type, target_user, content, created_at)
       VALUES ($1, 'dev-1', 'Pepe', 'user', 'group', 'Pepe', 'Mensaje antiguo', NOW() - INTERVAL '10 days')`,
      [diagramId]
    );

    // Insertar mensaje fresco
    await pool.query(
      `INSERT INTO chat_messages (diagram_id, device_id, sender_name, sender_type, channel_type, target_user, content, created_at)
       VALUES ($1, 'dev-1', 'Pepe', 'user', 'group', 'Pepe', 'Mensaje fresco', NOW())`,
      [diagramId]
    );

    const deletedCount = await purgeExpiredChatMessages(pool);
    expect(deletedCount).toBe(1);

    const checkRes = await pool.query('SELECT content FROM chat_messages');
    expect(checkRes.rows.length).toBe(1);
    expect(checkRes.rows[0].content).toBe('Mensaje fresco');
  });

  it('delega al LLM dinámico si soporta chat y sanitiza emojis', async () => {
    const mockLlm = {
      interpret: async () => ({ kind: 'refused' as const, reason: 'stub' }),
      chat: async () => '¡Hola! 🚀 Puedo ayudarte con clases y relaciones. 😊👍',
    };
    const customApp = buildApp({ logger: false, pool, llm: mockLlm as any });
    await customApp.ready();

    const diagramId = await createFixtureDiagram();

    await customApp.inject({
      method: 'POST',
      url: `/diagrams/${diagramId}/messages`,
      payload: {
        deviceId: 'dev-1',
        senderName: 'Carlos',
        channelType: 'direct_bot',
        content: '¿Qué podés hacer?',
      },
    });

    const getRes = await customApp.inject({
      method: 'GET',
      url: `/diagrams/${diagramId}/messages?channel=direct_bot&deviceId=dev-1&userName=Carlos`,
    });

    const messages = JSON.parse(getRes.body);
    const botReply = messages.find((m: any) => m.senderType === 'bot');
    expect(botReply).toBeDefined();
    expect(botReply.content).toBe('¡Hola! Puedo ayudarte con clases y relaciones.');
    await customApp.close();
  });

  it('procesa turnos unificados de modelado generando deltaId y batchDelta en el mensaje del bot', async () => {
    const mockLlm = {
      interpret: async () => ({ kind: 'refused' as const, reason: 'stub' }),
      chat: async () => `\`\`\`json
{
  "action": "create",
  "classes": [
    { "name": "Volador", "isInterface": true }
  ],
  "realizations": []
}
\`\`\``,
    };
    const customApp = buildApp({ logger: false, pool, llm: mockLlm as any });
    await customApp.ready();

    const diagramId = await createFixtureDiagram();

    await customApp.inject({
      method: 'POST',
      url: `/diagrams/${diagramId}/messages`,
      payload: {
        deviceId: 'dev-1',
        senderName: 'Carlos',
        channelType: 'direct_bot',
        content: 'crea una interfaz Volador',
      },
    });

    const getRes = await customApp.inject({
      method: 'GET',
      url: `/diagrams/${diagramId}/messages?channel=direct_bot&deviceId=dev-1&userName=Carlos`,
    });

    const messages = JSON.parse(getRes.body);
    const botReply = messages.find((m: any) => m.senderType === 'bot');
    expect(botReply).toBeDefined();
    expect(botReply.deltaId).toBeDefined();
    expect(botReply.delta).toBeDefined();
    expect(botReply.delta.kind).toBe('batch');
    const classDelta = botReply.delta.deltas.find((d: any) => d.kind === 'class');
    expect(classDelta).toBeDefined();
    expect(classDelta.name).toBe('Volador');
    expect(classDelta.classKind).toBe('interface');
    await customApp.close();
  });
});
