export type NewsCategory = "ai" | "security" | "dev";

export interface NewsSource {
  id: string;
  name: string;
  feedUrl: string;
  category: NewsCategory;
  /** 이 소스 글의 대표 태그 (없으면 category). 개발 블로그는 spring·java·react 등 */
  tag?: string;
}

/**
 * 뉴스에 붙일 수 있는 태그 (사용자 요청 2026-11-20: 내 분야 밖 태그로 태그 목록이 지저분해지지 않게).
 * 대표 태그(소스 tag 또는 category)는 항상 첫 번째로 붙고, 모델이 고른 태그는 이 목록 안의 것만 남는다.
 * 예: PHP·하드웨어 취약점 뉴스 → #security 만.
 */
export const NEWS_TAGS: readonly string[] = [
  "ai", "llm", "security",
  "java", "spring", "kotlin", "react", "nextjs", "nodejs", "javascript", "typescript",
  "database", "aws", "cloud", "devops", "kubernetes", "backend", "frontend",
];

/** 모델이 자주 쓰는 다른 표기 → 목록 안 태그 */
export const NEWS_TAG_ALIASES: Readonly<Record<string, string>> = {
  openai: "ai", anthropic: "ai", gemini: "ai", machinelearning: "ai", ml: "ai",
  gpt: "llm", llms: "llm",
  vulnerability: "security", zeroday: "security", malware: "security", breach: "security", databreach: "security",
  cybersecurity: "security", ransomware: "security", cve: "security",
  node: "nodejs", next: "nextjs", springboot: "spring", jdk: "java", k8s: "kubernetes",
};

// D4: 소스 목록. 추가/제거는 한 줄.
export const NEWS_SOURCES: readonly NewsSource[] = [
  { id: "karpathy", name: "Andrej Karpathy", feedUrl: "https://karpathy.bearblog.dev/feed/", category: "ai" },
  { id: "simonwillison", name: "Simon Willison", feedUrl: "https://simonwillison.net/atom/everything/", category: "ai" },
  { id: "raschka", name: "Sebastian Raschka", feedUrl: "https://magazine.sebastianraschka.com/feed", category: "ai" },
  { id: "interconnects", name: "Interconnects", feedUrl: "https://www.interconnects.ai/feed", category: "ai" },
  { id: "importai", name: "Import AI", feedUrl: "https://importai.substack.com/feed", category: "ai" },
  { id: "openai", name: "OpenAI News", feedUrl: "https://openai.com/news/rss.xml", category: "ai" },
  { id: "deepmind", name: "Google DeepMind", feedUrl: "https://deepmind.google/blog/rss.xml", category: "ai" },
  { id: "krebs", name: "Krebs on Security", feedUrl: "https://krebsonsecurity.com/feed/", category: "security" },
  { id: "schneier", name: "Schneier on Security", feedUrl: "https://www.schneier.com/feed/", category: "security" },
  { id: "thehackernews", name: "The Hacker News", feedUrl: "https://feeds.feedburner.com/TheHackersNews", category: "security" },
  { id: "bleepingcomputer", name: "BleepingComputer", feedUrl: "https://www.bleepingcomputer.com/feed/", category: "security" },
  // 개발(공식 블로그) — 사건 슬롯을 AI·보안과 따로 쓴다 (MAX_DEV_EVENTS_PER_DAY). 2026-11-20 추가.
  { id: "spring", name: "Spring Blog", feedUrl: "https://spring.io/blog.atom", category: "dev", tag: "spring" },
  { id: "insidejava", name: "Inside Java", feedUrl: "https://inside.java/feed.xml", category: "dev", tag: "java" },
  { id: "react", name: "React Blog", feedUrl: "https://react.dev/rss.xml", category: "dev", tag: "react" },
  { id: "nextjs", name: "Next.js Blog", feedUrl: "https://nextjs.org/feed.xml", category: "dev", tag: "nextjs" },
  { id: "nodejs", name: "Node.js Blog", feedUrl: "https://nodejs.org/en/feed/blog.xml", category: "dev", tag: "nodejs" },
];
