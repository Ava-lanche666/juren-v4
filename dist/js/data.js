/* 聚仁 · 初始数据
 * 新账号默认是空白空间，不再自动放入示例日程或错题。
 */

import { addDays, startOfWeek, toISODate } from './parser.js';
import { DEFAULT_CITY, demoWeather } from './weather.js';

export const SCHEMA_VERSION = 2;

function dateAt(offset) {
  return toISODate(addDays(startOfWeek(new Date()), offset));
}

function event(id, offset, start, end, title, category, location = '', notes = '', source = 'seed', importance = 'normal', alarm = 0) {
  return {
    id,
    title,
    date: dateAt(offset),
    start,
    end,
    category,
    location,
    notes,
    source,
    importance,
    alarm,
    alarmFiredAt: null,
    done: false,
    createdAt: new Date().toISOString(),
  };
}

function seedEvents() {
  return [
    event('ev_seed_01', 0, '08:00', '09:35', '高等数学', 'course', 'A301', '第 11 周 · 多元函数'),
    event('ev_seed_02', 0, '14:00', '15:35', '大学物理', 'course', 'B204', '刚体转动'),
    event('ev_seed_03', 0, '19:30', '21:00', '英语角', 'activity', '湖畔咖啡', '主题：AI 与教育'),
    event('ev_seed_04', 0, '23:59', '23:59', '线代作业提交', 'deadline', '', '第 5 章 · 矩阵的秩', 'seed', 'critical', 60),

    event('ev_seed_05', 1, '09:00', '10:35', '数字逻辑', 'course', 'C102', '时序逻辑'),
    event('ev_seed_06', 1, '15:00', '16:30', '社团例会', 'meeting', '学生活动中心', '带上海报初稿'),
    event('ev_seed_07', 1, '15:30', '17:00', 'AI 产品讲座', 'activity', '报告厅', '和例会撞车了，需要取舍'),
    event('ev_seed_08', 1, '18:30', '19:30', '健身', 'personal', '体育馆', ''),

    event('ev_seed_09', 2, '10:00', '11:00', '高数随堂测验', 'exam', 'A301', '第 3 章 · 极限与连续', 'seed', 'critical', 60),
    event('ev_seed_10', 2, '13:30', '16:00', '物理实验', 'course', '物理实验中心', '单摆测重力加速度'),
    event('ev_seed_11', 2, '20:00', '21:30', '竞赛组会', 'meeting', '线上', '过一遍原型和分工', 'seed', 'important', 30),

    event('ev_seed_12', 3, '08:00', '09:35', '大学英语', 'course', 'D305', 'Unit 6'),
    event('ev_seed_13', 3, '16:00', '17:30', '图书馆志愿', 'activity', '图书馆', '二楼咨询台'),
    event('ev_seed_14', 3, '21:00', '21:40', '错题复盘', 'personal', '宿舍', '只看错题，不做新题'),

    event('ev_seed_15', 4, '09:00', '10:35', '程序设计', 'course', 'B203', '递归与分治'),
    event('ev_seed_16', 4, '14:00', '15:30', '体测', 'exam', '操场', '带学生证', 'seed', 'important', 30),
    event('ev_seed_17', 4, '19:00', '21:00', '电影', 'personal', '万达影城', '《沙丘 2》'),

    event('ev_seed_18', 5, '10:00', '12:00', '图书馆自习', 'personal', '图书馆', '高数 + 线代'),
    event('ev_seed_19', 5, '15:00', '16:30', '篮球', 'personal', '体育馆', ''),

    event('ev_seed_20', 6, '20:00', '21:00', '周复盘', 'personal', '宿舍', '看时间轴，安排下周'),
  ];
}

function seedQuestions() {
  const today = new Date();
  const iso = (offset) => toISODate(addDays(today, offset));
  return [
    {
      id: 'q_seed_01',
      no: 1,
      subject: '高等数学',
      text: '求极限 lim(x→0) (sin x − x) / x³。',
      myAnswer: '用等价无穷小 sin x ~ x，所以分子为 0，答案是 0。',
      correctAnswer: '1/6',
      errorType: '概念不清',
      tags: ['极限', '等价无穷小'],
      mastery: 34,
      nextReview: iso(0),
      createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      analysis: {
        summary: '这道题的核心是「极限」。先别急着重算，先确认自己卡在"条件翻译"还是"最后运算"。',
        diagnosis: '更像是把「极限」的适用条件记混了，而不是单纯算错。sin x ~ x 只能替换整个因子，不能直接替换相减中的一项。',
        memory: '这已经是你第 2 次在「极限」附近卡住，其中 1 次是「概念不清」。这次先把第 2 步单独重做一遍。',
        steps: [
          '先判断类型：这是 0/0 型，但分子不能直接等价替换。',
          '把 sin x 展开到 x³ 项：sin x = x − x³/6 + o(x³)。',
          '回代得 (−x³/6 + o(x³))/x³ → −1/6，检查符号。',
          '用泰勒展开的阶数要求再验算一次，确认展开到分母同阶。',
        ],
        variant: '把原题的分母换成 1−cos x，判断还能不能用等价无穷小；再写一次完整步骤。',
        nextActions: ['重做一遍，只写关键步骤', '口述为什么不能局部替换', '明天做一道同考点变式'],
        confidence: 0.78,
      },
      reviews: [{ at: new Date(Date.now() - 86400000).toISOString(), result: 'again' }],
    },
    {
      id: 'q_seed_02',
      no: 2,
      subject: '线性代数',
      text: '已知 A 为 3×3 矩阵，r(A)=2，判断 Ax=b 的解的情况。',
      myAnswer: '秩小于 3，所以方程组有无穷多解。',
      correctAnswer: '需要判断 b 是否在 A 的列空间中；若在则无穷多解，否则无解。',
      errorType: '审题偏差',
      tags: ['矩阵', '秩'],
      mastery: 52,
      nextReview: iso(1),
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      analysis: {
        summary: '这道题的核心是「矩阵」。先别急着重算，先确认自己卡在"条件翻译"还是"最后运算"。',
        diagnosis: '你写的内容和题目真正问的对象可能错位了：r(A)<n 只说明齐次方程有非零解，非齐次还要看增广矩阵。',
        memory: '这是你第 2 次在「矩阵」附近卡住。',
        steps: [
          '先确认矩阵形状与秩的定义，别急着做行变换。',
          '比较 r(A) 与 r(A|b)：相等才有解。',
          '由秩判断解的存在性与自由变量个数。',
          '把通解写成"特解 + 齐次通解"，再代回原方程验证。',
        ],
        variant: '把原题中的矩阵换成一个含参数 a 的 3×3 矩阵，讨论 a 取何值时秩为 2，并写出通解。',
        nextActions: ['画一张 r(A) 与 r(A|b) 的关系表', '重做一道含参数讨论题'],
        confidence: 0.72,
      },
      reviews: [],
    },
    {
      id: 'q_seed_03',
      no: 3,
      subject: '大学物理',
      text: '均质细杆绕一端转动，求释放瞬间的角加速度。',
      myAnswer: '把杆看成质点，直接用 F=ma 求加速度。',
      correctAnswer: '用转动定律 M=Iα，I=mL²/3，α=3g/(2L)。',
      errorType: '思路卡住',
      tags: ['受力分析', '刚体'],
      mastery: 41,
      nextReview: iso(2),
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      analysis: {
        summary: '这道题的核心是「刚体」。先别急着重算，先确认自己卡在"条件翻译"还是"最后运算"。',
        diagnosis: '卡点通常不是公式本身，而是缺少"转动问题要用力矩和转动惯量"这个中间步骤。',
        memory: '这是你第 2 次在「刚体」附近卡住。',
        steps: [
          '选研究对象，画完整受力图；不要漏掉约束力与摩擦力。',
          '规定正方向，把力分解到切向/法向或 x/y 方向。',
          '列转动定律 M=Iα，注意力矩的力臂。',
          '检查量纲与极限情形（长度趋零、质量趋零）。',
        ],
        variant: '把细杆换成绕中心转动的均质圆盘，求角加速度并比较。',
        nextActions: ['默写转动定律与常见转动惯量', '做一道杆+滑轮的组合题'],
        confidence: 0.7,
      },
      reviews: [],
    },
  ];
}

export function createInitialState({ name = '同学', withDemo = false, major = '' } = {}) {
  const now = new Date();
  const questions = withDemo ? seedQuestions() : [];
  const chats = withDemo
    ? [
      {
        id: 'chat_seed_01',
        role: 'assistant',
        kind: 'text',
        content: `晚上好，${name}。今天有 2 道错题到了复习时间：一道「极限」、一道「矩阵」。\n\n你可以直接贴题目给我，或者点「标记为错题」做一次完整分析。时间轴上，本周三的高数测验和物理实验之间只有 30 分钟，记得留出吃饭的时间。`,
        createdAt: new Date(Date.now() - 3600000).toISOString(),
      },
    ]
    : [
      {
        id: 'chat_seed_01',
        role: 'assistant',
        kind: 'text',
        content: `你好，${name}。我是聚仁，会帮你把错题和时间安排放在同一个地方。\n\n第一次使用，建议先点「标记为错题」贴一道最近的错题；也可以去时间轴，把群里的通知粘进来试试。`,
        createdAt: new Date().toISOString(),
      },
    ];

  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    profile: {
      name,
      major: major || (withDemo ? '计算机科学与技术' : ''),
      grade: withDemo ? '大一' : '',
      goal: withDemo ? '本学期把高数稳定在 85 分，做出一个能参赛的学习助手。' : '',
      studyWindow: withDemo ? '19:30–22:00' : '',
      memoryNotes: '',
      onboardingDone: withDemo,
      motto: '把错题变成方法，把日程排成节奏。',
      settings: {
        city: DEFAULT_CITY,
        aiMode: 'local',
        aiModel: 'deepseek-chat',
        apiBaseUrl: 'https://api.deepseek.com',
        apiKey: '',
        autoLockMin: 30,
        weekStartsMonday: true,
        defaultAlarm: 30,
        notifyEnabled: false,
      },
      learner: withDemo ? {
        tagStats: {
          极限: { attempts: 3, wrong: 2, lastAt: now.toISOString() },
          矩阵: { attempts: 2, wrong: 2, lastAt: now.toISOString() },
          刚体: { attempts: 2, wrong: 1, lastAt: now.toISOString() },
          导数: { attempts: 1, wrong: 1, lastAt: now.toISOString() },
        },
        errorTypes: { 概念不清: 2, 审题偏差: 1, 思路卡住: 1 },
        preferences: ['步骤化讲解', '先提示后答案', '晚上复盘'],
        streak: 6,
        sessions: 6,
        lastActiveAt: now.toISOString(),
      } : {
        tagStats: {},
        errorTypes: {},
        preferences: ['步骤化讲解', '先提示后答案'],
        streak: 0,
        sessions: 0,
        lastActiveAt: null,
      },
    },
    events: withDemo ? seedEvents() : [],
    questions,
    chats,
    focusSessions: withDemo ? [
      { id: 'focus_seed_1', date: dateAt(0), minutes: 25, label: '高数', at: new Date().toISOString() },
      { id: 'focus_seed_2', date: dateAt(0), minutes: 25, label: '线代', at: new Date().toISOString() },
    ] : [],
    weather: demoWeather(DEFAULT_CITY),
    modules: { weather: true, deadline: true, focus: false },
    meta: {
      lastBackupAt: null,
      lastWeatherAt: null,
      source: withDemo ? 'demo' : 'blank',
    },
  };
}

export function emptyStats() {
  return {
    tagStats: {},
    errorTypes: {},
    preferences: ['步骤化讲解'],
    streak: 0,
  };
}
