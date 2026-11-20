/* 聚仁 · 错题教练
 * 两条引擎：
 *  - local：离线启发式推演，保证无网/无 Key 也能完整演示；
 *  - server：经由本地/云端网关调用 OpenAI 兼容大模型，浏览器不接触 API Key。
 */

const TAG_RULES = [
  { tags: ['极限', '等价无穷小'], re: /极限|无穷|洛必达|等价无穷小|夹逼|连续/ },
  { tags: ['导数', '单调性'], re: /导数|求导|极值|单调|切线|凹凸/ },
  { tags: ['积分', '换元'], re: /积分|原函数|定积分|不定积分|换元|分部/ },
  { tags: ['矩阵', '秩'], re: /矩阵|秩|行变换|线性方程组|初等变换/ },
  { tags: ['特征值', '相似对角化'], re: /特征值|特征向量|对角化|相似/ },
  { tags: ['概率', '条件概率'], re: /概率|分布|期望|方差|独立|贝叶斯/ },
  { tags: ['受力分析', '刚体'], re: /受力|刚体|力矩|转动|牛顿|摩擦/ },
  { tags: ['电路', '节点电压'], re: /电路|电压|电流|节点|戴维南|基尔霍夫/ },
  { tags: ['指针', '内存'], re: /指针|内存|链表|数组越界/ },
  { tags: ['递归', '复杂度'], re: /递归|复杂度|动态规划|算法|时间复杂度/ },
  { tags: ['生理学', '稳态'], re: /生理|稳态|神经|内分泌|循环|呼吸|肾脏/ },
  { tags: ['解剖学', '结构'], re: /解剖|骨骼|肌肉|器官|组织/ },
  { tags: ['生物化学', '代谢'], re: /生化|代谢|酶|糖酵解|三羧酸/ },
  { tags: ['法学', '法条'], re: /法条|法律|案例|权利|义务|合同|侵权/ },
  { tags: ['经济学', '供需'], re: /供需|弹性|边际|市场|GDP|通货膨胀/ },
  { tags: ['文学', '文本分析'], re: /文学|文本|修辞|主题|诗歌|小说/ },
];

const STEP_LIBRARY = {
  极限: [
    '先判断类型：0/0、∞/∞、1^∞，还是可以直接代入；不同类型用不同工具。',
    '把分子/分母拆成"主部 + 高阶小量"，再决定用等价无穷小、洛必达还是泰勒。',
    '检查等价替换的适用条件，尤其是加减法中出现替换时。',
    '回代原式，用数值或图像做一次 sanity check。',
  ],
  导数: [
    '先写定义域，再标出不可导点；很多"漏解"发生在定义域边界。',
    '求导后解 f′(x)=0，同时检查 f′ 不存在的点。',
    '用表格标出单调区间、极值与凹凸性，避免只盯驻点。',
    '回到题目问的结论：极值、最值还是参数范围？',
  ],
  积分: [
    '先看结构：换元、分部、有理函数还是对称区间。',
    '换元时同步换上下限，别把 x 的边界带进 u 的积分。',
    '分部积分先选"求导会变简单"的部分作为 u。',
    '结果求导验算，或对定积分做量级估算。',
  ],
  矩阵: [
    '先确认矩阵形状与秩的定义，别急着做行变换。',
    '用初等行变换化行阶梯形，记录每一步是否改变解集。',
    '由秩判断解的存在性与自由变量个数。',
    '把通解写成"特解 + 齐次通解"，再代回原方程验证。',
  ],
  特征值: [
    '先写特征方程 |λI−A|=0，注意行列式展开的符号。',
    '每个特征值对应的特征向量是 (λI−A)x=0 的非零解。',
    '判断是否可对角化：看几何重数是否等于代数重数。',
    '用 A=PΛP⁻¹ 回代检验，或检查迹与行列式。',
  ],
  概率: [
    '先定义样本空间与事件，把文字条件翻译成集合/随机变量。',
    '判断是条件概率、全概率还是贝叶斯，方向不要反。',
    '写出分布或密度，再算期望/方差。',
    '用极端值或归一化条件检查结果是否合理。',
  ],
  受力分析: [
    '选研究对象，画完整受力图；不要漏掉约束力与摩擦力。',
    '规定正方向，把力分解到切向/法向或 x/y 方向。',
    '列牛顿第二定律 / 转动定律，注意力矩的力臂。',
    '检查量纲与极限情形（质量趋零、角度趋零）。',
  ],
  电路: [
    '标出参考节点与电流方向，先把未知量定义清楚。',
    '选节点电压法或网孔电流法，避免方程数量爆炸。',
    '列 KCL/KVL，注意受控源带来的附加关系。',
    '解完代回功率守恒，检查是否出现负电阻等异常。',
  ],
  指针: [
    '画出内存示意图：每个指针指向哪里、谁拥有这块内存。',
    '检查空指针、越界、释放后使用这三类高频错误。',
    '把复杂表达式拆成临时变量，逐步验证类型与生命周期。',
    '用最小输入 + 边界输入各跑一遍。',
  ],
  递归: [
    '先用一句话写清递归函数的定义，再写终止条件。',
    '确认每一层规模严格变小，否则会栈溢出。',
    '画出递归树，数清重复子问题，判断是否需要记忆化。',
    '写出时间/空间复杂度，并用 n=1,2 的手算结果对照。',
  ],
  生理学: [
    '先画一张机制图：刺激 → 感受器 → 传入 → 中枢 → 传出 → 效应器。',
    '把题目里的变量对应到机制图上，标出哪一步被增强或抑制。',
    '区分「直接作用」和「代偿反应」，不要把它们混成一个方向。',
    '用正常值/极端值检查结论是否符合稳态逻辑。',
  ],
  解剖学: [
    '先定位：在哪个区域、哪一层、与哪些结构相邻。',
    '把结构放回三维关系里，用「上/下、前/后、内/外」描述。',
    '区分同名结构和相似结构，列出至少一个鉴别点。',
    '用功能反推结构，检查是否与临床/生理表现一致。',
  ],
  生物化学: [
    '先写通路名称与关键酶，确认限速步骤。',
    '把底物、产物、辅因子和能量变化放在同一条线上。',
    '判断题目问的是「通量」还是「某个代谢物浓度」。',
    '用抑制剂/缺乏症做一次因果推演。',
  ],
  法学: [
    '先拆法律关系：主体、客体、权利/义务、法律事实。',
    '找请求权基础或罪名构成要件，再对应案件事实。',
    '区分「构成要件」与「抗辩事由」，不要混在一起。',
    '用反面案例检验：如果少一个要件，结论会怎么变。',
  ],
  经济学: [
    '先画供需/成本曲线，标出初始均衡。',
    '判断冲击移动的是供给还是需求，还是两者同时移动。',
    '区分「沿曲线移动」和「曲线移动」。',
    '用弹性或边际量检查方向与大小是否合理。',
  ],
  文学: [
    '先回到文本：谁在说、对谁说、在什么情境下说。',
    '找反复出现的意象/修辞/结构，而不是只摘一句金句。',
    '把形式选择和主题联系起来：为什么用这种方式写。',
    '用另一种解读做对照，说明你的证据为什么更有说服力。',
  ],
  通用: [
    '把题目条件逐条翻译成数学/代码表达，标出还没用上的条件。',
    '找到"卡住的那一步"，先写它的上游结论，不要从头重算。',
    '用一条更小的例子或特殊值验证你的中间结论。',
    '最后用另一种方法（估算、图像、代回）做交叉检查。',
  ],
};

const ERROR_DIAGNOSIS = {
  概念不清: '更像是把「{tag}」的适用条件记混了，而不是单纯算错。建议把定义、条件和反例放在同一张卡片上对照。',
  计算失误: '思路方向大概率是对的，失分集中在符号、边界或中间一步的代数运算。建议把关键步骤写成两行，并单独验算。',
  审题偏差: '你写的内容和题目真正问的对象可能错位了。先把"已知 / 求什么 / 限制条件"三栏列出来，再动笔。',
  思路卡住: '卡点通常不是公式本身，而是缺少一个把条件转成式子的中间步骤。先找"题目给了什么、还差什么"。',
  时间不够: '这类题值得准备一条更短的路径：先判断题型，再套固定检查清单，把时间留给最后验证。',
  粗心: '知识本身可能已经掌握，问题出在流程。给每一步设一个"检查点"比反复提醒自己细心更有效。',
};

const VARIANT_LIBRARY = {
  极限: '把原题的分母换成 1−cos x，判断还能不能用等价无穷小；再写一次完整步骤，重点标出替换条件。',
  导数: '把原题改成"求参数 a 的取值范围，使 f(x) 在区间内恰有两个极值点"，先画单调性表格再作答。',
  积分: '把积分区间改成关于原点对称，先判断奇偶性再计算；比较两种解法的用时。',
  矩阵: '把原题中的矩阵换成一个含参数 a 的 3×3 矩阵，讨论 a 取何值时秩为 2，并写出通解。',
  特征值: '给一个上三角矩阵，先口算特征值，再判断是否可对角化；说明理由。',
  概率: '把"已知结果求原因"改成"已知原因求结果"，分别用全概率与贝叶斯公式算一次，比较分母。',
  受力分析: '把水平面改成倾角 30° 的斜面，加入摩擦系数 μ，重新列方程并讨论 μ 的临界值。',
  电路: '把电压源换成电流源，重画电路并用节点电压法求解；比较方程数量。',
  指针: '写一个函数，把单链表原地反转；先画三个指针的移动顺序，再处理空链表和单节点。',
  递归: '把递归版斐波那契改成记忆化版本，写出递归树中被重复计算的前 5 个节点。',
  通用: '把题目中的一个条件改掉（数值或方向），先预测答案会怎么变，再实际计算验证。',
};

function unique(arr) {
  return [...new Set(arr)];
}

export function detectTags(payload = {}) {
  const text = [payload.subject, payload.text, payload.myAnswer, payload.correctAnswer]
    .filter(Boolean)
    .join(' ');
  const hits = [];
  for (const rule of TAG_RULES) {
    if (rule.re.test(text)) hits.push(...rule.tags);
  }
  if (!hits.length) hits.push(payload.subject ? `${payload.subject}基础` : '通用解题');
  return unique(hits).slice(0, 3);
}

function primaryTag(tags) {
  for (const key of Object.keys(STEP_LIBRARY)) {
    if (tags.includes(key)) return key;
  }
  return '通用';
}

export function profileDigest(state) {
  const learner = state?.profile?.learner || {};
  const tags = Object.entries(learner.tagStats || {})
    .sort((a, b) => b[1].wrong - a[1].wrong)
    .slice(0, 4)
    .map(([tag, s]) => `${tag}（错 ${s.wrong} 次）`);
  const errors = Object.entries(learner.errorTypes || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type, count]) => `${type}×${count}`);
  const prefs = (learner.preferences || []).slice(0, 3);
  const recent = (state?.questions || []).slice(-3).map((q) => q.tags?.[0]).filter(Boolean);
  return [
    `学生昵称：${state?.profile?.name || '同学'}`,
    state?.profile?.major ? `专业/方向：${state.profile.major}` : '',
    state?.profile?.grade ? `年级：${state.profile.grade}` : '',
    state?.profile?.goal ? `这学期目标：${state.profile.goal}` : '',
    state?.profile?.studyWindow ? `常用学习时段：${state.profile.studyWindow}` : '',
    state?.profile?.memoryNotes ? `补充记忆：${state.profile.memoryNotes}` : '',
    `累计错题：${state?.questions?.length || 0} 道 · 分析次数：${state?.profile?.learner?.sessions || 0} 次`,
    tags.length ? `高频薄弱点：${tags.join('、')}` : '高频薄弱点：暂无足够数据',
    errors.length ? `主要错因：${errors.join('、')}` : '主要错因：暂无',
    prefs.length ? `讲解偏好：${prefs.join('、')}` : '讲解偏好：步骤化、先提示后答案',
    recent.length ? `最近涉及：${recent.join('、')}` : '',
  ].filter(Boolean).join('\n');
}

/** 离线推演：不调用任何外部服务，保证隐私与可演示性。 */
export function analyzeLocally(payload, state) {
  const tags = detectTags(payload);
  const tag = primaryTag(tags);
  const errorType = payload.errorType || '思路卡住';
  const prior = (state.questions || []).filter((q) => q.tags?.some((t) => tags.includes(t)));
  const sameType = prior.filter((q) => q.errorType === errorType).length;
  const diagnosisTpl = ERROR_DIAGNOSIS[errorType] || ERROR_DIAGNOSIS['思路卡住'];
  const diagnosis = diagnosisTpl.replace(/\{tag\}/g, tags[0]);
  const steps = STEP_LIBRARY[tag] || STEP_LIBRARY['通用'];

  const goalNote = state?.profile?.goal ? `记得你的目标是「${state.profile.goal}」，这道题可以放进这个目标里看。` : '';
  const memory = prior.length
    ? `${goalNote}这已经是你第 ${prior.length + 1} 次在「${tags[0]}」附近卡住${sameType ? `，其中 ${sameType} 次是「${errorType}」` : ''}。这次先不急着刷新题，把下面第 2 步单独重做一遍。`
    : `${goalNote}这是第一次记录「${tags[0]}」。我会从这道题开始，帮你把同类错误串起来。`;

  return {
    engine: 'local',
    model: '本地推演',
    tags,
    summary: `这道${payload.subject || ''}题的核心是「${tags[0]}」。先别急着重算，先确认自己卡在"条件翻译"还是"最后运算"。`,
    diagnosis,
    memory,
    steps,
    variant: VARIANT_LIBRARY[tag] || VARIANT_LIBRARY['通用'],
    nextActions: [
      '把错题重做一遍，只写关键步骤，控制在 5 分钟内',
      '用一句话向自己解释：为什么这一步可以用这个定理',
      '明天做一道同考点的变式题，不看答案',
    ],
    confidence: prior.length ? 0.78 : 0.62,
    raw: '',
  };
}

export function localChatReply(message, state) {
  const text = String(message || '');
  const tags = detectTags({ text });
  const due = (state.questions || []).filter((q) => q.nextReview && q.nextReview <= new Date().toISOString().slice(0, 10));
  if (/错题|不会|做错|卡住/.test(text)) {
    return [
      `听起来卡在「${tags[0]}」附近。`,
      '',
      '你可以点下面的「标记为错题」，把题目、你的答案和正确答案填进来。我会给你：',
      '1. 这道题真正考的考点；2. 你卡住的那一步；3. 一道变式；4. 三次复习时间。',
      '',
      due.length ? `另外，今天有 ${due.length} 道错题到了复习时间，别忘了回看。` : '如果没有具体题目，也可以先说说你当时是怎么想的。',
    ].join('\n');
  }
  if (/计划|安排|时间|日程|冲突/.test(text)) {
    return [
      '时间规划可以先做三件事：',
      '1. 把固定课程先放进时间轴，它们是"骨架"；',
      '2. 给作业截止日单独标红，它们比上课更容易被忘；',
      '3. 每天留一段 60 分钟的空白，专门接住突然出现的通知。',
      '',
      '你可以在「时间轴」右上角点「识别通知」，把群里的通知直接粘进来，我会先解析再让你确认。',
    ].join('\n');
  }
  if (/复习|考试|期末/.test(text)) {
    return [
      '复习不要按章节平均用力，按"错题密度"分配时间。',
      '',
      `你目前的高频薄弱点是「${tags[0]}」。建议今天先做 2 道同类题，明天再做 1 道变式，第三天口头讲一遍解题思路。`,
      '需要的话，把具体题目贴给我，我可以帮你拆步骤。',
    ].join('\n');
  }
  return [
    '我在。你可以：',
    '· 直接贴一道错题，并点「标记为错题」，我会做结构化分析；',
    '· 问我怎么安排今天/这周的时间；',
    '· 把群通知贴到「时间轴 → 识别通知」，我会自动拆出日期、时间、地点。',
    '',
    '当前是本地推演模式，数据不会离开这台设备。配置模型网关后，分析会更细。',
  ].join('\n');
}

function parseJSONLoose(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* noop */ }
    }
  }
  return null;
}

async function postJSON(url, body, timeoutMs = 45000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `模型网关返回 ${res.status}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkServer() {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    if (!res.ok) throw new Error('no gateway');
    return await res.json();
  } catch {
    return { ok: false, llm: false, vision: false, model: null };
  }
}


function analysisMessages(payload, state) {
  const system = [
    '你是"聚仁"的错题教练，面向中国大学生。',
    '你的任务不是直接给答案，而是做错因诊断、给出可执行的解题步骤、一道变式题和复习建议。',
    '语气克制、具体，不堆砌鼓励。使用简体中文。',
    '只输出一个 JSON 对象，不要 Markdown 代码块，字段为：',
    '{"summary":"一句话结论","diagnosis":"错因诊断，120字内","tags":["考点1","考点2"],"steps":["步骤1","步骤2","步骤3","步骤4"],"variant":"一道变式题","nextActions":["行动1","行动2","行动3"],"confidence":0.0}',
    '如果信息不足，明确说明假设，不要编造题目细节。',
    '',
    '学习者画像：',
    profileDigest(state),
  ].join('\n');
  const user = [
    `学科：${payload.subject || '未填写'}`,
    `题目：${payload.text}`,
    `我的答案/思路：${payload.myAnswer || '未填写'}`,
    `正确答案：${payload.correctAnswer || '未填写'}`,
    `自评错因：${payload.errorType || '未填写'}`,
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function normalizeAnalysis(parsed, payload, state, engine, model, raw) {
  if (!parsed) {
    const fallback = analyzeLocally(payload, state);
    fallback.raw = raw || '';
    fallback.engine = `${engine}-fallback`;
    fallback.summary = raw || fallback.summary;
    return fallback;
  }
  return {
    engine,
    model: model || '大模型',
    tags: Array.isArray(parsed.tags) && parsed.tags.length ? parsed.tags.slice(0, 4) : detectTags(payload),
    summary: String(parsed.summary || '').slice(0, 300),
    diagnosis: String(parsed.diagnosis || '').slice(0, 800),
    memory: '',
    steps: Array.isArray(parsed.steps) ? parsed.steps.slice(0, 6).map(String) : [],
    variant: String(parsed.variant || '').slice(0, 500),
    nextActions: Array.isArray(parsed.nextActions) ? parsed.nextActions.slice(0, 4).map(String) : [],
    confidence: Number(parsed.confidence) || 0.7,
    raw: raw || '',
  };
}

function directEndpoint(settings) {
  const base = String(settings.apiBaseUrl || 'https://api.deepseek.com').trim().replace(/\/+$/, '');
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
}

async function postDirect(settings, body, timeoutMs = 60000) {
  if (!settings.apiKey) throw new Error('还没有填写 API Key');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(directEndpoint(settings), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || data?.error || `模型返回 ${res.status}`);
    return data;
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('模型响应超时');
    if (err instanceof TypeError) throw new Error('浏览器直连失败，可能被模型服务的 CORS 拦截；可改用本地网关');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function testDirect(settings) {
  const data = await postDirect(settings, {
    model: settings.aiModel || undefined,
    temperature: 0,
    max_tokens: 5,
    messages: [{ role: 'user', content: '只回复：ok' }],
  }, 20000);
  return { ok: true, model: data.model || settings.aiModel || '模型' };
}

export async function analyzeWithServer(payload, state, model) {
  const data = await postJSON('/api/llm', {
    model: model || undefined,
    temperature: 0.3,
    messages: analysisMessages(payload, state),
  });
  const content = data?.content || data?.choices?.[0]?.message?.content;
  return normalizeAnalysis(parseJSONLoose(content), payload, state, 'server', data?.model || model || '大模型', content);
}

export async function analyzeWithDirect(payload, state, settings = {}) {
  const data = await postDirect(settings, {
    model: settings.aiModel || undefined,
    temperature: 0.3,
    max_tokens: 1200,
    messages: analysisMessages(payload, state),
  });
  const content = data?.choices?.[0]?.message?.content || data?.content || '';
  return normalizeAnalysis(parseJSONLoose(content), payload, state, 'direct', data?.model || settings.aiModel || '模型', content);
}

export async function analyzeWrong(payload, state, settings = {}) {
  if (settings.aiMode === 'server' || settings.aiMode === 'direct') {
    try {
      return settings.aiMode === 'direct'
        ? await analyzeWithDirect(payload, state, settings)
        : await analyzeWithServer(payload, state, settings.aiModel);
    } catch (err) {
      const fallback = analyzeLocally(payload, state);
      fallback.engine = 'local-fallback';
      fallback.memory = `模型暂时不可用（${err.message}），已切换本地推演。你可以在设置里检查 API Key 或改用本地模式。`;
      return fallback;
    }
  }
  return analyzeLocally(payload, state);
}

export async function chatWithServer(message, state, settings = {}) {
  const system = [
    '你是"聚仁"的学习助手，面向中国大学生。回答要短、具体、可执行，不要空泛鸡汤。',
    '当学生描述错题时，先确认题目信息，再给诊断；不要假装看到了不存在的题目。',
    '当学生问时间规划时，结合"固定日程优先、截止日单独标红、每天留缓冲"的原则。',
    '使用简体中文。',
    '',
    '学习者画像：',
    profileDigest(state),
  ].join('\n');
  const history = (state.chats || [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content }));
  // 调用方通常已经把当前消息写进 state，避免重复发送
  if (history.length && history[history.length - 1].role === 'user'
      && history[history.length - 1].content === message) {
    history.pop();
  }
  const data = await postJSON('/api/llm', {
    model: settings.aiModel || undefined,
    temperature: 0.5,
    messages: [
      { role: 'system', content: system },
      ...history,
      { role: 'user', content: message },
    ],
  });
  return data?.content || data?.choices?.[0]?.message?.content || '';
}


export async function chatWithDirect(message, state, settings = {}) {
  const system = [
    '你是"聚仁"的学习助手，面向中国大学生。回答要短、具体、可执行，不要空泛鸡汤。',
    '当学生描述错题时，先确认题目信息，再给诊断；不要假装看到了不存在的题目。',
    '记住学习者的专业、目标和学习情况，把它当作长期背景，但不要生硬重复。',
    '使用简体中文。',
    '',
    '学习者画像：',
    profileDigest(state),
  ].join('\n');
  const history = (state.chats || [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content }));
  if (history.length && history[history.length - 1].role === 'user'
      && history[history.length - 1].content === message) history.pop();
  const data = await postDirect(settings, {
    model: settings.aiModel || undefined,
    temperature: 0.5,
    max_tokens: 900,
    messages: [
      { role: 'system', content: system },
      ...history,
      { role: 'user', content: message },
    ],
  });
  return data?.choices?.[0]?.message?.content || data?.content || '';
}

export async function chat(message, state, settings = {}) {
  if (settings.aiMode === 'server' || settings.aiMode === 'direct') {
    try {
      const text = settings.aiMode === 'direct'
        ? await chatWithDirect(message, state, settings)
        : await chatWithServer(message, state, settings);
      return { text, engine: settings.aiMode };
    } catch (err) {
      return {
        text: `${localChatReply(message, state)}\n\n（模型暂时不可用：${err.message}，以上为本地回复。）`,
        engine: 'local-fallback',
      };
    }
  }
  return { text: localChatReply(message, state), engine: 'local' };
}

export async function extractTextFromImage(dataUrl) {
  const data = await postJSON('/api/vision', { image: dataUrl }, 60000);
  if (!data.text) throw new Error(data.error || '没有识别到文字');
  return data.text;
}

export function reviewInterval(mastery) {
  const m = Number(mastery) || 0;
  if (m >= 80) return 14;
  if (m >= 60) return 7;
  if (m >= 40) return 3;
  return 1;
}
