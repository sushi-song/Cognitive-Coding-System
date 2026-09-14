export interface XMLMessage {
  id: string;
  type: 'comment' | 'reply' | 'topic';
  parent_id: string;
  author: string;
  author_role: '同学' | '机器人' | '教师' | string;
  content: string;
  created_at?: string;
  likes?: number;
}

export interface XMLTopic {
  id: string;
  title: string;
  content: string;
}

export interface XMLParsePreview {
  topic: XMLTopic | null;
  totalMessages: number;
  studentMessages: number;
  robotMessages: number;
  studentAuthorsCount: number;
  status: 'idle' | 'success' | 'error';
  errorMsg: string;
  replyIntegrity: boolean;
  messages: XMLMessage[];
}

export interface CodingItem {
  code: string;
  evidence: string;
  reason: string;
  evidence_items?: Array<{ evidence: string; reason: string }>;
}

export interface Level3CodingItem {
  code: string;
  name: string;
  evidence: string;
  reason: string;
  evidence_items?: Array<{ evidence: string; reason: string }>;
}

export interface CodingResult {
  message_id: string;
  author: string;
  codes: CodingItem[];
  level_3_codes?: Level3CodingItem[];
}

export interface AnalysisResponse {
  discussion_id: string;
  coding_results: CodingResult[];
  warning?: string;
  validation_issues?: string[];
  course_type?: 'information_technology_pedagogy' | 'programming_learning' | 'discipline_frontier' | 'secondary_only';
  experiment_method?: 'M1' | 'M2' | 'M3';
  experiment_metadata?: SecondaryExperimentMetadata;
  api_provider?: string;
  model_name?: string;
  prompt_version?: string;
  generated_at?: string;
  raw_model_output?: unknown;
}

export interface GenerationModelConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
}

export interface ScreeningModelConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
}

export interface M3CandidateRecord {
  experiment_run_id: string;
  discussion_id: string;
  message_id: string;
  author: string;
  source_text: string;
  generation_index: 1 | 2 | 3;
  generation_id: 'generation_1' | 'generation_2' | 'generation_3';
  candidate_alias: 'A' | 'B' | 'C';
  raw_codes: CodingItem[];
  raw_model_output?: unknown;
  validated_codes: CodingItem[];
  validation_passed: boolean;
  validation_issues: string[];
  selected: boolean;
  judge_scores: null | {
    definition_match: number;
    evidence_sufficiency: number;
    coverage_completeness: number;
    coding_precision: number;
    reasoning_quality: number;
    total_score: number;
    evaluation_reason: string;
  };
  judge_reason: string | null;
  screening_reason?: string;
  generator_model: string;
  screening_model: string;
  generator_prompt_version: string;
  screening_prompt_version: string;
  generated_at: string;
}

export interface SecondaryExperimentMetadata {
  experiment_run_id?: string;
  experiment_method?: 'M1' | 'M2' | 'M3';
  status?: string;
  generator_model?: string;
  screening_model?: string;
  generator_prompt_version?: string;
  screening_prompt_version?: string;
  generation_count?: number;
  candidate_records?: M3CandidateRecord[];
  candidate_mapping?: Record<string, Record<'A' | 'B' | 'C', string>>;
  screening_results?: unknown[];
  tie_records?: unknown[];
  random_seed?: string;
  generation_config?: Record<string, unknown>;
  screening_config?: Record<string, unknown>;
  call_records?: unknown[];
  generated_at?: string;
  [key: string]: unknown;
}

export interface CodebookDetail {
  code: string;
  name: string;
  stage: string;
  stage_code: 'Triggering' | 'Exploration' | 'Integration' | 'Resolution';
  description: string;
  example: string;
}
