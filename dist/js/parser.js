/* 聚仁 · 通知 / 日程解析器
 * 纯函数，无 DOM 依赖，可在 Node 中直接测试。
 *
 * 目标不是"100% 自动"，而是"高召回 + 可校对"：
 * 先尽量识别，再把不确定的地方明确告诉用户，导入前必须预览确认。
 */

const CN_DIGITS = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
  五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

const WEEK_MAP = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
const MERIDIEM = '上午|下午|晚上|晚间|晚|中午|早上|早晨|凌晨|傍晚|今晚|明晚|今早|明早';

const CATEGORY_LABEL = {
  course: '课程',
  deadline: '截止',
  exam: '考试',
  meeting: '会议',
  activity: '活动',
  personal: '个人',
};

export const EVENT_CATEGORIES = CATEGORY_LABEL;

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfWeek(d = new Date()) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(x, diff);
}

export function weekdayCN(d) {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
}

export function minutesOf(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function hhmmOf(minutes) {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

export function normalizeText(input = '') {
  return String(input)
    .replace(/\r\n?/g, '\n')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[：]/g, ':')
    .replace(/[～〜]/g, '~')
    .replace(/[—–]/g, '-')
    .replace(/[－]/g, '-')
    .replace(/\u3000/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/[；;]\s*(?=(?:今天|今晚|明天|明早|明晚|后天|大后天|本周|这周|下周|周[一二三四五六日天]|星期[一二三四五六日天]|\d{1,2}\s*月|\d{1,2}\/\d{1,2}))/g, '\n')
    .trim();
}

function cnNumber(str) {
  if (!str) return NaN;
  if (/^\d+$/.test(str)) return Number(str);
  if (str === '十') return 10;
  if (str.startsWith('十')) return 10 + (CN_DIGITS[str[1]] ?? 0);
  if (str.endsWith('十')) return (CN_DIGITS[str[0]] ?? 0) * 10;
  if (str.includes('十')) {
    const [a, b] = str.split('十');
    return (CN_DIGITS[a] ?? 0) * 10 + (CN_DIGITS[b] ?? 0);
  }
  return CN_DIGITS[str] ?? NaN;
}

/** 识别文本中的日期，返回 Date 或 null。 */
export function resolveDate(text, now = new Date()) {
  const base = startOfDay(now);
  const t = normalizeText(text);

  let m = t.match(/(20\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})\s*[日号]?/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!Number.isNaN(d.getTime())) return d;
  }

  m = t.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    let year = base.getFullYear();
    let d = new Date(year, month - 1, day);
    // 跨年：12 月看到 1 月的通知，归到下一年
    if (d.getTime() < addDays(base, -180).getTime()) {
      d = new Date(year + 1, month - 1, day);
    }
    return d;
  }

  m = t.match(/(?<![\d:])(\d{1,2})\s*[/-]\s*(\d{1,2})(?![\d:])/);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(base.getFullYear(), month - 1, day);
    }
  }

  const rel = [
    [/大后天/, 3],
    [/后天/, 2],
    [/明天|明日|明早|明晚/, 1],
    [/今天|今日|今晚|今早/, 0],
  ];
  for (const [re, offset] of rel) {
    if (re.test(t)) return addDays(base, offset);
  }

  m = t.match(/(下下|下|本|这)?\s*(?:周|星期|礼拜)\s*([一二三四五六日天])/);
  if (m) {
    const target = WEEK_MAP[m[2]];
    const today = base.getDay();
    let d;
    if (m[1] === '下下') {
      const nextWeekMonday = addDays(startOfWeek(base), 7);
      d = addDays(nextWeekMonday, (target + 6) % 7);
    } else if (m[1] === '下') {
      const nextWeekMonday = addDays(startOfWeek(base), 7);
      d = addDays(nextWeekMonday, (target + 6) % 7);
    } else if (m[1] === '本' || m[1] === '这') {
      d = addDays(startOfWeek(base), (target + 6) % 7);
    } else {
      let delta = (target - today + 7) % 7;
      d = addDays(base, delta);
    }
    return d;
  }

  return null;
}

function inferHour(rawHour, meridiem, hasExplicitMeridiem) {
  let h = rawHour;
  if (!Number.isFinite(h)) return NaN;
  if (meridiem) {
    if (/下午|晚上|傍晚|晚/.test(meridiem) && h < 12) h += 12;
    if (/中午/.test(meridiem) && h < 11) h += 12;
    if (/凌晨/.test(meridiem) && h === 12) h = 0;
  } else if (!hasExplicitMeridiem && h >= 1 && h <= 7) {
    // 大学场景里"6点开会"多数指傍晚。用户可在预览里改。
    h += 12;
  }
  return h % 24;
}

/** 识别时间范围，返回 {start,end,meridiemInferred} 或 null。 */
export function resolveTime(text) {
  const t = normalizeText(text);
  const M = MERIDIEM;

  let re = new RegExp(`(${M})?\\s*(\\d{1,2})\\s*:\\s*(\\d{2})\\s*(?:-|~|至|到)\\s*(${M})?\\s*(\\d{1,2})\\s*:\\s*(\\d{2})`);
  let m = t.match(re);
  if (m) {
    const mer1 = m[1];
    const mer2 = m[4] || mer1;
    let sh = inferHour(Number(m[2]), mer1, Boolean(mer1));
    let eh = inferHour(Number(m[5]), mer2, Boolean(mer2));
    const sm = Number(m[3]);
    const em = Number(m[6]);
    if (eh * 60 + em <= sh * 60 + sm) eh = (eh + 12) % 24;
    return {
      start: `${pad2(sh)}:${pad2(sm)}`,
      end: `${pad2(eh)}:${pad2(em)}`,
      meridiemInferred: !mer1 && !mer2 && Math.min(sh, eh) <= 7,
    };
  }

  re = new RegExp(`(${M})?\\s*(\\d{1,2}|[一二三四五六七八九十]{1,3})\\s*点\\s*(半|(\\d{1,2})\\s*分?)?\\s*(?:-|~|至|到)\\s*(${M})?\\s*(\\d{1,2}|[一二三四五六七八九十]{1,3})\\s*点\\s*(半|(\\d{1,2})\\s*分?)?`);
  m = t.match(re);
  if (m) {
    const mer1 = m[1];
    const mer2 = m[5] || mer1;
    const sh0 = cnNumber(m[2]);
    const eh0 = cnNumber(m[6]);
    const sm = m[3] === '半' ? 30 : Number(m[4] || 0);
    const em = m[7] === '半' ? 30 : Number(m[8] || 0);
    let sh = inferHour(sh0, mer1, Boolean(mer1));
    let eh = inferHour(eh0, mer2, Boolean(mer2));
    if (eh * 60 + em <= sh * 60 + sm) eh = (eh + 12) % 24;
    return {
      start: `${pad2(sh)}:${pad2(sm)}`,
      end: `${pad2(eh)}:${pad2(em)}`,
      meridiemInferred: !mer1 && !mer2 && Math.min(sh, eh) <= 7,
    };
  }

  re = new RegExp(`(${M})?\\s*(\\d{1,2})\\s*:\\s*(\\d{2})`);
  m = t.match(re);
  if (m) {
    const mer = m[1];
    const h = inferHour(Number(m[2]), mer, Boolean(mer));
    const start = `${pad2(h)}:${pad2(Number(m[3]))}`;
    return { start, end: addMinutesToHHMM(start, 60), meridiemInferred: !mer && h <= 7 };
  }

  re = new RegExp(`(${M})?\\s*(\\d{1,2}|[一二三四五六七八九十]{1,3})\\s*点\\s*(半|(\\d{1,2})\\s*分?)?`);
  m = t.match(re);
  if (m) {
    const mer = m[1];
    const h = inferHour(cnNumber(m[2]), mer, Boolean(mer));
    const minutes = m[3] === '半' ? 30 : Number(m[4] || 0);
    const start = `${pad2(h)}:${pad2(minutes)}`;
    return { start, end: addMinutesToHHMM(start, 60), meridiemInferred: !mer && h <= 7 };
  }

  return null;
}

function addMinutesToHHMM(hhmm, delta) {
  const total = Math.min(24 * 60 - 1, minutesOf(hhmm) + delta);
  return hhmmOf(total);
}

export function guessCategory(text) {
  const t = normalizeText(text);
  if (/截止|ddl|deadline|提交|交作业|报名|缴费|上传|截止日期/i.test(t)) return 'deadline';
  if (/考试|测验|测试|小测|期中|期末|补考|随堂/i.test(t)) return 'exam';
  if (/组会|例会|开会|会议|面试|答辩|讨论|班会|宣讲/i.test(t)) return 'meeting';
  if (/英语角|读书会|分享会|观影|茶话会/i.test(t)) return 'activity';
  if (/上课|课程|讲座|实验|培训|课堂|习题课|高数|线代|英语|物理|化学|程序设计|数据结构|电路|概率|离散|思政|体育|微积分|线性代数/i.test(t)) return 'course';
  if (/健身|跑步|运动|电影|聚餐|吃饭|休息|散步|球/i.test(t)) return 'personal';
  return 'activity';
}

export function extractLocation(text) {
  const t = normalizeText(text);
  let m = t.match(/(?:地点|地址|教室|会场)\s*[:：]?\s*([^\n，。；;]{2,40})/);
  if (m) {
    return m[1]
      .replace(/^[在\s]+/, '')
      .replace(/\s+(?:请|准时|携带|注意|联系|电话|如有|详见).*$/, '')
      .trim();
  }
  m = t.match(/在\s*((?:[A-Za-z]{0,2}\s*-?\s*\d{2,4}[A-Za-z]?)|(?:[A-Za-z0-9\u4e00-\u9fa5-]{1,24}(?:楼|室|馆|厅|场|中心|教室|校区|广场|食堂|图书馆)[A-Za-z0-9-]{0,12}))/);
  if (m) return m[1].replace(/\s+/g, '').trim();
  m = t.match(/(图书馆|食堂|体育馆|操场|教学楼|实验楼|研讨间|报告厅|礼堂|活动中心|咖啡厅)([A-Za-z0-9\u4e00-\u9fa5-]{0,10})/);
  if (m) return `${m[1]}${m[2]}`.trim();
  m = t.match(/@\s*([^\s，,。;；]{2,30})/);
  if (m) return m[1].trim();
  return '';
}

/** 从一行文本里剥掉日期、时间、地点等，留下标题。 */
export function extractTitle(text, category = 'activity') {
  let t = normalizeText(text);

  // 通知正文里，"时间：/地点：" 之后通常是元信息，不参与标题
  const marker = t.search(/(?:时间|日期|地点|地址)\s*[:：]/);
  if (marker > 4) t = t.slice(0, marker);

  t = t.replace(/^(?:【[^】]{1,12}】|\[[^\]]{1,12}\])\s*/g, '');
  t = t.replace(/^关于(.{2,50}?)的(?:通知|安排|公告)[：:]?\s*/g, '$1 ');
  t = t.replace(/^(?:通知|提醒|公告|紧急通知|温馨提醒)\s*[：:，,]?\s*/g, '');
  t = t.replace(/(?:时间|日期|地点|地址|会场|备注|说明)\s*[：:]\s*/g, ' ');

  t = t.replace(/(?:下下|下|本|这|每)?\s*(?:周|星期|礼拜)\s*[一二三四五六日天]/g, ' ');
  t = t.replace(/(今天|今晚|明早|明早|明天|明晚|后天|大后天|本周|这周|下周|下下周)/g, ' ');
  t = t.replace(/(20\d{2}\s*[年./-]\s*\d{1,2}\s*[月./-]\s*\d{1,2}\s*[日号]?)/g, ' ');
  t = t.replace(/(\d{1,2}\s*月\s*\d{1,2}\s*[日号]?)/g, ' ');
  t = t.replace(/(?<![\d:])(\d{1,2}\s*[/-]\s*\d{1,2})(?![\d:])/g, ' ');

  const MER = MERIDIEM;
  t = t.replace(new RegExp(`(?:${MER})?\\s*\\d{1,2}\\s*:\\s*\\d{2}\\s*(?:-|~|至|到)?\\s*(?:\\d{1,2}\\s*:\\s*\\d{2})?`, 'g'), ' ');
  t = t.replace(new RegExp(`(?:${MER})?\\s*\\d{1,2}\\s*点\\s*(?:半|\\d{1,2}\\s*分?)?\\s*(?:-|~|至|到)?\\s*(?:${MER})?\\s*\\d{0,2}\\s*点?\\s*(?:半|\\d{1,2}\\s*分?)?`, 'g'), ' ');

  // 地点 / 房间号
  t = t.replace(/(?:地点|地址|会场)\s*[:：]?\s*[^\s，。；;]{1,32}/g, ' ');
  t = t.replace(/在\s*(?:[A-Za-z]{0,2}\s*-?\s*\d{2,4}[A-Za-z]?|[A-Za-z0-9\u4e00-\u9fa5-]{1,24}(?:楼|室|馆|厅|场|中心|教室|校区|广场|食堂|图书馆)[A-Za-z0-9-]{0,12})/g, ' ');
  t = t.replace(/\b[A-Za-z]{1,2}-?\d{2,4}\b/g, ' ');
  t = t.replace(/(图书馆|食堂|体育馆|操场|教学楼|实验楼|研讨间|报告厅|礼堂|活动中心|咖啡厅)([A-Za-z0-9\u4e00-\u9fa5-]{0,10})?/g, ' ');
  t = t.replace(/@\s*[^\s，,。;；]{2,30}/g, ' ');

  t = t.replace(/[，。；;、,.!?！？：:]/g, ' ');
  t = t.replace(/\s+(?:请|准时|携带|注意|如有|详见|联系).*$/, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  t = t.replace(/^(?:于|请|准时|参加|举行|召开|开展)\s*/g, '').trim();
  t = t.replace(/^开(?=(?:组会|会|班会|例会))/, '').trim();
  t = t.replace(/^关于\s*/, '').trim();
  t = t.replace(/(?:的)?(?:通知|安排|公告)$/g, '').trim();

  if (t.length > 36) t = `${t.slice(0, 36)}…`;
  if (!t || t.length < 2) {
    return `新的${CATEGORY_LABEL[category] || '日程'}`;
  }
  return t;
}

function segmentText(raw) {
  const text = normalizeText(raw);
  if (!text) return [];
  let lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  if (lines.length <= 1) return [text.replace(/\n/g, ' ')];

  const timeRe = /(\d{1,2}\s*:\s*\d{2})|(\d{1,2}\s*点)/;
  const blocks = [];
  let pending = [];

  for (const line of lines) {
    if (timeRe.test(line)) {
      blocks.push({ lines: [...pending, line] });
      pending = [];
    } else if (blocks.length) {
      blocks[blocks.length - 1].lines.push(line);
    } else {
      pending.push(line);
    }
  }
  if (!blocks.length) return [text.replace(/\n/g, ' ')];
  if (pending.length) blocks[0].lines.unshift(...pending);
  return blocks.map((b) => b.lines.join(' '));
}

function eventId() {
  return `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeCandidate(c, now) {
  let start = c.start;
  let end = c.end;
  if (!start) start = '09:00';
  if (!end) end = addMinutesToHHMM(start, 60);
  if (minutesOf(end) <= minutesOf(start)) end = addMinutesToHHMM(start, 60);
  if (minutesOf(end) > 24 * 60 - 1) end = '23:59';

  return {
    id: c.id || eventId(),
    title: c.title,
    date: c.date || toISODate(now),
    start,
    end,
    location: c.location || '',
    category: c.category || 'activity',
    notes: '',
    source: c.source || 'text',
    importance: c.importance || 'normal',
    alarm: Number(c.alarm || 0),
    alarmFiredAt: null,
    confidence: c.confidence ?? 0.6,
    warnings: c.warnings || [],
    recurrence: c.recurrence || null,
    raw: c.raw || '',
  };
}

/**
 * 解析一段通知/聊天文本。
 * @returns {Array<{title,date,start,end,location,category,confidence,warnings,raw}>}
 */
export function parseScheduleText(raw, now = new Date()) {
  if (!raw || !String(raw).trim()) return [];
  const blocks = segmentText(raw);
  const results = [];

  for (const block of blocks) {
    const date = resolveDate(block, now);
    const time = resolveTime(block);
    const category = guessCategory(block);
    const title = extractTitle(block, category);
    const location = extractLocation(block);
    const warnings = [];

    if (!date) warnings.push('未识别到日期，先放在今天');
    if (!time) warnings.push('未识别到时间，先按 09:00 安排');
    if (time?.meridiemInferred) warnings.push('上午/下午是推断的，请核对');

    let confidence = 0;
    if (date) confidence += 0.34;
    if (time) confidence += 0.34;
    if (title && !/^新的/.test(title)) confidence += 0.16;
    if (location) confidence += 0.08;
    if (time?.end) confidence += 0.08;
    confidence = Math.min(0.98, Math.round(confidence * 100) / 100);
    if (confidence < 0.6) warnings.push('识别把握较低，建议手动补全');

    const base = normalizeCandidate({
      title,
      date: toISODate(date || now),
      start: time?.start,
      end: time?.end,
      location,
      category,
      confidence,
      warnings,
      raw: block,
      source: 'text',
    }, now);

    const recurrence = block.match(/每\s*(?:周|星期|礼拜)\s*([一二三四五六日天])/);
    if (recurrence) {
      base.recurrence = 'weekly';
      base.notes = '每周重复';
      for (let i = 0; i < 4; i++) {
        const d = addDays(new Date(`${base.date}T00:00:00`), i * 7);
        results.push(normalizeCandidate({
          ...base,
          id: i === 0 ? base.id : eventId(),
          date: toISODate(d),
          confidence: Math.min(base.confidence, 0.9),
          warnings: i === 0 ? base.warnings : [...base.warnings.filter((w) => !w.includes('日期')), '重复日程的第 ' + (i + 1) + ' 次'],
        }, now));
      }
    } else {
      results.push(base);
    }
  }

  return results;
}

/* ---------------- ICS ---------------- */

function unfoldICS(text) {
  return String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '');
}

function unescapeICS(value = '') {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseICSDate(value, params = '') {
  if (!value) return null;
  const v = value.trim();
  let m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (m) {
    if (m[7] === 'Z') {
      const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
      return {
        date: toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate())),
        time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
        utc: true,
      };
    }
    return {
      date: `${m[1]}-${m[2]}-${m[3]}`,
      time: `${m[4]}:${m[5]}`,
      utc: false,
    };
  }
  m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: null, allDay: true, utc: false };
  return null;
}

/** 解析标准 .ics（Apple / Google / Outlook 日历导出）。 */
export function parseICS(raw) {
  const text = unfoldICS(raw);
  const lines = text.split('\n');
  const events = [];
  let cur = null;

  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const left = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [key, ...paramParts] = left.split(';');
    const params = paramParts.join(';');

    if (key === 'BEGIN' && value.trim() === 'VEVENT') {
      cur = { summary: '', location: '', description: '', rrule: '', priority: 9, alarm: 0 };
      continue;
    }
    if (key === 'END' && value.trim() === 'VEVENT') {
      if (cur) {
        const start = parseICSDate(cur.dtstart, cur.dtstartParams);
        const end = parseICSDate(cur.dtend, cur.dtendParams);
        if (start?.date) {
          const s = start.time || '09:00';
          let e = end?.time || addMinutesToHHMM(s, 60);
          if (start.allDay) e = '23:59';
          const base = normalizeCandidate({
            title: unescapeICS(cur.summary).trim() || '未命名日程',
            date: start.date,
            start: start.allDay ? '00:00' : s,
            end: e,
            location: unescapeICS(cur.location).trim(),
            notes: unescapeICS(cur.description).trim().slice(0, 500),
            category: guessCategory(`${cur.summary} ${cur.description}`),
            source: 'ics',
            importance: cur.priority === 1 ? 'critical' : cur.priority === 5 ? 'important' : 'normal',
            alarm: cur.alarm || 0,
            confidence: 1,
            warnings: [],
            raw: 'ICS',
          });
          const rrule = cur.rrule;
          const countMatch = rrule.match(/COUNT=(\d{1,2})/i);
          const untilMatch = rrule.match(/UNTIL=(\d{8})/i);
          const isWeekly = /FREQ=WEEKLY/i.test(rrule);
          if (isWeekly) {
            let count = countMatch ? Math.min(Number(countMatch[1]), 52) : 12;
            if (untilMatch) {
              const until = new Date(`${untilMatch[1].slice(0, 4)}-${untilMatch[1].slice(4, 6)}-${untilMatch[1].slice(6, 8)}T23:59:59`);
              const days = Math.floor((until - new Date(`${base.date}T00:00:00`)) / 86400000);
              count = Math.max(1, Math.min(count, Math.floor(days / 7) + 1));
            }
            for (let i = 0; i < count; i++) {
              const d = addDays(new Date(`${base.date}T00:00:00`), i * 7);
              events.push(normalizeCandidate({
                ...base,
                id: eventId(),
                date: toISODate(d),
                recurrence: i === 0 ? 'weekly' : null,
                warnings: i === 0 ? [] : ['重复日程'],
              }));
            }
          } else {
            events.push(base);
          }
        }
        cur = null;
      }
      continue;
    }
    if (!cur) continue;
    if (key === 'SUMMARY') cur.summary = value;
    else if (key === 'LOCATION') cur.location = value;
    else if (key === 'DESCRIPTION') cur.description = value;
    else if (key === 'DTSTART') { cur.dtstart = value; cur.dtstartParams = params; }
    else if (key === 'DTEND') { cur.dtend = value; cur.dtendParams = params; }
    else if (key === 'RRULE') cur.rrule = value;
    else if (key === 'PRIORITY') cur.priority = Number(value) || 9;
    else if (key === 'TRIGGER') {
      const trigger = value.match(/-PT(\d+)M/i);
      if (trigger) cur.alarm = Number(trigger[1]);
    }
  }

  return events;
}

function escapeICS(value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function icsLocal(date, time) {
  const [y, m, d] = date.split('-');
  const [hh, mm] = time.split(':');
  return `${y}${m}${d}T${hh}${mm}00`;
}

/** 导出为通用 .ics，方便导入手机系统日历。 */
export function buildICS(events) {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//JUREN//Learning Assistant//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const ev of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.id || eventId()}@juren.local`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${icsLocal(ev.date, ev.start)}`);
    lines.push(`DTEND:${icsLocal(ev.date, ev.end)}`);
    lines.push(`SUMMARY:${escapeICS(ev.title)}`);
    if (ev.location) lines.push(`LOCATION:${escapeICS(ev.location)}`);
    if (ev.notes) lines.push(`DESCRIPTION:${escapeICS(ev.notes)}`);
    const importance = ev.importance || 'normal';
    lines.push(`PRIORITY:${importance === 'critical' ? 1 : importance === 'important' ? 5 : 9}`);
    if (Number(ev.alarm) > 0) {
      lines.push('BEGIN:VALARM');
      lines.push('ACTION:DISPLAY');
      lines.push(`DESCRIPTION:${escapeICS(`聚仁提醒：${ev.title}`)}`);
      lines.push(`TRIGGER:-PT${Math.max(1, Number(ev.alarm))}M`);
      lines.push('END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

/* ---------------- 冲突检测 ---------------- */

export function findConflicts(events) {
  const byDate = new Map();
  for (const ev of events) {
    if (!byDate.has(ev.date)) byDate.set(ev.date, []);
    byDate.get(ev.date).push(ev);
  }
  const pairs = [];
  for (const [date, list] of byDate) {
    const sorted = [...list].sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        if (minutesOf(b.start) >= minutesOf(a.end)) break;
        pairs.push({ date, a, b });
      }
    }
  }
  return pairs;
}

/** 给一天内的日程分配轨道，避免互相遮挡。 */
export function layoutDay(events) {
  const sorted = [...events].sort((a, b) => {
    const d = minutesOf(a.start) - minutesOf(b.start);
    return d !== 0 ? d : minutesOf(a.end) - minutesOf(b.end);
  });
  const columns = [];
  const laid = [];
  for (const ev of sorted) {
    const start = minutesOf(ev.start);
    const end = Math.max(start + 15, minutesOf(ev.end));
    let col = columns.findIndex((colEnd) => colEnd <= start);
    if (col === -1) {
      col = columns.length;
      columns.push(end);
    } else {
      columns[col] = end;
    }
    laid.push({ ...ev, _col: col, _start: start, _end: end });
  }
  return { events: laid, columns: Math.max(1, columns.length) };
}

export function demoNotice() {
  return [
    '【教务处通知】',
    '关于本周三高等数学随堂测验的安排',
    '时间：11月18日 上午10:00-11:00',
    '地点：A楼301教室',
    '请提前10分钟到场，携带学生证。',
  ].join('\n');
}


/**
 * 课表 CSV 解析：支持「课程,星期,开始,结束,地点」或带表头的表格。
 * 生成未来 8 周，方便从喜鹊儿/教务系统导出后批量导入。
 */
export function parseCSV(raw, now = new Date()) {
  const text = String(raw || '').replace(/\r\n?/g, '\n').trim();
  if (!text) return [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const first = lines[0];
  const delimiter = first.includes('\t') ? '\t' : ',';
  const split = (line) => line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
  const rows = lines.map(split);
  const header = rows[0].map((h) => h.replace(/\s/g, ''));
  const hasHeader = header.some((h) => /课程|名称|星期|周几|开始|结束|地点|日期/.test(h));
  const data = hasHeader ? rows.slice(1) : rows;
  const idx = (...names) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const iTitle = hasHeader ? idx('课程', '名称', '标题', 'course') : 0;
  const iWeek = hasHeader ? idx('星期', '周几') : 1;
  const iDate = hasHeader ? idx('日期', 'date') : -1;
  const iStart = hasHeader ? idx('开始', '时间', 'start') : 2;
  const iEnd = hasHeader ? idx('结束', 'end') : 3;
  const iLoc = hasHeader ? idx('地点', '教室', 'location') : 4;

  const weekMap = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
  const results = [];
  for (const row of data) {
    const title = (row[iTitle] || '').trim();
    if (!title) continue;
    const rawWeek = (row[iWeek] || '').trim();
    const weekChar = rawWeek.match(/[一二三四五六日天]/)?.[0];
    let base = iDate >= 0 && row[iDate] ? resolveDate(row[iDate], now) : null;
    if (!base && weekChar) {
      const target = weekMap[weekChar];
      const today = startOfDay(now).getDay();
      const delta = (target - today + 7) % 7;
      base = addDays(startOfDay(now), delta);
    }
    if (!base) continue;
    let start = (row[iStart] || '').trim();
    let end = (row[iEnd] || '').trim();
    if (!end && start.includes('-')) {
      const parts = start.split(/\s*[-~至到]\s*/);
      start = parts[0];
      end = parts[1];
    }
    const time = resolveTime(end ? `${start}-${end}` : start);
    if (!time) continue;
    const location = (row[iLoc] || '').trim();
    const category = /实验|课|讲座/.test(title) ? 'course' : 'course';
    for (let i = 0; i < 8; i++) {
      const d = addDays(base, i * 7);
      results.push(normalizeCandidate({
        title,
        date: toISODate(d),
        start: time.start,
        end: time.end,
        location,
        category,
        source: 'csv',
        confidence: 0.92,
        warnings: i === 0 ? [] : ['课表重复生成'],
        recurrence: i === 0 ? 'weekly' : null,
        raw: row.join(' | '),
      }, now));
    }
  }
  return results;
}
