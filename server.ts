import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { nlSearchFilterSchema, type NLSearchFilter } from './src/schemas/validation';
import type { AllocationResult } from './src/types/models';

dotenv.config();

const GEMINI_MODEL = 'gemini-4-hydrogen';
const REQUEST_TIMEOUT_MS = 14000;

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    })
  : null;

// Simple in-memory rate limiter: 40 req/min per IP
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (bucket.count >= 40) return false;
  bucket.count += 1;
  return true;
}

async function withTimeout<T>(promise: Promise<T>, ms = REQUEST_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('GEMINI_TIMEOUT')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function buildRuleBasedExplanation(
  result: AllocationResult,
  studentNames: Record<string, string>,
  projectTitles: Record<string, string>
) {
  const eligible = result.entries.filter((e) => e.eligibility === 'ELIGIBLE');
  const ineligible = result.entries.filter((e) => e.eligibility === 'INELIGIBLE');
  const top = eligible[0];

  const summaryParts: string[] = [];
  if (top) {
    const name = studentNames[top.studentId] || top.studentId;
    const proj = projectTitles[top.projectId] || top.projectId;
    summaryParts.push(
      `Rank #1 is ${name} (${proj}) with priority score ${top.scoreBreakdown?.total ?? 0}/100, recommended for ${top.recommendedSlot ? `${top.recommendedSlot.start.slice(0, 16).replace('T', ' ')}–${top.recommendedSlot.end.slice(11, 16)}` : 'waitlist'}.`
    );
  }
  if (eligible.length > 1) {
    summaryParts.push(`${eligible.length} eligible requests were ranked deterministically using deadline urgency, necessity, fairness, feasibility, and wait time.`);
  }
  if (ineligible.length > 0) {
    summaryParts.push(`${ineligible.length} request(s) failed hard constraints and were excluded from ranking.`);
  }

  return {
    source: 'rule-based' as const,
    label: 'Rule-based explanation (Gemini unavailable)',
    summary: summaryParts.join(' ') || 'No competing requests in this group.',
    perRequest: result.entries.map((entry) => {
      const name = studentNames[entry.studentId] || entry.studentId;
      if (entry.eligibility === 'INELIGIBLE') {
        return {
          requestId: entry.requestId,
          explanation: `${name}: Ineligible due to ${entry.reasons.join('; ')}.`,
        };
      }
      const b = entry.scoreBreakdown!;
      const slotTxt = entry.recommendedSlot
        ? `Recommended ${entry.recommendedSlot.start.slice(0, 10)} ${entry.recommendedSlot.start.slice(11, 16)}–${entry.recommendedSlot.end.slice(11, 16)}.`
        : 'No continuous slot available before deadline; check alternatives.';
      return {
        requestId: entry.requestId,
        explanation: `Rank #${entry.rank} (${b.total} pts): Deadline ${b.deadline.score} (${b.deadline.rawInput}), Necessity ${b.necessity.score} (${b.necessity.rawInput}), Fairness ${b.fairness.score} (${b.fairness.rawInput}), Feasibility ${b.feasibility.score}, Waiting ${b.waiting.score}. ${slotTxt}`,
      };
    }),
    citedFactors: ['deadline', 'necessity', 'fairness', 'feasibility', 'waiting'],
  };
}

function validateExplanationAgainstEngine(
  parsed: { summary?: string; perRequest?: Array<{ requestId: string; explanation: string }>; citedFactors?: string[] },
  result: AllocationResult
): boolean {
  if (!parsed.summary || !Array.isArray(parsed.perRequest)) return false;
  const validReqIds = new Set(result.entries.map((e) => e.requestId));
  if (parsed.perRequest.length === 0 && result.entries.length > 0) return false;
  for (const item of parsed.perRequest) {
    if (!validReqIds.has(item.requestId) || typeof item.explanation !== 'string' || item.explanation.length < 5) {
      return false;
    }
  }

  // Build exact set of real engine scores, weights, and rank integers
  const allowedNumbers = new Set<number>([100, 0]);
  if (result.weightsUsed) {
    Object.values(result.weightsUsed).forEach((w) => {
      allowedNumbers.add(Math.round(w * 100));
    });
  }
  const allowedEquipmentIds = new Set<string>([result.equipmentId.toUpperCase()]);

  for (const e of result.entries) {
    if (e.rank !== null) allowedNumbers.add(e.rank);
    if (e.recommendedSlot?.equipmentId) allowedEquipmentIds.add(e.recommendedSlot.equipmentId.toUpperCase());
    e.alternatives.alternativeEquipment.forEach((a) => {
      allowedEquipmentIds.add(a.equipmentId.toUpperCase());
      allowedEquipmentIds.add(a.equipmentCode.toUpperCase());
    });
    if (e.scoreBreakdown) {
      const sb = e.scoreBreakdown;
      [
        sb.total,
        sb.deadline.score,
        sb.deadline.weighted,
        sb.necessity.score,
        sb.necessity.weighted,
        sb.fairness.score,
        sb.fairness.weighted,
        sb.feasibility.score,
        sb.feasibility.weighted,
        sb.waiting.score,
        sb.waiting.weighted,
      ].forEach((n) => {
        allowedNumbers.add(n);
        allowedNumbers.add(Math.round(n));
        allowedNumbers.add(Math.floor(n));
      });
    }
  }

  const allText = [parsed.summary, ...parsed.perRequest.map((p) => p.explanation)].join(' ');
  const pctMatches = allText.matchAll(/\b(\d{2,3}(?:\.\d)?)\s*(?:pts|points|\/100|%)\b/gi);
  for (const m of pctMatches) {
    const val = Number(m[1]);
    const closeMatch = Array.from(allowedNumbers).some((n) => Math.abs(n - val) <= 1.0);
    if (!closeMatch) {
      return false;
    }
  }

  // Also validate decimal scores cited without units (e.g., "83.8", "71.4")
  const decimalMatches = allText.matchAll(/\b(\d{1,3}\.\d)\b/g);
  for (const m of decimalMatches) {
    const val = Number(m[1]);
    const closeMatch = Array.from(allowedNumbers).some((n) => Math.abs(n - val) <= 0.25);
    if (!closeMatch) {
      return false;
    }
  }

  // Reject fabricated hardware codes not in engine result
  const eqCodeMatches = allText.matchAll(/\b([A-Z]{2,6}-[A-Z0-9]{1,6}-\d{2})\b/g);
  for (const m of eqCodeMatches) {
    if (!allowedEquipmentIds.has(m[1].toUpperCase())) {
      return false;
    }
  }

  return true;
}

function fallbackKeywordSearch(query: string, categories: string[]): NLSearchFilter {
  const q = query.toLowerCase();
  const matchedCategories = categories.filter((c) => {
    const lc = c.toLowerCase();
    if (q.includes(lc)) return true;
    if (lc.includes('gpu') && (q.includes('gpu') || q.includes('cuda') || q.includes('nvidia') || q.includes('vision') || q.includes('deep learning'))) return true;
    if (lc.includes('robot') && (q.includes('robot') || q.includes('arm') || q.includes('lidar') || q.includes('ros'))) return true;
    if (lc.includes('embedded') && (q.includes('arduino') || q.includes('esp32') || q.includes('raspberry') || q.includes('jetson') || q.includes('iot'))) return true;
    if (lc.includes('3d') && (q.includes('print') || q.includes('cnc') || q.includes('sla') || q.includes('cad'))) return true;
    if (lc.includes('electronics') && (q.includes('oscilloscope') || q.includes('scope') || q.includes('spectrum') || q.includes('logic'))) return true;
    if (lc.includes('fpga') && (q.includes('fpga') || q.includes('zynq') || q.includes('verilog') || q.includes('xilinx'))) return true;
    if (lc.includes('network') && (q.includes('sdn') || q.includes('sdr') || q.includes('radio') || q.includes('switch'))) return true;
    if (lc.includes('research') && (q.includes('thermal') || q.includes('tensile') || q.includes('motion') || q.includes('optitrack'))) return true;
    return false;
  });

  const vramMatch = q.match(/(\d+)\s*gb/i);
  const stopWords = new Set(['need', 'find', 'with', 'for', 'the', 'and', 'lab', 'equipment', 'available', 'now', 'tomorrow', 'at', 'least', 'hours']);
  const keywords = q
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !stopWords.has(w));

  return {
    categories: matchedCategories,
    keywords: keywords.slice(0, 6),
    minVramGB: vramMatch ? Number(vramMatch[1]) : null,
    requiresCuda: q.includes('cuda') || q.includes('nvidia') || q.includes('rtx') || q.includes('a6000') ? true : null,
    availableOnly: q.includes('available') || q.includes('free') || q.includes('operational'),
    departmentName: null,
    timeWindowStart: null,
    timeWindowEnd: null,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/ai', (req, res, next) => {
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(ip)) {
      res.status(429).json({ error: 'Rate limit exceeded. Please wait a minute before retrying.' });
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      model: GEMINI_MODEL,
    });
  });

  app.post('/api/ai/explain', async (req, res) => {
    const { allocationResult, equipmentName, studentNames = {}, projectTitles = {} } = req.body as {
      allocationResult: AllocationResult;
      equipmentName?: string;
      studentNames?: Record<string, string>;
      projectTitles?: Record<string, string>;
    };

    if (!allocationResult || !Array.isArray(allocationResult.entries)) {
      res.status(400).json({ error: 'allocationResult with entries is required.' });
      return;
    }

    const fallback = buildRuleBasedExplanation(allocationResult, studentNames, projectTitles);
    if (!ai) {
      res.json(fallback);
      return;
    }

    try {
      const promptPayload = {
        equipmentName: equipmentName || allocationResult.equipmentId,
        date: allocationResult.date,
        weightsUsed: allocationResult.weightsUsed,
        entries: allocationResult.entries.map((e) => ({
          requestId: e.requestId,
          studentName: studentNames[e.studentId] || e.studentId,
          projectTitle: projectTitles[e.projectId] || e.projectId,
          eligibility: e.eligibility,
          rank: e.rank,
          scoreBreakdown: e.scoreBreakdown,
          recommendedSlot: e.recommendedSlot,
          flags: e.flags,
          reasons: e.reasons,
        })),
      };

      const response = await withTimeout(
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: `Explain this deterministic laboratory allocation result in concise, transparent plain English for a faculty reviewer:\n${JSON.stringify(promptPayload)}`,
          config: {
            systemInstruction:
              'You are an explainable scheduling assistant for LabLink. Use ONLY the numbers, scores, timestamps, flags, and requestIds provided in the JSON input. NEVER invent equipment, scores, timestamps, or booking confirmations. Cite exact factor scores from scoreBreakdown.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                perRequest: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      requestId: { type: Type.STRING },
                      explanation: { type: Type.STRING },
                    },
                    required: ['requestId', 'explanation'],
                  },
                },
                citedFactors: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['summary', 'perRequest', 'citedFactors'],
            },
          },
        })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim());
      if (!validateExplanationAgainstEngine(parsed, allocationResult)) {
        res.json({ ...fallback, label: 'Rule-based explanation (Gemini output failed grounding check)' });
        return;
      }

      res.json({
        source: 'gemini',
        label: 'Generated from engine output',
        summary: parsed.summary,
        perRequest: parsed.perRequest,
        citedFactors: parsed.citedFactors ?? ['deadline', 'necessity', 'fairness', 'feasibility', 'waiting'],
      });
    } catch (err) {
      console.warn('Gemini explain fallback:', err instanceof Error ? err.message : err);
      res.json(fallback);
    }
  });

  app.post('/api/ai/search', async (req, res) => {
    const { query, categories = [] } = req.body as { query?: string; categories?: string[] };
    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      res.status(400).json({ error: 'Search query must be at least 2 characters.' });
      return;
    }

    const fallback = fallbackKeywordSearch(query, categories);
    if (!ai) {
      res.json({ source: 'rule-based', label: 'Keyword parser (Gemini unavailable)', filter: fallback });
      return;
    }

    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: `Convert this campus lab equipment search request into structured filters. Available categories: ${categories.join(', ')}. Query: "${query}"`,
          config: {
            systemInstruction:
              'Extract structured equipment search filters from natural language. Only use category names from the provided list. Never invent equipment IDs.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                categories: { type: Type.ARRAY, items: { type: Type.STRING } },
                keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                minVramGB: { type: Type.NUMBER, nullable: true },
                requiresCuda: { type: Type.BOOLEAN, nullable: true },
                availableOnly: { type: Type.BOOLEAN },
                departmentName: { type: Type.STRING, nullable: true },
                timeWindowStart: { type: Type.STRING, nullable: true },
                timeWindowEnd: { type: Type.STRING, nullable: true },
              },
              required: ['categories', 'keywords', 'availableOnly'],
            },
          },
        })
      );

      const raw = JSON.parse((response.text ?? '{}').trim());
      const validated = nlSearchFilterSchema.safeParse(raw);
      if (!validated.success) {
        res.json({ source: 'rule-based', label: 'Keyword parser (validation fallback)', filter: fallback });
        return;
      }
      const allowedCategories = new Set(categories);
      const safeFilter: NLSearchFilter = {
        ...validated.data,
        categories: categories.length > 0 ? validated.data.categories.filter((c) => allowedCategories.has(c)) : [],
      };
      res.json({ source: 'gemini', label: 'AI filter extraction', filter: safeFilter });
    } catch (err) {
      console.warn('Gemini search fallback:', err instanceof Error ? err.message : err);
      res.json({ source: 'rule-based', label: 'Keyword parser (Gemini unavailable)', filter: fallback });
    }
  });

  app.post('/api/ai/assistant', async (req, res) => {
    const { message, retrievedContext } = req.body as {
      message?: string;
      retrievedContext?: {
        matchedEquipment?: Array<{ id: string; equipmentId: string; name: string; category: string; building: string; available: boolean; specs: Record<string, unknown> }>;
        userRequests?: Array<{ id: string; equipmentId: string; status: string; aiScore?: number; reason?: string }>;
        alternativeSlots?: Array<{ equipmentId: string; start: string; end: string; reason: string }>;
      };
    };

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message is required.' });
      return;
    }

    const eqMatches = retrievedContext?.matchedEquipment ?? [];
    const reqs = retrievedContext?.userRequests ?? [];
    const alts = retrievedContext?.alternativeSlots ?? [];

    const buildFallback = () => {
      const lines: string[] = [];
      if (eqMatches.length > 0) {
        lines.push(
          `Found ${eqMatches.length} matching resource(s) in campus inventory: ${eqMatches
            .slice(0, 4)
            .map((e) => `${e.name} (${e.equipmentId}, ${e.building}, ${e.available ? 'Operational' : 'Unavailable'})`)
            .join('; ')}.`
        );
      } else {
        lines.push('No stored campus equipment matched your exact specification query.');
      }
      if (reqs.length > 0) {
        lines.push(
          `Your active/recent requests: ${reqs
            .slice(0, 3)
            .map((r) => `${r.equipmentId} [${r.status}]${r.aiScore !== undefined ? ` (score ${r.aiScore})` : ''}${r.reason ? ` — ${r.reason}` : ''}`)
            .join('; ')}.`
        );
      }
      if (alts.length > 0) {
        lines.push(
          `Alternative available slots: ${alts
            .slice(0, 3)
            .map((a) => `${a.equipmentId}: ${a.start.slice(0, 16).replace('T', ' ')}–${a.end.slice(11, 16)} (${a.reason})`)
            .join('; ')}.`
        );
      }
      return {
        source: 'rule-based' as const,
        label: 'Grounded retrieval response (Gemini unavailable)',
        reply: lines.join('\n\n'),
        citedIds: eqMatches.map((e) => e.equipmentId),
      };
    };

    if (!ai) {
      res.json(buildFallback());
      return;
    }

    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: `Student question: "${message}"\n\nRetrieved campus database records:\n${JSON.stringify(retrievedContext ?? {})}`,
          config: {
            systemInstruction:
              'You are the LabLink Campus Resource Assistant. Answer strictly using the retrieved records JSON provided. Never invent equipment, availability, slots, or approval decisions. If matchedEquipment is empty, clearly state that no matching equipment was found in the current inventory.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                reply: { type: Type.STRING },
                citedIds: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['reply', 'citedIds'],
            },
          },
        })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim());
      if (!parsed.reply || typeof parsed.reply !== 'string') {
        res.json(buildFallback());
        return;
      }
      const allowedIds = new Set([
        ...eqMatches.map((e) => e.equipmentId.toUpperCase()),
        ...eqMatches.map((e) => e.id.toUpperCase()),
        ...reqs.map((r) => r.id.toUpperCase()),
        ...reqs.map((r) => r.equipmentId.toUpperCase()),
        ...alts.map((a) => a.equipmentId.toUpperCase()),
      ]);
      const replyText = String(parsed.reply);
      const mentionedCodes = Array.from(replyText.matchAll(/\b([A-Z]{2,6}-[A-Z0-9]{1,6}-\d{2})\b/g)).map((m) =>
        m[1].toUpperCase()
      );
      if (mentionedCodes.some((code) => !allowedIds.has(code))) {
        res.json({
          ...buildFallback(),
          label: 'Grounded retrieval response (AI output failed grounding check)',
        });
        return;
      }

      const validCited = Array.isArray(parsed.citedIds)
        ? parsed.citedIds.filter((id: string) => allowedIds.has(id.toUpperCase()))
        : [];

      res.json({
        source: 'gemini',
        label: 'Grounded AI response',
        reply: parsed.reply,
        citedIds: validCited,
      });
    } catch (err) {
      console.warn('Gemini assistant fallback:', err instanceof Error ? err.message : err);
      res.json(buildFallback());
    }
  });

  app.post('/api/ai/insights', async (req, res) => {
    const { metrics, isDemo } = req.body as {
      metrics?: Record<string, number | string>;
      isDemo?: boolean;
    };

    if (!metrics || typeof metrics !== 'object') {
      res.status(400).json({ error: 'Aggregated metrics object is required.' });
      return;
    }

    const metricKeys = Object.keys(metrics);
    const buildFallback = () => {
      const insights = metricKeys.slice(0, 4).map((k) => ({
        title: `Observed ${k.replace(/([A-Z])/g, ' $1').trim()}`,
        body: `Current computed value from stored records is ${metrics[k]}.`,
        metricKey: k,
        metricValue: String(metrics[k]),
      }));
      return {
        source: 'rule-based' as const,
        label: 'Rule-based analytics summary (Gemini unavailable)',
        isDemo: Boolean(isDemo),
        insights,
      };
    };

    if (!ai) {
      res.json(buildFallback());
      return;
    }

    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: `Summarize up to 4 operational laboratory resource insights from these aggregated campus metrics:\n${JSON.stringify(metrics)}`,
          config: {
            systemInstruction: `Provide concise executive insights tied strictly to the provided metric keys (${metricKeys.join(', ')}). Every insight MUST reference one exact metricKey from the input and its actual value. Never invent numbers.`,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                insights: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      body: { type: Type.STRING },
                      metricKey: { type: Type.STRING },
                      metricValue: { type: Type.STRING },
                    },
                    required: ['title', 'body', 'metricKey', 'metricValue'],
                  },
                },
              },
              required: ['insights'],
            },
          },
        })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim());
      if (!Array.isArray(parsed.insights)) {
        res.json(buildFallback());
        return;
      }

      const validInsights = parsed.insights.filter(
        (ins: { metricKey?: string; title?: string; body?: string }) =>
          ins.metricKey && metricKeys.includes(ins.metricKey) && ins.title && ins.body
      );

      if (validInsights.length === 0) {
        res.json(buildFallback());
        return;
      }

      res.json({
        source: 'gemini',
        label: 'AI analytics insights',
        isDemo: Boolean(isDemo),
        insights: validInsights.slice(0, 4).map((ins: { title: string; body: string; metricKey: string }) => ({
          title: ins.title,
          body: ins.body,
          metricKey: ins.metricKey,
          metricValue: String(metrics[ins.metricKey]),
        })),
      });
    } catch (err) {
      console.warn('Gemini insights fallback:', err instanceof Error ? err.message : err);
      res.json(buildFallback());
    }
  });

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`LabLink server listening on http://localhost:${port}`);
  });
}

startServer();
