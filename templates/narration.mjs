// 分镜旁白脚本（示例：替换为你的产品文案）
// 苹果发布会体要点：短句、有停顿感、讲价值不讲功能名
export const VOICE = "zh-CN-XiaoxiaoNeural"; // 女声温暖；男声新闻感用 zh-CN-YunyangNeural
export const RATE = "-6%";

export const chapters = [
  {
    id: "intro",
    type: "card", // 标题卡章节
    title: "Acme 经营驾驶舱", // 支持 \n 换行
    subtitle: "AI 时代的经营参谋",
    narration: "这是 Acme 经营驾驶舱，一个 AI 时代的经营参谋。接下来你看到的每一个数字，都来自实时同步的数据底座。",
    subs: ["这是 Acme 经营驾驶舱", "AI 时代的经营参谋", "每一个数字，都来自实时同步的数据底座"]
  },
  {
    id: "overview",
    type: "record", // 录屏章节（id 需与 record.mjs 的 actions/startUrl 对应）
    narration: "打开驾驶舱，核心指标一屏尽收。趋势、热力、AI 决策建议，逐层展开，每一条都可以一键分发到人。",
    subs: [
      "打开驾驶舱，核心指标一屏尽收",
      "趋势、热力、AI 决策建议，逐层展开",
      "每一条都可以一键分发到人"
    ]
  },
  {
    id: "agent",
    type: "record",
    narration: "有问题，直接问。AI 基于真实数据实时回答，结论先行，依据带着数字，每一条都可以一键溯源。",
    subs: [
      "有问题，直接问",
      "AI 基于真实数据实时回答",
      "结论先行，依据带数字，可一键溯源"
    ]
  },
  {
    id: "outro",
    type: "card",
    title: "让每一个决策\n都有据可依",
    subtitle: "实时数据 · 智能问答 · 知识内置",
    narration: "Acme 经营驾驶舱，让每一个决策，都有据可依。",
    subs: ["Acme 经营驾驶舱", "让每一个决策，都有据可依"]
  }
];
