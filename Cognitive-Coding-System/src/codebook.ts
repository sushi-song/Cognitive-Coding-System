import { CodebookDetail } from "./types";

export const CODEBOOK: Record<string, CodebookDetail> = {
  "T-DP": {
    code: "T-DP",
    name: "描述问题",
    stage: "触发事件",
    stage_code: "Triggering",
    description: "识别并描述一个问题，并提供与该问题有关的背景信息。",
    example: "我们目前收集到的数据不完整，无法支持后续分析。"
  },
  "T-AQ": {
    code: "T-AQ",
    name: "提出问题",
    stage: "触发事件",
    stage_code: "Triggering",
    description: "通过提出问题表达困惑或疑惑感。",
    example: "我们应该如何分工，才能在截止时间前完成资料整理和汇报？"
  },
  "E-UD": {
    code: "E-UD",
    name: "无依据的反对或批评",
    stage: "探索",
    stage_code: "Exploration",
    description: "对先前观点作出没有依据的反驳或批评。",
    example: "我不同意这个方案，我觉得这样不行。"
  },
  "E-RV": {
    code: "E-RV",
    name: "复述或换述",
    stage: "探索",
    stage_code: "Exploration",
    description: "重复或换一种说法表述先前观点，但不增加新观点。",
    example: "我也同意学生02刚才说的，我们需要先整理资料。"
  },
  "E-BE": {
    code: "E-BE",
    name: "基于外部资源进行观点头脑风暴",
    stage: "探索",
    stage_code: "Exploration",
    description: "依据观察或过去经验、阅读材料、互联网、教师或其他专家等外部资源交换信息或观点，但不把这些资源作为支持结论的证据。",
    example: "我查阅了一篇研究，文中提到同伴互评可以提高小组学习投入。"
  },
  "E-BP": {
    code: "E-BP",
    name: "基于个人信念或偏好进行观点头脑风暴",
    stage: "探索",
    stage_code: "Exploration",
    description: "依据个人信念或偏好交换观点或意见，但没有系统地辩护、论证或深入发展这些观点。",
    example: "我个人更喜欢先做展示稿，这样安排感觉比较顺手。"
  },
  "I-JA": {
    code: "I-JA",
    name: "论证性同意或补充",
    stage: "整合",
    stage_code: "Integration",
    description: "引用先前消息并作出有依据的同意，或在他人观点上增加内容并对新增内容进行论证。",
    example: "我同意学生02先分工的建议，因为按成员专长分配任务可以减少重复劳动；我补充由一人统一校对。"
  },
  "I-JD": {
    code: "I-JD",
    name: "论证性反对或批评",
    stage: "整合",
    stage_code: "Integration",
    description: "对先前观点作出有依据的反驳或批评。",
    example: "我不同意现在直接制作PPT，因为核心资料还没有核实，先制作会导致后续反复返工。"
  },
  "I-JHP": {
    code: "I-JHP",
    name: "基于个人信念或偏好论证假设",
    stage: "整合",
    stage_code: "Integration",
    description: "基于个人信念或偏好，发展并论证一个可辩护但仍属暂定的假设。",
    example: "根据我以往的小组经验，每天同步可能及时发现进度差异，因此我们可以设置每日同步。"
  },
  "I-JHE": {
    code: "I-JHE",
    name: "基于外部资源论证假设",
    stage: "整合",
    stage_code: "Integration",
    description: "基于观察或过去经验、阅读材料、互联网、教师或其他专家等外部资源，发展并论证一个可辩护但仍属暂定的假设。",
    example: "研究表明结构化角色分工能够减少搭便车，因此我们可以明确记录员、汇报员和资料员。"
  },
  "I-CS": {
    code: "I-CS",
    name: "创建解决方案",
    stage: "整合",
    stage_code: "Integration",
    description: "针对已经识别的问题，创建并论证一个解决方案。",
    example: "资料容易重复，所以我们按成员专长分工并由一人统一校对，这样既能减少重复劳动，也能保证格式一致。"
  },
  "R-AT": {
    code: "R-AT",
    name: "检验或辩护解决方案",
    stage: "解决",
    stage_code: "Resolution",
    description: "把解决方案应用于真实情境，并使用获得的经验检验或辩护该解决方案。",
    example: "我们按新分工实际运行了两天，任务延误明显减少，这说明该方案能够改善进度问题。"
  }
};

export const CODEBOOK_EN: Record<string, CodebookDetail> = {
  "T-DP": { code: "T-DP", name: "Describe problems", stage: "Triggering Event", stage_code: "Triggering", description: "Recognize and describe a problem, and present background information on the problem.", example: "The data we have collected are incomplete, so they cannot support the next stage of analysis." },
  "T-AQ": { code: "T-AQ", name: "Ask questions", stage: "Triggering Event", stage_code: "Triggering", description: "Express a sense of puzzlement by asking questions.", example: "How should we divide the work so that we can finish before the deadline?" },
  "E-UD": { code: "E-UD", name: "Unsubstantiated disagreement/critique", stage: "Exploration", stage_code: "Exploration", description: "Give unsubstantiated contradiction or critique of previous ideas.", example: "I disagree with this plan. I do not think it will work." },
  "E-RV": { code: "E-RV", name: "Re-voice", stage: "Exploration", stage_code: "Exploration", description: "Repeat or rephrase previous ideas, but add no new ideas.", example: "I agree with Student 02 that we should organize the sources first." },
  "E-BE": { code: "E-BE", name: "Brainstorm ideas based on external resources", stage: "Exploration", stage_code: "Exploration", description: "Exchange information or ideas based on external resources, without using those resources as evidence to support a conclusion.", example: "A paper I read reports that peer assessment can improve engagement in group learning." },
  "E-BP": { code: "E-BP", name: "Brainstorm ideas based on personal beliefs or preferences", stage: "Exploration", stage_code: "Exploration", description: "Exchange ideas or opinions based on personal beliefs or preferences without systematically defending, justifying, or developing them.", example: "I personally prefer making the slides first because that feels easier to organize." },
  "I-JA": { code: "I-JA", name: "Justify agreement/addition", stage: "Integration", stage_code: "Integration", description: "Refer to a previous message and provide substantiated agreement, or build on others' ideas and justify the addition.", example: "I agree that we should divide the work first because assigning tasks by expertise reduces duplication; I would also add one final editor." },
  "I-JD": { code: "I-JD", name: "Justify disagreement/critique", stage: "Integration", stage_code: "Integration", description: "Give justified contradiction or critique of previous ideas.", example: "I disagree with making the slides now because our key sources have not been verified and we would have to redo them later." },
  "I-JHP": { code: "I-JHP", name: "Justify hypothesis based on personal beliefs or preferences", stage: "Integration", stage_code: "Integration", description: "Develop and justify a defensible, yet tentative hypothesis based on personal beliefs or preferences.", example: "From my previous group experience, a daily check-in may reveal schedule gaps early, so we could adopt one." },
  "I-JHE": { code: "I-JHE", name: "Justify hypothesis based on external resources", stage: "Integration", stage_code: "Integration", description: "Develop and justify a defensible, yet tentative hypothesis based on external resources such as observations, past experience, readings, the internet, teachers, or other experts.", example: "Research suggests that structured roles reduce free-riding, so we could assign a recorder, presenter, and source manager." },
  "I-CS": { code: "I-CS", name: "Create solutions", stage: "Integration", stage_code: "Integration", description: "Create and justify a solution to the identified problem.", example: "Because our sources overlap, we can use a shared table and one final editor to reduce duplication and keep the format consistent." },
  "R-AT": { code: "R-AT", name: "Test/Defend solutions", stage: "Resolution", stage_code: "Resolution", description: "Apply the solution in the real world and use the experience to test or defend the solution.", example: "We used the new division of labor for two days and delays decreased, showing that the solution improved our progress." }
};

export const SAMPLE_XML_DATA_EN = `<?xml version="1.0" encoding="UTF-8"?>
<discussion_export schema_version="1.0">
  <topic id="topic-101-en">
    <title>Designing an Energy-Efficient Thermal Shield for a Mars Lander</title>
    <content><![CDATA[Teacher: Design a lightweight thermal shield that can withstand impact and temperatures down to -120°C. Use heat-transfer principles, structural design, and external resources to develop a feasible composite solution.]]></content>
  </topic>
  <messages>
    <message id="m001" type="comment" parent_id="topic-101-en"><author role="student">Student 1</author><content><![CDATA[The main problem is that the Martian day-night temperature range exceeds 150°C. Poor insulation could freeze the instruments, but a thick shield would add launch mass. How can we balance weight and insulation?]]></content></message>
    <message id="m002" type="reply" parent_id="m001"><author role="student">Student 2</author><content><![CDATA[Could a double-layer aluminum shell filled with a low-conductivity inert gas provide both low mass and strong protection against radiative heat loss?]]></content></message>
    <message id="m003" type="reply" parent_id="m002"><author role="robot">AI</author><content><![CDATA[Context only: seals may crack under low pressure and thermal cycling, allowing the gas to escape. Consider a vacuum layer or solid multilayer insulation.]]></content></message>
    <message id="m004" type="reply" parent_id="m003"><author role="student">Student 3</author><content><![CDATA[I think the AI's concern makes sense. In my experience with pressure-sealed models, leaks were common, so I would avoid a gas-filled layer and use solid multilayer shielding.]]></content></message>
    <message id="m005" type="reply" parent_id="m004"><author role="student">Student 1</author><content><![CDATA[I reviewed NASA technical material describing multilayer insulation made of thin aluminized polymer films separated by mesh; it limits radiative heat transfer in a vacuum.]]></content></message>
    <message id="m006" type="reply" parent_id="m005"><author role="student">Student 2</author><content><![CDATA[I agree with Student 1's MLI proposal because radiation dominates heat loss at low pressure, and the separated reflective layers reduce both radiation and direct conduction.]]></content></message>
    <message id="m007" type="reply" parent_id="m006"><author role="student">Student 4</author><content><![CDATA[I disagree with relying on MLI alone because landing impact can compress its fragile layers and sharply reduce insulation performance. A rigid outer shell is needed to protect it.]]></content></message>
    <message id="m008" type="reply" parent_id="m007"><author role="student">Student 3</author><content><![CDATA[To solve both problems, we can use a rigid aluminum-silicon-carbide honeycomb shell for impact resistance and suspend fifteen MLI layers inside it; the shell protects the insulation while the gaps reduce heat transfer.]]></content></message>
    <message id="m009" type="reply" parent_id="m008"><author role="student">Student 2</author><content><![CDATA[We tested a scaled version of this composite shield in a thermal-vacuum chamber and after a simulated impact the internal temperature stayed above -20°C, which supports the effectiveness of the design.]]></content></message>
  </messages>
</discussion_export>`;

export const SAMPLE_XML_DATA = `<?xml version="1.0" encoding="UTF-8"?>
<discussion_export schema_version="1.0">
  <topic id="topic-101">
    <title>太空探测器高能效保温罩设计方案</title>
    <content><![CDATA[教师：同学们好！本次讨论的主题是“如何为火星着陆器设计一个高能效、抗碰撞、耐超低温（-120℃）的保温罩？”请结合材料热传导原理、机械结构设计及外部资源，共同探讨一个可落地的复合结构设计。]]></content>
  </topic>

  <messages>
    <message id="m001" type="comment" parent_id="topic-101">
      <author role="同学">学生1</author>
      <content><![CDATA[我们面临的最主要困难在于，火星表面的昼夜温差达到150℃以上，而且夜间极寒。如果不妥善绝热，精密的科学仪器会直接冻坏，但如果保温罩太厚，又会增加发射质量。怎样平衡重量与隔热效能？]]></content>
    </message>

    <message id="m002" type="reply" parent_id="m001">
      <author role="同学">学生2</author>
      <content><![CDATA[如果我们在保温层中间，使用双层中空铝合金材质，并且在密封夹层里充入低导热系数的惰性气体（比如氙气），是否能同时做到轻量化和极高防辐射传热？]]></content>
    </message>

    <message id="m003" type="reply" parent_id="m002">
      <author role="机器人">AI</author>
      <content><![CDATA[机器人上下文：氙气确实具有很低的热导率。但是，在火星稀薄大气的强风和极低气压下，铝合金薄板如果发生微小的热胀冷缩，密封焊缝极易微裂，导致氙气在数月内泄漏殆尽，使得中空层失效。请考虑真空或多层固体阻隔。]]></content>
    </message>

    <message id="m004" type="reply" parent_id="m003">
      <author role="同学">学生3</author>
      <content><![CDATA[我觉得AI说的很有道理。我个人平时组装过气压密封玩具，密封气密性总是出问题，感觉在火星充气太不保险了。依我看，我们应该避免使用任何气体填充夹层，直接依靠固体多层屏蔽。]]></content>
    </message>

    <message id="m005" type="reply" parent_id="m004">
      <author role="同学">学生1</author>
      <content><![CDATA[为了解决密封问题，我查阅了中国航天局和NASA的技术文献。NASA的“毅力号”火星车使用的绝热罩核心是多层绝热材料（MLI，Multi-Layer Insulation），它是由多层极其薄的镀铝聚酯薄膜和聚酯网隔开组成的复合固体材料，能够在超高真空下阻断绝大部分的热辐射，热导率极低。]]></content>
    </message>

    <message id="m006" type="reply" parent_id="m005">
      <author role="同学">学生2</author>
      <content><![CDATA[我非常赞同学生1查阅文献提出的MLI（多层绝热材料）方案！因为太空和火星气压极低，热传导和对流占比例小，热辐射是最大的失热途径。MLI的多层反射薄膜能阻挡99%以上的辐射传热，而中间的聚酯网阻止了反射膜之间的直接接触导热。引入MLI可以让我们的绝热比普通气凝胶高出几十倍。]]></content>
    </message>

    <message id="m007" type="reply" parent_id="m006">
      <author role="同学">学生4</author>
      <content><![CDATA[我不太赞成只靠MLI，因为MLI非常脆弱。火星着陆器在着陆时要承受几十个G的撞击力，MLI一旦受到机械挤压，反射层紧紧贴在一起，它的阻热效能就会瞬间暴跌，甚至发生短路导热。必须有一个刚性的外壳来支撑和保护里面的MLI。]]></content>
    </message>

    <message id="m008" type="reply" parent_id="m007">
      <author role="同学">学生3</author>
      <content><![CDATA[综合大家的精彩看法，我们最终的设计方案决定是这样的：外层采用高刚性的铝碳化硅（AlSiC）蜂窝复合外壳，提供超强的抗撞击和机械支撑；在外壳和内部仪器仓之间，挂载15层高反射率的多层隔热材料（MLI）悬挂结构，中间留有真空间隙。]]></content>
    </message>

    <message id="m009" type="reply" parent_id="m008">
      <author role="同学">学生2</author>
      <content><![CDATA[为了验证这个双层复合保温方案，我们可以设计个模拟测试：制作一个缩比例保温罩，放进高低温真空热罐（零下130℃到零上80℃）里，用液氮冷却外部，并模拟30G重力撞击。如果在撞击后，内部电机的温度仍能维持在零下20℃以上，就说明这套设计成功了。]]></content>
    </message>
  </messages>
</discussion_export>`;

export interface ThirdLevelCodebookItem {
  code: string;
  name: string;
  description: string;
  dimension: string;
}

export interface CourseConfig {
  key: 'information_technology_pedagogy' | 'programming_learning' | 'discipline_frontier';
  label: string;
  thirdLevelCodebook: ThirdLevelCodebookItem[];
}

export const COURSE_CONFIGS: Record<'information_technology_pedagogy' | 'programming_learning' | 'discipline_frontier', CourseConfig> = {
  information_technology_pedagogy: {
    key: "information_technology_pedagogy",
    label: "信息技术教学法",
    thirdLevelCodebook: [
      {
        code: "EDU-TK",
        name: "技术知识",
        description: "学生讨论数字工具、软件、平台、硬件的功能、操作方式、技术特征或限制，但没有说明该技术如何支持具体教学方法或具体学科内容。",
        dimension: "单一知识"
      },
      {
        code: "EDU-PK",
        name: "教学法知识",
        description: "学生讨论一般教学策略、教学组织、课堂管理或评价方式，但没有联系具体学科内容，也没有讨论ICT工具。",
        dimension: "单一知识"
      },
      {
        code: "EDU-CK",
        name: "学科内容知识",
        description: "学生讨论信息技术课程或拟教学学科中的概念、原理、事实、程序和知识关系，但没有讨论如何教授或如何使用ICT呈现这些内容。",
        dimension: "单一知识"
      },
      {
        code: "EDU-PCK",
        name: "学科教学知识",
        description: "学生讨论如何采用特定教学方法帮助学生理解某项具体学科内容，但不涉及ICT工具。",
        dimension: "复合知识"
      },
      {
        code: "EDU-TPK",
        name: "技术教学法知识",
        description: "学生讨论ICT工具如何支持某种教学策略、学习活动、课堂组织或评价方式，但没有明确联系某项具体学科内容。",
        dimension: "复合知识"
      },
      {
        code: "EDU-TCK",
        name: "技术学科内容知识",
        description: "学生讨论ICT工具如何表达、呈现、处理或模拟具体学科内容，但没有进一步形成完整教学策略。",
        dimension: "复合知识"
      },
      {
        code: "EDU-TPACK",
        name: "整合性技术教学内容知识",
        description: "学生综合讨论ICT工具、教学方法和具体学科内容，说明如何使用适当技术支持特定教学策略，以促进学生理解明确的学科知识（必须同时包含：1. 明确的ICT/技术；2. 明确的教学策略/活动；3. 明确的学科知识）。",
        dimension: "复合知识"
      },
      {
        code: "EDU-DK",
        name: "设计知识",
        description: "学生讨论教学设计过程，包括目标确定、需求分析、资源选择、教学步骤安排、评价设计、方案比较和根据反馈修改教学方案（单纯分工讨论不计）。",
        dimension: "设计与情境"
      },
      {
        code: "EDU-CTX",
        name: "学校教学情境",
        description: "学生讨论可能影响教学实施的现实学校因素，包括设备、网络、课时、班级规模、学校制度、经费、数据隐私和技术支持等。",
        dimension: "设计与情境"
      }
    ]
  },
  programming_learning: {
    key: "programming_learning",
    label: "编程学习",
    thirdLevelCodebook: [
      {
        code: "C-SEQ",
        name: "顺序结构",
        description: "学生讨论能够由计算机依次执行的一系列步骤、语句或指令，包括程序执行顺序、语句先后关系和算法步骤。",
        dimension: "计算概念"
      },
      {
        code: "C-LOOP",
        name: "循环结构",
        description: "学生讨论让相同或相似指令重复执行的程序机制，包括循环次数、循环条件、嵌套循环和循环终止。",
        dimension: "计算概念"
      },
      {
        code: "C-COND",
        name: "条件结构",
        description: "学生讨论程序如何根据条件作出判断并产生不同执行路径或结果，包括条件表达式、分支选择和边界条件。",
        dimension: "计算概念"
      },
      {
        code: "C-OPER",
        name: "运算操作",
        description: "学生讨论数学、逻辑或字符串运算，以及这些运算如何支持数据处理、条件判断和程序结果计算。",
        dimension: "计算概念"
      },
      {
        code: "C-DATA",
        name: "数据",
        description: "学生讨论数据类型以及数据的定义、存储、读取、传递、修改和更新，包括变量、数组、列表、参数和作用域。",
        dimension: "计算概念"
      },
      {
        code: "P-ITER",
        name: "增量与迭代",
        description: "学生将复杂编程任务分解为较小的子任务或阶段，通过设计、实现、检查和修改的循环逐步完善程序。",
        dimension: "计算实践"
      },
      {
        code: "P-DEBUG",
        name: "测试与调试",
        description: "学生针对程序错误、异常结果或未达到预期的运行现象，进行问题定位、原因分析、测试验证、代码修改和结果复查。",
        dimension: "计算实践"
      },
      {
        code: "P-REUSE",
        name: "复用与重混",
        description: "学生寻找、理解并使用已有代码、案例、算法或他人方案，在其基础上进行修改、组合和扩展。",
        dimension: "计算实践"
      },
      {
        code: "P-ABSMOD",
        name: "抽象与模块化",
        description: "学生从具体问题或代码中识别共同模式、概括一般规律，或者将复杂程序分解为功能相对独立的函数、类和模块。",
        dimension: "计算实践"
      },
      {
        code: "I-EXPRESS",
        name: "计算表达",
        description: "学生将编程视为创造作品、表达想法和解决真实问题的手段，而不只是记忆语法、模仿代码或被动使用软件。",
        dimension: "计算身份"
      },
      {
        code: "I-QUESTION",
        name: "计算质疑",
        description: "学生分析或质疑程序、算法、AI工具及计算技术的功能、可靠性、局限和现实影响，并形成对技术能力边界的认识。",
        dimension: "计算身份"
      }
    ]
  },
  discipline_frontier: {
    key: "discipline_frontier",
    label: "学科前沿展示",
    thirdLevelCodebook: [
      {
        code: "CH-COG",
        name: "认知挑战",
        description: "小组在理解任务要求、掌握相关概念、理解复杂知识、整合不同信息或形成共同认识等方面遇到的困难。",
        dimension: "挑战"
      },
      {
        code: "CH-MOT",
        name: "动机挑战",
        description: "小组成员在保持学习兴趣、任务投入、参与积极性、信心或持续完成任务的意愿等方面遇到的困难。",
        dimension: "挑战"
      },
      {
        code: "CH-TIME",
        name: "时间管理挑战",
        description: "小组在时间不足、进度安排、成员时间协调、任务期限或工作量分配等方面遇到的困难。",
        dimension: "挑战"
      },
      {
        code: "CH-ENV",
        name: "环境与技术挑战",
        description: "小组在使用软件、设备、网络、学习平台或其他技术工具，以及适应新的学习环境和学习方式时遇到的困难。",
        dimension: "挑战"
      },
      {
        code: "CH-SOC",
        name: "社会互动挑战",
        description: "小组成员在沟通交流、理解彼此观点、协调意见、角色分工、成员配合或处理人际关系等方面遇到的困难。",
        dimension: "挑战"
      },
      {
        code: "CH-NONE",
        name: "未识别到挑战",
        description: "学生明确表示没有遇到挑战，或者回答中没有出现能够归入其他挑战类别的具体困难。",
        dimension: "挑战"
      },
      {
        code: "ST-COG",
        name: "认知调节策略",
        description: "小组通过学习相关知识、查找 and 分析资料、分享知识、解释观点、讨论问题、整合信息或调整解决思路来克服困难。",
        dimension: "应对策略"
      },
      {
        code: "ST-MOT",
        name: "动机调节策略",
        description: "小组通过相互鼓励、增强信心、维持兴趣、激发积极性或营造积极的团队氛围来保持任务投入。",
        dimension: "应对策略"
      },
      {
        code: "ST-TIME",
        name: "时间管理策略",
        description: "小组通过制定计划、安排时间、设置任务期限、划分任务阶段或协调成员进度来推动任务按时完成。",
        dimension: "应对策略"
      },
      {
        code: "ST-ENV",
        name: "环境建构策略",
        description: "小组通过选择或调整学习环境、使用技术工具、利用平台功能、寻找外部资源或改善任务条件来支持任务完成。",
        dimension: "应对策略"
      },
      {
        code: "ST-NONE",
        name: "未提出有效策略",
        description: "学生没有提出具体的应对办法，或者只表达“努力完成”“认真对待”等态度，但没有说明实际可执行的行动。",
        dimension: "应对策略"
      }
    ]
  }
};

export const SAMPLE_XML_DATA_FRONTIER = `<?xml version="1.0" encoding="UTF-8"?>
<discussion_export schema_version="1.0">
  <topic id="topic-frontier">
    <title>量子计算与未来密码学前沿技术展示</title>
    <content><![CDATA[教师：同学们好！本次讨论的主题是“如何设计我们关于量子计算在未来密码学中的应用前沿展示？”请大家围绕内容框架、遇到的困难和应对策略，共同规划我们的汇报方案。]]></content>
  </topic>

  <messages>
    <message id="m001" type="comment" parent_id="topic-frontier">
      <author role="同学">学生1</author>
      <content><![CDATA[目前我们小组在理解超导量子比特和拓扑量子比特的概念时遇到了很大的困难，感觉量子物理的知识太复杂了，在整合这些概念并形成统一的认知方面非常吃力。]]></content>
    </message>

    <message id="m002" type="reply" parent_id="m001">
      <author role="同学">学生2</author>
      <content><![CDATA[为了克服理解上的困难，我们可以去查阅IBM Quantum官方文献，以及最新的前沿综述资料，分享彼此的理解，以此调整我们的讲述思路来克服这个困难。]]></content>
    </message>

    <message id="m003" type="reply" parent_id="m002">
      <author role="机器人">AI</author>
      <content><![CDATA[机器人提示：对于量子比特的物理实现方式，建议通过PPT动画或直观的对比图表进行展示。拓扑量子比特具有内在的非局域性保护，而超导量子比特则依赖于极低温和纠错算法。请重点阐述量子纠错对未来密码学的影响。]]></content>
    </message>

    <message id="m004" type="reply" parent_id="m003">
      <author role="同学">学生3</author>
      <content><![CDATA[我觉得AI的建议非常好。为了准备汇报，我们可以去本地安装和运行Qiskit库，寻找外部技术资源，生成直观的量子电路图并截图放到PPT中，以此来改善我们的展示条件。]]></content>
    </message>

    <message id="m005" type="reply" parent_id="m004">
      <author role="同学">学生1</author>
      <content><![CDATA[另一个严峻的问题是，这周大家都有很多其他功课，每个人时间协调十分不便，任务进度很赶，面临很大的时间压力和工作量分配困难。]]></content>
    </message>

    <message id="m006" type="reply" parent_id="m005">
      <author role="同学">学生2</author>
      <content><![CDATA[大家先不要泄气，要相信我们能做好！我们互相鼓励、振作起来。我们可以通过制定一个精确到小时的48小时倒计时任务表，安排时间节点，划分任务阶段，全力以赴确保按时完成。]]></content>
    </message>

    <message id="m007" type="reply" parent_id="m006">
      <author role="同学">学生4</author>
      <content><![CDATA[我觉得我们在社会互动和分工上也有点问题，写文案和做PPT的同学之间没有充分协调好，沟通意见不一致，导致PPT结构和逻辑有些冲突。]]></content>
    </message>

    <message id="m008" type="reply" parent_id="m007">
      <author role="同学">学生3</author>
      <content><![CDATA[而且我们由于使用的是国外科研协作平台，经常发生网络卡顿、设备连接中断以及在线编辑工具报错等环境和技术障碍，极大地拖慢了效率。]]></content>
    </message>

    <message id="m009" type="reply" parent_id="m008">
      <author role="同学">学生2</author>
      <content><![CDATA[既然如此，我们今天下午3点到5点安排一次腾讯会议专门协调，把PPT大纲定下来。我们今天晚上12点前把各分工的PPT初稿汇总到腾讯文档，以此来严格管理时间并推动进度！]]></content>
    </message>
  </messages>
</discussion_export>`;

export const SAMPLE_XML_DATA_PROGRAMMING = `<?xml version="1.0" encoding="UTF-8"?>
<discussion_export schema_version="1.0">
  <topic id="topic-001">
    <title>如何利用循环与分支优化冒泡排序算法</title>
    <content><![CDATA[教师：同学们好！本周我们讨论的主题是“如何通过改进循环控制或引入条件分支，优化基础冒泡排序算法，减少无用的比较与交换次数？”请结合计算概念，共同探究一个更高效的排序过程。]]></content>
  </topic>

  <messages>
    <message id="m001" type="comment" parent_id="topic-001">
      <author role="同学">学生1</author>
      <content><![CDATA[我们在运行标准的双重循环冒泡排序时发现，即使数组在中间某一步已经完全排好序了，程序还是会机械地执行完剩下的外层循环。如何能在检测到没有发生交换时提前终止外层循环？]]></content>
    </message>

    <message id="m002" type="reply" parent_id="m001">
      <author role="同学">学生2</author>
      <content><![CDATA[我们是不是可以引入一个布尔变量（例如 swapped），初始设为 false。在内层循环中，只要发生了一次数据交换，就把 swapped 设为 true。在外层循环中判断：如果一次完整内循环结束 swapped 仍为 false，就直接 break 跳出。]]></content>
    </message>

    <message id="m003" type="reply" parent_id="m002">
      <author role="机器人">AI</author>
      <content><![CDATA[机器人提示：使用布尔标志变量可以很好地减少已排序数组的无效外层循环。但在最坏情况下（倒序数组），它并不能减少交换和比较的次数。而且，每次内层循环的比较之后仍需要对边界条件进行检测。有没有办法能在每次迭代中缩减下一次内层循环的比较范围？]]></content>
    </message>

    <message id="m004" type="reply" parent_id="m003">
      <author role="同学">学生3</author>
      <content><![CDATA[我赞成AI的提示。我平时在开源平台看过别人的代码（复用与重混），他们不仅用布尔标记，还记录了“最后一次发生数据交换的位置”（比如 lastExchangeIndex）。因为在这个位置之后的元素，在这一轮里没有发生交换，说明它们在后半段其实已经是有序的了。]]></content>
    </message>

    <message id="m005" type="reply" parent_id="m004">
      <author role="同学">学生1</author>
      <content><![CDATA[我同意学生3说的方法！我们可以把下一轮内层循环的边界（也就是控制循环次数的 limit 变量）直接设为这个 lastExchangeIndex。这样一来，每一次外层循环结束后，下一次比较的范围都可以大幅度“增量式”缩减，而不是每次都固定减 1。]]></content>
    </message>

    <message id="m006" type="reply" parent_id="m005">
      <author role="同学">学生2</author>
      <content><![CDATA[对！我们可以把整个算法抽象为两个功能明确的方法：一个是 swap(arr, i, j) 负责数据交换，另一个是 optimizedBubbleSort(arr) 负责控制排序逻辑。代码模块化清晰，也方便复用。]]></content>
    </message>

    <message id="m007" type="reply" parent_id="m006">
      <author role="同学">学生4</author>
      <content><![CDATA[我不太赞同直接设置 limit。如果初始数组是空的，或者长度为 1，直接访问 index 可能会发生空指针或越界错误。在条件判断中，我们应该对极值边界情况先做异常捕捉或者首行返回保护。]]></content>
    </message>

    <message id="m008" type="reply" parent_id="m007">
      <author role="同学">学生3</author>
      <content><![CDATA[综上所述，我们小组得出的最终冒泡排序代码解决方案是：
function bubbleSort(arr) {
  if (!arr || arr.length &lt;= 1) return arr;
  let limit = arr.length - 1;
  while (limit &gt; 0) {
    let lastExchangeIndex = 0;
    for (let i = 0; i &lt; limit; i++) {
      if (arr[i] &gt; arr[i + 1]) {
        swap(arr, i, i + 1);
        lastExchangeIndex = i;
      }
    }
    limit = lastExchangeIndex;
  }
  return arr;
}]]></content>
    </message>

    <message id="m009" type="reply" parent_id="m008">
      <author role="同学">学生2</author>
      <content><![CDATA[为了验证这个方案，我编写了三组测试用例：
1. 顺序数组 [1,2,3,4,5]：运行后内循环执行1遍，外循环提前 break。
2. 倒序数组 [5,4,3,2,1]：执行完整的比较。
3. 随机乱序及边界空列表。
运行结果完全正确，说明调试非常成功！]]></content>
    </message>
  </messages>
</discussion_export>`;
