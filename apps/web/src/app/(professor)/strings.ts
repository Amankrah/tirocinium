// Professor route group strings (guide 3.4: sentence case, one job per string).
// The sign-in failure is the backend's one generic line, which never says
// whether the email or the password was the problem (backend 7.1).
export const strings = {
  shell: {
    wordmark: "Tirocinium",
    signOut: "Sign out",
  },
  signIn: {
    title: "Sign in",
    emailLabel: "Email",
    passwordLabel: "Password",
    action: "Sign in",
    failure: "Email or password is incorrect.",
  },
  dashboard: {
    greeting: (email: string) => `Signed in as ${email}.`,
    heading: "Your courses",
    empty: "Your courses will appear here once you create one.",
    newCourseLabel: "New course title",
    newCourseAction: "Create course",
  },
  course: {
    back: "All courses",
    heading: "Case studies",
    empty: "No case studies yet. Write your first one below.",
    draft: "Draft",
    published: "Published",
    open: "Open",
    publish: "Publish",
    unpublish: "Unpublish",
    newTitleLabel: "Title",
    newBodyLabel: "Body (Markdown, with $math$)",
    newAction: "Create case study",
  },
} as const;
