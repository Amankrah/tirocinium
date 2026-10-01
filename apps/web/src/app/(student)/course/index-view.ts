// How the course home turns the published list into a page a student can scan
// (decision 0083). Pure, so the paging, topic grouping, and search are tested
// without a session. The API already orders each problem's concepts by weight,
// so the first tag is the one the problem is chiefly about.
import type { Schemas } from "@/lib/api/client";

export const PAGE_SIZE = 12;

export type IndexTopic = {
  conceptId: number;
  name: string;
  count: number;
};

export type IndexGroup = {
  conceptId: number | null;
  name: string | null;
  items: Schemas["CaseStudySummary"][];
};

export type IndexView = {
  emptyCourse: boolean;
  q: string;
  topicId: number | null;
  topicName: string | null;
  /** Problems matching the search, before the topic narrows them. */
  searchedCount: number;
  topics: IndexTopic[];
  groups: IndexGroup[];
  page: number;
  pageCount: number;
  total: number;
  catalogue: number;
  from: number;
  to: number;
};

type Summary = Schemas["CaseStudySummary"];

export function indexHref(query: {
  page?: number;
  topic?: number | null;
  q?: string;
}): string {
  const params = new URLSearchParams();
  const q = query.q?.trim();
  if (q) params.set("q", q);
  if (query.topic) params.set("topic", String(query.topic));
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const text = params.toString();
  return text ? `/course?${text}` : "/course";
}

export function buildIndexView(
  items: readonly Summary[],
  raw: { page?: string; topic?: string; q?: string },
): IndexView {
  const q = (raw.q ?? "").trim().replace(/\s+/g, " ");
  const topicId = positiveInt(raw.topic);
  const needle = q.toLocaleLowerCase();
  const searched = needle
    ? items.filter((item) => haystack(item).includes(needle))
    : items;
  const topics = collectTopics(searched);
  const topicName = topics.find((topic) => topic.conceptId === topicId)?.name ?? null;
  const filtered =
    topicId === null
      ? searched
      : searched.filter((item) =>
          item.concepts.some((concept) => concept.concept_id === topicId),
        );
  const ordered =
    topicId === null ? orderByPrimary([...filtered]) : [...filtered].sort(byId);
  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const requested = positiveInt(raw.page) ?? 1;
  const page = ordered.length === 0 ? 1 : Math.min(requested, pageCount);
  const start = ordered.length === 0 ? 0 : (page - 1) * PAGE_SIZE;
  const slice = ordered.slice(start, start + PAGE_SIZE);

  return {
    emptyCourse: items.length === 0,
    q,
    topicId,
    topicName,
    searchedCount: searched.length,
    topics,
    groups:
      topicId === null
        ? groupConsecutive(slice)
        : [{ conceptId: topicId, name: null, items: slice }],
    page,
    pageCount: ordered.length === 0 ? 1 : pageCount,
    total: ordered.length,
    catalogue: items.length,
    from: ordered.length === 0 ? 0 : start + 1,
    to: start + slice.length,
  };
}

function positiveInt(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function haystack(item: Summary): string {
  return [item.title, ...item.concepts.map((concept) => concept.name)]
    .join("\n")
    .toLocaleLowerCase();
}

function byId(a: Summary, b: Summary): number {
  return a.id - b.id;
}

function collectTopics(items: readonly Summary[]): IndexTopic[] {
  const byIdMap = new Map<number, { name: string; count: number; firstId: number }>();
  for (const item of [...items].sort(byId)) {
    for (const concept of item.concepts) {
      const existing = byIdMap.get(concept.concept_id);
      if (existing) {
        existing.count += 1;
      } else {
        byIdMap.set(concept.concept_id, {
          name: concept.name,
          count: 1,
          firstId: item.id,
        });
      }
    }
  }
  return [...byIdMap.entries()]
    .sort((a, b) => a[1].firstId - b[1].firstId || a[0] - b[0])
    .map(([conceptId, topic]) => ({
      conceptId,
      name: topic.name,
      count: topic.count,
    }));
}

function primaryRank(item: Summary, rank: Map<number, number>): number {
  const concept = item.concepts[0];
  if (!concept) return Number.MAX_SAFE_INTEGER;
  return rank.get(concept.concept_id) ?? Number.MAX_SAFE_INTEGER;
}

function orderByPrimary(items: Summary[]): Summary[] {
  const rank = new Map<number, number>();
  const inPublicationOrder = [...items].sort(byId);
  for (const item of inPublicationOrder) {
    const concept = item.concepts[0];
    if (concept && !rank.has(concept.concept_id)) rank.set(concept.concept_id, rank.size);
  }
  return inPublicationOrder.sort((a, b) => {
    const byTopic = primaryRank(a, rank) - primaryRank(b, rank);
    return byTopic === 0 ? a.id - b.id : byTopic;
  });
}

function groupConsecutive(items: Summary[]): IndexGroup[] {
  const groups: IndexGroup[] = [];
  for (const item of items) {
    const concept = item.concepts[0] ?? null;
    const conceptId = concept?.concept_id ?? null;
    const last = groups[groups.length - 1];
    if (last && last.conceptId === conceptId) {
      last.items.push(item);
    } else {
      groups.push({ conceptId, name: concept?.name ?? null, items: [item] });
    }
  }
  return groups;
}
