import { createHash, randomUUID } from "crypto";

export const SECOND_LEVEL_CODES = [
  "T-DP", "T-AQ", "E-UD", "E-RV", "E-BE", "E-BP",
  "I-JA", "I-JD", "I-JHP", "I-JHE", "I-CS", "R-AT"
] as const;

export type SecondaryCode = typeof SECOND_LEVEL_CODES[number];
export type ExperimentMethod = "M3";
export type CandidateAlias = "A" | "B" | "C";
export type GenerationId = "generation_1" | "generation_2" | "generation_3";

export const SECONDARY_M3_SCREENING_PROMPT_VERSION = "secondary-m3-screening-v6";
export const SECONDARY_M3_SCREENING_PROMPT_VERSION_EN = "secondary-m3-screening-en-v1";

export const SECOND_LEVEL_M3_SCREENING_SYSTEM_PROMPT = `你是一名独立的CSCL二级认知编码筛选Judge。

你的任务不是重新编码学生讨论文本，而是严格依据给定的二级认知编码Codebook，对候选A、候选B和候选C进行独立评分，并选择质量最高的候选。

【任务边界】
1. 本任务只评价二级认知编码，不评价任何三级内容标签。
2. 二级编码表示学生发言体现的认知过程。
3. 每个候选可能包含零个、一个或多个二级标签。
4. 多标签候选中的每个标签都必须获得当前学生发言中的证据支持。
   同一标签如果包含多个 evidence_items，必须把其中每一组 evidence 与 reason 都纳入证据充分性和理由合理性评价，不得只看第一组。
5. 候选A、B、C分别表示三套完整的多标签编码方案。
6. 你只能评价和选择已有候选。
7. 禁止重新编码、修改候选、合并候选、删除候选标签、补充标签或生成新候选。
8. 不得因为候选更长、更流畅、解释更详细或排列更靠前而给予更高分。
9. 标签判断必须以提供的Codebook为唯一依据。
10. 证据必须能够在当前待编码学生发言中逐字定位。
11. 背景消息只能用于理解指代、回复关系和讨论进程，不能代替当前学生发言作为证据。
12. 必须先分别独立评价三个候选，再进行横向比较。

【评分维度】
一、标签与定义匹配度（definition_match），0—2分。
2分：候选中的所有标签均符合Codebook定义和判定条件。
1分：整体方向基本正确，但存在边界模糊、定义匹配不充分或轻微误判。
0分：核心标签明显不符合Codebook定义，或者错误理解了发言体现的认知过程。

二、文本证据充分性（evidence_sufficiency），0—2分。
2分：候选中的每个标签都有直接、明确且可定位的原文证据。
1分：存在相关证据，但部分标签的证据不够直接、完整或具体。
0分：缺少可定位证据，或者证据与标签无关、矛盾。

三、标签覆盖完整性（coverage_completeness），0—2分。
2分：候选覆盖了文本中所有具有实质性证据支持的主要认知过程。
1分：识别了核心认知过程，但可能遗漏一个有一定证据支持的标签。
0分：遗漏了文本中非常明确的核心认知过程。

如果当前发言确实不包含任何可编码认知过程，候选正确输出空标签，也可以获得2分，不能因标签为空而直接扣分。

四、编码精确性（coding_precision），0—2分。
2分：所有标签都有充分依据，不存在明显多余、重复或推断过度的标签。
1分：存在一个边界性较强或证据较弱的可疑标签。
0分：存在明显无证据标签、过度编码或把未发生的认知过程编码出来。

五、判断理由合理性（reasoning_quality），0—2分。
2分：理由准确建立了原文证据、认知表现和Codebook标签之间的联系。
1分：理由基本合理，但较为笼统，或者没有充分解释标签与证据的关系。
0分：理由与原文、标签或Codebook定义明显不一致。

【选择规则】
1. 首先选择总分最高的候选。
2. 总分相同时，依次比较：标签与定义匹配度、文本证据充分性、编码精确性、标签覆盖完整性、判断理由合理性。
3. 如果最高分候选的总分和五项评分仍完全相同，必须在 tie_candidates 中列出全部数值并列候选；你可以继续比较它们的具体标签、证据完整性、证据与理由的对应清晰度，并从并列候选中选择一个。
4. 从数值并列候选中选择一个时，selection_reason 必须明确比较这些并列候选并说明选择依据，不得选择并列集合之外的候选。
5. 只有在数值并列候选确实不存在可验证的实质差异时，才返回 selected_candidate: "TIE"，并由 selection_reason 解释为何无法区分。
6. 不得为了避免TIE而虚构差异，也不得通过修改五项评分来迎合最终选择。
7. 只能选择候选A、B、C中的一套完整结果，不能组合或修改候选。
8. 只能输出规定的JSON，不得输出Markdown、前言或额外说明。`;

export const SECOND_LEVEL_M3_SCREENING_SYSTEM_PROMPT_EN = `You are an independent judge for second-level CSCL cognitive-presence coding.

Your task is to evaluate three anonymized candidate codings (A, B, and C) for each student message against the complete Codebook, assign scores, and select one complete candidate. Do not merge, rewrite, or add labels to any candidate.

Score each candidate on five dimensions, using only 0, 1, or 2:
1. definition_match: whether every label matches the Codebook definition and boundaries.
2. evidence_sufficiency: whether every label has direct, complete, verbatim-locatable evidence in the current message.
3. coverage_completeness: whether all major cognitive processes supported by the current message are covered. A genuinely non-codable message may correctly receive an empty label set and full credit.
4. coding_precision: whether the candidate avoids unsupported, duplicate, or over-inferred labels.
5. reasoning_quality: whether each reason clearly connects the quoted evidence, the cognitive behavior, and the Codebook label.

Rules:
1. Evaluate each candidate independently before comparing them.
2. total_score must equal the sum of the five dimension scores (0-10).
3. unsupported_labels and potential_missing_labels may contain only valid second-level codes.
4. If one candidate has the highest total score, select A, B, or C and return an empty tie_candidates array.
5. If the top candidates have identical total and dimension scores, compare their labels, evidence, and reasons qualitatively. Select the better complete candidate when a verifiable difference exists and explain it in selection_reason. Use TIE only when no verifiable difference remains.
6. Never invent differences or manipulate scores to justify a preferred selection.
7. Select exactly one complete candidate A, B, or C; never combine or edit candidates.
8. Return only the required JSON object, with no Markdown, preface, reasoning tags, or extra text.`;

export interface SecondaryCodingItem {
  code: string;
  evidence: string;
  reason: string;
  evidence_items: Array<{ evidence: string; reason: string }>;
}

export interface SecondaryCodingResult {
  message_id: string;
  author: string;
  codes: SecondaryCodingItem[];
  level_3_codes: [];
}

export interface JudgeScore {
  definition_match: number;
  evidence_sufficiency: number;
  coverage_completeness: number;
  coding_precision: number;
  reasoning_quality: number;
  total_score: number;
  unsupported_labels: string[];
  potential_missing_labels: string[];
  evaluation_reason: string;
}

export interface ValidatedJudgeResult {
  message_id: string;
  candidate_scores: Record<CandidateAlias, JudgeScore>;
  selected_candidate: CandidateAlias | "TIE";
  tie_candidates: CandidateAlias[];
  selection_reason: string;
}

export interface ParsedStrictJsonResponse {
  parsed: any;
  normalizations: string[];
}

/**
 * Parse a model response without guessing or extracting arbitrary JSON.
 * Besides direct JSON, the only accepted compatibility form is one complete
 * outer Markdown code fence containing exactly one valid JSON object.
 */
export function parseStrictJsonResponse(content: string): ParsedStrictJsonResponse {
  try {
    return { parsed: JSON.parse(content), normalizations: [] };
  } catch {
    // Continue only to the narrowly defined outer-fence compatibility case.
  }

  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i);
  if (!fenced) throw new Error("返回内容不是严格合法的 JSON。");

  try {
    const parsed = JSON.parse(fenced[1].trim());
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("JSON 顶层必须是对象。");
    }
    return { parsed, normalizations: ["removed_outer_json_fence"] };
  } catch {
    throw new Error("返回内容不是严格合法的 JSON。");
  }
}

export function createSecondaryCodingJsonSchema(discussionId: string, studentMessages: any[]): any {
  return {
    type: "object",
    properties: {
      discussion_id: { type: "string", enum: [discussionId] },
      course_type: { type: "string", enum: ["secondary_only"] },
      coding_results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            message_id: { type: "string", enum: studentMessages.map(message => message.id) },
            author: { type: "string" },
            codes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  code: { type: "string", enum: [...SECOND_LEVEL_CODES] },
                  evidence: { type: "string" },
                  reason: { type: "string" }
                },
                required: ["code", "evidence", "reason"],
                additionalProperties: false
              }
            },
            level_3_codes: {
              type: "array",
              items: { type: "string" },
              maxItems: 0
            }
          },
          required: ["message_id", "author", "codes", "level_3_codes"],
          additionalProperties: false
        }
      }
    },
    required: ["discussion_id", "course_type", "coding_results"],
    additionalProperties: false
  };
}

export function createSecondaryResponseFormat(discussionId: string, studentMessages: any[]): any {
  return {
    type: "json_schema",
    json_schema: {
      name: "cscl_secondary_experiment",
      strict: true,
      schema: createSecondaryCodingJsonSchema(discussionId, studentMessages)
    }
  };
}

export function createScreeningJsonSchema(messageIds: string[]): any {
  const scoreSchema = {
    type: "object",
    properties: {
      definition_match: { type: "integer", enum: [0, 1, 2] },
      evidence_sufficiency: { type: "integer", enum: [0, 1, 2] },
      coverage_completeness: { type: "integer", enum: [0, 1, 2] },
      coding_precision: { type: "integer", enum: [0, 1, 2] },
      reasoning_quality: { type: "integer", enum: [0, 1, 2] },
      total_score: { type: "integer", minimum: 0, maximum: 10 },
      unsupported_labels: { type: "array", items: { type: "string", enum: [...SECOND_LEVEL_CODES] } },
      potential_missing_labels: { type: "array", items: { type: "string", enum: [...SECOND_LEVEL_CODES] } },
      evaluation_reason: { type: "string" }
    },
    required: ["definition_match", "evidence_sufficiency", "coverage_completeness", "coding_precision", "reasoning_quality", "total_score", "unsupported_labels", "potential_missing_labels", "evaluation_reason"],
    additionalProperties: false
  };
  const resultSchema = {
    type: "object",
    properties: {
      message_id: { type: "string", enum: messageIds },
      candidate_scores: {
        type: "object",
        properties: { A: scoreSchema, B: scoreSchema, C: scoreSchema },
        required: ["A", "B", "C"],
        additionalProperties: false
      },
      selected_candidate: { type: "string", enum: ["A", "B", "C", "TIE"] },
      tie_candidates: { type: "array", items: { type: "string", enum: ["A", "B", "C"] } },
      selection_reason: { type: "string" }
    },
    required: ["message_id", "candidate_scores", "selected_candidate", "tie_candidates", "selection_reason"],
    additionalProperties: false
  };
  return {
    type: "object",
    properties: {
      screening_results: { type: "array", items: resultSchema }
    },
    required: ["screening_results"],
    additionalProperties: false
  };
}

export function validateSecondaryResults(discussionId: string, studentMessages: any[], parsed: any): any {
  if (!parsed || !Array.isArray(parsed.coding_results)) {
    throw new Error("缺少 coding_results 数组。");
  }
  const studentMap = new Map(studentMessages.map(message => [message.id, message]));
  const validCodes = new Set<string>(SECOND_LEVEL_CODES);
  const issues: string[] = [];
  const byId = new Map<string, SecondaryCodingResult>();
  for (const message of studentMessages) {
    byId.set(message.id, { message_id: message.id, author: message.author, codes: [], level_3_codes: [] });
  }
  if (typeof parsed.discussion_id === "string" && parsed.discussion_id !== discussionId) {
    issues.push("discussion_id 与请求不一致，已使用请求中的 ID");
  }
  const returnedMessageIds = new Set<string>();
  for (const item of parsed.coding_results) {
    if (!item || typeof item.message_id !== "string" || !studentMap.has(item.message_id)) {
      issues.push("包含未知、非学生或无效的 message_id，已忽略");
      continue;
    }
    if (returnedMessageIds.has(item.message_id)) {
      throw new Error(`消息 ${item.message_id} 在 coding_results 中重复出现。`);
    }
    returnedMessageIds.add(item.message_id);
    const target = byId.get(item.message_id)!;
    if (!Array.isArray(item.codes)) {
      issues.push(`消息 ${item.message_id} 缺少 codes 数组，已按空编码处理`);
      continue;
    }
    if (Array.isArray(item.level_3_codes) && item.level_3_codes.length > 0) {
      issues.push(`消息 ${item.message_id} 返回了三级编码，已全部排除`);
    }
    const source = studentMap.get(item.message_id).content;
    const byCode = new Map<string, SecondaryCodingItem>();
    for (const raw of item.codes) {
      const code = typeof raw?.code === "string" ? raw.code.trim().toUpperCase() : "";
      if (!validCodes.has(code)) {
        issues.push(`消息 ${item.message_id} 的非法二级编码“${code || "空值"}”已排除`);
        continue;
      }
      const evidence = typeof raw.evidence === "string" ? raw.evidence.trim() : "";
      const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
      if (!evidence || !source.includes(evidence)) {
        issues.push(`消息 ${item.message_id} 的编码 ${code} 没有可在原文中定位的证据，已排除`);
        continue;
      }
      if (!reason) {
        issues.push(`消息 ${item.message_id} 的编码 ${code} 缺少模型解释，已排除`);
        continue;
      }
      const existing = byCode.get(code);
      if (existing) {
        const isExactDuplicate = existing.evidence_items.some(item => item.evidence === evidence && item.reason === reason);
        if (isExactDuplicate) {
          issues.push(`消息 ${item.message_id} 的重复二级编码 ${code} 含完全相同的证据与理由，已忽略重复项`);
        } else {
          existing.evidence_items.push({ evidence, reason });
          issues.push(`消息 ${item.message_id} 的重复二级编码 ${code} 已合并其合法证据与理由，标签频次仍计 1 次`);
        }
        continue;
      }
      const normalized = { code, evidence, reason, evidence_items: [{ evidence, reason }] };
      byCode.set(code, normalized);
      target.codes.push(normalized);
    }
  }
  return {
    discussion_id: discussionId,
    course_type: "secondary_only",
    coding_results: studentMessages.map(message => byId.get(message.id)),
    validation_issues: issues,
    ...(issues.length ? { warning: `模型返回中有 ${issues.length} 项校验或规范化提示。${issues.slice(0, 5).join("；")}${issues.length > 5 ? `；另有 ${issues.length - 5} 项` : ""}。` } : {})
  };
}

export function createExperimentRunId(): string {
  return `m3-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
}

function hashNumber(seed: string): number {
  return Number.parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 8), 16) >>> 0;
}

export function candidateMappingForMessage(seed: string, messageId: string): Record<CandidateAlias, GenerationId> {
  const ids: GenerationId[] = ["generation_1", "generation_2", "generation_3"];
  let state = hashNumber(`${seed}:${messageId}:mapping`);
  for (let index = ids.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    [ids[index], ids[swap]] = [ids[swap], ids[index]];
  }
  return { A: ids[0], B: ids[1], C: ids[2] };
}

const SCORE_ORDER: Array<keyof JudgeScore> = [
  "total_score", "definition_match", "evidence_sufficiency", "coding_precision", "coverage_completeness", "reasoning_quality"
];

function compareScores(left: JudgeScore, right: JudgeScore): number {
  for (const key of SCORE_ORDER) {
    const difference = Number(right[key]) - Number(left[key]);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function validateJudgeResult(messageId: string, raw: any): ValidatedJudgeResult {
  if (!raw || raw.message_id !== messageId || !raw.candidate_scores) {
    throw new Error(`筛选结果缺少消息 ${messageId} 的合法记录。`);
  }
  const aliases: CandidateAlias[] = ["A", "B", "C"];
  const validCodes = new Set<string>(SECOND_LEVEL_CODES);
  for (const alias of aliases) {
    const score = raw.candidate_scores[alias];
    if (!score) throw new Error(`消息 ${messageId} 缺少候选 ${alias} 的评分。`);
    const dimensions = [score.definition_match, score.evidence_sufficiency, score.coverage_completeness, score.coding_precision, score.reasoning_quality];
    if (dimensions.some(value => !Number.isInteger(value) || value < 0 || value > 2)) {
      throw new Error(`消息 ${messageId} 的候选 ${alias} 含有超出 0–2 的评分。`);
    }
    if (score.total_score !== dimensions.reduce((sum, value) => sum + value, 0)) {
      throw new Error(`消息 ${messageId} 的候选 ${alias} 总分与五维分数之和不一致。`);
    }
    for (const field of ["unsupported_labels", "potential_missing_labels"] as const) {
      if (!Array.isArray(score[field]) || score[field].some((code: any) => !validCodes.has(code))) {
        throw new Error(`消息 ${messageId} 的候选 ${alias} 含有非法的 ${field}。`);
      }
    }
    if (typeof score.evaluation_reason !== "string") throw new Error(`消息 ${messageId} 的候选 ${alias} 缺少评价理由。`);
  }
  const ordered = [...aliases].sort((a, b) => compareScores(raw.candidate_scores[a], raw.candidate_scores[b]));
  const tied = ordered.filter(alias => compareScores(raw.candidate_scores[ordered[0]], raw.candidate_scores[alias]) === 0);
  if (tied.length > 1) {
    const returnedTies = Array.isArray(raw.tie_candidates) ? [...new Set(raw.tie_candidates)].sort() : [];
    if (returnedTies.join(",") !== [...tied].sort().join(",")) throw new Error(`消息 ${messageId} 的数值并列候选与评分结果不一致。`);
    if (raw.selected_candidate !== "TIE" && !tied.includes(raw.selected_candidate)) {
      throw new Error(`消息 ${messageId} 的最终候选不在最高分并列集合中。`);
    }
  } else if (raw.selected_candidate !== ordered[0] || (Array.isArray(raw.tie_candidates) && raw.tie_candidates.length > 0)) {
    throw new Error(`消息 ${messageId} 的最终候选不符合总分和破同分规则。`);
  }
  if (typeof raw.selection_reason !== "string" || !raw.selection_reason.trim()) throw new Error(`消息 ${messageId} 缺少筛选理由。`);
  return raw as ValidatedJudgeResult;
}

export function chooseTieCandidate(seed: string, messageId: string, aliases: CandidateAlias[]): CandidateAlias {
  const normalizedAliases = [...new Set(aliases)].sort() as CandidateAlias[];
  if (normalizedAliases.length === 0) throw new Error("TIE 候选不能为空。");
  return normalizedAliases[hashNumber(`${seed}:${messageId}:tie:${normalizedAliases.join(",")}`) % normalizedAliases.length];
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function candidateRecordsToCsv(records: any[]): string {
  const headers = ["experiment_run_id", "discussion_id", "message_id", "author", "source_text", "generation_id", "candidate_alias", "candidate_codes", "candidate_evidence", "candidate_reasons", "generation_temperature", "screening_temperature", "validation_passed", "validation_issues", "selected", "definition_match", "evidence_sufficiency", "coverage_completeness", "coding_precision", "reasoning_quality", "total_score", "screening_reason", "generator_model", "screening_model", "generator_prompt_version", "screening_prompt_version", "generated_at"];
  const rows = records.map(record => {
    const codes = record.validated_codes || [];
    return [record.experiment_run_id, record.discussion_id, record.message_id, record.author, record.source_text, record.generation_id, record.candidate_alias, JSON.stringify(codes.map((item: any) => item.code)), JSON.stringify(codes.map((item: any) => item.evidence_items || [{ evidence: item.evidence, reason: item.reason }])), JSON.stringify(codes.map((item: any) => (item.evidence_items || [{ evidence: item.evidence, reason: item.reason }]).map((pair: any) => pair.reason))), record.generation_config?.temperature ?? "", record.screening_config?.temperature ?? "", record.validation_passed, (record.validation_issues || []).join("；"), record.selected, record.judge_scores?.definition_match ?? "", record.judge_scores?.evidence_sufficiency ?? "", record.judge_scores?.coverage_completeness ?? "", record.judge_scores?.coding_precision ?? "", record.judge_scores?.reasoning_quality ?? "", record.judge_scores?.total_score ?? "", record.judge_reason ?? "", record.generator_model, record.screening_model, record.generator_prompt_version, record.screening_prompt_version, record.generated_at];
  });
  return "\uFEFF" + [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
}

export function labelRecordsToCsv(records: any[]): string {
  const headers = ["experiment_run_id", "discussion_id", "message_id", "generation_id", "candidate_alias", "code", "evidence", "reason", "generation_temperature", "screening_temperature", "validation_passed", "selected"];
  const rows: unknown[][] = [];
  for (const record of records) {
    const codes = record.validated_codes || [];
    const entries = codes.length ? codes : [{ code: "", evidence: "", reason: "" }];
    for (const item of entries) {
      const pairs = item.evidence_items || [{ evidence: item.evidence, reason: item.reason }];
      rows.push([record.experiment_run_id, record.discussion_id, record.message_id, record.generation_id, record.candidate_alias, item.code, JSON.stringify(pairs.map((pair: any) => pair.evidence)), JSON.stringify(pairs.map((pair: any) => pair.reason)), record.generation_config?.temperature ?? "", record.screening_config?.temperature ?? "", record.validation_passed, record.selected]);
    }
  }
  return "\uFEFF" + [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
}
