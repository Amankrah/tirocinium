// Marketing route group strings (frontend guide 3.4: every string lives in a
// typed strings module from day one; sentence case, one job per string). The
// tagline appears on the landing hero and nowhere inside the app shell.
export const strings = {
  wordmark: "Tirocinium",
  tagline: "Every problem, freshly ruled.",
  // The Roman story, told once here and never repeated inside the product
  // (frontend guide 3.1).
  story:
    "In Rome, you learned law by working cases beside a jurist. This is that, for your course.",
  // Two doors (decision 0065), in the landing header as the button primitive:
  // the same jobs as /enter and /sign-in, named as the user does them.
  doors: "Ways in",
  enterCourse: "Enter course",
  signIn: "Sign in",
} as const;
