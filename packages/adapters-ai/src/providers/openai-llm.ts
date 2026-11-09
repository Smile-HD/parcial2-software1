import {
  type Diagram,
  type LlmPort,
  type LlmResult,
  DeltaSchema,
} from '@app/core';
import { repairModelIdentifiers } from '../nlp/repair.js';

export interface OpenAiLlmConfig {
  apiKey: string;
  /** Por defecto: https://api.openai.com/v1 — sobreescribir para gateways compatibles. */
  baseUrl?: string | undefined;
  /** Por defecto: gpt-4o-mini (el nivel económico es suficiente para interpretar deltas). */
  model?: string | undefined;
}

/**
 * Adaptador compatible con OpenAI (tarea 7.3). Utiliza salida estructurada en objeto JSON
 * e instruye al modelo con el JSON Schema de deltas; el INVOCADOR aún así valida con
 * Zod cada delta retornado (interpreter:R1), evitando que una respuesta malformada
 * del modelo alcance el metamodelo canónico.
 */
export class OpenAiLlm implements LlmPort {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: OpenAiLlmConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
    this.model = config.model ?? 'gpt-4o-mini';
  }

  static fromEnv(): OpenAiLlm | null {
    const apiKey = process.env.OPENAI_API_KEY || (process.env.OPENAI_BASE_URL ? 'ollama' : undefined);
    if (!apiKey) return null;
    return new OpenAiLlm({
      apiKey,
      baseUrl: process.env.OPENAI_BASE_URL,
      model: process.env.LLM_MODEL,
    });
  }

  async chat(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: {
      timeoutMs?: number;
      temperature?: number;
      maxTokens?: number;
      onChunk?: (chunk: string) => void;
      stop?: string[];
      repeatPenalty?: number;
      repeatLastN?: number;
      signal?: AbortSignal;
    }
  ): Promise<string> {
    const isStream = typeof options?.onChunk === 'function';
    const controller = new AbortController();
    if (options?.signal) {
      if (options.signal.aborted) {
        controller.abort(options.signal.reason);
      } else {
        options.signal.addEventListener('abort', () => controller.abort(options.signal?.reason), { once: true });
      }
    }
    const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 15000);
    try {
      const requestBody: Record<string, any> = {
        model: this.model,
        messages,
        temperature: options?.temperature ?? 0.2,
        max_tokens: options?.maxTokens ?? 2048,
        frequency_penalty: (options as any)?.frequencyPenalty ?? 0.4,
        presence_penalty: (options as any)?.presencePenalty ?? 0.2,
        stream: isStream,
      };
      if (options?.stop && options.stop.length > 0) {
        requestBody.stop = options.stop;
      }
      if (options?.repeatPenalty !== undefined || options?.repeatLastN !== undefined) {
        requestBody.options = {
          repeat_penalty: options?.repeatPenalty ?? 1.15,
          repeat_last_n: options?.repeatLastN ?? 128,
        };
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`LLM chat failed with status ${response.status}`);
      }

      if (isStream) {
        if (!response.body) {
          throw new Error('LLM streaming response had no body');
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullContent = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const chunk = JSON.parse(dataStr);
              const delta = chunk.choices?.[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
                options!.onChunk!(delta);
              }
            } catch {
              // Ignorar líneas parciales
            }
          }
        }
        return fullContent;
      }

      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error('LLM chat response had no message content');
      }
      return content;
    } finally {
      clearTimeout(timeout);
    }
  }

  async checkHealth(timeoutMs = 2500): Promise<{ ok: boolean; message?: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = this.baseUrl.endsWith('/v1') ? `${this.baseUrl}/models` : `${this.baseUrl}/models`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
      });
      return { ok: res.ok, message: res.ok ? undefined : `HTTP ${res.status}` };
    } catch (err: any) {
      return { ok: false, message: err?.message || 'Connection failed' };
    } finally {
      clearTimeout(timeout);
    }
  }

  async interpret(utterance: string, _deltaJsonSchema: object, currentIr: Diagram): Promise<LlmResult> {
    const system = [
      'You translate UML class-diagram EDIT commands into structured deltas.',
      'You are an interpreter of user intent, NOT a design generator: refuse any request to invent a complete design, explaining that you edit an existing model on explicit instruction.',
      'Respond ONLY with a JSON object: {"action":"apply","delta":<delta>} or {"action":"refuse","reason":"..."}',
      '',
      'BASE FIELDS (required on EVERY delta and on EVERY inner batch item): "id":"<new uuid>","diagramId":"<currentIr.id>","timestamp":"<RFC3339 UTC like 2026-08-31T12:00:00.000Z>"',
      '',
      'Shapes (use EXACTLY these field names; pick by command):',
       'CLASS CREATE: {"kind":"class","op":"create", ...base, "classId":"<new uuid or placeholder>","name":"<ClassName>","position":{"x":120,"y":80} [, "classKind":"class"|"interface"]}',
       'CLASS RENAME: {"kind":"class","op":"rename", ...base, "classId":"<existing class uuid>","newName":"<NewName>"}',
       'CLASS REPOSITION: {"kind":"class","op":"reposition", ...base, "classId":"<existing class uuid>","newPosition":{"x":<number>,"y":<number>}}',
       'CLASS DELETE: {"kind":"class","op":"delete", ...base, "classId":"<existing class uuid>"}',
       'CLASS UPDATE: {"kind":"class","op":"update", ...base, "classId":"<existing class uuid>" [, "classKind":"class"|"interface"] [, "isAbstract":true|false]} — at least one of classKind/isAbstract required',
      'ADD ATTRIBUTE: {"kind":"member","op":"addAttribute", ...base, "classId":"<existing class uuid or placeholder>","memberId":"<new uuid>","name":"<attrName>","type":"<attrType>" [, "visibility":"+"|"-"|"#"|"~"] [, "isStatic":true] [, "isDerived":true] [, "multiplicity":"0..*"]}',
      'EDIT ATTRIBUTE: {"kind":"member","op":"editAttribute", ...base, "classId":"<existing class uuid>","memberId":"<existing attribute uuid>","name":"<newName>","type":"<newType>" [, visibility/isStatic/isDerived/multiplicity]}',
      'DELETE ATTRIBUTE: {"kind":"member","op":"deleteAttribute", ...base, "classId":"<existing class uuid>","memberId":"<existing attribute uuid>"}',
      'ADD METHOD: {"kind":"member","op":"addMethod", ...base, "classId":"<existing class uuid or placeholder>","memberId":"<new uuid>","name":"<methodName>","returnType":"<type>","parameters":[] [, "visibility":"+"|"-"|"#"|"~"] [, "isStatic":true]}',
      'EDIT METHOD: {"kind":"member","op":"editMethod", ...base, "classId":"<existing class uuid>","memberId":"<existing method uuid>","name":"<newName>","returnType":"<newReturnType>","parameters":[] [, visibility/isStatic]}',
      'DELETE METHOD: {"kind":"member","op":"deleteMethod", ...base, "classId":"<existing class uuid>","memberId":"<existing method uuid>"}',
'ASSOCIATION CREATE: {"kind":"association","op":"create", ...base, "associationId":"<new uuid>","sourceClassId":"<existing or placeholder>","targetClassId":"<existing or placeholder>","sourceMultiplicity":"1","targetMultiplicity":"1","directed":false [, "aggregation":"none"|"shared"|"composite"] [, "aggregationEnd":"source"|"target"] [, "name":"<assocName>"] [, "sourceRole":"<role>"] [, "targetRole":"<role>"] [, "associationClassId":"<existing class uuid or placeholder>"]}',
       'ASSOCIATION UPDATE MULTIPLICITY: {"kind":"association","op":"updateMultiplicity", ...base, "associationId":"<existing association uuid>","newSourceMultiplicity":"1"|"0..1"|"1..*"|"0..*","newTargetMultiplicity":"1"|"0..1"|"1..*"|"0..*" [, "aggregation":"none"|"shared"|"composite"] [, "aggregationEnd":"source"|"target"] [, "name":"<assocName>"] [, "sourceRole":"<role>"] [, "targetRole":"<role>"] [, "newAssociationClassId":"<existing class uuid or placeholder>"]}',
       'ASSOCIATION DELETE: {"kind":"association","op":"delete", ...base, "associationId":"<existing association uuid>"}',
        'GENERALIZATION CREATE: {"kind":"generalization","op":"create", ...base, "generalizationId":"<new uuid>","subClassId":"<existing class uuid — the SUBCLASS>","superClassId":"<existing class uuid — the SUPERCLASS>"}',
        'GENERALIZATION DELETE: {"kind":"generalization","op":"delete", ...base, "generalizationId":"<existing generalization uuid from the IR>"}',
         'REALIZATION CREATE: {"kind":"realization","op":"create", ...base, "realizationId":"<new uuid>","clientClassId":"<existing class uuid — the REALIZING class>","supplierInterfaceId":"<existing INTERFACE uuid — kind must be interface>"}',
         'REALIZATION DELETE: {"kind":"realization","op":"delete", ...base, "realizationId":"<existing realization uuid from the IR>"}',
          'DEPENDENCY CREATE: {"kind":"dependency","op":"create", ...base, "dependencyId":"<new uuid>","clientClassId":"<existing class uuid — the DEPENDENT client>","supplierClassId":"<existing class uuid — the SUPPLIER (any class or interface)>"}',
          'DEPENDENCY DELETE: {"kind":"dependency","op":"delete", ...base, "dependencyId":"<existing dependency uuid from the IR>"}',
          'NARY ASSOCIATION CREATE: {"kind":"naryAssociation","op":"create", ...base, "naryAssociationId":"<new uuid>","memberEnds":[{"classId":"<existing class uuid>","multiplicity":"1" [, "role":"<endRole>"]}, ...AT LEAST THREE ENDS...] [, "name":"<assocName>"]}',
          'NARY ASSOCIATION DELETE: {"kind":"naryAssociation","op":"delete", ...base, "naryAssociationId":"<existing n-ary association uuid from the IR>"}',
        '',
        'GENERALIZATION GUIDANCE:',
        '- "X is a kind of Y", "X inherits from Y", "X is a subclass of Y" → X is the subClass, Y is the superClass.',
        '- The engine rejects cycles (A→B→A transitively), duplicate edges, and references to missing classes. Never emit a generalization that inverts an existing one.',
        '- "remove inheritance" / "X does not inherit from Y" → generalization delete using the EXACT generalizationId from currentIr.generalizations.',
        '',
        'INTERFACE / ABSTRACT / REALIZATION GUIDANCE (unit 12a):',
        '- "create interface X" → class create with "classKind":"interface". Interfaces are classifiers with kind === "interface" in the IR.',
        '- "make X abstract" / "mark X abstract" → class update with "isAbstract":true.',
        '- "X realizes Y" / "X implements Y" → realization create: X is clientClassId, Y is supplierInterfaceId.',
        '- The engine REJECTS a realization whose supplier is not kind === "interface" (abstract classes are not interfaces). Check currentIr.classes[].kind before emitting a realization.',
        '- Duplicate realizations (same client + supplier) are rejected.',
        '',
        'DEPENDENCY GUIDANCE (unit 12b):',
        '- "X depends on Y" / "X uses Y" → dependency create: X is clientClassId, Y is supplierClassId.',
        '- The supplier may be ANY class or interface (unlike realization, there is NO interface-target requirement). Dependencies carry NO multiplicity.',
        '- "remove dependency between X and Y" / "X does not depend on Y" → dependency delete using the EXACT dependencyId from currentIr.dependencies.',
        '- Duplicate dependencies (same client + supplier) are rejected.',
        '',
      'N-ARY ASSOCIATION GUIDANCE (unit 13):',
      '- "ternary association between A, B and C" / "n-ary association between A, B, C and D" → naryAssociation create with one memberEnd per class (in the order named), each carrying its own multiplicity (default "1") and optional role.',
      '- An n-ary association connects THREE OR MORE classes through a central diamond. A create with fewer than three member ends is REJECTED by the engine.',
      '- Every memberEnds[].classId must reference an EXISTING class uuid; duplicate classes within one association are rejected.',
      '- "remove n-ary association" / "delete ternary association" → naryAssociation delete using the EXACT naryAssociationId from currentIr.naryAssociations.',
      '- N-ary associations live in their OWN collection; they never touch the binary associations array.',
      '',
      'BATCH (multi-command) GUIDANCE (interpreter-llm-resilience R4):',
      '- When the user asks for SEVERAL operations in one utterance ("create classes Supplier, Part, Project" / "create class A and add attribute x: int to it"), wrap them in a SINGLE "kind":"batch" envelope — the editor applies them atomically. The interpreter NEVER splits a batch on the client side.',
      '- Shape: {"kind":"batch", ...base, "deltas":[<delta1>, <delta2>, ...]} where every sub-delta carries the full BASE FIELDS (id, diagramId, timestamp) plus its own kind-specific payload. ALL sub-deltas must validate against their respective DeltaSchema members; the engine rejects the whole batch if any sub-delta is invalid.',
      '- For a single n-ary association (or any single operation) emit the matching kind directly — do NOT wrap a single delta in a "kind":"batch" envelope. Batch is for COMBINING operations, not for wrapping a single one.',
      '- Cross-references INSIDE a batch (a class-create in slot 0 referenced by an attribute in slot 1 and an association in slot 2) MUST use a PLACEHOLDER (NEW_CLASS_1, NEW_CLASS_2, ...) consistently — the system regenerates coherent UUIDs for every occurrence of the same placeholder string.',
      '- Example: "create classes Supplier, Part, Project" →',
      '   {"kind":"batch", ...base, "deltas":[',
      '     {"kind":"class","op":"create", ...base, "classId":"NEW_CLASS_1","name":"Supplier","position":{"x":0,"y":0}},',
      '     {"kind":"class","op":"create", ...base, "classId":"NEW_CLASS_2","name":"Part","position":{"x":120,"y":0}},',
      '     {"kind":"class","op":"create", ...base, "classId":"NEW_CLASS_3","name":"Project","position":{"x":240,"y":0}}',
      '   ]}',
      '- Example: "create class A and add attribute x: int to it" →',
      '   {"kind":"batch", ...base, "deltas":[',
      '     {"kind":"class","op":"create", ...base, "classId":"NEW_CLASS_1","name":"A","position":{"x":0,"y":0}},',
      '     {"kind":"member","op":"addAttribute", ...base, "classId":"NEW_CLASS_1","memberId":"NEW_ATTR_1","name":"x","type":"int"}',
      '   ]}',
      '- Example: "borra todas las clases" / "delete all classes" → emit a "kind":"batch" containing a "kind":"class","op":"delete" for EACH class in currentIr.classes. The engine automatically cascades member and association deletions.',
      '- NEVER emit "kind":"composition" or "kind":"aggregation". In UML and our schema, compositions and aggregations are ALWAYS "kind":"association" with "aggregation":"composite" (for composition) or "aggregation":"shared" (for aggregation).',
      '',
      'AGGREGATION END GUIDANCE:',
      '- The `aggregationEnd` field ("source" or "target") explicitly declares which END of the association owns the aggregation diamond (UML 2.5.1).',
      '- It is INDEPENDENT of drawing direction (source/target class order) and multiplicities.',
      '- When the user names the WHOLE/OWNER class ("Order is composed of OrderLines", "Order aggregates OrderLine", "OrderLine is part of Order", "OrderLine belongs to Order"), set `aggregationEnd` to the END THAT HOLDS THE WHOLE CLASS.',
      '- Example: "Order is composed of OrderLine" → whole=Order. If Order is sourceClassId, set aggregationEnd="source". If Order is targetClassId, set aggregationEnd="target".',
      '- Example: "OrderLine is part of Order" → whole=Order. Set aggregationEnd to the end where Order resides.',
      '- Default is "source" if omitted (backward compat).',
      '',
      'MULTIPLICITY & CARDINALITY GUIDANCE (UML 2.5.1):',
      '- "1 a 1" / "1:1" / "uno a uno" → sourceMultiplicity="1", targetMultiplicity="1".',
      '- "1 a N" / "1:N" / "uno a muchos" / "Order has many Items" → sourceMultiplicity="1", targetMultiplicity="0..*" (or "1..*" if required).',
      '- "N a 1" / "N:1" / "muchos a uno" → sourceMultiplicity="0..*", targetMultiplicity="1".',
      '- "N a M" / "N:M" / "muchos a muchos" → sourceMultiplicity="0..*", targetMultiplicity="0..*".',
      '- "0..1" / "cero o uno" / "opcional" → multiplicity="0..1".',
      '- "1..*" / "uno o más" / "al menos uno" → multiplicity="1..*".',
      '- REFLEXIVE ASSOCIATION: When an association is reflexive (e.g. "Employee supervises Employee", "conecta Empleado consigo misma"), set both sourceClassId and targetClassId to the SAME existing class uuid. Never invent or hallucinate an extra class.',
      '',
      'FLEXIBLE INTENT & TYPE DEFAULTS:',
      '- If the user names attributes without specifying types (e.g. "crea un diagrama hola con atributos pepe y año", "crea clase Usuario con atributos nombre, email", "add attribute nickname to User"), default type to "string". Do NOT refuse or fail due to omitted attribute types.',
      '- Informal phrasings like "crea un diagrama X con atributos..." or "crea clase X con atributos A, B y C" mean create class X with those attributes (using default type "string" if unspecified). Combine them in a "kind":"batch" envelope.',
      '- REFUSAL OF VAGUE / GARBAGE PROMPTS: If the request lacks any actionable UML entities, classes, attributes or operations (e.g. "creame algo", "haz algo", "poner cosas", "asdfghjkl"), reply with {"action":"refuse","reason":"No valid UML entities or operations specified."}. Never invent arbitrary unrequested classes.',
      '',
      'HARD RULES:',
      '- Every uuid you output MUST be hex-only (0-9a-f) UUID v4.',
      '- diagramId is copied EXACTLY from currentIr.id.',
      '- Valid multiplicities: *, 0, integers, m..n, m..* (UML 2.5.1).',
      '- For a class you CREATE inside this response, do NOT invent a real uuid: use a PLACEHOLDER like NEW_CLASS_1 (NEW_CLASS_2 for the second, etc.) in the create AND in every other delta that references it (attributes, methods, associations). The system assigns real ids consistently.',
      '- Classes that ALREADY exist in the current diagram must be referenced by their EXACT uuid from the IR.',
      '- Never invent fields outside the shapes. Never nest class arrays.',
      `Current diagram (IR): ${JSON.stringify(currentIr)}`,
    ].join('\n');

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: utterance },
        ],
        temperature: 0.1,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('LLM response had no message content');
    }

    let parsed: { action?: string; reason?: string; delta?: unknown };
    try {
      parsed = JSON.parse(content) as typeof parsed;
    } catch {
      throw new Error('LLM returned non-JSON content');
    }

    if (parsed.action === 'refuse') {
      return { kind: 'refused', reason: parsed.reason ?? 'Refused.' };
    }
    if (parsed.action === 'apply' && parsed.delta !== undefined) {
      const repaired = repairModelIdentifiers(parsed.delta);
      const check = DeltaSchema.safeParse(repaired);
      if (!check.success) {
        return { kind: 'delta', value: repaired };
      }
      return { kind: 'delta', value: check.data };
    }
    throw new Error('LLM returned an unexpected action');
  }
}
