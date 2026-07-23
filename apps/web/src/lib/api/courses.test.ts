import { afterEach, describe, expect, it, vi } from "vitest";

import { createCourse, listCourses } from "./courses";

afterEach(() => vi.unstubAllGlobals());

describe("listCourses", () => {
  it("returns the professor's courses on a 200", async () => {
    const courses = [{ id: 1, title: "Corporate finance", created_at: 0 }];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ courses }) }),
    );
    expect(await listCourses("jwt.abc")).toEqual(courses);
  });

  it("returns an empty list on any failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    expect(await listCourses("jwt.abc")).toEqual([]);
  });
});

describe("createCourse", () => {
  it("returns the created course on a 201", async () => {
    const course = { id: 5, title: "Thermodynamics", created_at: 0 };
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => course });
    vi.stubGlobal("fetch", fetchSpy);
    expect(await createCourse("jwt.abc", "Thermodynamics")).toEqual(course);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/courses"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "Thermodynamics" }),
      }),
    );
  });

  it("returns null when creation is refused", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    expect(await createCourse("jwt.abc", "Thermodynamics")).toBeNull();
  });
});
