import { describe, expect, it } from "vitest";

import { buildIndexView, indexHref, PAGE_SIZE, type IndexView } from "./index-view";

function summary(over: Partial<{
  id: number;
  title: string;
  concepts: { concept_id: number; name: string; weight: number }[];
}> = {}) {
  return {
    id: 1,
    title: "Wheatstone bridge",
    status: "published",
    concepts: [{ concept_id: 4, name: "Kirchhoff's laws", weight: 1 }],
    created_at: 0,
    updated_at: 0,
    ...over,
  };
}

const structure = { concept_id: 1, name: "Structure of crystalline solids", weight: 1 };
const imperfections = { concept_id: 2, name: "Imperfections in solids", weight: 1 };

describe("buildIndexView", () => {
  it("groups by the heaviest concept, in the order those concepts first appear", () => {
    const view = buildIndexView(
      [
        summary({ id: 1, title: "Palladium", concepts: [structure] }),
        summary({ id: 2, title: "Vacancies", concepts: [imperfections] }),
        summary({ id: 3, title: "Niobium", concepts: [structure] }),
      ],
      {},
    );
    expect(view.groups.map((group) => group.name)).toEqual([
      "Structure of crystalline solids",
      "Imperfections in solids",
    ]);
    expect(view.groups[0]?.items.map((item) => item.id)).toEqual([1, 3]);
    expect(view.groups[1]?.items.map((item) => item.id)).toEqual([2]);
  });

  it("keeps a problem under its primary concept and still counts a secondary tag", () => {
    const both = [
      { ...structure, weight: 1 },
      { ...imperfections, weight: 0.4 },
    ];
    const view = buildIndexView(
      [
        summary({ id: 1, title: "Palladium", concepts: [structure] }),
        summary({ id: 2, title: "Lithium", concepts: both }),
      ],
      {},
    );
    expect(view.groups.map((group) => group.conceptId)).toEqual([1]);
    expect(view.topics.map((topic) => [topic.conceptId, topic.count])).toEqual([
      [1, 2],
      [2, 1],
    ]);

    const narrowed = buildIndexView(
      [
        summary({ id: 1, title: "Palladium", concepts: [structure] }),
        summary({ id: 2, title: "Lithium", concepts: both }),
      ],
      { topic: "2" },
    );
    expect(narrowed.total).toBe(1);
    expect(narrowed.groups[0]?.items.map((item) => item.title)).toEqual(["Lithium"]);
    expect(narrowed.groups[0]?.name).toBeNull();
    expect(narrowed.topicName).toBe("Imperfections in solids");
  });

  it("matches a title or a topic name without caring about case", () => {
    const items = [
      summary({ id: 1, title: "Is niobium FCC or BCC?", concepts: [structure] }),
      summary({ id: 2, title: "Vacancies per cubic metre", concepts: [imperfections] }),
    ];
    expect(buildIndexView(items, { q: "  fcc " }).groups[0]?.items.map((item) => item.id)).toEqual([
      1,
    ]);
    const byTopic = buildIndexView(items, { q: "vacan" });
    expect(byTopic.total).toBe(1);
    expect(byTopic.searchedCount).toBe(1);
    expect(byTopic.catalogue).toBe(2);
  });

  it("pages the whole set and clamps a page past the end", () => {
    const items = Array.from({ length: PAGE_SIZE + 1 }, (_, index) =>
      summary({
        id: index + 1,
        title: `Problem ${index + 1}`,
        concepts: [structure],
      }),
    );
    const first = buildIndexView(items, {});
    expect(first.pageCount).toBe(2);
    expect(first.from).toBe(1);
    expect(first.to).toBe(PAGE_SIZE);
    expect(first.groups[0]?.items).toHaveLength(PAGE_SIZE);

    const second = buildIndexView(items, { page: "2" });
    expect(second.groups[0]?.name).toBe("Structure of crystalline solids");
    expect(second.groups[0]?.items.map((item) => item.id)).toEqual([PAGE_SIZE + 1]);
    expect(second.from).toBe(PAGE_SIZE + 1);

    const clamped = buildIndexView(items, { page: "99" });
    expect(clamped.page).toBe(2);
    expect(clamped.groups[0]?.items.map((item) => item.id)).toEqual([PAGE_SIZE + 1]);
  });

  it("repeats a topic heading when the topic continues onto the next page", () => {
    const items = [
      ...Array.from({ length: 10 }, (_, index) =>
        summary({ id: index + 1, title: `S${index}`, concepts: [structure] }),
      ),
      ...Array.from({ length: 5 }, (_, index) =>
        summary({ id: index + 11, title: `I${index}`, concepts: [imperfections] }),
      ),
    ];
    const first = buildIndexView(items, {});
    expect(first.groups.map((group) => [group.name, group.items.length])).toEqual([
      ["Structure of crystalline solids", 10],
      ["Imperfections in solids", 2],
    ]);
    const second = buildIndexView(items, { page: "2" });
    expect(second.groups.map((group) => [group.name, group.items.length])).toEqual([
      ["Imperfections in solids", 3],
    ]);
  });

  it("treats a topic the course does not have as no matches", () => {
    const view = buildIndexView([summary()], { topic: "999" });
    expect(view.total).toBe(0);
    expect(view.topicName).toBeNull();
    expect(view.emptyCourse).toBe(false);
  });

  it("ignores a page or topic that is not a positive integer", () => {
    const view = buildIndexView([summary()], { page: "0", topic: "nope" });
    expect(view.page).toBe(1);
    expect(view.topicId).toBeNull();
    expect(view.total).toBe(1);
  });
});

describe("indexHref", () => {
  it("omits the defaults and keeps a search, a topic, and a later page", () => {
    expect(indexHref({})).toBe("/course");
    expect(indexHref({ page: 1, q: "  ", topic: null })).toBe("/course");
    expect(indexHref({ q: "fcc", topic: 2, page: 3 })).toBe("/course?q=fcc&topic=2&page=3");
  });
});

function titles(view: IndexView): string[] {
  return view.groups.flatMap((group) => group.items.map((item) => item.title));
}

describe("buildIndexView titles", () => {
  it("does not drop the problem past the first page", () => {
    const items = Array.from({ length: 13 }, (_, index) =>
      summary({ id: index + 1, title: `Problem ${index + 1}`, concepts: [] }),
    );
    expect(titles(buildIndexView(items, { page: "2" }))).toEqual(["Problem 13"]);
  });
});
