import React, { useState, useRef, useMemo, useEffect } from "react";
import { 
  FileCode, 
  Upload, 
  Database, 
  Play, 
  Trash2, 
  Sparkles, 
  Loader2, 
  CheckCircle, 
  AlertTriangle, 
  HelpCircle, 
  ChevronRight, 
  Download, 
  RefreshCw, 
  Settings, 
  MessageSquare, 
  Eye, 
  User, 
  Info, 
  X,
  Target,
  BookOpen,
  Search,
  Presentation
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { XMLMessage, XMLTopic, XMLParsePreview, CodingResult, AnalysisResponse, CodebookDetail, Level3CodingItem, type M3CandidateRecord } from "./types";
import { CODEBOOK, CODEBOOK_EN, SAMPLE_XML_DATA, SAMPLE_XML_DATA_EN, SAMPLE_XML_DATA_PROGRAMMING, SAMPLE_XML_DATA_FRONTIER, COURSE_CONFIGS } from "./codebook";

export default function App() {
  const [language, setLanguage] = useState<'zh' | 'en'>(() => localStorage.getItem("ui_language") === "en" ? "en" : "zh");
  const en = language === 'en';
  const uiCodebook = en ? CODEBOOK_EN : CODEBOOK;
  // UI States: 'unparsed' | 'parsed' | 'analyzing' | 'completed'
  const [appState, setAppState] = useState<'unparsed' | 'parsed' | 'analyzing' | 'completed'>('unparsed');
  
  // Course selection state: 'information_technology_pedagogy' | 'programming_learning' | 'discipline_frontier' | ''
  const [courseType, setCourseType] = useState<string>("");
  const [statsTab, setStatsTab] = useState<'level2' | 'level3'>('level2');
  const [activeLevel3Filter, setActiveLevel3Filter] = useState<string | null>(null);

  // Codebook reference helper states
  const [activeGuideCourse, setActiveGuideCourse] = useState<'information_technology_pedagogy' | 'programming_learning' | 'discipline_frontier'>('information_technology_pedagogy');
  const [guideSearchQuery, setGuideSearchQuery] = useState<string>("");

  // Inputs
  const [xmlText, setXmlText] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Custom LLM Config
  const [showLlmSettings, setShowLlmSettings] = useState<boolean>(false);
  const [llmBaseUrl, setLlmBaseUrl] = useState<string>(() => localStorage.getItem("llm_base_url") || "");
  const [llmApiKey, setLlmApiKey] = useState<string>(() => sessionStorage.getItem("llm_api_key") || "");
  const [llmModel, setLlmModel] = useState<string>(() => localStorage.getItem("llm_model") || "");
  const [generationTemperature, setGenerationTemperature] = useState<number>(() => {
    const raw = localStorage.getItem("generation_temperature");
    const saved = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(saved) && saved >= 0 && saved <= 2 ? saved : 0.3;
  });
  const experimentMethod: 'M3' = 'M3';
  const [screeningBaseUrl, setScreeningBaseUrl] = useState<string>(() => localStorage.getItem("screening_llm_base_url") || "");
  const [screeningApiKey, setScreeningApiKey] = useState<string>(() => sessionStorage.getItem("screening_llm_api_key") || "");
  const [screeningModel, setScreeningModel] = useState<string>(() => localStorage.getItem("screening_llm_model") || "");
  const [screeningTemperature, setScreeningTemperature] = useState<number>(() => {
    const raw = localStorage.getItem("screening_temperature");
    const saved = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(saved) && saved >= 0 && saved <= 2 ? saved : 0.3;
  });
  const [partialExperiment, setPartialExperiment] = useState<{ experiment_run_id: string; export_urls: Record<string, string>; saved_candidate_count: number } | null>(null);

  // Sync Custom LLM Config to localStorage
  useEffect(() => {
    localStorage.setItem("llm_base_url", llmBaseUrl);
  }, [llmBaseUrl]);

  useEffect(() => {
    localStorage.removeItem("llm_api_key");
    if (llmApiKey) {
      sessionStorage.setItem("llm_api_key", llmApiKey);
    } else {
      sessionStorage.removeItem("llm_api_key");
    }
  }, [llmApiKey]);

  useEffect(() => {
    localStorage.setItem("llm_model", llmModel);
  }, [llmModel]);

  useEffect(() => {
    localStorage.setItem("generation_temperature", String(generationTemperature));
  }, [generationTemperature]);

  useEffect(() => {
    localStorage.setItem("ui_language", language);
    document.documentElement.lang = en ? "en" : "zh-CN";
  }, [language, en]);

  useEffect(() => {
    localStorage.setItem("screening_llm_base_url", screeningBaseUrl);
    localStorage.setItem("screening_llm_model", screeningModel);
    localStorage.setItem("screening_temperature", String(screeningTemperature));
  }, [screeningBaseUrl, screeningModel, screeningTemperature]);

  useEffect(() => {
    if (screeningApiKey) sessionStorage.setItem("screening_llm_api_key", screeningApiKey);
    else sessionStorage.removeItem("screening_llm_api_key");
  }, [screeningApiKey]);

  // Parsing Results
  const [parseResult, setParseResult] = useState<XMLParsePreview | null>(null);
  const [parsingError, setParsingError] = useState<string | null>(null);

  // Coding Results
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [activeBubble, setActiveBubble] = useState<string | null>(null);
  const [selectedContextMsg, setSelectedContextMsg] = useState<XMLMessage | null>(null);
  const [llmWarning, setLlmWarning] = useState<string | null>(null);

  // Drag and Drop state
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // ---------------------------------------------------------
  // 1. XML Parsing & Validation & Anonymization
  // ---------------------------------------------------------
  const handleParseXML = (rawText: string) => {
    if (!rawText.trim()) {
      setParsingError(en ? "The XML input is empty." : "XML内容为空，请输入或上传XML。");
      return;
    }

    try {
      setParsingError(null);
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(rawText, "text/xml");
      
      // Check for parsing errors
      const parserError = xmlDoc.getElementsByTagName("parsererror");
      if (parserError.length > 0) {
        throw new Error(parserError[0].textContent || "XML 语法格式错误");
      }

      // 1. Extract Topic
      const topicNode = xmlDoc.getElementsByTagName("topic")[0];
      if (!topicNode) {
        throw new Error(en ? "Required <topic> element is missing." : "缺少必要的 <topic> 节点。");
      }
      const topicId = topicNode.getAttribute("id") || "topic-default";
      const titleNode = topicNode.getElementsByTagName("title")[0];
      const contentNode = topicNode.getElementsByTagName("content")[0];
      
      const topic: XMLTopic = {
        id: topicId,
        title: titleNode ? titleNode.textContent?.trim() || "" : "未命名讨论主题",
        content: contentNode ? contentNode.textContent?.trim() || "" : ""
      };

      // 2. Extract Messages
      const messagesContainer = xmlDoc.getElementsByTagName("messages")[0];
      if (!messagesContainer) {
        throw new Error(en ? "Required <messages> element is missing." : "缺少必要的 <messages> 容器节点。");
      }

      const messageNodes = xmlDoc.getElementsByTagName("message");
      if (messageNodes.length === 0) {
        throw new Error(en ? "No <message> element was found under <messages>." : "在 <messages> 节点下未找到任何 <message>。");
      }

      const messages: XMLMessage[] = [];
      const idSet = new Set<string>();
      let hasDuplicates = false;
      let hasEmptyContent = false;

      // Temporary arrays to parse
      for (let i = 0; i < messageNodes.length; i++) {
        const node = messageNodes[i];
        const id = node.getAttribute("id")?.trim() || "";
        if (!id) {
          throw new Error(`XML 校验失败：第 ${i + 1} 条消息缺少非空的 id 属性。`);
        }
        const type = (node.getAttribute("type") || "comment") as 'comment' | 'reply' | 'topic';
        const parentId = node.getAttribute("parent_id") || "";
        
        const authorNode = node.getElementsByTagName("author")[0];
        if (!authorNode) {
          throw new Error(`XML 校验失败：消息 [ID: ${id}] 缺少 <author> 节点。`);
        }
        const authorName = authorNode.textContent?.trim() || "";
        if (!authorName) {
          throw new Error(`XML 校验失败：消息 [ID: ${id}] 的作者姓名为空。`);
        }
        const rawRole = authorNode.getAttribute("role")?.trim() || "";
        if (!rawRole) {
          throw new Error(`XML 校验失败：消息 [ID: ${id}] 的作者缺少 role 属性。`);
        }
        const authorRole = (() => {
          const r = rawRole.trim().toLowerCase();
          if (["同学", "学生", "student", "respondent", "learner", "user", "peer", "participant"].includes(r)) return "同学";
          if (["教师", "老师", "导师", "助教", "教员", "teacher", "instructor", "tutor", "moderator"].includes(r)) return "教师";
          if (["机器人", "ai助手", "智能体", "robot", "assistant", "ai"].includes(r)) return "机器人";
          throw new Error(`XML 校验失败：消息 [ID: ${id}] 的作者角色“${rawRole}”无法识别。`);
        })();
        
        const msgContentNode = node.getElementsByTagName("content")[0];
        const msgContent = msgContentNode ? msgContentNode.textContent?.trim() || "" : "";

        if (idSet.has(id)) {
          hasDuplicates = true;
        }
        idSet.add(id);

        if (!msgContent) {
          hasEmptyContent = true;
        }

        messages.push({
          id,
          type,
          parent_id: parentId,
          author: authorName,
          author_role: authorRole,
          content: msgContent
        });
      }

      if (hasDuplicates) {
        throw new Error("XML 校验失败：发现重复的消息ID（message id）。");
      }
      if (hasEmptyContent) {
        throw new Error("XML 校验失败：存在消息正文为空（content 为空）的帖子。");
      }

      // Check Parent ID validity (pointing to either topic id or other message ids)
      let parentIntegrity = true;
      for (const msg of messages) {
        if (msg.parent_id && msg.parent_id !== topic.id && !idSet.has(msg.parent_id)) {
          parentIntegrity = false;
          throw new Error(`XML 校验失败：消息 [ID: ${msg.id}] 的 parent_id指向不存在的帖子/主题 [${msg.parent_id}]。`);
        }
      }

      // 3. Preserve original author names and message text.
      const studentAuthorsCount = new Set(
        messages.filter(msg => msg.author_role === "同学").map(msg => msg.author)
      ).size;
      const totalMessages = messages.length;
      const studentMessages = messages.filter(m => m.author_role === "同学").length;
      const robotMessages = messages.filter(m => m.author_role === "机器人").length;

      setParseResult({
        topic,
        totalMessages,
        studentMessages,
        robotMessages,
        studentAuthorsCount,
        status: 'success',
        errorMsg: "",
        replyIntegrity: parentIntegrity,
        messages
      });
      setXmlText(rawText);
      setAnalysisResult(null);
      setAnalysisError(null);
      setLlmWarning(null);
      setActiveBubble(null);
      setActiveLevel3Filter(null);
      setSelectedContextMsg(null);
      setAppState('parsed');

    } catch (err: any) {
      setParsingError(err.message || "解析XML时出现未知错误");
      setParseResult({
        topic: null,
        totalMessages: 0,
        studentMessages: 0,
        robotMessages: 0,
        studentAuthorsCount: 0,
        status: 'error',
        errorMsg: err.message || "解析XML错误",
        replyIntegrity: false,
        messages: []
      });
    }
  };

  // ---------------------------------------------------------
  // 2. Action Handlers
  // ---------------------------------------------------------
  const handleLoadSampleData = () => {
    if (en) {
      handleParseXML(SAMPLE_XML_DATA_EN);
      return;
    }
    if (courseType === 'programming_learning') {
      handleParseXML(SAMPLE_XML_DATA_PROGRAMMING);
    } else if (courseType === 'discipline_frontier') {
      handleParseXML(SAMPLE_XML_DATA_FRONTIER);
    } else {
      handleParseXML(SAMPLE_XML_DATA);
    }
  };

  const handleClear = () => {
    setXmlText("");
    setParseResult(null);
    setParsingError(null);
    setAnalysisResult(null);
    setAnalysisError(null);
    setLlmWarning(null);
    setActiveBubble(null);
    setActiveLevel3Filter(null);
    setSelectedContextMsg(null);
    setPartialExperiment(null);
    setAppState('unparsed');
  };

  const handleCourseChange = (newCourse: string) => {
    if (courseType === newCourse) return;
    
    if (parseResult || analysisResult) {
      const confirmed = window.confirm(
        en ? "Changing the course type clears the current XML and analysis results. Continue?" : "切换课程类型将会清除当前已上传的 XML 数据及相关的微观分析结果。确定要切换吗？"
      );
      if (!confirmed) return;
    }
    
    handleClear();
    setCourseType(newCourse);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          handleParseXML(event.target.result as string);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          handleParseXML(event.target.result as string);
        }
      };
      reader.readAsText(file);
    }
  };

  // Run cognitive coding with the configured LLM
  const handleStartCoding = async () => {
    if (!parseResult) return;
    if (parseResult.studentMessages === 0) {
      setAnalysisError(en ? "This discussion contains no student messages to code." : "当前讨论中没有可编码的学生发言，无法开始实验。");
      return;
    }
    setAppState('analyzing');
    setLlmWarning(null);
    setAnalysisError(null);
    setAnalysisResult(null); // Clear previous results immediately so we don't show stale data!
    setPartialExperiment(null);

    try {
      if (courseType === "" && experimentMethod === "M3" && (!screeningApiKey.trim() || !screeningBaseUrl.trim() || !screeningModel.trim())) {
        throw new Error(en ? "M3 requires a complete, separate judge API key, base URL, and model name." : "M3 必须单独完整填写筛选模型的 API Key、Base URL 和模型名称。");
      }
      // Build request payload
      const commonPayload = {
        discussion_id: parseResult.topic?.id || "topic-default",
        topic: parseResult.topic,
        messages: parseResult.messages,
        language,
      };
      const generationConfig = (llmApiKey || llmBaseUrl || llmModel) ? {
          apiKey: llmApiKey || undefined,
          baseUrl: llmBaseUrl || undefined,
          model: llmModel || undefined,
          temperature: generationTemperature
        } : { temperature: generationTemperature };
      const isSecondaryExperiment = courseType === "";
      const payload = isSecondaryExperiment ? {
        ...commonPayload,
        experiment_method: "M3",
        generationModelConfig: generationConfig,
        screeningModelConfig: experimentMethod === "M3" ? {
          apiKey: screeningApiKey || undefined,
          baseUrl: screeningBaseUrl || undefined,
          model: screeningModel || undefined,
          temperature: screeningTemperature
        } : undefined
      } : {
        ...commonPayload,
        course_type: courseType,
        customLLM: generationConfig
      };

      const response = await fetch(isSecondaryExperiment ? "/api/secondary-experiment" : "/api/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let errMsg = `分析失败：服务器返回状态码 ${response.status}`;
        try {
          const errJson = await response.json();
          if (errJson && errJson.error) {
            errMsg = errJson.error;
          }
          if (errJson?.experiment_run_id && errJson?.export_urls) {
            setPartialExperiment({ experiment_run_id: errJson.experiment_run_id, export_urls: errJson.export_urls, saved_candidate_count: Number(errJson.saved_candidate_count || 0) });
          }
        } catch (e) {
          // ignore
        }
        throw new Error(errMsg);
      }

      const result: AnalysisResponse = await response.json();
      setAnalysisResult(result);
      if (result.course_type === "secondary_only") setStatsTab("level2");
      if (result.warning) {
        setLlmWarning(result.warning);
      }
      setAppState('completed');
      
      // Default to select first non-zero code to view evidence
      const freq = getFrequencyMap(result.coding_results);
      const firstActiveCode = Object.keys(freq).find(k => freq[k] > 0);
      if (firstActiveCode) {
        setActiveBubble(firstActiveCode);
      } else {
        setActiveBubble("T-DP");
      }

    } catch (err: any) {
      console.error(err);
      setAnalysisError(err.message || "大模型分析接口请求失败，请检查网络连接或 API 设置后重试。");
      setAppState('parsed');
      setAnalysisResult(null);
    }
  };

  // ---------------------------------------------------------
  // 3. Analytics Computations & Maps
  // ---------------------------------------------------------
  const getFrequencyMap = (results: CodingResult[]) => {
    const map: Record<string, number> = {};
    const allCodes = [
      "T-DP", "T-AQ", "E-UD", "E-RV", "E-BE", "E-BP",
      "I-JA", "I-JD", "I-JHP", "I-JHE", "I-CS", "R-AT"
    ];
    for (const c of allCodes) {
      map[c] = 0;
    }
    for (const res of results) {
      for (const c of res.codes) {
        if (allCodes.includes(c.code)) {
          map[c.code] = (map[c.code] || 0) + 1;
        }
      }
    }
    return map;
  };

  const frequencyMap = useMemo<Record<string, number>>(() => {
    if (!analysisResult) return {};
    return getFrequencyMap(analysisResult.coding_results);
  }, [analysisResult]);

  const level3FrequencyMap = useMemo<Record<string, number>>(() => {
    if (!analysisResult) return {};
    const map: Record<string, number> = {};
    const course = analysisResult.course_type || courseType || "";
    if (!course) return {};
    const currentCourseConfig = COURSE_CONFIGS[course as 'information_technology_pedagogy' | 'programming_learning' | 'discipline_frontier'];
    if (!currentCourseConfig) return {};
    
    currentCourseConfig.thirdLevelCodebook.forEach(item => {
      map[item.code] = 0;
    });
    
    analysisResult.coding_results.forEach(res => {
      const l3Codes = res.level_3_codes || [];
      l3Codes.forEach(item => {
        map[item.code] = (map[item.code] || 0) + 1;
      });
    });
    return map;
  }, [analysisResult, courseType]);

  // Total student messages (for percentages)
  const studentMsgsCount = useMemo(() => {
    if (!parseResult) return 0;
    return parseResult.messages.filter(m => m.author_role === "同学").length;
  }, [parseResult]);

  // Aggregate stats per main category
  const stageCounts = useMemo(() => {
    const counts = { Triggering: 0, Exploration: 0, Integration: 0, Resolution: 0 };
    if (!frequencyMap) return counts;

    Object.entries(uiCodebook).forEach(([code, detail]) => {
      const freq = frequencyMap[code] || 0;
      if (detail.stage_code === "Triggering") counts.Triggering += freq;
      if (detail.stage_code === "Exploration") counts.Exploration += freq;
      if (detail.stage_code === "Integration") counts.Integration += freq;
      if (detail.stage_code === "Resolution") counts.Resolution += freq;
    });
    return counts;
  }, [frequencyMap, language]);

  // Clicked bubble or level 3 code evidence list
  const activeEvidences = useMemo(() => {
    if (!analysisResult) return [];
    const list: Array<{
      msgId: string;
      author: string;
      parentId: string;
      originalContent: string;
      evidence: string;
      reason?: string;
      otherCodes: string[];
      level3Codes?: Level3CodingItem[];
    }> = [];

    if (activeBubble) {
      analysisResult.coding_results.forEach(res => {
        const matchCode = res.codes.find(c => c.code === activeBubble);
        if (matchCode) {
          const origMsg = parseResult?.messages.find(m => m.id === res.message_id);
          const otherCodesList = res.codes.filter(c => c.code !== activeBubble).map(c => c.code);
          const evidenceItems = matchCode.evidence_items?.length
            ? matchCode.evidence_items
            : [{ evidence: matchCode.evidence, reason: matchCode.reason }];
          evidenceItems.forEach(pair => list.push({
              msgId: res.message_id,
              author: res.author,
              parentId: origMsg?.parent_id || "",
              originalContent: origMsg?.content || "",
              evidence: pair.evidence,
              reason: pair.reason,
              otherCodes: otherCodesList,
              level3Codes: res.level_3_codes
            }));
        }
      });
    } else if (activeLevel3Filter) {
      analysisResult.coding_results.forEach(res => {
        const matchLevel3 = res.level_3_codes?.find(l => l.code === activeLevel3Filter);
        if (matchLevel3) {
          const origMsg = parseResult?.messages.find(m => m.id === res.message_id);
          const otherCodesList = res.codes.map(c => c.code);
          list.push({
            msgId: res.message_id,
            author: res.author,
            parentId: origMsg?.parent_id || "",
            originalContent: origMsg?.content || "",
            evidence: matchLevel3.evidence,
            reason: matchLevel3.reason,
            otherCodes: otherCodesList,
            level3Codes: res.level_3_codes
          });
        }
      });
    } else {
      // Show all
      analysisResult.coding_results.forEach(res => {
        const origMsg = parseResult?.messages.find(m => m.id === res.message_id);
        const otherCodesList = res.codes.map(c => c.code);
        list.push({
          msgId: res.message_id,
          author: res.author,
          parentId: origMsg?.parent_id || "",
          originalContent: origMsg?.content || "",
          evidence: origMsg?.content || "",
          otherCodes: otherCodesList,
          level3Codes: res.level_3_codes
        });
      });
    }
    return list;
  }, [analysisResult, activeBubble, activeLevel3Filter, parseResult]);

  const getExportFileBaseName = () => {
    if (!analysisResult) return en ? "coding_data" : "编码数据";
    const analyzedCourse = analysisResult.course_type || courseType;
    const courseName = analyzedCourse === "secondary_only"
      ? `${en ? "cognitive_coding_experiment" : "二级编码实验"}_${analysisResult.experiment_method || experimentMethod}`
      : en ? analyzedCourse : COURSE_CONFIGS[analyzedCourse as keyof typeof COURSE_CONFIGS]?.label || "未命名课程";
    const modelName = analysisResult.model_name || llmModel || (en ? "unnamed_model" : "未命名模型");
    const sanitizeFileNamePart = (value: string) =>
      value
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
        .replace(/\s+/g, "_")
        .replace(/[. ]+$/g, "") || (en ? "unnamed" : "未命名");
    const recordedGenerationTemperature = analysisResult.experiment_metadata?.generation_config?.temperature ?? generationTemperature;
    const recordedScreeningTemperature = analysisResult.experiment_metadata?.screening_config?.temperature ?? screeningTemperature;
    const temperatureSuffix = analysisResult.experiment_method
      ? `_${en ? "generator" : "生成"}T${sanitizeFileNamePart(String(recordedGenerationTemperature))}${analysisResult.experiment_method === "M3" ? `_${en ? "judge" : "筛选"}T${sanitizeFileNamePart(String(recordedScreeningTemperature))}` : ""}`
      : "";
    return `${sanitizeFileNamePart(courseName)}_${sanitizeFileNamePart(modelName)}${temperatureSuffix}`.slice(0, 180);
  };

  // Export results as JSON file
  const handleExportJSON = () => {
    if (!analysisResult) return;
    const exportPayload = {
      metadata: {
        api_provider: analysisResult.api_provider || (en ? "unknown" : "未知"),
        model_name: analysisResult.model_name || llmModel || (en ? "unknown" : "未知"),
        prompt_version: analysisResult.prompt_version || (en ? "not_recorded" : "未记录"),
        generated_at: analysisResult.generated_at || new Date().toISOString(),
        experiment_method: analysisResult.experiment_method,
        experiment_metadata: analysisResult.experiment_metadata
      },
      raw_model_output: analysisResult.raw_model_output ?? null,
      validated_result: {
        discussion_id: analysisResult.discussion_id,
        course_type: analysisResult.course_type,
        coding_results: analysisResult.coding_results,
        warning: analysisResult.warning
      },
      validation_issues: analysisResult.validation_issues || []
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${getExportFileBaseName()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadExperimentArtifact = (kind: 'json' | 'candidates.csv' | 'labels.csv') => {
    const runId = analysisResult?.experiment_metadata?.experiment_run_id || partialExperiment?.experiment_run_id;
    if (!runId) return;
    const href = kind === 'json'
      ? `/api/secondary-experiments/${runId}`
      : `/api/secondary-experiments/${runId}/export/${kind}`;
    const a = document.createElement("a");
    a.href = href;
    a.download = `${getExportFileBaseName()}_${kind === 'json' ? (en ? 'full_experiment.json' : '完整实验.json') : kind === 'candidates.csv' ? (en ? 'candidate_level.csv' : '候选级.csv') : (en ? 'label_level.csv' : '标签级.csv')}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Export results as detailed CSV table mapping each message
  const handleExportCSV = () => {
    if (!analysisResult || !parseResult) return;
    
    // Header columns
    const headers = en
      ? ["Message ID", "Parent ID", "Author", "Role", "Message content", "Level 2 cognitive codes", "Level 2 code count", "Level 3 course codes", "Evidence and reasoning details"]
      : ["帖子ID (Message ID)", "父帖子ID (Parent ID)", "发言人姓名 (Author)", "角色 (Role)", "发言原文 (Content)", "二级认知存在微观编码 (Level 2 Cognitive Codes)", "二级编码数量 (Level 2 Code Count)", "三级课程特有微观编码 (Level 3 Course Codes)", "详细证据与理由分析 (Evidence & Reasoning Details)"];

    const rows = parseResult.messages.map(msg => {
      const codeResult = analysisResult.coding_results.find(r => r.message_id === msg.id);
      const role = en
        ? (msg.author_role === "同学" ? "Student" : msg.author_role === "教师" ? "Teacher" : "Robot")
        : (msg.author_role === "同学" ? "学生" : msg.author_role === "教师" ? "教师" : "机器人");
      
      const codesStr = codeResult ? codeResult.codes.map(c => c.code).join(", ") : "";
      const codeCount = codeResult ? codeResult.codes.length : 0;
      
      const level3CodesStr = codeResult && codeResult.level_3_codes
        ? codeResult.level_3_codes.map(l => `${l.code}(${l.name})`).join(", ")
        : "";

      const detailsStr = codeResult
        ? [
            ...codeResult.codes.flatMap(c => {
              const pairs = c.evidence_items?.length ? c.evidence_items : [{ evidence: c.evidence, reason: c.reason }];
              return pairs.map((pair, index) =>
                en
                  ? `[Level 2 ${c.code}${pairs.length > 1 ? ` · Evidence ${index + 1}` : ""}] Evidence: "${pair.evidence}" | Reason: ${pair.reason}`
                  : `[二级 ${c.code}${pairs.length > 1 ? ` · 证据${index + 1}` : ""}] 证据: "${pair.evidence}" | 理由: ${pair.reason}`
              );
            }),
            ...(codeResult.level_3_codes || []).map(c =>
              en ? `[Level 3 ${c.code}] Evidence: "${c.evidence}" | Reason: ${c.reason}` : `[三级 ${c.code}] 证据: "${c.evidence}" | 理由: ${c.reason}`
            )
          ].join("\n")
        : "";

      return [
        msg.id,
        msg.parent_id || "",
        msg.author,
        role,
        msg.content,
        codesStr,
        codeCount,
        level3CodesStr,
        detailsStr
      ];
    });

    // Convert to CSV string with RFC-4180 standard escaping
    const escapeCSVCell = (val: any) => {
      let str = val === null || val === undefined ? "" : String(val);
      // Replace double quotes with two double quotes, and wrap in double quotes if there are commas, double quotes, or newlines
      if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        str = `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent = "\uFEFF" + [ // Add UTF-8 BOM for Excel compatibility with Chinese characters
      headers.map(escapeCSVCell).join(","),
      ...rows.map(row => row.map(escapeCSVCell).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${getExportFileBaseName()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Interactive Bubble Chart Coordinates Placement Config
  // Coordinates are designed to place bubbles beautifully inside their quadrant boxes:
  // Center is (300, 300) in 600x600 viewBox
  const bubbleChartData = [
    // Quadrant I: Triggering Event (触发事件) - Top-Right (X: 300~600, Y: 0~300)
    { code: "T-DP", x: 400, y: 190, stage: "触发事件", stage_code: "Triggering", color: "from-blue-400 to-blue-500", bgLight: "bg-blue-50", stroke: "stroke-blue-400" },
    { code: "T-AQ", x: 500, y: 100, stage: "触发事件", stage_code: "Triggering", color: "from-blue-400 to-blue-500", bgLight: "bg-blue-50", stroke: "stroke-blue-400" },
    
    // Quadrant II: Exploration (探索) - Top-Left (X: 0~300, Y: 0~300)
    { code: "E-UD", x: 190, y: 200, stage: "探索", stage_code: "Exploration", color: "from-amber-400 to-amber-500", bgLight: "bg-amber-50", stroke: "stroke-amber-400" },
    { code: "E-RV", x: 110, y: 220, stage: "探索", stage_code: "Exploration", color: "from-amber-400 to-amber-500", bgLight: "bg-amber-50", stroke: "stroke-amber-400" },
    { code: "E-BE", x: 90, y: 100, stage: "探索", stage_code: "Exploration", color: "from-amber-400 to-amber-500", bgLight: "bg-amber-50", stroke: "stroke-amber-400" },
    { code: "E-BP", x: 200, y: 90, stage: "探索", stage_code: "Exploration", color: "from-amber-400 to-amber-500", bgLight: "bg-amber-50", stroke: "stroke-amber-400" },
    
    // Quadrant III: Integration (整合) - Bottom-Left (X: 0~300, Y: 300~600)
    { code: "I-JA", x: 190, y: 410, stage: "整合", stage_code: "Integration", color: "from-emerald-400 to-emerald-500", bgLight: "bg-emerald-50", stroke: "stroke-emerald-400" },
    { code: "I-JD", x: 100, y: 390, stage: "整合", stage_code: "Integration", color: "from-emerald-400 to-emerald-500", bgLight: "bg-emerald-50", stroke: "stroke-emerald-400" },
    { code: "I-JHP", x: 80, y: 480, stage: "整合", stage_code: "Integration", color: "from-emerald-400 to-emerald-500", bgLight: "bg-emerald-50", stroke: "stroke-emerald-400" },
    { code: "I-JHE", x: 150, y: 510, stage: "整合", stage_code: "Integration", color: "from-emerald-400 to-emerald-500", bgLight: "bg-emerald-50", stroke: "stroke-emerald-400" },
    { code: "I-CS", x: 230, y: 470, stage: "整合", stage_code: "Integration", color: "from-emerald-400 to-emerald-500", bgLight: "bg-emerald-50", stroke: "stroke-emerald-400" },
    
    // Quadrant IV: Resolution (解决) - Bottom-Right (X: 300~600, Y: 300~600)
    { code: "R-AT", x: 450, y: 450, stage: "解决", stage_code: "Resolution", color: "from-violet-400 to-violet-500", bgLight: "bg-violet-50", stroke: "stroke-violet-400" },
  ];

  const getOriginalAuthorName = (authorName: string) => authorName;

  const statusText = useMemo(() => {
    switch (appState) {
      case 'unparsed': return en ? "Waiting for import" : "等待导入";
      case 'parsed': return en ? "Data parsed" : "数据已解析";
      case 'analyzing': return en ? "Coding..." : "正在编码...";
      case 'completed': return en ? "Analysis complete" : "分析完成";
      default: return en ? "Ready" : "正常";
    }
  }, [appState, en]);

  const statusColor = useMemo(() => {
    switch (appState) {
      case 'unparsed': return "bg-amber-400";
      case 'parsed': return "bg-blue-500";
      case 'analyzing': return "bg-blue-500 animate-pulse";
      case 'completed': return "bg-emerald-500";
      default: return "bg-slate-400";
    }
  }, [appState]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col transition-colors duration-200 select-none">
      
      {/* 1. Scholarly Top Bar */}
      <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center text-white font-bold shrink-0">C</div>
          <div>
            <h1 className="text-sm sm:text-base md:text-lg font-semibold tracking-tight text-slate-900 flex items-center gap-2" id="app-title">
              {en ? "CSCL Cognitive Coding Experiment System" : "CSCL 讨论帖认知编码实验系统"}
              <span className="text-xs font-normal text-slate-400 ml-1">Bilingual Edition</span>
            </h1>
            <p className="text-xs text-slate-500 hidden md:block">
              {en ? "LLM-as-a-Judge Best-of-N Selection for cognitive-presence analysis" : "基于认知存在 Codebook 的 LLM-as-a-Judge Best-of-N 筛选平台"}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs">
            <span className={`w-2.5 h-2.5 rounded-full ${statusColor}`}></span>
            <span className="text-slate-500 font-medium">{en ? "Status" : "系统状态"}: {statusText}</span>
          </div>

          <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold" aria-label="Language switcher">
            <button type="button" onClick={() => setLanguage('zh')} className={`px-2 py-1 rounded ${!en ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'}`}>中文</button>
            <button type="button" onClick={() => setLanguage('en')} className={`px-2 py-1 rounded ${en ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'}`}>EN</button>
          </div>

          <button
            onClick={() => setShowLlmSettings(!showLlmSettings)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all flex items-center gap-1.5 ${
              showLlmSettings || llmApiKey 
                ? "bg-indigo-50 border-indigo-200 text-indigo-700" 
                : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
            }`}
            title={en ? "LLM API and connection settings" : "大模型API与连接设置"}
            id="btn-settings"
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{en ? "Model settings" : "模型设置"}</span>
          </button>
          
          {appState !== 'unparsed' && (
            <button
              onClick={handleClear}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-md border border-slate-300 transition-colors flex items-center gap-1.5"
              id="btn-reset-top"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>{en ? "Reset" : "重置"}</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">

        {/* 2. API Settings Expandable Panel */}
        <AnimatePresence>
          {showLlmSettings && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-white border border-indigo-100 rounded-xl shadow-sm overflow-hidden"
              id="llm-settings-card"
            >
              <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Settings className="h-5 w-5 text-indigo-600" />
                  <h3 className="font-semibold text-slate-900 text-sm">{en ? "LLM connection and credentials" : "大模型连接与密钥配置"}</h3>
                </div>
                <button 
                  onClick={() => setShowLlmSettings(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1.5">
                    {en ? "API base URL" : "API 基础端点"} (LLM_BASE_URL)
                  </label>
                  <input
                    type="text"
                    value={llmBaseUrl}
                    onChange={(e) => setLlmBaseUrl(e.target.value)}
                    placeholder={en ? "Example: https://api.openai.com/v1" : "例如: https://api.openai.com/v1"}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    id="input-base-url"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1.5">
                    {en ? "API key" : "API 访问密钥"} (LLM_API_KEY)
                  </label>
                  <input
                    type="password"
                    value={llmApiKey}
                    onChange={(e) => setLlmApiKey(e.target.value)}
                    placeholder={en ? "Enter an OpenAI-compatible API key" : "输入 OpenAI / DeepSeek / 通义千问的 API Key"}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    id="input-api-key"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1.5">
                    {en ? "Model name" : "模型名称"} (LLM_MODEL)
                  </label>
                  <input
                    type="text"
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    placeholder={en ? "Example: gpt-4o-mini or deepseek-chat" : "例如: gpt-4o-mini 或 deepseek-chat"}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    id="input-model-name"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* =========================================================
            STATE 1: UNPARSED STATE (Import XML)
            ========================================================= */}
        {appState === 'unparsed' && (
          <div className="flex flex-col gap-6 animate-fadeIn" id="state-unparsed-view">
            
            {/* 1. Course Type Selection cards */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
              <div className="flex items-center space-x-2 text-slate-900 font-semibold mb-4 border-b border-slate-100 pb-3">
                <Target className="h-5 w-5 text-indigo-600" />
                <span>{en ? "Select a discussion-course type (optional third-level coding)" : "选择讨论课程类型以开启三级编码（可选）"}</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <button
                  type="button"
                  onClick={() => handleCourseChange('information_technology_pedagogy')}
                  className={`p-5 rounded-xl border text-left transition-all relative overflow-hidden ${
                    courseType === 'information_technology_pedagogy'
                      ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-600/15'
                      : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50/30'
                  }`}
                  id="course-card-it"
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-2.5 rounded-lg shrink-0 transition-colors ${
                      courseType === 'information_technology_pedagogy' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      <FileCode className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-sm text-slate-900 mb-1 flex items-center justify-between">
                        <span>{en ? "1. Information Technology Pedagogy" : "1. 信息技术教学法"}</span>
                        {courseType === 'information_technology_pedagogy' && (
                          <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-md font-normal">{en ? "Selected" : "已选定"}</span>
                        )}
                      </h4>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {en ? "For technology-enhanced instructional design, TPACK, teaching strategies, and subject-context integration. Adds TPACK-specific third-level codes." : "适用于信息化教学设计、TPACK 框架、教学策略与学科情境融合编码。三级编码自动匹配 TPACK 专属认知维度（EDU-TK等）。"}
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleCourseChange('programming_learning')}
                  className={`p-5 rounded-xl border text-left transition-all relative overflow-hidden ${
                    courseType === 'programming_learning'
                      ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-600/15'
                      : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50/30'
                  }`}
                  id="course-card-prog"
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-2.5 rounded-lg shrink-0 transition-colors ${
                      courseType === 'programming_learning' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      <Database className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-sm text-slate-900 mb-1 flex items-center justify-between">
                        <span>{en ? "2. Programming Learning" : "2. 编程学习"}</span>
                        {courseType === 'programming_learning' && (
                          <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-md font-normal">{en ? "Selected" : "已选定"}</span>
                        )}
                      </h4>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {en ? "For collaborative discussions of computational thinking, programming concepts, and practices such as debugging, reuse, and abstraction." : "适用于计算思维、代码概念（条件、循环、数据等）、计算实践（调试、复用、抽象）的协作讨论。三级编码匹配编程专属微观维度。"}
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleCourseChange('discipline_frontier')}
                  className={`p-5 rounded-xl border text-left transition-all relative overflow-hidden ${
                    courseType === 'discipline_frontier'
                      ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-600/15'
                      : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50/30'
                  }`}
                  id="course-card-front"
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-2.5 rounded-lg shrink-0 transition-colors ${
                      courseType === 'discipline_frontier' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      <Presentation className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-sm text-slate-900 mb-1 flex items-center justify-between">
                        <span>{en ? "3. Disciplinary Frontier Presentation" : "3. 学科前沿展示"}</span>
                        {courseType === 'discipline_frontier' && (
                          <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-md font-normal">{en ? "Selected" : "已选定"}</span>
                        )}
                      </h4>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {en ? "For group collaboration in frontier-topic presentations, with challenge and coping-strategy third-level dimensions." : "适用于学术前沿课题汇报、展示汇报场景中的小组协作分析。三级编码自动匹配“挑战”与“应对策略”专属微观维度。"}
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleCourseChange('')}
                  className={`p-5 rounded-xl border text-left transition-all relative overflow-hidden ${
                    courseType === ''
                      ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-600/15'
                      : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50/30'
                  }`}
                  id="course-card-none"
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-2.5 rounded-lg shrink-0 transition-colors ${
                      courseType === '' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      <HelpCircle className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-sm text-slate-900 mb-1 flex items-center justify-between">
                        <span>4. M3. LLM-as-a-Judge Best-of-N Selection</span>
                        {courseType === '' && (
                          <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-md font-normal">{en ? "Selected" : "已选定"}</span>
                        )}
                      </h4>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {en ? "Generate three independent second-level coding candidates and use a separate LLM judge to select the best complete candidate." : "生成三套独立的二级认知编码候选，再由独立的大模型评审选择质量最高的完整候选。"}
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {courseType === '' && (
              <div className="bg-white border border-indigo-200 rounded-xl p-6 shadow-xs" id="secondary-experiment-settings">
                <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
                  <Search className="h-5 w-5 text-indigo-600" />
                  <div>
                    <h3 className="font-semibold text-slate-900 text-sm">M3. LLM-as-a-Judge Best-of-N Selection</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{en ? "Three independent candidates are generated for the same batch; a separate judge selects one complete candidate. Generator and judge temperatures are configured and recorded separately." : "同一批次独立生成三套候选，再由独立筛选模型选择一套完整候选；生成与筛选 temperature 分别设置并记录。"}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <label className="block text-xs font-semibold text-slate-700">{en ? "Generator temperature" : "生成模型 temperature"}
                    <input type="number" min="0" max="2" step="0.1" value={generationTemperature} onChange={event => setGenerationTemperature(Number(event.target.value))} className="mt-1.5 w-full max-w-48 px-3 py-2 bg-white border border-slate-200 rounded-lg" />
                  </label>
                </div>

                {experimentMethod === 'M3' && (
                  <div className="mt-4 border border-amber-200 bg-amber-50/40 rounded-xl p-4">
                    <h4 className="text-sm font-bold text-slate-900 mb-1">{en ? "Independent judge configuration" : "独立筛选模型配置"}</h4>
                    <p className="text-[11px] text-slate-500 mb-3">{en ? "Stored and transmitted separately from the generator; the API key remains only in this browser-tab session." : "与生成模型分别保存和传输；API Key 只保存在当前浏览器标签会话中。"}</p>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <label className="text-xs text-slate-700">Base URL
                        <input value={screeningBaseUrl} onChange={event => setScreeningBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-lg" />
                      </label>
                      <label className="text-xs text-slate-700">API Key
                        <input type="password" value={screeningApiKey} onChange={event => setScreeningApiKey(event.target.value)} placeholder={en ? "Judge API key" : "筛选模型 API Key"} className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-lg" />
                      </label>
                      <label className="text-xs text-slate-700">{en ? "Model name" : "模型名称"}
                        <input value={screeningModel} onChange={event => setScreeningModel(event.target.value)} placeholder={en ? "Example: gpt-4o-mini" : "例如 gpt-4o-mini"} className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-lg" />
                      </label>
                      <label className="text-xs text-slate-700">temperature
                        <input type="number" min="0" max="2" step="0.1" value={screeningTemperature} onChange={event => setScreeningTemperature(Number(event.target.value))} className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-lg" />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* XML Upload and Preview Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 transition-all duration-300 relative">
              
              {/* Input Box Column */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col flex-1 min-h-[480px]">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2 text-slate-900 font-semibold">
                      <FileCode className="h-5 w-5 text-indigo-600" />
                      <span>{en ? "Import CSCL discussion XML" : "导入 CSCL 讨论帖 XML 数据"}</span>
                    </div>
                    <button
                      onClick={handleLoadSampleData}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 cursor-pointer"
                      id="btn-load-sample"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>{en ? "Load English test data" : "加载测试数据"}</span>
                    </button>
                  </div>

                  {/* Drag and Drop Zone */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleFileDrop}
                    className={`flex-1 border-2 border-dashed rounded-xl p-4 flex flex-col transition-all ${
                      isDragging
                        ? "border-indigo-500 bg-indigo-50/50" 
                        : "border-slate-200 bg-slate-50/50 hover:bg-slate-50"
                    }`}
                  >
                    <textarea
                      value={xmlText}
                      onChange={(e) => {
                        setXmlText(e.target.value);
                        if (parsingError) setParsingError(null);
                      }}
                      placeholder={en ? "Paste valid discussion XML here, or drag an XML file into this area..." : "请将符合讨论帖标准的 XML 数据粘贴到此处，或拖拽 XML 文件到本区域..."}
                      className="w-full flex-1 bg-transparent resize-none focus:outline-hidden text-xs font-mono leading-relaxed text-slate-700 placeholder-slate-400"
                      id="textarea-xml-input"
                    />
                    
                    {/* File selector trigger */}
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <span>{en ? "Drag and drop an XML file or paste XML directly" : "支持拖放 XML 文件或直接粘贴代码"}</span>
                      <button
                        onClick={() => { fileInputRef.current?.click(); }}
                        className="px-3 py-1.5 border rounded-lg font-medium transition-all flex items-center space-x-1.5 border-slate-200 hover:bg-white text-slate-700 bg-slate-50 cursor-pointer"
                        id="btn-select-file"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        <span>{en ? "Upload XML file" : "上传 XML 文件"}</span>
                      </button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        accept=".xml"
                        className="hidden"
                      />
                    </div>
                  </div>

                  {/* Error Box */}
                  {parsingError && (
                    <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-start space-x-2" id="parse-error-box">
                      <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">{en ? "XML validation error:" : "XML 解析校验错误："}</span> {parsingError}
                      </div>
                    </div>
                  )}

                  {/* Button Panel */}
                  <div className="mt-4 flex items-center justify-end space-x-3">
                    {xmlText && (
                      <button
                        onClick={handleClear}
                        className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-medium transition-all"
                        id="btn-clear-input"
                      >
                        {en ? "Clear" : "清空"}
                      </button>
                    )}
                    <button
                      onClick={() => handleParseXML(xmlText)}
                      disabled={!xmlText}
                      className={`px-5 py-2.5 rounded-lg text-xs font-semibold shadow-xs flex items-center space-x-2 transition-all ${
                        xmlText
                          ? "bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer" 
                          : "bg-slate-200 text-slate-400 cursor-not-allowed"
                      }`}
                      id="btn-parse-xml"
                    >
                      <Play className="h-3.5 w-3.5" />
                      <span>{en ? "Parse XML and preview" : "解析 XML 并查看预览"}</span>
                    </button>
                  </div>
                </div>
              </div>

            {/* Codebook Quick Guideline Column */}
            <div className="flex flex-col gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex-1">
                <div className="flex items-center space-x-2 text-slate-900 font-semibold mb-4 border-b border-slate-100 pb-3">
                  <HelpCircle className="h-5 w-5 text-indigo-600" />
                  <span>Cognitive Presence Codebook (LLM)</span>
                </div>
                
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  {en ? "The system uses the Cognitive Presence framework with four phases and 12 second-level cognitive-behavior codes." : "系统采用学术界标准的认知存在（Cognitive Presence）二维编码方案，包含 4 个核心阶段与 12 个微观认知行为二级编码。"}
                </p>

                {/* Micro Codebook list */}
                <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
                  
                  {/* Triggering Event */}
                  <section className="border-l-2 border-blue-100 pl-3">
                    <h3 className="font-bold text-blue-600 text-xs mb-2">1. {en ? "Triggering Event" : "触发事件 (Triggering)"}</h3>
                    <div className="space-y-1.5 pl-1">
                      <div className="bg-blue-50/40 p-2 rounded-md border border-blue-100/55">
                        <span className="font-mono font-semibold text-blue-700 text-xs mr-2">T-DP</span>
                        <span className="text-xs font-semibold text-slate-800">{uiCodebook['T-DP'].name}</span>
                        <p className="text-[11px] text-slate-500 mt-0.5">{uiCodebook['T-DP'].description}</p>
                      </div>
                      <div className="bg-blue-50/40 p-2 rounded-md border border-blue-100/55">
                        <span className="font-mono font-semibold text-blue-700 text-xs mr-2">T-AQ</span>
                        <span className="text-xs font-semibold text-slate-800">{uiCodebook['T-AQ'].name}</span>
                        <p className="text-[11px] text-slate-500 mt-0.5">{uiCodebook['T-AQ'].description}</p>
                      </div>
                    </div>
                  </section>

                  {/* Exploration */}
                  <section className="border-l-2 border-amber-100 pl-3">
                    <h3 className="font-bold text-amber-600 text-xs mb-2">2. {en ? "Exploration" : "探索 (Exploration)"}</h3>
                    <div className="space-y-1.5 pl-1">
                      <div className="bg-amber-50/40 p-2 rounded-md border border-amber-100/55">
                        <span className="font-mono font-semibold text-amber-700 text-xs mr-2">E-UD</span>
                        <span className="text-xs font-semibold text-slate-800">{uiCodebook['E-UD'].name}</span>
                        <p className="text-[11px] text-slate-500 mt-0.5">{uiCodebook['E-UD'].description}</p>
                      </div>
                      <div className="bg-amber-50/40 p-2 rounded-md border border-amber-100/55">
                        <span className="font-mono font-semibold text-amber-700 text-xs mr-2">E-RV</span>
                        <span className="text-xs font-semibold text-slate-800">{uiCodebook['E-RV'].name}</span>
                        <p className="text-[11px] text-slate-500 mt-0.5">{uiCodebook['E-RV'].description}</p>
                      </div>
                      <div className="bg-amber-50/40 p-2 rounded-md border border-amber-100/55">
                        <span className="font-mono font-semibold text-amber-700 text-xs mr-2">E-BE</span>
                        <span className="text-xs font-semibold text-slate-800">{uiCodebook['E-BE'].name}</span>
                        <p className="text-[11px] text-slate-500 mt-0.5">{uiCodebook['E-BE'].description}</p>
                      </div>
                      <div className="bg-amber-50/40 p-2 rounded-md border border-amber-100/55">
                        <span className="font-mono font-semibold text-amber-700 text-xs mr-2">E-BP</span>
                        <span className="text-xs font-semibold text-slate-800">{uiCodebook['E-BP'].name}</span>
                        <p className="text-[11px] text-slate-500 mt-0.5">{uiCodebook['E-BP'].description}</p>
                      </div>
                    </div>
                  </section>

                  {/* Integration */}
                  <section className="border-l-2 border-emerald-100 pl-3">
                    <h3 className="font-bold text-emerald-600 text-xs mb-2">3. {en ? "Integration" : "整合 (Integration)"}</h3>
                    <div className="space-y-1.5 pl-1">
                      <div className="bg-emerald-50/40 p-2 rounded-md border border-emerald-100/55">
                        <span className="font-mono font-semibold text-emerald-700 text-xs mr-2">I-JA</span>
                        <span className="text-xs font-semibold text-slate-800">{uiCodebook['I-JA'].name}</span>
                        <p className="text-[11px] text-slate-500 mt-0.5">{uiCodebook['I-JA'].description}</p>
                      </div>
                      <div className="bg-emerald-50/40 p-2 rounded-md border border-emerald-100/55">
                        <span className="font-mono font-semibold text-emerald-700 text-xs mr-2">I-JD</span>
                        <span className="text-xs font-semibold text-slate-800">{uiCodebook['I-JD'].name}</span>
                        <p className="text-[11px] text-slate-500 mt-0.5">{uiCodebook['I-JD'].description}</p>
                      </div>
                      <div className="bg-emerald-50/40 p-2 rounded-md border border-emerald-100/55">
                        <span className="font-mono font-semibold text-emerald-700 text-xs mr-2">I-JHP</span>
                        <span className="text-xs font-semibold text-slate-800">{uiCodebook['I-JHP'].name}</span>
                        <p className="text-[11px] text-slate-500 mt-0.5">{uiCodebook['I-JHP'].description}</p>
                      </div>
                      <div className="bg-emerald-50/40 p-2 rounded-md border border-emerald-100/55">
                        <span className="font-mono font-semibold text-emerald-700 text-xs mr-2">I-JHE</span>
                        <span className="text-xs font-semibold text-slate-800">{uiCodebook['I-JHE'].name}</span>
                        <p className="text-[11px] text-slate-500 mt-0.5">{uiCodebook['I-JHE'].description}</p>
                      </div>
                      <div className="bg-emerald-50/40 p-2 rounded-md border border-emerald-100/55">
                        <span className="font-mono font-semibold text-emerald-700 text-xs mr-2">I-CS</span>
                        <span className="text-xs font-semibold text-slate-800">{uiCodebook['I-CS'].name}</span>
                        <p className="text-[11px] text-slate-500 mt-0.5">{uiCodebook['I-CS'].description}</p>
                      </div>
                    </div>
                  </section>

                  {/* Resolution */}
                  <section className="border-l-2 border-violet-100 pl-3">
                    <h3 className="font-bold text-violet-600 text-xs mb-2">4. {en ? "Resolution" : "解决 (Resolution)"}</h3>
                    <div className="space-y-1.5 pl-1">
                      <div className="bg-violet-50/40 p-2 rounded-md border border-violet-100/55">
                        <span className="font-mono font-semibold text-violet-700 text-xs mr-2">R-AT</span>
                        <span className="text-xs font-semibold text-slate-800">{uiCodebook['R-AT'].name}</span>
                        <p className="text-[11px] text-slate-500 mt-0.5">{uiCodebook['R-AT'].description}</p>
                      </div>
                    </div>
                  </section>

                </div>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* =========================================================
            STATE 2: PARSED STATE (Data statistics & Preview table)
            ========================================================= */}
        {appState === 'parsed' && parseResult && (
          <div className="flex flex-col gap-6" id="state-parsed-view">
            
            {/* Warning / Error notification for API failure */}
            {analysisError && (
              <div 
                className="bg-rose-50 border border-rose-200 text-rose-900 rounded-xl p-4 flex items-start gap-3 text-xs shadow-xs" 
                id="analysis-api-error-banner"
              >
                <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-bold block mb-1 text-rose-900">{en ? "LLM analysis request failed" : "提示：大模型分析接口调用失败"}</span>
                  <p className="leading-relaxed text-rose-800">{analysisError}</p>
                  {partialExperiment && (
                    <div className="mt-3 p-3 bg-white/70 border border-rose-200 rounded-lg">
                      <p className="font-semibold">
                        {partialExperiment.saved_candidate_count > 0
                          ? en ? `M3 safely saved ${partialExperiment.saved_candidate_count} candidates: ` : `M3 已安全保存 ${partialExperiment.saved_candidate_count} 条候选：`
                          : en ? 'No M3 candidate was generated; diagnostics were saved: ' : 'M3 尚未生成候选，已保存诊断记录：'}
                        <code>{partialExperiment.experiment_run_id}</code>
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <button onClick={() => downloadExperimentArtifact('json')} className="px-2.5 py-1.5 bg-white border border-rose-200 rounded-md font-semibold">{en ? "Download full experiment JSON" : "下载完整实验 JSON"}</button>
                        <button onClick={() => downloadExperimentArtifact('candidates.csv')} className="px-2.5 py-1.5 bg-white border border-rose-200 rounded-md font-semibold">{en ? "Candidate-level CSV" : "导出候选级 CSV"}</button>
                        <button onClick={() => downloadExperimentArtifact('labels.csv')} className="px-2.5 py-1.5 bg-white border border-rose-200 rounded-md font-semibold">{en ? "Label-level CSV" : "导出标签级 CSV"}</button>
                      </div>
                    </div>
                  )}
                </div>
                <button 
                  onClick={() => setAnalysisError(null)} 
                  className="text-rose-500 hover:text-rose-700 transition-colors p-1"
                  title={en ? "Dismiss" : "关闭提示"}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            
            {/* Dashboard summary stats card */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs grid grid-cols-2 md:grid-cols-6 gap-4 text-center">
              
              <div className="md:col-span-2 text-left border-b md:border-b-0 md:border-r border-slate-100 pb-3 md:pb-0 md:pr-4 flex flex-col justify-center">
                <span className="text-xs text-slate-400 font-medium block mb-1">{en ? "Discussion topic" : "正在分析的讨论主题"}</span>
                <h4 className="text-sm font-semibold text-slate-900 truncate" title={parseResult.topic?.title}>
                  {parseResult.topic?.title}
                </h4>
                <p className="text-[11px] text-slate-500 truncate mt-1">ID: {parseResult.topic?.id}</p>
              </div>

              <div className="border-r border-slate-100">
                <span className="text-[11px] text-slate-400 font-medium block">{en ? "Total messages" : "总消息数量"}</span>
                <strong className="text-2xl font-bold text-slate-800 mt-1 block">{parseResult.totalMessages}</strong>
                <span className="text-[10px] text-slate-400">{en ? "(including robot and teacher)" : "（包含机器人与教师）"}</span>
              </div>

              <div className="border-r border-slate-100">
                <span className="text-[11px] text-indigo-500 font-semibold block">{en ? "Student messages" : "学生发言数"}</span>
                <strong className="text-2xl font-bold text-indigo-600 mt-1 block">{parseResult.studentMessages}</strong>
                <span className="text-[10px] text-indigo-400">{en ? "(coding targets)" : "（需认知编码对象）"}</span>
              </div>

              <div className="border-r border-slate-100">
                <span className="text-[11px] text-slate-400 font-medium block">{en ? "Robot messages" : "机器人发言数"}</span>
                <strong className="text-2xl font-bold text-slate-800 mt-1 block">{parseResult.robotMessages}</strong>
                <span className="text-[10px] text-slate-400">{en ? "(context only)" : "（仅作为语境上下文）"}</span>
              </div>

              <div>
                <span className="text-[11px] text-slate-400 font-medium block">{en ? "Students" : "学生人数"}</span>
                <strong className="text-2xl font-bold text-slate-800 mt-1 block">{parseResult.studentAuthorsCount}</strong>
                <span className="text-[10px] text-slate-400">{en ? "(unique original names)" : "（按原始姓名去重）"}</span>
              </div>
            </div>

            {/* XML parsing validations bar */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex flex-wrap gap-x-6 gap-y-2 items-center">
                <div className="flex items-center space-x-1.5 text-emerald-700 font-semibold">
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  <span>{en ? "Valid XML" : "XML 格式正确"}</span>
                </div>
                <div className="flex items-center space-x-1.5 text-emerald-700 font-semibold">
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  <span>{en ? "Original names retained" : "原始姓名已保留"}</span>
                </div>
                <div className="flex items-center space-x-1.5 text-emerald-700 font-semibold">
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  <span>{en ? "Complete reply links (Parent-ID)" : "回复关联完整 (Parent-ID)"}</span>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={handleClear}
                  className="px-3 py-1.5 border border-slate-200 hover:bg-white text-slate-600 rounded-lg font-medium transition-all"
                  id="btn-reupload-xml"
                >
                  {en ? "Upload another XML" : "重新上传 XML"}
                </button>
                <button
                  onClick={handleStartCoding}
                  disabled={parseResult.studentMessages === 0}
                  title={parseResult.studentMessages === 0 ? "当前讨论中没有学生发言" : undefined}
                  className={`px-5 py-2.5 rounded-lg font-semibold shadow-md flex items-center space-x-1.5 transition-all ${parseResult.studentMessages > 0 ? "bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}
                  id="btn-trigger-coding"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>{en ? "Run M3 Best-of-N coding" : "开始大模型认知存在编码"}</span>
                </button>
              </div>
            </div>

            {/* Structured discussion message list preview */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center space-x-2 font-semibold text-slate-900 text-sm">
                  <Eye className="h-4 w-4 text-indigo-600" />
                  <span>{en ? "Loaded discussion preview (original names and roles)" : "已载入帖子预览 (原始姓名与角色标记)"}</span>
                </div>
                <span className="text-xs text-slate-500 font-mono">{en ? "Every student message is treated as an independent coding unit" : "全部学生发言均将映射为独立的编码单元"}</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 font-semibold uppercase border-b border-slate-200">
                      <th className="p-3 w-20 text-center">{en ? "Message ID" : "消息ID"}</th>
                      <th className="p-3 w-32">{en ? "Author" : "作者姓名"}</th>
                      <th className="p-3 w-24">{en ? "Replies to" : "回复对象"}</th>
                      <th className="p-3 w-40">{en ? "Role and status" : "解析角色与状态"}</th>
                      <th className="p-3">{en ? "Message text" : "帖子正文内容"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    
                    {/* Topic Row Background info */}
                    <tr className="bg-slate-50/50">
                      <td className="p-3 font-mono text-slate-400 text-center">-</td>
                      <td className="p-3 font-semibold text-slate-500">{en ? "Teacher (context)" : "教师 (讨论背景)"}</td>
                      <td className="p-3 font-mono text-slate-400">-</td>
                      <td className="p-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                          {en ? "Topic context · not coded" : "背景提示 · 不编码"}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500 italic">
                        {parseResult.topic?.content}
                      </td>
                    </tr>

                    {/* Messages Rows */}
                    {parseResult.messages.map((msg) => {
                      const isStudent = msg.author_role === "同学";
                      const isTeacher = msg.author_role === "教师";
                      return (
                        <tr 
                          key={msg.id} 
                          className={`hover:bg-slate-50/80 transition-colors ${
                            isStudent ? "bg-indigo-50/10" : ""
                          }`}
                        >
                          <td className="p-3 font-mono font-semibold text-slate-600 text-center">{msg.id}</td>
                          <td className="p-3 flex items-center space-x-1.5 font-medium text-slate-800">
                            {isStudent ? (
                              <User className="h-3.5 w-3.5 text-indigo-500" />
                            ) : isTeacher ? (
                              <BookOpen className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Sparkles className="h-3.5 w-3.5 text-rose-500" />
                            )}
                            <span>{msg.author}</span>
                          </td>
                          <td className="p-3 font-mono text-slate-500">{msg.parent_id || "-"}</td>
                          <td className="p-3">
                            {isStudent ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                {en ? "Student · coding target" : "学生 · 编码对象"}
                              </span>
                            ) : isTeacher ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                {en ? "Teacher · context only" : "教师 · 仅作上下文"}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-medium bg-rose-50 text-rose-700 border border-rose-200/50">
                                {en ? "Robot · context only" : "机器人 · 仅作上下文"}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-slate-700 leading-relaxed font-sans max-w-prose">
                            {msg.content}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================
            STATE 3: ANALYZING STATE (Calling AI Loading)
            ========================================================= */}
        {appState === 'analyzing' && (
          <div className="bg-white border border-slate-200 rounded-xl p-12 shadow-xs text-center flex flex-col items-center justify-center min-h-[400px]" id="state-analyzing-view">
            <Loader2 className="h-10 w-10 text-indigo-600 animate-spin mb-4" />
            <h3 className="text-base font-semibold text-slate-900 mb-2">{en ? "Generating and judging cognitive-presence candidates..." : "正在通过 AI 大模型解析学生发言认知存在..."}</h3>
            
            <p className="text-xs text-slate-500 max-w-md leading-relaxed mb-6">
              {en ? "The system is generating three independent multi-label coding candidates for each student message and asking a separate LLM judge to select the best complete candidate. This may take several minutes." : "系统正在调用服务器端大语言模型对每一名学生的发言生成三套独立的多标签认知编码候选，再由独立筛选模型选择最佳完整候选。请稍候。"}
            </p>

            {/* Model status bar indicator */}
            <div className="w-full max-w-xs bg-slate-100 rounded-full h-1.5 mb-2 overflow-hidden">
              <div className="bg-indigo-600 h-1.5 rounded-full w-2/3 animate-pulse"></div>
            </div>
            
            <div className="text-[11px] text-slate-400 flex items-center space-x-1 mb-6">
              <span>{en ? "Generator model:" : "当前使用模型："}</span>
              <code className="bg-slate-50 px-1.5 py-0.5 border border-slate-200 rounded-xs text-indigo-600">
                {llmModel || (en ? "Configured LLM (for example, gpt-4o-mini)" : "自定义大模型 (如 gpt-4o-mini)")}
              </code>
            </div>

            <button
              onClick={() => setAppState('parsed')}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-medium transition-all"
              id="btn-cancel-analysis"
            >
              {en ? "Cancel and return to preview" : "取消分析并返回预览"}
            </button>
          </div>
        )}

        {/* =========================================================
            STATE 4: ANALYZED COMPLETED STATE (Bubble chart, table, list)
            ========================================================= */}
        {appState === 'completed' && analysisResult && (
          <div className="flex flex-col gap-6" id="state-completed-view">
            
            {/* Warning / Error notification for API failure */}
            {llmWarning && (
              <div 
                className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 flex items-start gap-3 text-xs shadow-xs" 
                id="llm-api-warning-banner"
              >
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-bold block mb-1 text-amber-900">{en ? "Notice: the model returned analysis warnings" : "提示：模型返回了分析提示"}</span>
                  <p className="leading-relaxed text-amber-800">{llmWarning}</p>
                </div>
                <button 
                  onClick={() => setLlmWarning(null)} 
                  className="text-amber-500 hover:text-amber-700 transition-colors p-1"
                  title={en ? "Dismiss" : "关闭提示"}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            
            {/* Top completed stats header info */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
                  <CheckCircle className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm flex flex-col sm:flex-row sm:items-center gap-2">
                    <span>{en ? "Cognitive-presence coding complete" : "讨论帖认知编码分析完成"}</span>
                    {analysisResult.api_provider && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100/50">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                        <span>{en ? "Source" : "数据来源"}: {analysisResult.api_provider}</span>
                        {analysisResult.model_name && (
                          <span className="opacity-75 font-mono">({analysisResult.model_name})</span>
                        )}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {en ? "Discussion ID" : "讨论帖ID"}: <span className="font-mono font-medium">{analysisResult.discussion_id}</span> | {en ? "Fine-grained, multi-label coding of student messages" : "对学生发言进行了微观多标签细粒度归类"}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
                <button
                  onClick={handleClear}
                  className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1 bg-white cursor-pointer"
                  id="btn-restart-completed"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>{en ? "Analyze new XML" : "分析新 XML"}</span>
                </button>
                <button
                  onClick={handleExportJSON}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer"
                  id="btn-export-json"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>{en ? "Export analysis JSON" : "导出完整分析 JSON"}</span>
                </button>
                <button
                  onClick={handleExportCSV}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer"
                  id="btn-export-csv"
                  title={en ? "Export a UTF-8 coding table for Excel or SPSS" : "导出可直接用 Excel/SPSS 打开的 UTF-8 编码数据表格"}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>{en ? "Export coding table (CSV)" : "导出编码数据表 (CSV)"}</span>
                </button>
              </div>
            </div>

            {analysisResult.experiment_method && (
              <div className="bg-white border border-indigo-100 rounded-xl p-5 shadow-xs" id="secondary-experiment-result-summary">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="text-xs text-slate-600 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2">
                    <span><strong>{en ? "Method:" : "实验方法："}</strong>LLM-as-a-Judge Best-of-N Selection</span>
                    <span><strong>{en ? "Generator:" : "生成模型："}</strong>{analysisResult.experiment_metadata?.generator_model || analysisResult.model_name}</span>
                    {analysisResult.experiment_method === 'M3' && <span><strong>{en ? "Judge:" : "筛选模型："}</strong>{analysisResult.experiment_metadata?.screening_model}</span>}
                    <span><strong>{en ? "Prompt:" : "Prompt："}</strong><code>{analysisResult.prompt_version}</code></span>
                    <span><strong>{en ? "Generator temperature:" : "生成 temperature："}</strong>{String(analysisResult.experiment_metadata?.generation_config?.temperature ?? (en ? 'not recorded' : '未记录'))}</span>
                    {analysisResult.experiment_method === 'M3' && <span><strong>{en ? "Judge temperature:" : "筛选 temperature："}</strong>{String(analysisResult.experiment_metadata?.screening_config?.temperature ?? (en ? 'not recorded' : '未记录'))}</span>}
                    {analysisResult.experiment_metadata?.experiment_run_id && <span><strong>{en ? "Run ID:" : "运行ID："}</strong><code>{analysisResult.experiment_metadata.experiment_run_id}</code></span>}
                  </div>
                  {analysisResult.experiment_method === 'M3' && (
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => downloadExperimentArtifact('json')} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold">{en ? "Full experiment JSON" : "下载完整实验 JSON"}</button>
                      <button onClick={() => downloadExperimentArtifact('candidates.csv')} className="px-3 py-2 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-semibold">{en ? "Candidate-level CSV" : "候选级 CSV"}</button>
                      <button onClick={() => downloadExperimentArtifact('labels.csv')} className="px-3 py-2 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-semibold">{en ? "Label-level CSV" : "标签级 CSV"}</button>
                    </div>
                  )}
                </div>
                {analysisResult.experiment_method === 'M3' && (
                  <details className="mt-4 border-t border-slate-100 pt-4">
                    <summary className="cursor-pointer text-sm font-bold text-indigo-700">{en ? "View the three candidates, judge scores, and generation mapping" : "查看三个原始候选、评分与生成轮次映射"}</summary>
                    <div className="mt-4 space-y-4 max-h-[720px] overflow-y-auto pr-1">
                      {Object.entries(
                        (analysisResult.experiment_metadata?.candidate_records || []).reduce<Record<string, M3CandidateRecord[]>>((groups, record) => {
                          (groups[record.message_id] ||= []).push(record);
                          return groups;
                        }, {})
                      ).map(([messageId, records]: [string, M3CandidateRecord[]]) => (
                        <div key={messageId} className="border border-slate-200 rounded-lg p-4">
                          <h4 className="text-sm font-bold text-slate-900 mb-3">{en ? "Message" : "消息"} {messageId} · {records[0]?.author}</h4>
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                            {records.sort((a, b) => a.candidate_alias.localeCompare(b.candidate_alias)).map(record => (
                              <div key={record.generation_id} className={`rounded-lg border p-3 ${record.selected ? 'border-emerald-400 bg-emerald-50/50' : 'border-slate-200 bg-slate-50/50'}`}>
                                <div className="flex items-center justify-between text-xs mb-2">
                                  <strong>{en ? "Candidate" : "候选"} {record.candidate_alias}</strong>
                                  <span className="font-mono text-slate-500">{record.generation_id}</span>
                                </div>
                                <p className="text-[11px] text-slate-500 mb-2">{record.selected ? (en ? '✓ Selected' : '✓ 最终入选') : (en ? 'Not selected' : '未入选')} · {en ? 'Validation' : '验证'} {record.validation_passed ? (en ? 'passed' : '通过') : (en ? 'warning' : '有提示')}</p>
                                {(record.validated_codes || []).length === 0 ? (
                                  <p className="text-xs text-slate-400">codes = []</p>
                                ) : record.validated_codes.map(item => {
                                  const pairs = item.evidence_items?.length ? item.evidence_items : [{ evidence: item.evidence, reason: item.reason }];
                                  return (
                                    <div key={item.code} className="mb-2 text-xs border-t border-slate-200 pt-2">
                                      <strong className="text-indigo-700">{item.code}</strong>
                                      {pairs.map((pair, index) => (
                                        <div key={`${item.code}-${index}`} className="mt-1">
                                          {pairs.length > 1 && <p className="font-semibold text-slate-500">{en ? "Evidence" : "证据"} {index + 1}</p>}
                                          <p className="text-slate-700">{en ? "Evidence:" : "证据："}{pair.evidence}</p>
                                          <p className="mt-1 text-slate-500">{en ? "Reason:" : "理由："}{pair.reason}</p>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })}
                                {record.judge_scores && (
                                  <div className="mt-2 text-[11px] text-slate-600 border-t border-slate-200 pt-2">
                                    <p>{en ? "Definition" : "定义"} {record.judge_scores.definition_match} · {en ? "Evidence" : "证据"} {record.judge_scores.evidence_sufficiency} · {en ? "Coverage" : "覆盖"} {record.judge_scores.coverage_completeness}</p>
                                    <p>{en ? "Precision" : "精确"} {record.judge_scores.coding_precision} · {en ? "Reasoning" : "理由"} {record.judge_scores.reasoning_quality} · {en ? "Total" : "总分"} <strong>{record.judge_scores.total_score}</strong></p>
                                    <p className="mt-1">{record.judge_reason}</p>
                                    {record.selected && record.screening_reason && <p className="mt-1 font-semibold text-emerald-700">{en ? "Selection reason:" : "选择理由："}{record.screening_reason}</p>}
                                  </div>
                                )}
                                <details className="mt-2 text-[11px]">
                                  <summary className="cursor-pointer text-slate-500">{en ? "View raw generation response" : "查看该生成轮次原始返回"}</summary>
                                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap bg-slate-900 text-slate-100 rounded-md p-2">{JSON.stringify(record.raw_model_output ?? record.raw_codes, null, 2)}</pre>
                                </details>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* Two Column Layout: Quad Bubble Chart & Frequency Table */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left Column: Custom SVG Four-Quadrant Bubble Chart (Col-Span 7) */}
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col">
                <div className="mb-4 pb-3 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center space-x-2 font-bold text-slate-900 text-sm">
                    <Target className="h-4 text-indigo-600 w-4" />
                    <span>{en ? "Four-quadrant distribution of cognitive-presence codes" : "认知存在微观编码四象限气泡分布图 (可点击筛选证据)"}</span>
                  </div>
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-sm">
                    {en ? "Bubble area is proportional to frequency" : "气泡面积正比于发言频次"}
                  </span>
                </div>

                {/* SVG Quadrant Canvas Container */}
                <div className="relative aspect-square w-full bg-slate-50/50 rounded-xl overflow-hidden border border-slate-100 max-w-[560px] mx-auto">
                  <svg 
                    viewBox="0 0 600 600" 
                    className="w-full h-full select-none"
                    id="quadrant-bubble-svg"
                  >
                    {/* Quadrant Soft Shaded Backgrounds */}
                    {/* Q2: Top-Left (Exploration) */}
                    <rect x="0" y="0" width="300" height="300" fill="#FFFDF5" opacity="0.6" />
                    {/* Q1: Top-Right (Triggering) */}
                    <rect x="300" y="0" width="300" height="300" fill="#EFF6FF" opacity="0.4" />
                    {/* Q3: Bottom-Left (Integration) */}
                    <rect x="0" y="300" width="300" height="300" fill="#ECFDF5" opacity="0.45" />
                    {/* Q4: Bottom-Right (Resolution) */}
                    <rect x="300" y="300" width="300" height="300" fill="#F5F3FF" opacity="0.45" />

                    {/* Central Grid Cross Axes lines */}
                    <line x1="300" y1="0" x2="300" y2="600" stroke="#E2E8F0" strokeWidth="2" strokeDasharray="3,3" />
                    <line x1="0" y1="300" x2="600" y2="300" stroke="#E2E8F0" strokeWidth="2" strokeDasharray="3,3" />

                    {/* Concentric targets circles to represent scholarly focus */}
                    <circle cx="300" cy="300" r="100" fill="none" stroke="#E2E8F0" strokeWidth="1" strokeDasharray="5,5" opacity="0.5" />
                    <circle cx="300" cy="300" r="200" fill="none" stroke="#E2E8F0" strokeWidth="1" strokeDasharray="5,5" opacity="0.5" />

                    {/* Academic Quadrant Label overlays */}
                    {/* Q2: Exploration */}
                    <text x="20" y="30" fill="#B45309" className="text-[13px] font-bold tracking-wide">{en ? "Q2: Exploration" : "第二象限：探索 Exploration (散性/搜集)"}</text>
                    <text x="20" y="48" fill="#D97706" className="text-[10px] font-semibold opacity-85">{en ? `Codes: E-UD, E-RV, E-BE, E-BP | Total: ${stageCounts.Exploration}` : `二级编码: E-UD, E-RV, E-BE, E-BP | 频次总计: ${stageCounts.Exploration}次`}</text>

                    {/* Q1: Triggering Event */}
                    <text x="580" y="30" fill="#1D4ED8" textAnchor="end" className="text-[13px] font-bold tracking-wide">{en ? "Q1: Triggering Event" : "第一象限：触发事件 Triggering (起步/发现)"}</text>
                    <text x="580" y="48" fill="#2563EB" textAnchor="end" className="text-[10px] font-semibold opacity-85">{en ? `Codes: T-DP, T-AQ | Total: ${stageCounts.Triggering}` : `二级编码: T-DP, T-AQ | 频次总计: ${stageCounts.Triggering}次`}</text>

                    {/* Q3: Integration */}
                    <text x="20" y="565" fill="#047857" className="text-[13px] font-bold tracking-wide">{en ? "Q3: Integration" : "第三象限：整合 Integration (收敛/推论)"}</text>
                    <text x="20" y="582" fill="#059669" className="text-[10px] font-semibold opacity-85">{en ? `Codes: I-JA, I-JD, I-JHP, I-JHE, I-CS | Total: ${stageCounts.Integration}` : `二级编码: I-JA, I-JD, I-JHP, I-JHE, I-CS | 频次总计: ${stageCounts.Integration}次`}</text>

                    {/* Q4: Resolution */}
                    <text x="580" y="565" fill="#6D28D9" textAnchor="end" className="text-[13px] font-bold tracking-wide">{en ? "Q4: Resolution" : "第四象限：解决 Resolution (验证/批判)"}</text>
                    <text x="580" y="582" fill="#7C3AED" textAnchor="end" className="text-[10px] font-semibold opacity-85">{en ? `Codes: R-AT | Total: ${stageCounts.Resolution}` : `二级编码: R-AT | 频次总计: ${stageCounts.Resolution}次`}</text>

                    {/* Render Interactive Bubbles */}
                    {bubbleChartData.map((b) => {
                      const freq = frequencyMap[b.code] || 0;
                      // Size proportional to frequency (area proportional to freq)
                      // Min radius 14, max depends on frequency
                      const radius = freq === 0 ? 14 : 18 + Math.sqrt(freq) * 12;
                      const isSelected = activeBubble === b.code;

                      return (
                        <g 
                          key={b.code}
                          onClick={() => {
                            setActiveBubble(b.code);
                            setActiveLevel3Filter(null);
                          }}
                          className="cursor-pointer group select-none"
                          id={`bubble-g-${b.code}`}
                        >
                          {/* Selection Outer highlight ring pulsing */}
                          {isSelected && (
                            <circle
                              cx={b.x}
                              cy={b.y}
                              r={radius + 7}
                              fill="none"
                              stroke="#6366F1"
                              strokeWidth="2.5"
                              strokeDasharray="4,2"
                              className="animate-spin"
                              style={{ animationDuration: "12s" }}
                            />
                          )}

                          {/* Bubble circle */}
                          <circle
                            cx={b.x}
                            cy={b.y}
                            r={radius}
                            className={`transition-all duration-300 ${
                              freq === 0 
                                ? "fill-slate-100 stroke-slate-300 opacity-40 hover:opacity-75" 
                                : `fill-linear-to-br ${b.color} stroke-2 hover:brightness-105 shadow-sm`
                            } ${b.stroke}`}
                          />

                          {/* Code Codebook Label centered */}
                          <text
                            x={b.x}
                            y={b.y - 1}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill={freq === 0 ? "#64748B" : "#FFFFFF"}
                            className="text-[11px] font-mono font-bold pointer-events-none drop-shadow-xs"
                          >
                            {b.code}
                          </text>

                          {/* Frequency badge slightly below or overlay */}
                          <text
                            x={b.x}
                            y={b.y + 11}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill={freq === 0 ? "#94A3B8" : "rgba(255,255,255,0.95)"}
                            className="text-[9px] font-semibold pointer-events-none"
                          >
                            {freq}{en ? "" : "次"}
                          </text>

                          {/* Sub-code Name Hover Floating Label */}
                          <title>
                            {`${b.code} - ${uiCodebook[b.code].name}\n${en ? "Definition" : "定义"}: ${uiCodebook[b.code].description}\n${en ? "Frequency" : "当前频次"}: ${freq}`}
                          </title>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Bubble chart quick helpers */}
                <div className="mt-4 p-3 bg-slate-50 border border-slate-100 rounded-xl text-[11px] text-slate-500 flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <Info className="h-3.5 w-3.5 text-indigo-500" />
                    <span>{en ? "Select any code bubble to filter its source evidence and reasons." : "提示：点击气泡图中任意二级编码气泡，右下侧证据栏即可精准展示对应的发言原文与论据理由。"}</span>
                  </div>
                  <button 
                    onClick={() => setActiveBubble(null)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-bold shrink-0 ml-2"
                  >
                    {en ? "Show all codes" : "查看全部编码"} ({(Object.values(frequencyMap) as number[]).reduce((a, b) => a + b, 0)}{en ? "" : "条"})
                  </button>
                </div>
              </div>

              {/* Right Column: Frequency Statistics Table (Col-Span 5) */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="mb-4 pb-3 border-b border-slate-100 flex flex-col gap-3">
                    <div className="flex items-center space-x-2 font-bold text-slate-900 text-sm">
                      <Database className="h-4 text-indigo-600 w-4" />
                      <span>{en ? "Frequency and percentage statistics" : "分层频次统计与占比分析"}</span>
                    </div>
                    {/* Tab Switcher Segmented Control */}
                    {(analysisResult?.course_type || courseType) && analysisResult?.course_type !== 'secondary_only' ? (
                      <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs" id="stats-tab-switcher">
                        <button
                          type="button"
                          onClick={() => {
                            setStatsTab('level2');
                            setActiveLevel3Filter(null);
                          }}
                          className={`flex-1 py-1.5 rounded-md font-semibold text-center transition-all cursor-pointer ${
                            statsTab === 'level2'
                              ? 'bg-white text-indigo-700 shadow-xs font-bold'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                          id="tab-btn-level2"
                        >
                          {en ? "Level 2 frequencies" : "二级认知存在频次"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStatsTab('level3');
                            setActiveBubble(null);
                          }}
                          className={`flex-1 py-1.5 rounded-md font-semibold text-center transition-all cursor-pointer ${
                            statsTab === 'level3'
                              ? 'bg-white text-indigo-700 shadow-xs font-bold'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                          id="tab-btn-level3"
                        >
                          {en ? "Level 3 frequencies" : "课程三级微观频次"}
                        </button>
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-150 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5 text-slate-400" />
                        <span>{en ? <>Selected <strong>M3 Best-of-N</strong> mode (second-level cognitive-presence coding)</> : <>已选择 <strong>M3 Best-of-N</strong> 模式（仅分析并展示二级认知层频次）</>}</span>
                      </div>
                    )}
                  </div>

                  <div className="overflow-y-auto max-h-[460px] pr-1">
                    {statsTab === 'level2' ? (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                            <th className="p-2">{en ? "Code / name" : "代码 / 中文名称"}</th>
                            <th className="p-2 w-16 text-center">{en ? "Frequency" : "频次"}</th>
                            <th className="p-2 w-20 text-right">{en ? "% of messages" : "学生贴占比"}</th>
                            <th className="p-2 text-center w-12">{en ? "Filter" : "筛选"}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-sans">
                          {bubbleChartData.map((b) => {
                            const detail = uiCodebook[b.code];
                            const freq = frequencyMap[b.code] || 0;
                            const isSelected = activeBubble === b.code;
                            const ratio = studentMsgsCount > 0 ? ((freq / studentMsgsCount) * 100).toFixed(1) : "0.0";
                            
                            // Stage styling pills
                            let pillStyle = "bg-rose-50 text-rose-700 border-rose-100";
                            if (b.stage_code === "Exploration") pillStyle = "bg-amber-50 text-amber-700 border-amber-100";
                            if (b.stage_code === "Integration") pillStyle = "bg-blue-50 text-blue-700 border-blue-100";
                            if (b.stage_code === "Resolution") pillStyle = "bg-emerald-50 text-emerald-700 border-emerald-100";

                            return (
                              <tr 
                                key={b.code} 
                                className={`hover:bg-slate-50/50 transition-colors ${
                                  isSelected ? "bg-indigo-50/20 font-semibold text-indigo-700" : "text-slate-700"
                                }`}
                              >
                                <td className="p-2.5">
                                  <div className="flex items-center space-x-2">
                                    <span className={`inline-block font-mono text-[10px] px-1.5 py-0.5 rounded-sm border shrink-0 ${pillStyle}`}>
                                      {b.code}
                                    </span>
                                    <span className="truncate max-w-[130px]" title={detail.name}>{detail.name}</span>
                                  </div>
                                </td>
                                <td className="p-2.5 text-center font-bold">
                                  {freq > 0 ? (
                                    <span className="inline-block bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded-full min-w-[20px]">
                                      {freq}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300">0</span>
                                  )}
                                </td>
                                <td className="p-2.5 text-right font-mono text-slate-500">
                                  {ratio}%
                                </td>
                                <td className="p-2.5 text-center">
                                  <button
                                    onClick={() => {
                                      setActiveBubble(isSelected ? null : b.code);
                                      setActiveLevel3Filter(null);
                                    }}
                                    className={`p-1 rounded-sm border transition-colors ${
                                      isSelected 
                                        ? "bg-indigo-600 border-indigo-600 text-white" 
                                        : "bg-white border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                                    }`}
                                    title={en ? "Filter source evidence" : "筛选原文证据"}
                                  >
                                    <ChevronRight className="h-3 w-3" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                            <th className="p-2">{en ? "Dimension / code" : "维度 / 编码名称"}</th>
                            <th className="p-2 w-16 text-center">{en ? "Frequency" : "频次"}</th>
                            <th className="p-2 w-20 text-right">{en ? "% of messages" : "学生贴占比"}</th>
                            <th className="p-2 text-center w-12">{en ? "Filter" : "筛选"}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-sans">
                          {(() => {
                            const course = analysisResult?.course_type || courseType || "";
                            if (!course) {
                              return (
                                <tr>
                                  <td colSpan={4} className="p-4 text-center text-slate-400 italic font-sans">
                                    {en ? "No course-specific Level 3 coding data are available." : "当前未选择任何特定课程，无三级微观编码数据。"}
                                  </td>
                                </tr>
                              );
                            }
                            const config = COURSE_CONFIGS[course as 'information_technology_pedagogy' | 'programming_learning' | 'discipline_frontier'];
                            if (!config) return null;
                            return config.thirdLevelCodebook.map((item) => {
                              const freq = level3FrequencyMap[item.code] || 0;
                              const isSelected = activeLevel3Filter === item.code;
                              const ratio = studentMsgsCount > 0 ? ((freq / studentMsgsCount) * 100).toFixed(1) : "0.0";
                              
                              let pillStyle = "bg-slate-50 text-slate-700 border-slate-200";
                              if (item.dimension.includes("知识") || item.dimension.includes("概念")) {
                                pillStyle = "bg-indigo-50 text-indigo-700 border-indigo-100";
                              } else if (item.dimension.includes("实践")) {
                                pillStyle = "bg-teal-50 text-teal-700 border-teal-100";
                              } else if (item.dimension.includes("情境") || item.dimension.includes("身份")) {
                                pillStyle = "bg-amber-50 text-amber-700 border-amber-100";
                              } else if (item.dimension.includes("挑战")) {
                                pillStyle = "bg-rose-50 text-rose-700 border-rose-100";
                              } else if (item.dimension.includes("策略") || item.dimension.includes("应对")) {
                                pillStyle = "bg-emerald-50 text-emerald-700 border-emerald-100";
                              }

                              return (
                                <tr 
                                  key={item.code} 
                                  className={`hover:bg-slate-50/50 transition-colors ${
                                    isSelected ? "bg-indigo-50/20 font-semibold text-indigo-700" : "text-slate-700"
                                  }`}
                                >
                                  <td className="p-2.5">
                                    <div className="flex flex-col gap-0.5">
                                      <div className="flex items-center space-x-2">
                                        <span className={`inline-block font-mono text-[10px] px-1.5 py-0.5 rounded-sm border shrink-0 ${pillStyle}`}>
                                          {item.code}
                                        </span>
                                        <span className="truncate max-w-[130px] font-semibold" title={item.name}>{item.name}</span>
                                      </div>
                                      <span className="text-[10px] text-slate-400 font-normal line-clamp-1 mt-0.5" title={item.description}>
                                        [{item.dimension}] {item.description}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="p-2.5 text-center font-bold">
                                    {freq > 0 ? (
                                      <span className="inline-block bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded-full min-w-[20px]">
                                        {freq}
                                      </span>
                                    ) : (
                                      <span className="text-slate-300">0</span>
                                    )}
                                  </td>
                                  <td className="p-2.5 text-right font-mono text-slate-500">
                                    {ratio}%
                                  </td>
                                  <td className="p-2.5 text-center">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveLevel3Filter(isSelected ? null : item.code);
                                        setActiveBubble(null);
                                      }}
                                      className={`p-1 rounded-sm border transition-colors ${
                                        isSelected 
                                          ? "bg-indigo-600 border-indigo-600 text-white" 
                                          : "bg-white border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                                      }`}
                                      title={en ? "Filter evidence for this Level 3 code" : "筛选此三级编码证据"}
                                    >
                                      <ChevronRight className="h-3 w-3" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* Percentage totals */}
                <div className="pt-3 border-t border-slate-100 mt-4 text-[11px] text-slate-500 space-y-1">
                  <div className="flex justify-between">
                    <span>{en ? "Student messages coded:" : "参与编码的学生发言总数："}</span>
                    <strong className="text-slate-800 font-bold">{studentMsgsCount}{en ? "" : " 条"}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>{en ? "Total code assignments at current level:" : "二级/三级当前层频次总计："}</span>
                    <strong className="text-indigo-600 font-bold">
                      {statsTab === 'level2'
                        ? (Object.values(frequencyMap) as number[]).reduce((a, b) => a + b, 0)
                        : (Object.values(level3FrequencyMap) as number[]).reduce((a, b) => a + b, 0)
                      }{en ? "" : " 次"}
                    </strong>
                  </div>
                  <p className="text-[10px] text-slate-400 italic leading-relaxed mt-2">
                    {statsTab === 'level2' 
                      ? en ? "* A message may receive multiple second-level codes, so total frequency may exceed the number of messages." : "*注：一句话可映射多个二级微观编码，故频次总和可能大于发言贴总数。" 
                      : en ? "* Level 3 codes identify domain-specific disciplinary, computational, or technological expressions." : "*注：三级编码细分至特定领域的学科、计算或技术维度的微观表达。"
                    }
                  </p>
                </div>

              </div>

            </div>

            {/* 3. Evidences list Linked dynamically */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              
              {/* Linked evidences header */}
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-2 text-slate-900 font-semibold text-sm">
                  <MessageSquare className="h-4 w-4 text-indigo-600" />
                  <span>
                    {activeBubble 
                      ? en ? `Level 2 · ${activeBubble} · ${uiCodebook[activeBubble].name}: evidence (${activeEvidences.length})` : `【二级 · ${activeBubble} · ${uiCodebook[activeBubble].name}】对应证据链列表 (${activeEvidences.length}条)`
                      : activeLevel3Filter
                        ? en ? `Level 3 · ${activeLevel3Filter}: course-specific evidence (${activeEvidences.length})` : `【三级 · ${activeLevel3Filter}】对应课程特有证据链列表 (${activeEvidences.length}条)`
                        : en ? "All cognitive-presence evidence" : "全部学生发言认知证据链清单"
                    }
                  </span>
                </div>
                
                {(activeBubble || activeLevel3Filter) && (
                  <button
                    onClick={() => {
                      setActiveBubble(null);
                      setActiveLevel3Filter(null);
                    }}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-bold border border-indigo-200 bg-white px-2 py-1 rounded-md transition-colors"
                  >
                    {en ? "Clear filter" : "清除筛选显示全部"}
                  </button>
                )}
              </div>

              {/* Evidence cards rendering */}
              <div className="p-5 space-y-5">
                {activeEvidences.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <Info className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p className="text-xs">
                      {activeBubble 
                        ? en ? `No evidence of ${activeBubble} · ${uiCodebook[activeBubble].name} was identified in this discussion.` : `在此讨论中没有识别出属于【${activeBubble} · ${uiCodebook[activeBubble].name}】的认知存在表现。`
                        : activeLevel3Filter
                          ? en ? `No evidence for Level 3 code ${activeLevel3Filter} was identified in this discussion.` : `在此讨论中没有检测出属于三级编码【${activeLevel3Filter}】的微观表现。`
                          : en ? "No coding evidence is available." : "暂无编码证据，请检查是否已载入分析。"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activeEvidences.map((ev, index) => {
                      return (
                        <div 
                          key={`${ev.msgId}-${index}`}
                          className="border border-slate-200 rounded-xl p-4 sm:p-5 hover:shadow-xs transition-shadow flex flex-col justify-between bg-slate-50/25"
                        >
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                            <div className="flex flex-wrap gap-2 items-center">
                              <span className="font-semibold text-slate-800 text-xs flex items-center space-x-1">
                                <User className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                                <span>{getOriginalAuthorName(ev.author)}</span>
                              </span>
                              <span className="font-mono text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-sm">
                                {en ? "Message ID" : "帖子ID"}: {ev.msgId}
                              </span>
                              {ev.parentId && (
                                <span className="font-mono text-[10px] bg-indigo-50/50 text-indigo-500 px-1.5 py-0.5 rounded-sm">
                                  {en ? "Replies to" : "回复目标"}: {ev.parentId}
                                </span>
                              )}
                              {ev.level3Codes && ev.level3Codes.length > 0 && (
                                <div className="flex flex-wrap gap-1 items-center">
                                  <span className="text-[10px] text-slate-400 font-medium ml-1">{en ? "Level 3 codes:" : "三级编码:"}</span>
                                  {ev.level3Codes.map(l3 => {
                                    const isSelected = activeLevel3Filter === l3.code;
                                    return (
                                      <span 
                                        key={l3.code}
                                        onClick={() => {
                                          setActiveLevel3Filter(isSelected ? null : l3.code);
                                          setActiveBubble(null);
                                          setStatsTab('level3');
                                        }}
                                        className={`inline-block cursor-pointer text-[9px] px-1.5 py-0.5 rounded-sm border font-mono transition-colors ${
                                          isSelected
                                            ? "bg-indigo-600 border-indigo-600 text-white font-bold"
                                            : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-100"
                                        }`}
                                        title={l3.name}
                                      >
                                        {l3.code} {l3.name}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center space-x-2">
                              {/* Other matched tags preview */}
                              {ev.otherCodes.length > 0 && (
                                <div className="flex items-center space-x-1 shrink-0">
                                  <span className="text-[10px] text-slate-400 font-medium">{en ? "Also:" : "兼有:"}</span>
                                  {ev.otherCodes.map(oc => (
                                    <span 
                                      key={oc} 
                                      onClick={() => setActiveBubble(oc)}
                                      className="font-mono cursor-pointer text-[9px] bg-slate-100 text-slate-500 px-1 rounded-xs hover:bg-slate-200 border border-slate-200"
                                    >
                                      {oc}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Original context text with highlighting */}
                          <div className="py-4">
                            <div className="text-xs text-slate-400 mb-1.5 font-semibold">{en ? "Original message with highlighted evidence:" : "发言原文及高亮分析证据："}</div>
                            <blockquote className="text-slate-700 bg-white border-l-4 border-indigo-400 p-3 rounded-r-lg text-xs leading-relaxed font-sans max-w-prose">
                              {/* Replace evidence with styled highlighting */}
                              {ev.originalContent.includes(ev.evidence) && ev.evidence ? (
                                <>
                                  {ev.originalContent.split(ev.evidence)[0]}
                                  <span className="bg-yellow-100 text-yellow-900 px-0.5 font-medium border-b border-yellow-300">
                                    {ev.evidence}
                                  </span>
                                  {ev.originalContent.split(ev.evidence)[1]}
                                </>
                              ) : (
                                ev.originalContent
                              )}
                            </blockquote>
                            
                            {/* Evidence snippet only callout if substring mismatch */}
                            {(!ev.originalContent.includes(ev.evidence) || !ev.evidence) && (
                              <div className="mt-2 text-xs bg-amber-50 text-amber-800 p-2 rounded-lg border border-amber-100 font-sans">
                                <span className="font-bold">{en ? "Extracted evidence:" : "独立证据提取："}</span>“ {ev.evidence || (en ? "None" : "无")} ”
                              </div>
                            )}
                          </div>

                          {/* Model reasoning argument */}
                          {ev.reason && (
                            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-100/80 flex items-start space-x-2.5">
                              <Info className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                              <div className="text-xs">
                                <span className="font-bold text-slate-900 block mb-0.5">{en ? "Coding rationale:" : "大模型认知编码原理解释："}</span>
                                <p className="text-slate-600 leading-relaxed font-sans">{ev.reason}</p>
                              </div>
                            </div>
                          )}

                          {/* Context tree trigger button */}
                          <div className="mt-3 pt-3 border-t border-slate-100 flex justify-end">
                            <button
                              onClick={() => {
                                // Find original parsed msg object to show context
                                const rawMsg = parseResult?.messages.find(m => m.id === ev.msgId);
                                if (rawMsg) setSelectedContextMsg(rawMsg);
                              }}
                              className="px-3 py-1.5 text-[11px] text-indigo-600 font-bold hover:text-indigo-800 flex items-center space-x-1 hover:bg-indigo-50/50 rounded-md transition-all cursor-pointer"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                              <span>{en ? "View reply context" : "查看此帖子所在的回复上下文"}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>

          </div>
        )}

        {/* =========================================================
            6. BOTH COURSES LEVEL-3 CODEBOOKS SPECIFICATION TABLE
            ========================================================= */}
        {courseType !== '' && !en && <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs mt-6" id="level3-complete-specification-card">
          <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-100 gap-4 mb-5">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">三课程三级学科微观认知量规对照标准表</h3>
                <p className="text-xs text-slate-400 mt-0.5">完整展示三门可选课程中，大模型进行高阶/低阶学科深度学习微观特征提取的判定维度</p>
              </div>
            </div>

            {/* Right: Search and Course Selector */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Course selection segmented tabs */}
              <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs" id="guide-course-switcher">
                <button
                  type="button"
                  onClick={() => {
                    setActiveGuideCourse('information_technology_pedagogy');
                  }}
                  className={`px-3 py-1.5 rounded-md font-semibold text-center transition-all cursor-pointer ${
                    activeGuideCourse === 'information_technology_pedagogy'
                      ? 'bg-white text-indigo-700 shadow-xs font-bold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  信息技术教学法
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveGuideCourse('programming_learning');
                  }}
                  className={`px-3 py-1.5 rounded-md font-semibold text-center transition-all cursor-pointer ${
                    activeGuideCourse === 'programming_learning'
                      ? 'bg-white text-indigo-700 shadow-xs font-bold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  编程学习
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveGuideCourse('discipline_frontier');
                  }}
                  className={`px-3 py-1.5 rounded-md font-semibold text-center transition-all cursor-pointer ${
                    activeGuideCourse === 'discipline_frontier'
                      ? 'bg-white text-indigo-700 shadow-xs font-bold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  学科前沿展示
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜索编码、维度或释义..."
                  value={guideSearchQuery}
                  onChange={(e) => setGuideSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 w-full sm:w-48 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  id="guide-table-search"
                />
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <th className="p-3 w-28">三级微观代码</th>
                  <th className="p-3 w-36">认知特征维度</th>
                  <th className="p-3 w-40">维度行为名称</th>
                  <th className="p-3">系统定义规范与判定指标释义</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(() => {
                  const items = COURSE_CONFIGS[activeGuideCourse]?.thirdLevelCodebook || [];
                  const filtered = items.filter(item => {
                    const q = guideSearchQuery.trim().toLowerCase();
                    if (!q) return true;
                    return item.code.toLowerCase().includes(q) ||
                           item.name.toLowerCase().includes(q) ||
                           item.dimension.toLowerCase().includes(q) ||
                           item.description.toLowerCase().includes(q);
                  });

                  if (filtered.length === 0) {
                    return (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-slate-400 italic">
                          没有检索到符合 “{guideSearchQuery}” 关键词的指标项
                        </td>
                      </tr>
                    );
                  }

                  return filtered.map((item) => {
                    let pillStyle = "bg-slate-50 text-slate-700 border-slate-200";
                    if (item.dimension.includes("知识") || item.dimension.includes("概念")) {
                      pillStyle = "bg-indigo-50 text-indigo-700 border-indigo-100";
                    } else if (item.dimension.includes("实践")) {
                      pillStyle = "bg-teal-50 text-teal-700 border-teal-100";
                    } else if (item.dimension.includes("情境") || item.dimension.includes("身份")) {
                      pillStyle = "bg-amber-50 text-amber-700 border-amber-100";
                    } else if (item.dimension.includes("挑战")) {
                      pillStyle = "bg-rose-50 text-rose-700 border-rose-100";
                    } else if (item.dimension.includes("策略") || item.dimension.includes("应对")) {
                      pillStyle = "bg-emerald-50 text-emerald-700 border-emerald-100";
                    }

                    return (
                      <tr 
                        key={item.code} 
                        className={`hover:bg-slate-50/40 transition-colors ${
                          (analysisResult && activeLevel3Filter === item.code) 
                            ? "bg-indigo-50/30 font-semibold text-indigo-900" 
                            : "text-slate-600"
                        }`}
                      >
                        <td className="p-3 font-mono">
                          <span className={`inline-block text-[11px] px-2 py-0.5 rounded-sm border shrink-0 font-bold ${pillStyle}`}>
                            {item.code}
                          </span>
                        </td>
                        <td className="p-3 font-semibold text-slate-700">
                          {item.dimension}
                        </td>
                        <td className="p-3 text-slate-900 font-bold">
                          {item.name}
                        </td>
                        <td className="p-3 text-slate-500 leading-relaxed max-w-xl">
                          {item.description}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
          
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px] text-slate-400">
            <div>
              <span>当前展示类别：<strong>{COURSE_CONFIGS[activeGuideCourse]?.label}</strong> (共计 {COURSE_CONFIGS[activeGuideCourse]?.thirdLevelCodebook.length} 个三级微观分析维度)</span>
            </div>
            <div>
              <span>* 提示：高维大模型进行多标签编码分析时，将按照本量规严格匹配学科特征。在分析完成后，点击上面统计表中的三级分类可以直接过滤和查看对应的发言证据。</span>
            </div>
          </div>
        </div>}

      </main>

      {/* 4. Complete Reply Thread Context Modal overlay */}
      <AnimatePresence>
        {selectedContextMsg && parseResult && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200"
              id="context-modal"
            >
              {/* Modal header */}
              <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center space-x-2 font-bold text-slate-900 text-sm">
                  <MessageSquare className="h-5 w-5 text-indigo-600" />
                  <span>{en ? "Complete Reply-Thread Context" : "帖子回复树完整上下文"} [ID: {selectedContextMsg.id}]</span>
                </div>
                <button 
                  onClick={() => setSelectedContextMsg(null)}
                  className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Context list scrolling content */}
              <div className="p-5 max-h-[480px] overflow-y-auto space-y-4 text-xs font-sans">
                
                {/* 1. Discussion Background Topic Prompt */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <span className="font-bold text-slate-500 block mb-1">{en ? "Teacher's discussion prompt:" : "教师讨论主题背景："}</span>
                  <p className="text-slate-600 leading-relaxed italic">{parseResult.topic?.content}</p>
                </div>

                {/* Separator line */}
                <div className="flex items-center justify-center text-[10px] text-slate-400 uppercase tracking-widest py-1">
                  <span className="bg-white px-2 border-b border-slate-200 w-full text-center">{en ? "Reply-thread structure" : "上下回复链条结构"}</span>
                </div>

                {/* 2. Parent Message (if parent_id is not topic id) */}
                {selectedContextMsg.parent_id && selectedContextMsg.parent_id !== parseResult.topic?.id && (() => {
                  const parentMsg = parseResult.messages.find(m => m.id === selectedContextMsg.parent_id);
                  if (!parentMsg) return null;
                  const isRobot = parentMsg.author_role === "机器人";
                  const isTeacher = parentMsg.author_role === "教师";
                  const parentRoleLabel = en
                    ? (isRobot ? "Robot · context only" : isTeacher ? "Teacher · context only" : "Student")
                    : (isRobot ? "机器人·不编码" : isTeacher ? "教师·不编码" : "学生");
                  return (
                    <div className="bg-slate-100/50 rounded-lg p-3 border border-slate-200 relative ml-0 mr-8">
                      <div className="absolute top-2 right-2 bg-slate-200 px-1.5 py-0.5 rounded-xs text-[9px] font-mono font-medium text-slate-500">
                        {en ? "Parent message" : "父消息"} [ID: {parentMsg.id}]
                      </div>
                      <div className="flex items-center space-x-1.5 font-bold text-slate-700 mb-1">
                        {isRobot ? (
                          <span className="text-rose-600">{en ? "AI Robot (context only)" : "AI机器人 (上下文)"}</span>
                        ) : isTeacher ? (
                          <span className="text-emerald-700">{getOriginalAuthorName(parentMsg.author)} {en ? "(Teacher)" : "（教师）"}</span>
                        ) : (
                          <span className="text-slate-700">{getOriginalAuthorName(parentMsg.author)}</span>
                        )}
                        <span className="text-[10px] font-normal text-slate-400">({parentRoleLabel})</span>
                      </div>
                      <p className="text-slate-600 leading-relaxed">{parentMsg.content}</p>
                    </div>
                  );
                })()}

                {/* Arrow down connector */}
                {selectedContextMsg.parent_id && selectedContextMsg.parent_id !== parseResult.topic?.id && (
                  <div className="flex justify-center -my-2">
                    <ChevronRight className="h-5 w-5 text-indigo-400 rotate-90" />
                  </div>
                )}

                {/* 3. Current Selected Message Highlighted */}
                <div className="bg-indigo-50 border-2 border-indigo-200 rounded-lg p-4 relative ml-4 mr-4 shadow-xs">
                  <div className="absolute top-2 right-2 bg-indigo-200 text-indigo-700 px-1.5 py-0.5 rounded-xs text-[9px] font-mono font-semibold">
                    {en ? "Current coding target" : "当前编码分析目标"} [ID: {selectedContextMsg.id}]
                  </div>
                  <div className="flex items-center space-x-1.5 font-bold text-indigo-900 mb-1.5">
                    <User className="h-3.5 w-3.5 text-indigo-600" />
                    <span>{getOriginalAuthorName(selectedContextMsg.author)}</span>
                    <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-xs">
                      {en ? "Student · cognitive-presence coding target" : "学生·认知存在编码对象"}
                    </span>
                  </div>
                  <p className="text-slate-800 leading-relaxed font-semibold">{selectedContextMsg.content}</p>
                </div>

                {/* Arrow down connector to next children (if any) */}
                {(() => {
                  const children = parseResult.messages.filter(m => m.parent_id === selectedContextMsg.id);
                  if (children.length === 0) return null;
                  return (
                    <>
                      <div className="flex justify-center -my-2">
                        <ChevronRight className="h-5 w-5 text-slate-400 rotate-90" />
                      </div>
                      
                      {/* 4. Child Messages responding to this */}
                      <div className="space-y-2 pl-8">
                        <div className="text-[10px] text-slate-400 font-bold mb-1">{en ? "Subsequent replies from peers, teachers, or robots:" : "随后的同伴、教师或机器人追问回复："}</div>
                        {children.map(child => {
                          const isRobot = child.author_role === "机器人";
                          const isTeacher = child.author_role === "教师";
                          return (
                            <div key={child.id} className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 relative">
                              <span className="absolute top-1.5 right-1.5 bg-slate-200/50 px-1 text-[8px] font-mono text-slate-400">
                                {en ? "Child reply" : "子回复"} [ID: {child.id}]
                              </span>
                              <div className="flex items-center space-x-1.5 font-semibold text-slate-700 text-[11px] mb-0.5">
                                {isRobot ? (
                                  <span className="text-rose-600">{en ? "AI Robot" : "AI机器人"}</span>
                                ) : isTeacher ? (
                                  <span className="text-emerald-700">{getOriginalAuthorName(child.author)} {en ? "(Teacher · context only)" : "（教师·不编码）"}</span>
                                ) : (
                                  <span>{getOriginalAuthorName(child.author)}</span>
                                )}
                              </div>
                              <p className="text-slate-500 leading-relaxed text-[11px]">{child.content}</p>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}

              </div>

              {/* Modal footer closing */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                <button
                  onClick={() => setSelectedContextMsg(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-950 text-white rounded-lg text-xs font-semibold transition-all cursor-pointer"
                >
                  {en ? "Close" : "关闭查看"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. Clean Academic Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 mt-12 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 space-y-1">
          <p>{en ? "CSCL Cognitive Coding Experiment System" : "CSCL讨论帖认知编码实验系统"}</p>
          <p className="font-mono text-[10px]">{en ? "LLM-as-a-Judge Best-of-N | Evidence validation | Interactive four-quadrant view" : "LLM-as-a-Judge Best-of-N | 证据真实性校验 | 四象限交互气泡图"}</p>
        </div>
      </footer>

    </div>
  );
}
