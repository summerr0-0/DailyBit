export type NewsCategory = "ai" | "security";

export interface NewsSource {
  id: string;
  name: string;
  feedUrl: string;
  category: NewsCategory;
}

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
];
